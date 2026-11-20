import { describe, it, expect } from 'vitest';
import {
  validateStellarAddress,
  validateEvmAddress,
  validateSolanaOwnerAddress,
  validateDestinationAddress,
  evmChecksumAddress,
  decodeBase58,
  isEd25519OnCurve,
  quantizeStroopsToSixDecimals,
  stroopsToMicroUsdc,
  microUsdcToStroops,
  microUsdcToString,
  validatePayoutDestination,
  CORRIDORS,
  RedeemChequeSchema,
} from '../src/index.js';

const VALID_STELLAR = 'G' + 'A'.repeat(55);
/** On-curve Solana wallet used in the testnet spike. */
const SOLANA_OWNER = '2tsqy83JyTQMCVQysqWEFe76zEKqoBvb4JeLtWzKpYEx';
/** Associated token account (PDA, off-curve) derived from the owner above. */
const SOLANA_ATA = '8iwQRhpeDNALXjXcutPP15BLND3QKnEB7ffmWkZ5DyLZ';
const EVM_CHECKSUM = '0xfc4Ad12BC5Dd48f78fcAD24d476bDDF22A92390A';

describe('Stellar addresses', () => {
  it('accepts a G-address of 56 characters', () => {
    expect(validateStellarAddress(VALID_STELLAR)).toBeNull();
    expect(validateDestinationAddress('stellar', VALID_STELLAR)).toBeNull();
  });

  it('rejects short or C-contract addresses', () => {
    expect(validateStellarAddress('GABC')).toMatch(/Stellar address/);
    expect(validateStellarAddress('C' + 'A'.repeat(55))).toMatch(/Stellar address/);
  });
});

describe('EVM / Base addresses', () => {
  it('accepts lowercase, uppercase, and a correct checksum', () => {
    expect(validateEvmAddress(EVM_CHECKSUM.toLowerCase())).toBeNull();
    expect(validateEvmAddress('0x' + 'F'.repeat(40))).toBeNull();
    expect(validateEvmAddress(EVM_CHECKSUM)).toBeNull();
    expect(evmChecksumAddress(EVM_CHECKSUM.toLowerCase())).toBe(EVM_CHECKSUM);
  });

  it('rejects a bad length or a wrong mixed-case checksum', () => {
    expect(validateEvmAddress('0x1234')).toMatch(/EVM address/);
    // Flip one letter of a known checksum to violate EIP-55 while staying mixed-case.
    const broken = EVM_CHECKSUM[2] === 'f'
      ? '0xF' + EVM_CHECKSUM.slice(3)
      : '0xf' + EVM_CHECKSUM.slice(3);
    expect(broken).not.toBe(evmChecksumAddress(EVM_CHECKSUM));
    expect(validateEvmAddress(broken)).toMatch(/checksum/i);
  });
});

describe('Solana owner addresses', () => {
  it('accepts an on-curve wallet and rejects an ATA/PDA', () => {
    expect(validateSolanaOwnerAddress(SOLANA_OWNER)).toBeNull();
    const ataErr = validateSolanaOwnerAddress(SOLANA_ATA);
    expect(ataErr).toMatch(/wallet address/i);
    const ownerBytes = decodeBase58(SOLANA_OWNER);
    const ataBytes = decodeBase58(SOLANA_ATA);
    expect(ownerBytes).toHaveLength(32);
    expect(ataBytes).toHaveLength(32);
    expect(isEd25519OnCurve(ownerBytes!)).toBe(true);
    expect(isEd25519OnCurve(ataBytes!)).toBe(false);
  });

  it('rejects garbage', () => {
    expect(validateSolanaOwnerAddress('not-a-key!!!')).toMatch(/Solana/);
    expect(validateSolanaOwnerAddress('short')).toMatch(/Solana/);
  });
});

describe('corridor payout validation is chain-aware', () => {
  it('accepts Base and Solana USDC destinations in every corridor', () => {
    for (const c of Object.values(CORRIDORS)) {
      expect(validatePayoutDestination(c, { type: 'USDC', accountRef: VALID_STELLAR })).toBeNull();
      expect(
        validatePayoutDestination(c, { type: 'USDC', chain: 'base', accountRef: EVM_CHECKSUM })
      ).toBeNull();
      expect(
        validatePayoutDestination(c, { type: 'USDC', chain: 'solana', accountRef: SOLANA_OWNER })
      ).toBeNull();
      expect(
        validatePayoutDestination(c, { type: 'USDC', chain: 'solana', accountRef: SOLANA_ATA })
      ).toMatch(/wallet address/i);
    }
  });
});

describe('RedeemChequeSchema accepts a destination chain', () => {
  it('parses a Base destination', () => {
    const parsed = RedeemChequeSchema.safeParse({
      destination: { type: 'USDC', chain: 'base', accountRef: EVM_CHECKSUM },
      idempotencyKey: 'idem-12345678',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.destination.chain).toBe('base');
  });

  it('defaults chain to undefined when omitted (treated as Stellar)', () => {
    const parsed = RedeemChequeSchema.safeParse({
      destination: { type: 'USDC', accountRef: VALID_STELLAR },
      idempotencyKey: 'idem-12345678',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('6-decimal USDC quantization', () => {
  it('drops the 7th Stellar decimal and converts to micro-USDC', () => {
    expect(quantizeStroopsToSixDecimals(12_345_678n)).toBe(12_345_670n);
    expect(quantizeStroopsToSixDecimals(10_000_000n)).toBe(10_000_000n);
    expect(stroopsToMicroUsdc(12_345_678n)).toBe(1_234_567n);
    expect(microUsdcToStroops(1_234_567n)).toBe(12_345_670n);
    expect(microUsdcToString(1_947_031n)).toBe('1.947031');
    expect(microUsdcToString(50_000n)).toBe('0.050000');
  });
});
