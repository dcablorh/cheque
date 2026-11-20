import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  FORWARD_HOOK_BASIC,
  associatedTokenAddress,
  cctpDestinationDomain,
  encodeForwardHook,
  encodeMintRecipient,
  encodeSolanaAtaSetupHook,
  evmAddressToBytes32,
  isCctpForwardSuccess,
  maxFeeStroopsFromQuote,
  SOLANA_DEVNET_USDC_MINT,
} from '../src/cctp.js';

const EVM = '0xfc4Ad12BC5Dd48f78fcAD24d476bDDF22A92390A';
const SOLANA_OWNER = '2tsqy83JyTQMCVQysqWEFe76zEKqoBvb4JeLtWzKpYEx';
const SOLANA_ATA = '8iwQRhpeDNALXjXcutPP15BLND3QKnEB7ffmWkZ5DyLZ';

describe('CCTP encoding', () => {
  it('left-pads a 20-byte EVM address to 32 bytes', () => {
    const buf = evmAddressToBytes32(EVM);
    expect(buf).toHaveLength(32);
    expect(buf.subarray(0, 12).equals(Buffer.alloc(12))).toBe(true);
    expect(buf.subarray(12).toString('hex')).toBe(EVM.slice(2).toLowerCase());
    const mint = encodeMintRecipient('base', EVM);
    expect(mint.equals(buf)).toBe(true);
  });

  it('uses the derived ATA as the Solana mintRecipient, not the wallet', () => {
    const mint = new PublicKey(SOLANA_DEVNET_USDC_MINT);
    const owner = new PublicKey(SOLANA_OWNER);
    const ata = associatedTokenAddress(mint, owner);
    expect(ata.toBase58()).toBe(SOLANA_ATA);
    const encoded = encodeMintRecipient('solana', SOLANA_OWNER, SOLANA_ATA);
    expect(encoded).toHaveLength(32);
    expect(Buffer.from(ata.toBytes()).equals(encoded)).toBe(true);
    expect(() => encodeMintRecipient('solana', SOLANA_OWNER)).toThrow(/ATA/);
  });

  it('encodes the basic forwarding hook and the Solana ATA-setup hook', () => {
    expect(encodeForwardHook('base').equals(FORWARD_HOOK_BASIC)).toBe(true);
    expect(FORWARD_HOOK_BASIC.toString('utf8').startsWith('cctp-forward')).toBe(true);
    const hook = encodeSolanaAtaSetupHook(SOLANA_OWNER);
    expect(hook).toHaveLength(65);
    expect(hook.subarray(0, 12).toString('utf8')).toBe('cctp-forward');
    expect(hook.readUInt32BE(24)).toBe(0);
    expect(hook.readUInt32BE(28)).toBe(33);
    expect(hook[32]).toBe(1);
    expect(Buffer.from(hook.subarray(33)).equals(Buffer.from(new PublicKey(SOLANA_OWNER).toBytes()))).toBe(
      true,
    );
    expect(encodeForwardHook('solana', { includeRecipientSetup: true, solanaOwner: SOLANA_OWNER }).equals(hook)).toBe(
      true,
    );
  });

  it('maps destination chains to CCTP domains', () => {
    expect(cctpDestinationDomain('base')).toBe(6);
    expect(cctpDestinationDomain('solana')).toBe(5);
  });
});

describe('CCTP fee and success helpers', () => {
  it('converts a 6-decimal med forward fee to 7-decimal stroops and adds the protocol bps', () => {
    // 0.052754 USDC + 0 bps on a 2 USDC burn
    const noProtocol = maxFeeStroopsFromQuote(20_000_000n, {
      finalityThreshold: 2000,
      minimumFee: 0,
      forwardFee: { low: 52720, med: 52754, high: 52969 },
    });
    expect(noProtocol).toBe(527_540n);

    // 1 bp = 0.01%. Formula: amount * ceil(bps * 100) / 1_000_000
    // 1 USDC * 1 bp -> (10_000_000 * 100) / 1_000_000 = 1_000 stroops = 0.0001 USDC
    const withBps = maxFeeStroopsFromQuote(10_000_000n, {
      finalityThreshold: 2000,
      minimumFee: 1,
      forwardFee: { med: 0 },
    });
    expect(withBps).toBe(1_000n);
  });

  it('treats Iris success as status=complete plus a forwardTxHash, regardless of forwardState', () => {
    expect(isCctpForwardSuccess({ status: 'complete', forwardTxHash: '0xabc' })).toBe(true);
    expect(isCctpForwardSuccess({ status: 'complete', forwardTxHash: 'sig' })).toBe(true);
    expect(isCctpForwardSuccess({ status: 'complete' })).toBe(false);
    expect(isCctpForwardSuccess({ status: 'pending_confirmations', forwardTxHash: '0xabc' })).toBe(false);
  });
});
