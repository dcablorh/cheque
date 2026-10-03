#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    Address, BytesN, Env,
};

#[test]
fn test_create_and_redeem_cheque_single_redemption() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let claim_authority = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Create test USDC SAC token
    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_contract_id.address(&env));
    let token_admin_client = StellarAssetClient::new(&env, &token_contract_id.address(&env));

    // Register cheque contract
    let contract_id = env.register(ChequeContract, ());
    let client = ChequeContractClient::new(&env, &contract_id);

    // Initialize
    client.initialize(&admin, &token_contract_id.address(&env), &claim_authority);

    // Mint 100 USDC (1,000,000,000 stroops) to sender
    let amount_stroops = 1_000_000_000i128;
    token_admin_client.mint(&sender, &amount_stroops);
    assert_eq!(token_client.balance(&sender), amount_stroops);

    // Create Cheque
    let cheque_id = BytesN::from_array(&env, &[7u8; 32]);
    let expires_at = 100_000u64;
    client.create_cheque(&sender, &cheque_id, &amount_stroops, &expires_at);

    // Verify sender transferred to contract escrow
    assert_eq!(token_client.balance(&sender), 0);
    assert_eq!(token_client.balance(&contract_id), amount_stroops);

    // First redemption succeeds
    client.redeem_cheque(&cheque_id, &recipient);
    assert_eq!(token_client.balance(&recipient), amount_stroops);
    assert_eq!(token_client.balance(&contract_id), 0);

    // Second redemption MUST fail with ChequeAlreadyRedeemed
    let double_redeem_res = client.try_redeem_cheque(&cheque_id, &recipient);
    assert_eq!(double_redeem_res, Err(Ok(Error::ChequeAlreadyRedeemed)));
}

#[test]
fn test_refund_expired_cheque() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let claim_authority = Address::generate(&env);
    let sender = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_contract_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = token::Client::new(&env, &token_contract_id.address(&env));
    let token_admin_client = StellarAssetClient::new(&env, &token_contract_id.address(&env));

    let contract_id = env.register(ChequeContract, ());
    let client = ChequeContractClient::new(&env, &contract_id);

    client.initialize(&admin, &token_contract_id.address(&env), &claim_authority);

    let amount = 500_000_000i128;
    token_admin_client.mint(&sender, &amount);

    let cheque_id = BytesN::from_array(&env, &[9u8; 32]);
    let expires_at = 1_000u64;
    client.create_cheque(&sender, &cheque_id, &amount, &expires_at);

    // Advance time past expiry
    env.ledger().set_timestamp(2_000u64);

    // Refund
    client.refund_cheque(&cheque_id);
    assert_eq!(token_client.balance(&sender), amount);

    // Attempting to redeem after refund fails
    let recipient = Address::generate(&env);
    let redeem_res = client.try_redeem_cheque(&cheque_id, &recipient);
    assert_eq!(redeem_res, Err(Ok(Error::ChequeAlreadyRefunded)));
}
