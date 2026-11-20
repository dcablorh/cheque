#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN,
    Env,
};

const LEDGERS_PER_DAY: u32 = 17_280; // ~5 seconds per ledger on Stellar
const TTL_THRESHOLD: u32 = LEDGERS_PER_DAY * 14; // 14 days
const TTL_EXTEND_TO: u32 = LEDGERS_PER_DAY * 35; // 35 days
/// Longest cheque life. Kept below TTL_EXTEND_TO so an active cheque's entry can never archive.
const MAX_EXPIRY_SECS: u64 = 30 * 24 * 60 * 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ChequeAlreadyExists = 4,
    ChequeNotFound = 5,
    InvalidState = 6,
    ChequeExpired = 7,
    ChequeNotExpired = 8,
    AmountOutOfBounds = 9,
    LockExpired = 10,
    LockNotExpired = 11,
    DelayNotMet = 12,
    DelayPassed = 13,
    ContractPaused = 14,
    InvalidLockDuration = 15,
    NoPendingAdmin = 16,
    InvalidExpiry = 17,
    InvalidConfig = 18,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ChequeState {
    Active = 1,
    Locked = 2,
    Redeemed = 3,
    Cancelled = 4,
    Refunded = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LockInfo {
    pub to: Address,
    pub locked_at: u64,
    pub unlock_after: u64,
    pub executable_after: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Cheque {
    pub funder: Address,
    pub refund_to: Address,
    pub amount: i128,
    pub expires_at: u64,
    pub state: ChequeState,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub min_amount: i128,
    pub max_amount: i128,
    pub max_lock_secs: u64,
    pub delay_threshold: i128,
    pub delay_secs: u64,
    pub paused: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Authority,
    Guardian,
    Token,
    Config,
    Cheque(BytesN<32>),
    // Lock lives in its own entry: nesting Option<LockInfo> inside `Cheque` breaks
    // soroban-sdk 22 testutils (no infallible ScVal conversion for user structs).
    Lock(BytesN<32>),
}

/// Rejects configs that would brick the contract or make limits meaningless.
fn validate_config(config: &Config) -> Result<(), Error> {
    if config.min_amount <= 0
        || config.max_amount < config.min_amount
        || config.max_lock_secs == 0
        || config.delay_threshold < 0
    {
        return Err(Error::InvalidConfig);
    }
    Ok(())
}

#[contract]
pub struct ChequeContract;

#[contractimpl]
impl ChequeContract {
    pub fn init(
        env: Env,
        admin: Address,
        authority: Address,
        guardian: Address,
        token: Address,
        config: Config,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        validate_config(&config)?;

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Authority, &authority);
        env.storage().instance().set(&DataKey::Guardian, &guardian);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Config, &config);

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    pub fn create_cheque(
        env: Env,
        funder: Address,
        cheque_id: BytesN<32>,
        refund_to: Address,
        amount: i128,
        expires_at: u64,
    ) -> Result<(), Error> {
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;

        if config.paused {
            return Err(Error::ContractPaused);
        }

        funder.require_auth();

        if amount <= 0 || amount < config.min_amount || amount > config.max_amount {
            return Err(Error::AmountOutOfBounds);
        }

        let now = env.ledger().timestamp();
        if expires_at <= now || expires_at > now + MAX_EXPIRY_SECS {
            return Err(Error::InvalidExpiry);
        }

        let key = DataKey::Cheque(cheque_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::ChequeAlreadyExists);
        }

        // Pull tokens from funder to contract escrow
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let cheque = Cheque {
            funder: funder.clone(),
            refund_to: refund_to.clone(),
            amount,
            expires_at,
            state: ChequeState::Active,
        };

        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        // Indexed event: (event_name, cheque_id)
        env.events().publish(
            (symbol_short!("created"), cheque_id),
            (funder, refund_to, amount, expires_at),
        );

        Ok(())
    }

    pub fn lock(
        env: Env,
        cheque_id: BytesN<32>,
        to: Address,
        lock_secs: u64,
    ) -> Result<(), Error> {
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;

        if config.paused {
            return Err(Error::ContractPaused);
        }

        let authority: Address = env
            .storage()
            .instance()
            .get(&DataKey::Authority)
            .ok_or(Error::NotInitialized)?;
        authority.require_auth();

        if lock_secs > config.max_lock_secs || lock_secs == 0 {
            return Err(Error::InvalidLockDuration);
        }

        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        if cheque.state != ChequeState::Active {
            return Err(Error::InvalidState);
        }

        let now = env.ledger().timestamp();
        if now >= cheque.expires_at {
            return Err(Error::ChequeExpired);
        }

        let unlock_after = now + lock_secs;
        let executable_after = if cheque.amount >= config.delay_threshold {
            now + config.delay_secs
        } else {
            now
        };

        let lock_info = LockInfo {
            to: to.clone(),
            locked_at: now,
            unlock_after,
            executable_after,
        };

        cheque.state = ChequeState::Locked;

        let lock_key = DataKey::Lock(cheque_id.clone());
        env.storage().persistent().set(&lock_key, &lock_info);
        env.storage()
            .persistent()
            .extend_ttl(&lock_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish(
            (symbol_short!("locked"), cheque_id),
            (to, unlock_after, executable_after),
        );

        Ok(())
    }

    pub fn unlock(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        if cheque.state != ChequeState::Locked {
            return Err(Error::InvalidState);
        }

        let lock_key = DataKey::Lock(cheque_id.clone());
        let lock_info: LockInfo = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(Error::InvalidState)?;
        let now = env.ledger().timestamp();

        let authority: Address = env
            .storage()
            .instance()
            .get(&DataKey::Authority)
            .ok_or(Error::NotInitialized)?;

        // Authority can unlock anytime, or ANYONE after lock expiry
        if now < lock_info.unlock_after {
            authority.require_auth();
        }

        cheque.state = ChequeState::Active;
        env.storage().persistent().remove(&lock_key);

        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events()
            .publish((symbol_short!("unlocked"), cheque_id), ());

        Ok(())
    }

    pub fn veto(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        let guardian: Address = env
            .storage()
            .instance()
            .get(&DataKey::Guardian)
            .ok_or(Error::NotInitialized)?;
        guardian.require_auth();

        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        if cheque.state != ChequeState::Locked {
            return Err(Error::InvalidState);
        }

        let lock_key = DataKey::Lock(cheque_id.clone());
        let lock_info: LockInfo = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(Error::InvalidState)?;
        let now = env.ledger().timestamp();

        if now >= lock_info.executable_after {
            return Err(Error::DelayPassed);
        }

        cheque.state = ChequeState::Active;
        env.storage().persistent().remove(&lock_key);

        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events()
            .publish((symbol_short!("vetoed"), cheque_id), ());

        Ok(())
    }

    pub fn redeem(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        // An incident pause must also stop payouts (cancel and refund stay open so funds can exit).
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;
        if config.paused {
            return Err(Error::ContractPaused);
        }

        let authority: Address = env
            .storage()
            .instance()
            .get(&DataKey::Authority)
            .ok_or(Error::NotInitialized)?;
        authority.require_auth();

        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        if cheque.state != ChequeState::Locked {
            return Err(Error::InvalidState);
        }

        let lock_key = DataKey::Lock(cheque_id.clone());
        let lock_info: LockInfo = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(Error::InvalidState)?;
        let now = env.ledger().timestamp();

        if now < lock_info.executable_after {
            return Err(Error::DelayNotMet);
        }

        if now >= lock_info.unlock_after {
            return Err(Error::LockExpired);
        }

        // Checks-Effects-Interactions: set state BEFORE the token transfer
        cheque.state = ChequeState::Redeemed;
        env.storage().persistent().remove(&lock_key);
        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(
            &env.current_contract_address(),
            &lock_info.to,
            &cheque.amount,
        );

        env.events().publish(
            (symbol_short!("redeemed"), cheque_id),
            (lock_info.to, cheque.amount),
        );

        Ok(())
    }

    pub fn cancel(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        cheque.funder.require_auth();

        if cheque.state != ChequeState::Active {
            return Err(Error::InvalidState);
        }

        // Checks-Effects-Interactions
        cheque.state = ChequeState::Cancelled;
        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(
            &env.current_contract_address(),
            &cheque.refund_to,
            &cheque.amount,
        );

        env.events().publish(
            (symbol_short!("cancelled"), cheque_id),
            (cheque.refund_to, cheque.amount),
        );

        Ok(())
    }

    pub fn refund(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Cheque(cheque_id.clone());
        let mut cheque: Cheque = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        let now = env.ledger().timestamp();
        if now < cheque.expires_at {
            return Err(Error::ChequeNotExpired);
        }

        // Can only refund if Active, or Locked with lock expired
        match cheque.state {
            ChequeState::Active => {}
            ChequeState::Locked => {
                let lock_info: LockInfo = env
                    .storage()
                    .persistent()
                    .get(&DataKey::Lock(cheque_id.clone()))
                    .ok_or(Error::InvalidState)?;
                if now < lock_info.unlock_after {
                    return Err(Error::LockNotExpired);
                }
            }
            _ => return Err(Error::InvalidState),
        }

        // Checks-Effects-Interactions
        cheque.state = ChequeState::Refunded;
        env.storage().persistent().remove(&DataKey::Lock(cheque_id.clone()));
        env.storage().persistent().set(&key, &cheque);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(
            &env.current_contract_address(),
            &cheque.refund_to,
            &cheque.amount,
        );

        env.events().publish(
            (symbol_short!("refunded"), cheque_id),
            (cheque.refund_to, cheque.amount),
        );

        Ok(())
    }

    // Admin functions
    pub fn set_authority(env: Env, new_authority: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Authority, &new_authority);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("authority"),), new_authority);
        Ok(())
    }

    pub fn set_guardian(env: Env, new_guardian: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Guardian, &new_guardian);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("guardian"),), new_guardian);
        Ok(())
    }

    pub fn set_config(env: Env, new_config: Config) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        validate_config(&new_config)?;

        env.storage().instance().set(&DataKey::Config, &new_config);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("config"),), new_config.paused);
        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;
        config.paused = true;
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("paused"),), ());
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;
        config.paused = false;
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("unpaused"),), ());
        Ok(())
    }

    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("adm_prop"),), new_admin);
        Ok(())
    }

    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();

        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.events().publish((symbol_short!("adm_acc"),), pending);
        Ok(())
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    // Views
    pub fn get_cheque(env: Env, cheque_id: BytesN<32>) -> Result<Cheque, Error> {
        let key = DataKey::Cheque(cheque_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)
    }

    /// Current lock for a cheque, if any (only present while state is `Locked`).
    pub fn get_lock(env: Env, cheque_id: BytesN<32>) -> Option<LockInfo> {
        env.storage().persistent().get(&DataKey::Lock(cheque_id))
    }

    pub fn config(env: Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    pub fn authority(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Authority)
            .ok_or(Error::NotInitialized)
    }

    pub fn guardian(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Guardian)
            .ok_or(Error::NotInitialized)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }
}

#[cfg(test)]
mod test;
