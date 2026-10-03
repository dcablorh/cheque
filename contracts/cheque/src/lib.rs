#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ChequeAlreadyExists = 4,
    ChequeNotFound = 5,
    ChequeNotActive = 6,
    ChequeAlreadyRedeemed = 7,
    ChequeAlreadyRefunded = 8,
    ChequeExpired = 9,
    ChequeNotExpired = 10,
    InvalidAmount = 11,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ChequeStatus {
    Active = 1,
    Redeemed = 2,
    Refunded = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChequeRecord {
    pub sender: Address,
    pub amount_stroops: i128,
    pub status: ChequeStatus,
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    ClaimAuthority,
    Cheque(BytesN<32>),
}

#[contract]
pub struct ChequeContract;

#[contractimpl]
impl ChequeContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        claim_authority: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::ClaimAuthority, &claim_authority);

        Ok(())
    }

    pub fn create_cheque(
        env: Env,
        sender: Address,
        cheque_id: BytesN<32>,
        amount_stroops: i128,
        expires_at: u64,
    ) -> Result<(), Error> {
        sender.require_auth();

        if amount_stroops <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Cheque(cheque_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::ChequeAlreadyExists);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        // Transfer funds from sender to contract escrow
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&sender, &env.current_contract_address(), &amount_stroops);

        let record = ChequeRecord {
            sender,
            amount_stroops,
            status: ChequeStatus::Active,
            expires_at,
        };

        env.storage().persistent().set(&key, &record);

        Ok(())
    }

    pub fn redeem_cheque(
        env: Env,
        cheque_id: BytesN<32>,
        recipient: Address,
    ) -> Result<(), Error> {
        // Must be authorized by the backend claim authority
        let claim_authority: Address = env
            .storage()
            .instance()
            .get(&DataKey::ClaimAuthority)
            .ok_or(Error::NotInitialized)?;
        claim_authority.require_auth();

        let key = DataKey::Cheque(cheque_id.clone());
        let mut record: ChequeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        match record.status {
            ChequeStatus::Redeemed => return Err(Error::ChequeAlreadyRedeemed),
            ChequeStatus::Refunded => return Err(Error::ChequeAlreadyRefunded),
            ChequeStatus::Active => {}
        }

        let now = env.ledger().timestamp();
        if now > record.expires_at {
            return Err(Error::ChequeExpired);
        }

        // Single redemption: atomically mark redeemed before transfer
        record.status = ChequeStatus::Redeemed;
        env.storage().persistent().set(&key, &record);

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(
            &env.current_contract_address(),
            &recipient,
            &record.amount_stroops,
        );

        Ok(())
    }

    pub fn refund_cheque(env: Env, cheque_id: BytesN<32>) -> Result<(), Error> {
        let key = DataKey::Cheque(cheque_id.clone());
        let mut record: ChequeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)?;

        match record.status {
            ChequeStatus::Redeemed => return Err(Error::ChequeAlreadyRedeemed),
            ChequeStatus::Refunded => return Err(Error::ChequeAlreadyRefunded),
            ChequeStatus::Active => {}
        }

        let now = env.ledger().timestamp();
        let claim_authority: Address = env
            .storage()
            .instance()
            .get(&DataKey::ClaimAuthority)
            .ok_or(Error::NotInitialized)?;

        // Refund can happen if expired, or if authorized by claim authority (sender cancel)
        if now <= record.expires_at {
            claim_authority.require_auth();
        }

        record.status = ChequeStatus::Refunded;
        env.storage().persistent().set(&key, &record);

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(
            &env.current_contract_address(),
            &record.sender,
            &record.amount_stroops,
        );

        Ok(())
    }

    pub fn get_cheque(env: Env, cheque_id: BytesN<32>) -> Result<ChequeRecord, Error> {
        let key = DataKey::Cheque(cheque_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ChequeNotFound)
    }
}

#[cfg(test)]
mod test;
