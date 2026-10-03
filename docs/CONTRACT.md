# Soroban Escrow Smart Contract Specification (`contracts/cheque`)

## 1. Overview
The **Cheque Escrow Contract** is a high-assurance Soroban smart contract written in Rust (`soroban-sdk = "22"`). It provides on-chain escrow, single-redemption enforcement, and time-locked settlements for Digital Cheques denominated in USDC on the Stellar network.

---

## 2. Security Guarantees & Non-Negotiable Rules

1. **Single Redemption Guarantee**:
   - Enforced on-chain via atomic state transition: `state: ChequeState::Locked -> ChequeState::Redeemed`.
   - Uses the strict **Checks-Effects-Interactions** pattern: the contract updates state and deletes the lock *before* invoking the token client transfer.
   - Any second redemption attempt immediately aborts with `Error::InvalidState`.

2. **Integer-Only Stroops (USDC 7 Decimals)**:
   - All amounts are 128-bit signed integers (`i128`).
   - `1 USDC = 10,000,000 stroops`. Floating point numbers are strictly forbidden.

3. **No Stranded Funds**:
   - An authorized lock that fails or is unused can be unlocked by the authority at any time, or by **anyone** after `lock_secs` has elapsed, returning the cheque safely to `Active`.
   - If a cheque reaches `expires_at`, **anyone** can trigger `refund(cheque_id)`, returning 100% of escrowed funds to `refund_to`.

4. **Abuse & SIM-Swap Protection**:
   - High-value cheques (`amount >= delay_threshold`) trigger an mandatory on-chain delay (`delay_secs`) before `redeem` can be executed.
   - During this delay window, the **Guardian** can execute `veto(cheque_id)` to cancel an illicit claim and return the cheque to `Active`.

---

## 3. Storage Layout

### Instance Storage
Shared contract configuration and privileged roles:
*   `Admin`: `Address` — Contract administrator (two-step transfer).
*   `PendingAdmin`: `Option<Address>` — Nominated administrator in two-step handover.
*   `Authority`: `Address` — Backend claim authority key (authorizes verified OTP claims).
*   `Guardian`: `Address` — Multisig security key (can veto delayed high-value payouts).
*   `Token`: `Address` — Canonical Stellar Asset Contract (SAC) address for USDC.
*   `Config`:
    *   `min_amount`: `i128` (default: 1 USDC = 10,000,000 stroops)
    *   `max_amount`: `i128` (default: 2,000 USDC = 20,000,000,000 stroops)
    *   `max_lock_secs`: `u64` (default: 3600s / 1 hour)
    *   `delay_threshold`: `i128` (default: 50 USDC = 500,000,000 stroops)
    *   `delay_secs`: `u64` (default: 900s / 15 minutes)
    *   `paused`: `bool` (when `true`, blocks `create_cheque` and `lock`; never blocks `cancel` or `refund`)

### Persistent Storage (Per Cheque)
Key: `DataKey::Cheque(BytesN<32>)`
*   `funder`: `Address` — Account that funded the cheque.
*   `refund_to`: `Address` — Destination if cancelled or expired without claim.
*   `amount`: `i128` — Stroops locked in escrow.
*   `expires_at`: `u64` — Unix timestamp after which anyone can trigger refund.
*   `state`: `ChequeState` — `Active` (1), `Locked` (2), `Redeemed` (3), `Cancelled` (4), `Refunded` (5).
*   `lock`: `Option<LockInfo>`:
    *   `to`: `Address` — Recipient destination address.
    *   `locked_at`: `u64`
    *   `unlock_after`: `u64`
    *   `executable_after`: `u64`

---

## 4. State Machine Diagram

```
                 funder cancels
           ┌────────────────────────► [Cancelled] (Terminal)
           │
           │
    [Active] ◄────── authority / anyone unlocks ──────┐
       │     ◄────── guardian vetoes (if delayed) ────┤
       │                                              │
 authority locks                                      │
       │                                              │
       ▼                                              │
    [Locked] ─────────────────────────────────────────┘
       │
       ├──── authority redeems (now >= executable_after) ──► [Redeemed] (Terminal)
       │
       └──── expires_at reached & lock expired ────────────► [Refunded] (Terminal)
```

---

## 5. Functions & Authorization Matrix

| Function | Caller Authorization | Valid Initial State | Resulting State | Description |
|---|---|---|---|---|
| `init` | `admin.require_auth()` | None (once) | Initialized | Sets roles, token address, and config. |
| `create_cheque` | `funder.require_auth()` | None | `Active` | Pulls USDC from funder to contract. Emits `created`. |
| `lock` | `authority.require_auth()` | `Active` | `Locked` | Commits destination `to`. Emits `locked`. |
| `unlock` | `authority` or `ANYONE` (after lock expiry) | `Locked` | `Active` | Releases destination lock. Emits `unlocked`. |
| `veto` | `guardian.require_auth()` | `Locked` (pre-delay) | `Active` | Halts payout before execution. Emits `vetoed`. |
| `redeem` | `authority.require_auth()` | `Locked` | `Redeemed` | Transfers USDC to `to`. Emits `redeemed`. |
| `cancel` | `funder.require_auth()` | `Active` | `Cancelled` | Refunds USDC to `refund_to`. Emits `cancelled`. |
| `refund` | `ANYONE` | `Active` or expired `Locked` | `Refunded` | Refunds USDC to `refund_to` after `expires_at`. Emits `refunded`. |
| `pause` / `unpause` | `admin.require_auth()` | Any | Paused / Unpaused | Blocks new deposits/locks. |
| `transfer_admin` | `admin.require_auth()` | Any | Pending Admin | Step 1 of admin handover. |
| `accept_admin` | `pending.require_auth()` | Pending Admin | New Admin | Step 2 of admin handover. |

---

## 6. Events Specification
All events publish indexed topics `(event_name, cheque_id)`:
1. `(Symbol("created"), cheque_id)`: Data `(funder, refund_to, amount, expires_at)`
2. `(Symbol("locked"), cheque_id)`: Data `(to, unlock_after, executable_after)`
3. `(Symbol("unlocked"), cheque_id)`: Data `()`
4. `(Symbol("vetoed"), cheque_id)`: Data `()`
5. `(Symbol("redeemed"), cheque_id)`: Data `(to, amount)`
6. `(Symbol("cancelled"), cheque_id)`: Data `(refund_to, amount)`
7. `(Symbol("refunded"), cheque_id)`: Data `(refund_to, amount)`

---

## 7. Storage TTL Management
To prevent state archival on Stellar:
*   On contract initialization, `extend_ttl` is called on instance storage for `35 days` (approx `604,800` ledgers).
*   On every mutation (`create_cheque`, `lock`, `unlock`, `veto`, `redeem`, `cancel`, `refund`), `extend_ttl` is refreshed on both instance storage and the cheque's persistent entry.
