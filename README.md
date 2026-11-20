# sencheq

**If you can send a message, you can send money.**

sencheq is a cross-border digital cheque. A sender writes a cheque for someone in another country, gets a link, and sends it on WhatsApp, Telegram, SMS or email. Whoever holds the link can claim the money and choose where it goes. The recipient needs no app and no account.

Corridors: **Ghana (GHS, mobile money), Nigeria (NGN, bank) and the United States (USD, bank)**. Money is held in an on-chain escrow on the Stellar network until it is claimed or refunded.

> Status: early build. Settlement runs on Stellar testnet with USDC. Local cash-out (mobile money and bank payouts) is being connected and is not live yet.

## How it works

1. **Write.** The sender enters the recipient's name, the amount in the recipient's currency, an optional note and an expiry (24 hours, 48 hours or 7 days). They can add a signature.
2. **Fund.** The amount is locked in a Soroban escrow contract as USDC. The sender can pay with a Stellar wallet.
3. **Share.** The sender gets a claim link and sends it to the recipient in any chat app.
4. **Claim.** The recipient opens the link, sees the cheque, verifies their phone with a one-time code, and chooses a destination.
5. **Settle or refund.** The money is paid out to the destination. If nobody claims it before it expires, the escrow returns it to the sender automatically. A sender can cancel before the recipient starts claiming.

Each cheque shows the amount in words and figures, the recipient, the sender, a cheque number and a memo, so it reads like a real cheque.

## Principles

- **The user sees a cheque, not a blockchain.** Stellar, USDC and settlement details stay in small print.
- **Sender says who. Recipient says where.**
- **Money is locked once and leaves once.** A cheque can be redeemed only one time, enforced on-chain.
- **Nothing is silently lost.** Every state change is recorded, and unclaimed money goes back.
- **Providers are replaceable.** Settlement sits behind an adapter interface.

## Repository layout

| Path | What it is |
|---|---|
| `frontend/` | Next.js web app: landing page, sender app (`/app`) and claim page (`/c/[token]`) |
| `api/` | Fastify API: cheques, claims, auth, configuration and the outbox worker |
| `packages/core` | Domain logic: state machine, money, corridors, ledger, outbox, migrations |
| `packages/chain` | Stellar and Soroban client, signing, idempotent chain operations |
| `packages/notify` | Phone normalisation, OTP over WhatsApp with SMS fallback, auth tokens |
| `packages/shared` | Environment parsing and logging |
| `contract/cheque` | Soroban escrow contract (Rust) |
| `scripts/` | Testnet bootstrap, contract deploy and end-to-end flows |
| `docs/` | Product spec, implementation spec, contract spec, design system, settlement guides |

All project documentation is consolidated in the **`docs/`** directory:
- **[docs/SETUP.md](docs/SETUP.md)** — Manual setup guide (environment, database, email, deployment)
- **[docs/cheque.md](docs/cheque.md)** — Digital Cheques for Ghana implementation spec
- **[docs/SPEC.md](docs/SPEC.md)** — Core product specification
- **[docs/PRD.md](docs/PRD.md)** — Product requirements (source document: `docs/sendcheq_PRD_v4.docx`)
- **[docs/CONTRACT.md](docs/CONTRACT.md)** — Soroban smart contract specification
- **[docs/DESIGN.md](docs/DESIGN.md)** — Visual design system and UI components
- **[docs/moropay.md](docs/moropay.md)** — MoraPay offramp & onramp integration guide
- **[docs/SEEVCASH_FINDINGS.md](docs/SEEVCASH_FINDINGS.md)** — SeevCash Stellar Anchor findings
- **[docs/morapay/](docs/morapay/README.md)** — Mirrored MoraPay developer documentation

## Quick start

Requirements: Node 20+, pnpm 10, Docker (for Postgres and Redis). Rust and the `wasm32v1-none` target are only needed to build the contract.

```bash
# 1. install dependencies
pnpm install

# 2. start Postgres and Redis
docker compose up -d

# 3. create your env file and fill in the blanks
cp .env.example .env

# 4. create testnet accounts and fund them (writes the public keys to .env)
pnpm bootstrap:testnet

# 5. run the API (port 3001) and the web app (port 3100)
pnpm dev
```

Open http://localhost:3100. The API runs its database migrations on start.

### Useful commands

| Command | Does |
|---|---|
| `pnpm test` | Runs the unit tests in every package |
| `pnpm build` | Builds all packages and the frontend |
| `pnpm build:contract` | Builds the Soroban contract to WASM |
| `pnpm deploy:contract` | Deploys the contract to testnet |
| `pnpm e2e:contract` | Runs the contract flow end to end |
| `pnpm e2e:wallet` | Runs the wallet funding flow end to end |
| `pnpm e2e:cctp` | Creates a testnet cheque and claims it to Base or Solana via CCTP |

## Configuration

All settings live in `.env`. See `.env.example` for the full list and the comments. The main groups are:

- **Database and cache:** `DATABASE_URL`, `REDIS_URL`
- **Stellar:** `STELLAR_NETWORK`, horizon and Soroban RPC URLs, USDC issuer, `CHEQUE_CONTRACT_ID`, and the testnet account keys
- **Messaging:** WhatsApp Cloud API, SMS provider, and the email key for cheque notifications
- **Pricing:** `ENABLED_CORRIDORS`, FX rates per corridor, and `FEE_BPS` (100 bps = 1%)
- **Security:** `JWT_SECRET` and `OTP_SALT`. Change both before any shared deployment.

Never commit secret keys. The `.env` file is ignored by git.

## Status and known limits

- Funding and USDC payouts run on the Stellar testnet. A cheque is always escrowed in USDC on Stellar (Soroban). Claimants can receive that USDC on Stellar, or bridge it to Base or Solana with Circle CCTP. Mobile money (MTN, Telecel, AirtelTigo) and bank payouts go through a settlement adapter that only has a mock implementation so far.
- The FX rates in `.env.example` are placeholders. Replace them with live quotes before launch.
- Regulatory approval for holding and paying out customer funds is still open. Settle it before any real money moves.

## Running locally (contributors)

1. Install prerequisites: Node 20+, pnpm 10, Docker (Postgres + Redis). Rust + `wasm32v1-none` target only for the contract.
2. `pnpm install`
3. `docker compose up -d` (Postgres on 5432, Redis on 6379)
4. `cp .env.example .env` and fill in secrets; bootstrap writes testnet keys to `.env.local`.
5. `pnpm bootstrap:testnet`
6. `pnpm build:contract && pnpm deploy:contract`
7. Copy env if needed: `cp .env.local api/.env.local`
8. `pnpm dev` (web: 3100, API: 3001; migrations run on API start)
9. Sign in with an email or phone OTP and write your first cheque.

Useful: `pnpm test`, `pnpm build`, `pnpm lint`. Without Redis, OTP and IP rate-limit state fall back to in-memory stores for development. Cheque state, the ledger, and the outbox still require Postgres.


## Network and contract IDs

These IDs are on **Stellar Testnet**. Stellar is the source of funds: every cheque is locked in the Soroban escrow below, then either paid out as Stellar USDC or burned through Circle CCTP V2 (with the Forwarding Service) to Base Sepolia or Solana Devnet.

### Stellar (source)

| What | ID |
|---|---|
| Network | Testnet (`Test SDF Network ; September 2015`) |
| Cheque escrow contract | `CD2WZT2QH7RABNKIRFHIRQGF63R5OBZNEOUZAQD4GOIP2X2FATCJDSKM` |
| Circle USDC (classic issuer) | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Circle USDC (Stellar Asset Contract) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| CCTP TokenMessengerMinter | `CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP` |
| CCTP MessageTransmitter | `CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY` |
| CCTP Forwarder | `CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ` |
| Settlement account (receives escrow on cross-chain redeem, then burns) | `GC7NESFNIKPLWIYW2APKFSEXX54GXTFBNALMJ73LPJZGYKMIIIB3WYST` |
| Funding account (platform create_cheque) | `GAYSXQKLWK7ZD4BMA3BAQPUF5LOSGNINMCKBWZ7WYD262XBAICKQ7JD7` |
| CCTP domain (Stellar) | `27` |

Contract deploy (20 Nov 2026, Africa/Accra):

- WASM upload: [7632bfa35645d578f3ea8a9dbe01cd6981ab2dae7e79862515bffb4afe6750a5](https://stellar.expert/explorer/testnet/tx/7632bfa35645d578f3ea8a9dbe01cd6981ab2dae7e79862515bffb4afe6750a5)
- Create: [f1588ce37039479f78179a477d9047e15d04b28ac6856e334fcb1619e9bc80d1](https://stellar.expert/explorer/testnet/tx/f1588ce37039479f78179a477d9047e15d04b28ac6856e334fcb1619e9bc80d1)
- Init: [63ea719b933bfcfadde4de4bb3eaa7b811abebab9601c57532eb5b27f426b5ef](https://stellar.expert/explorer/testnet/tx/63ea719b933bfcfadde4de4bb3eaa7b811abebab9601c57532eb5b27f426b5ef)

### Destination chains

| Chain | Domain | USDC |
|---|---|---|
| Base Sepolia | `6` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Solana Devnet | `5` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

### Spike (direct settlement burns, 20 Nov 2026, Africa/Accra)

2 USDC each, forwarded from Stellar.

**Base Sepolia** (received 1.947031 USDC):

- Approve: [a29712999948f65b81d9c355a45b4c4c0b48ce7bb02e0f150fdf86377d433243](https://stellar.expert/explorer/testnet/tx/a29712999948f65b81d9c355a45b4c4c0b48ce7bb02e0f150fdf86377d433243)
- Burn: [9a4908d5f6b63b3fbf1a572255a965721fea91ca90dff9d929022ad554f2db6c](https://stellar.expert/explorer/testnet/tx/9a4908d5f6b63b3fbf1a572255a965721fea91ca90dff9d929022ad554f2db6c)
- Mint: [0x49458849658f890a4a44949cb230d56e3bf8a071f25ac965ec1e1de62bff8c42](https://sepolia.basescan.org/tx/0x49458849658f890a4a44949cb230d56e3bf8a071f25ac965ec1e1de62bff8c42)

**Solana Devnet** (received 1.786744 USDC, ATA created):

- Approve: [e7c2d56e9a15a0c804d24ed5ab23a7c268b73fe506d693290e854af83cfad520](https://stellar.expert/explorer/testnet/tx/e7c2d56e9a15a0c804d24ed5ab23a7c268b73fe506d693290e854af83cfad520)
- Burn: [dc75b32159aff31b5fe8ec0fd73f6a033833c5f5a6ccb87b48eaef943f028e28](https://stellar.expert/explorer/testnet/tx/dc75b32159aff31b5fe8ec0fd73f6a033833c5f5a6ccb87b48eaef943f028e28)
- Mint: [3ubGJJyP3sWMCsGiy55neG52m2wUT3bpBapWnwtWhhC3MDj9xuvvegYB44UAazYChsyqL9HNifGudtCgYSvd6Jk5](https://explorer.solana.com/tx/3ubGJJyP3sWMCsGiy55neG52m2wUT3bpBapWnwtWhhC3MDj9xuvvegYB44UAazYChsyqL9HNifGudtCgYSvd6Jk5?cluster=devnet)

### Product e2e (API + escrow + CCTP, 20 Nov 2026, Africa/Accra)

US $5 cheques, claimed after email OTP. USDC was escrowed on Stellar, redeemed to the settlement account, then burned with the forwarding hook.

Funding top-up (11 USDC, settlement → funding): [c466adc6b7fcb2482209fab05ac84ec8d9658b5f87a3f8bd4e2c33314f35b99a](https://stellar.expert/explorer/testnet/tx/c466adc6b7fcb2482209fab05ac84ec8d9658b5f87a3f8bd4e2c33314f35b99a)

**Base Sepolia** — cheque `CHQ-63JV93` (`2c2f1c9e-71d9-417b-ae39-bd1f8c5db82c`), fee 0.052745 USDC, received 4.947255 USDC:

- create_cheque: [557c0a6426e667d08f30c9cfde28390332b39f7e885dd02c00bc43222069d11a](https://stellar.expert/explorer/testnet/tx/557c0a6426e667d08f30c9cfde28390332b39f7e885dd02c00bc43222069d11a)
- lock (to settlement): [fc76d0ed5093fc55debfde162bab40981e72ec874596bb9ab955dc1d0e5c886f](https://stellar.expert/explorer/testnet/tx/fc76d0ed5093fc55debfde162bab40981e72ec874596bb9ab955dc1d0e5c886f)
- redeem (escrow → settlement): [b3de3d8f9aa19f464c580173b727918f18d929ef2a193a847d96a72441b627e1](https://stellar.expert/explorer/testnet/tx/b3de3d8f9aa19f464c580173b727918f18d929ef2a193a847d96a72441b627e1)
- CCTP burn: [3471f17fbcf463d7e3c58b26ba600f5c29a792d817b53afa1c98477549f9663e](https://stellar.expert/explorer/testnet/tx/3471f17fbcf463d7e3c58b26ba600f5c29a792d817b53afa1c98477549f9663e)
- Base mint: [0x285d584fc0ad9d567bf7469f67a986bbb297f98c56ffe78b7b0141a5718766cc](https://sepolia.basescan.org/tx/0x285d584fc0ad9d567bf7469f67a986bbb297f98c56ffe78b7b0141a5718766cc)

**Solana Devnet** — cheque `CHQ-HSE4C5` (`28d9ddab-c1d6-4092-a48e-3a1a943cdfc0`), fee 0.105803 USDC, received 4.894197 USDC:

- create_cheque: [e90527aab6a7d1953d01482f7af1bcbd75db35b4b3de53a14ef7b95800c30882](https://stellar.expert/explorer/testnet/tx/e90527aab6a7d1953d01482f7af1bcbd75db35b4b3de53a14ef7b95800c30882)
- lock (to settlement): [5f833015405aa117a5fd22a99c5c5462d33950ad24918e3ab714bca08c04f251](https://stellar.expert/explorer/testnet/tx/5f833015405aa117a5fd22a99c5c5462d33950ad24918e3ab714bca08c04f251)
- redeem (escrow → settlement): [41657d23fce8630a79f1eeb3594612c6fab743382b9139346dd9f9f5b427919e](https://stellar.expert/explorer/testnet/tx/41657d23fce8630a79f1eeb3594612c6fab743382b9139346dd9f9f5b427919e)
- CCTP burn: [91f6fc91dc676c70f72a27694e3d5532db1545a7da689f481e58eb7d9d39816a](https://stellar.expert/explorer/testnet/tx/91f6fc91dc676c70f72a27694e3d5532db1545a7da689f481e58eb7d9d39816a)
- Solana mint: [nQmkP3WpNkB1icDbNYxxngd8cxxVobx9gZRTrFLqvqPcKjbwfHWbcEwmVq9aCMJaZVce7x84E94qUXyHhYDKBSA](https://explorer.solana.com/tx/nQmkP3WpNkB1icDbNYxxngd8cxxVobx9gZRTrFLqvqPcKjbwfHWbcEwmVq9aCMJaZVce7x84E94qUXyHhYDKBSA?cluster=devnet)

## Contributing

Work on a branch, open a pull request into `main`, and keep changes focused. Run `pnpm test` and `pnpm build` before you push.
