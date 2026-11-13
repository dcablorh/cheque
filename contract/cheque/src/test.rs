#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    Address, BytesN, Env,
};

fn setup_test() -> (
    Env,
    Address,
    Address,
    Address,
    Address,
    token::Client<'static>,
    StellarAssetClient<'static>,
    Address,
    ChequeContractClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let authority = Address::generate(&env);
    let guardian = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin);
    let token_addr = token_contract_id.address();
    let token_client = token::Client::new(&env, &token_addr);
    let token_admin_client = StellarAssetClient::new(&env, &token_addr);

    let contract_id = env.register(ChequeContract, ());
    let client = ChequeContractClient::new(&env, &contract_id);

    let config = Config {
        min_amount: 10_000_000,          // 1 USDC (10^7 stroops)
        max_amount: 10_000_000_000,      // 1,000 USDC
        max_lock_secs: 3600,             // 1 hour
        delay_threshold: 500_000_000,    // 50 USDC
        delay_secs: 900,                 // 15 mins delay for large cheques
        paused: false,
    };

    client.init(&admin, &authority, &guardian, &token_addr, &config);

    (
        env,
        admin,
        authority,
        guardian,
        token_addr,
        token_client,
        token_admin_client,
        contract_id,
        client,
    )
}

#[test]
fn test_create_lock_redeem_happy_path() {
    let (env, _, _, _, _, token_client, token_admin_client, contract_id, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    let amount = 50_000_000i128; // 5 USDC
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[1u8; 32]);
    let now = env.ledger().timestamp();
    let expires_at = now + 86400; // 24 hours

    // 1. Create Cheque
    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);
    assert_eq!(token_client.balance(&contract_id), amount);
    assert_eq!(token_client.balance(&funder), 0);

    let chq = client.get_cheque(&cheque_id);
    assert_eq!(chq.state, ChequeState::Active);

    // 2. Lock to recipient
    client.lock(&cheque_id, &recipient, &1800); // 30 mins lock
    let chq_locked = client.get_cheque(&cheque_id);
    assert_eq!(chq_locked.state, ChequeState::Locked);

    // 3. Redeem to recipient
    client.redeem(&cheque_id);
    let chq_redeemed = client.get_cheque(&cheque_id);
    assert_eq!(chq_redeemed.state, ChequeState::Redeemed);
    assert_eq!(token_client.balance(&recipient), amount);
    assert_eq!(token_client.balance(&contract_id), 0);
}

#[test]
fn test_double_redeem_fails() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    let amount = 50_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[2u8; 32]);
    let expires_at = env.ledger().timestamp() + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);
    client.lock(&cheque_id, &recipient, &1800);
    client.redeem(&cheque_id);

    // Second redeem MUST fail with InvalidState
    let res = client.try_redeem(&cheque_id);
    assert_eq!(res, Err(Ok(Error::InvalidState)));
}

#[test]
fn test_redeem_without_lock_fails() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);

    let amount = 50_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[3u8; 32]);
    let expires_at = env.ledger().timestamp() + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);

    // Attempt redeem directly from Active without locking
    let res = client.try_redeem(&cheque_id);
    assert_eq!(res, Err(Ok(Error::InvalidState)));
}

#[test]
fn test_delay_threshold_and_veto() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Amount >= 50 USDC triggers delay (900 seconds)
    let large_amount = 600_000_000i128; // 60 USDC
    token_admin_client.mint(&funder, &large_amount);

    let cheque_id = BytesN::from_array(&env, &[4u8; 32]);
    let now = env.ledger().timestamp();
    let expires_at = now + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &large_amount, &expires_at);
    client.lock(&cheque_id, &recipient, &1800);

    // Attempting to redeem immediately fails because delay is not met
    let early_redeem = client.try_redeem(&cheque_id);
    assert_eq!(early_redeem, Err(Ok(Error::DelayNotMet)));

    // Guardian vetoes before executable_after
    client.veto(&cheque_id);

    // Cheque goes back to Active
    let chq = client.get_cheque(&cheque_id);
    assert_eq!(chq.state, ChequeState::Active);
    assert_eq!(client.get_lock(&cheque_id), None);
}

#[test]
fn test_cancel_active_and_blocked_after_lock() {
    let (env, _, _, _, _, token_client, token_admin_client, contract_id, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    let amount = 20_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[5u8; 32]);
    let expires_at = env.ledger().timestamp() + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);

    // Lock it
    client.lock(&cheque_id, &recipient, &1800);

    // Cancel after lock fails! (Prevents race abuse)
    let cancel_res = client.try_cancel(&cheque_id);
    assert_eq!(cancel_res, Err(Ok(Error::InvalidState)));

    // Unlock it back to Active
    client.unlock(&cheque_id);

    // Cancel from Active succeeds and refunds to refund_to
    client.cancel(&cheque_id);
    assert_eq!(token_client.balance(&refund_to), amount);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(client.get_cheque(&cheque_id).state, ChequeState::Cancelled);
}

#[test]
fn test_refund_lifecycle() {
    let (env, _, _, _, _, token_client, token_admin_client, contract_id, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);

    let amount = 30_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[6u8; 32]);
    let now = env.ledger().timestamp();
    let expires_at = now + 1000;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);

    // Refund before expiry fails
    let early_refund = client.try_refund(&cheque_id);
    assert_eq!(early_refund, Err(Ok(Error::ChequeNotExpired)));

    // Advance time past expiry
    env.ledger().set_timestamp(expires_at + 1);

    // Anyone can trigger refund after expiry
    client.refund(&cheque_id);
    assert_eq!(token_client.balance(&refund_to), amount);
    assert_eq!(token_client.balance(&contract_id), 0);
    assert_eq!(client.get_cheque(&cheque_id).state, ChequeState::Refunded);
}

#[test]
fn test_lock_expiry_and_anyone_unlock() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    let amount = 40_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[7u8; 32]);
    let now = env.ledger().timestamp();
    let expires_at = now + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);
    client.lock(&cheque_id, &recipient, &600); // 10 mins lock

    // Advance time past lock duration (600s)
    env.ledger().set_timestamp(now + 601);

    // Redeem fails because lock is expired
    let redeem_res = client.try_redeem(&cheque_id);
    assert_eq!(redeem_res, Err(Ok(Error::LockExpired)));

    // Anyone can unlock after lock expiry without authority auth
    client.unlock(&cheque_id);
    assert_eq!(client.get_cheque(&cheque_id).state, ChequeState::Active);
}

#[test]
fn test_pause_semantics() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);

    let amount = 25_000_000i128;
    token_admin_client.mint(&funder, &amount);

    let cheque_id = BytesN::from_array(&env, &[8u8; 32]);
    let expires_at = env.ledger().timestamp() + 86400;

    client.create_cheque(&funder, &cheque_id, &refund_to, &amount, &expires_at);

    // Admin pauses contract
    client.pause();

    // Create new cheque is blocked while paused
    let funder2 = Address::generate(&env);
    token_admin_client.mint(&funder2, &amount);
    let cheque_id2 = BytesN::from_array(&env, &[9u8; 32]);
    let create_paused = client.try_create_cheque(&funder2, &cheque_id2, &refund_to, &amount, &expires_at);
    assert_eq!(create_paused, Err(Ok(Error::ContractPaused)));

    // But cancel is NEVER blocked by pause!
    client.cancel(&cheque_id);
    assert_eq!(client.get_cheque(&cheque_id).state, ChequeState::Cancelled);
}

#[test]
fn test_amount_bounds_and_duplicate_ids() {
    let (env, _, _, _, _, _, token_admin_client, _, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);

    token_admin_client.mint(&funder, &100_000_000_000i128);

    let cheque_id = BytesN::from_array(&env, &[10u8; 32]);
    let expires_at = env.ledger().timestamp() + 86400;

    // Below min amount (min is 10_000_000)
    let too_small = client.try_create_cheque(&funder, &cheque_id, &refund_to, &5_000_000i128, &expires_at);
    assert_eq!(too_small, Err(Ok(Error::AmountOutOfBounds)));

    // Above max amount (max is 10_000_000_000)
    let too_large = client.try_create_cheque(&funder, &cheque_id, &refund_to, &20_000_000_000i128, &expires_at);
    assert_eq!(too_large, Err(Ok(Error::AmountOutOfBounds)));

    // Valid create
    client.create_cheque(&funder, &cheque_id, &refund_to, &50_000_000i128, &expires_at);

    // Duplicate cheque ID rejected
    let duplicate = client.try_create_cheque(&funder, &cheque_id, &refund_to, &50_000_000i128, &expires_at);
    assert_eq!(duplicate, Err(Ok(Error::ChequeAlreadyExists)));
}

#[test]
fn test_two_step_admin_transfer() {
    let (env, admin, _, _, _, _, _, _, client) = setup_test();

    let new_admin = Address::generate(&env);

    // Step 1: initiate transfer
    client.transfer_admin(&new_admin);
    assert_eq!(client.admin(), admin);

    // Step 2: accept admin
    client.accept_admin();
    assert_eq!(client.admin(), new_admin);
}

#[test]
fn test_fuzz_state_machine_invariant() {
    // Invariant: contract token balance == sum of non-terminal cheque amounts
    let (env, _, _, _, _, token_client, token_admin_client, contract_id, client) = setup_test();

    let funder = Address::generate(&env);
    let refund_to = Address::generate(&env);
    let recipient = Address::generate(&env);

    let total_mint = 500_000_000i128;
    token_admin_client.mint(&funder, &total_mint);

    let cheque_ids: [BytesN<32>; 5] = [
        BytesN::from_array(&env, &[11u8; 32]),
        BytesN::from_array(&env, &[12u8; 32]),
        BytesN::from_array(&env, &[13u8; 32]),
        BytesN::from_array(&env, &[14u8; 32]),
        BytesN::from_array(&env, &[15u8; 32]),
    ];

    let amounts: [i128; 5] = [
        20_000_000,
        30_000_000,
        40_000_000,
        25_000_000,
        35_000_000,
    ];

    let mut expected_escrow = 0i128;

    // Create 5 cheques
    for i in 0..5 {
        let exp = env.ledger().timestamp() + 5000 + (i as u64 * 100);
        client.create_cheque(&funder, &cheque_ids[i], &refund_to, &amounts[i], &exp);
        expected_escrow += amounts[i];
        assert_eq!(token_client.balance(&contract_id), expected_escrow);
    }

    // Cheque 0: Lock & Redeem -> terminal
    client.lock(&cheque_ids[0], &recipient, &1000);
    client.redeem(&cheque_ids[0]);
    expected_escrow -= amounts[0];
    assert_eq!(token_client.balance(&contract_id), expected_escrow);

    // Cheque 1: Cancel -> terminal
    client.cancel(&cheque_ids[1]);
    expected_escrow -= amounts[1];
    assert_eq!(token_client.balance(&contract_id), expected_escrow);

    // Cheque 2: Lock & Unlock -> still Active (non-terminal)
    client.lock(&cheque_ids[2], &recipient, &1000);
    client.unlock(&cheque_ids[2]);
    assert_eq!(token_client.balance(&contract_id), expected_escrow);

    // Cheque 3: Expire & Refund -> terminal
    env.ledger().set_timestamp(env.ledger().timestamp() + 10_000);
    client.refund(&cheque_ids[3]);
    expected_escrow -= amounts[3];
    assert_eq!(token_client.balance(&contract_id), expected_escrow);

    // Final balance matches exact sum of remaining active cheques (cheque 2 & cheque 4)
    let remaining_sum = amounts[2] + amounts[4];
    assert_eq!(expected_escrow, remaining_sum);
    assert_eq!(token_client.balance(&contract_id), remaining_sum);
}
