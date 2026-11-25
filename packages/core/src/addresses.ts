/**
 * Destination-chain identifiers and address validation for claim payouts.
 * Stellar is the source of funds (Soroban escrow). Recipients may cash out
 * to Stellar USDC, Solana, or Base.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

export const DESTINATION_CHAINS = ['stellar', 'base', 'solana'] as const;
export type DestinationChain = (typeof DESTINATION_CHAINS)[number];

export function isDestinationChain(value: string): value is DestinationChain {
  return (DESTINATION_CHAINS as readonly string[]).includes(value);
}

export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;
export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes a Bitcoin/Solana-style Base58 string. Returns null if invalid. */
export function decodeBase58(input: string): Uint8Array | null {
  if (!input || /[^1-9A-HJ-NP-Za-km-z]/.test(input)) return null;
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') zeros += 1;
  const size = Math.ceil((input.length * Math.log2(58)) / 8) + 1;
  const bytes = new Uint8Array(size);
  for (const ch of input) {
    const val = BASE58_ALPHABET.indexOf(ch);
    if (val < 0) return null;
    let carry = val;
    for (let i = size - 1; i >= 0; i--) {
      carry += 58 * bytes[i]!;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) return null;
  }
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start += 1;
  const out = new Uint8Array(zeros + (bytes.length - start));
  out.set(bytes.slice(start), zeros);
  return out;
}

/** True when the 32-byte key is an on-curve ed25519 public key (a Solana wallet, not a PDA/ATA). */
export function isEd25519OnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

export function validateStellarAddress(address: string): string | null {
  const trimmed = address.trim();
  return STELLAR_ADDRESS_REGEX.test(trimmed)
    ? null
    : 'Enter a valid Stellar address (starts with G, 56 characters).';
}

/** EIP-55 checksum. Lower/upper-only addresses are accepted; mixed case must match. */
export function evmChecksumAddress(address: string): string {
  const hex = address.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }
  const hash = keccak_256(new TextEncoder().encode(hex));
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    const nibble = hash[Math.floor(i / 2)]!;
    const hi = i % 2 === 0 ? nibble >> 4 : nibble & 0x0f;
    out += hi >= 8 ? hex[i]!.toUpperCase() : hex[i];
  }
  return out;
}

export function validateEvmAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!EVM_ADDRESS_REGEX.test(trimmed)) {
    return 'Enter a valid EVM address (0x followed by 40 hex characters).';
  }
  const body = trimmed.slice(2);
  const hasLower = /[a-f]/.test(body);
  const hasUpper = /[A-F]/.test(body);
  if (hasLower && hasUpper && evmChecksumAddress(trimmed) !== trimmed) {
    return 'Enter a valid checksummed EVM address.';
  }
  return null;
}

export function normalizeEvmAddress(address: string): string {
  const err = validateEvmAddress(address);
  if (err) throw new Error(err);
  return evmChecksumAddress(address);
}

/**
 * Accepts a Solana *wallet* (on-curve system account). Rejects ATAs, PDAs, and
 * other off-curve inputs — we always derive the USDC ATA from the owner.
 */
export function validateSolanaOwnerAddress(address: string): string | null {
  const trimmed = address.trim();
  if (trimmed.length < 32 || trimmed.length > 44) {
    return 'Enter a valid Solana wallet address (32–44 Base58 characters).';
  }
  const bytes = decodeBase58(trimmed);
  if (!bytes || bytes.length !== 32) {
    return 'Enter a valid Solana wallet address.';
  }
  if (!isEd25519OnCurve(bytes)) {
    return 'Enter your Solana wallet address, not a token account. We will create the USDC account if needed.';
  }
  return null;
}

/** Validates a payout address for the chosen destination chain. Null when valid. */
export function validateDestinationAddress(chain: DestinationChain, address: string): string | null {
  switch (chain) {
    case 'stellar':
      return validateStellarAddress(address);
    case 'base':
      return validateEvmAddress(address);
    case 'solana':
      return validateSolanaOwnerAddress(address);
  }
}

export function explorerAddressUrl(chain: DestinationChain, address: string, network: 'TESTNET' | 'PUBLIC' = 'TESTNET'): string {
  switch (chain) {
    case 'stellar':
      // stellarchain.io serves testnet from a hostname prefix
      return `${network === 'PUBLIC' ? 'https://stellarchain.io' : 'https://testnet.stellarchain.io'}/account/${address}`;
    case 'base':
      return network === 'PUBLIC'
        ? `https://basescan.org/address/${address}`
        : `https://sepolia.basescan.org/address/${address}`;
    case 'solana':
      return network === 'PUBLIC'
        ? `https://explorer.solana.com/address/${address}`
        : `https://explorer.solana.com/address/${address}?cluster=devnet`;
  }
}

export function explorerTxUrl(chain: DestinationChain, txHash: string, network: 'TESTNET' | 'PUBLIC' = 'TESTNET'): string {
  switch (chain) {
    case 'stellar':
      return `${network === 'PUBLIC' ? 'https://stellarchain.io' : 'https://testnet.stellarchain.io'}/tx/${txHash}`;
    case 'base':
      return network === 'PUBLIC'
        ? `https://basescan.org/tx/${txHash}`
        : `https://sepolia.basescan.org/tx/${txHash}`;
    case 'solana':
      return network === 'PUBLIC'
        ? `https://explorer.solana.com/tx/${txHash}`
        : `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  }
}
