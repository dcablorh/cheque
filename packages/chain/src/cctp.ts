/**
 * Circle CCTP V2 client for transfers that start on Stellar (Soroban).
 * Burns native USDC from a Stellar settlement account and uses the Forwarding
 * Service so the recipient needs no dest-chain gas.
 */
import {
  Address,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import type { DestinationChain } from '@cheque/core';
import { evmChecksumAddress, decodeBase58 } from '@cheque/core';

export const CCTP_STELLAR_DOMAIN = 27;
export const CCTP_BASE_DOMAIN = 6;
export const CCTP_SOLANA_DOMAIN = 5;

export const TESTNET_USDC_SAC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const TESTNET_TOKEN_MESSENGER_MINTER =
  'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP';
export const MAINNET_USDC_SAC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
export const MAINNET_TOKEN_MESSENGER_MINTER =
  'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL';

export const SOLANA_DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const SOLANA_MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/** "cctp-forward" + hook version 0 + empty additional length (32 bytes). */
export const FORWARD_HOOK_BASIC = Buffer.from(
  '636374702d666f72776172640000000000000000000000000000000000000000',
  'hex',
);

export function cctpDestinationDomain(chain: Exclude<DestinationChain, 'stellar'>): number {
  return chain === 'base' ? CCTP_BASE_DOMAIN : CCTP_SOLANA_DOMAIN;
}

export function evmAddressToBytes32(address: string): Buffer {
  const checksummed = evmChecksumAddress(address);
  const hex = checksummed.toLowerCase().replace(/^0x/, '');
  return Buffer.from(hex.padStart(64, '0'), 'hex');
}

export function solanaPubkeyToBytes32(base58: string): Buffer {
  const bytes = decodeBase58(base58);
  if (!bytes || bytes.length !== 32) {
    throw new Error(`Invalid Solana public key: ${base58}`);
  }
  return Buffer.from(bytes);
}

export function associatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** Version-0 forwarding hook that asks the Forwarding Service to create the recipient ATA. */
export function encodeSolanaAtaSetupHook(ownerBase58: string): Buffer {
  const owner = decodeBase58(ownerBase58);
  if (!owner || owner.length !== 32) {
    throw new Error(`Invalid Solana owner for ATA hook: ${ownerBase58}`);
  }
  const magic = Buffer.alloc(24);
  magic.write('cctp-forward', 'utf-8');
  const version = Buffer.alloc(4); // 0
  const length = Buffer.alloc(4);
  length.writeUInt32BE(33);
  const ataFlag = Buffer.from([1]);
  return Buffer.concat([magic, version, length, ataFlag, Buffer.from(owner)]);
}

export function encodeMintRecipient(
  chain: Exclude<DestinationChain, 'stellar'>,
  address: string,
  solanaAta?: string,
): Buffer {
  if (chain === 'base') return evmAddressToBytes32(address);
  if (!solanaAta) throw new Error('Solana mintRecipient must be the USDC ATA, not the wallet');
  return solanaPubkeyToBytes32(solanaAta);
}

export function encodeForwardHook(
  chain: Exclude<DestinationChain, 'stellar'>,
  opts: { includeRecipientSetup?: boolean; solanaOwner?: string } = {},
): Buffer {
  if (chain === 'solana' && opts.includeRecipientSetup) {
    if (!opts.solanaOwner) throw new Error('solanaOwner is required for ATA setup hook');
    return encodeSolanaAtaSetupHook(opts.solanaOwner);
  }
  return FORWARD_HOOK_BASIC;
}

export interface IrisFeeQuoteRaw {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee?: { low?: number; med?: number; medium?: number; high?: number };
}

export interface CctpFeeQuote {
  finalityThreshold: number;
  minimumFeeBps: number;
  forwardFeeMicro: { low: bigint; med: bigint; high: bigint };
  /** max_fee in Stellar 7-decimal stroops, using the med quote (no extra buffer). */
  maxFeeStroops: bigint;
  includeRecipientSetup: boolean;
  raw: IrisFeeQuoteRaw;
}

/**
 * Protocol fee (bps of the 7-decimal amount) plus the 6-decimal forward fee scaled to stroops.
 * Uses `med` as Circle/Stellar docs recommend. Do not add a large buffer from Stellar.
 */
export function maxFeeStroopsFromQuote(amountStroops: bigint, quote: IrisFeeQuoteRaw): bigint {
  const forward = quote.forwardFee?.med ?? quote.forwardFee?.medium;
  if (forward == null) throw new Error('Fee quote is missing forwardFee.med');
  const protocol = (amountStroops * BigInt(Math.ceil(quote.minimumFee * 100))) / 1_000_000n;
  return protocol + BigInt(forward) * 10n;
}

export function isCctpForwardSuccess(message: {
  status?: string;
  forwardTxHash?: string | null;
}): boolean {
  return message.status === 'complete' && typeof message.forwardTxHash === 'string' && message.forwardTxHash.length > 0;
}

export interface CctpAdapterConfig {
  irisUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  usdcSac: string;
  tokenMessengerMinter: string;
  solanaRpcUrl?: string;
  solanaUsdcMint?: string;
  fetch?: typeof fetch;
}

export class CctpAdapter {
  readonly config: CctpAdapterConfig;
  private readonly server: rpc.Server;
  private readonly fetchFn: typeof fetch;
  private readonly signer?: Keypair;

  constructor(config: CctpAdapterConfig, settlementSecret?: string) {
    this.config = config;
    this.server = new rpc.Server(config.rpcUrl);
    this.fetchFn = config.fetch ?? fetch;
    this.signer = settlementSecret ? Keypair.fromSecret(settlementSecret) : undefined;
  }

  get settlementPublicKey(): string | undefined {
    return this.signer?.publicKey();
  }

  deriveSolanaAta(ownerBase58: string): string {
    const mint = new PublicKey(this.config.solanaUsdcMint ?? SOLANA_DEVNET_USDC_MINT);
    const owner = new PublicKey(ownerBase58);
    return associatedTokenAddress(mint, owner).toBase58();
  }

  async ataExists(ataBase58: string): Promise<boolean> {
    const rpcUrl = this.config.solanaRpcUrl;
    if (!rpcUrl) return false;
    const conn = new Connection(rpcUrl, 'confirmed');
    const info = await conn.getAccountInfo(new PublicKey(ataBase58), 'confirmed');
    return info != null;
  }

  async quoteForwardFee(
    chain: Exclude<DestinationChain, 'stellar'>,
    opts: { includeRecipientSetup?: boolean; amountStroops: bigint },
  ): Promise<CctpFeeQuote> {
    const domain = cctpDestinationDomain(chain);
    const setup = chain === 'solana' && !!opts.includeRecipientSetup;
    const url =
      `${this.config.irisUrl}/v2/burn/USDC/fees/${CCTP_STELLAR_DOMAIN}/${domain}` +
      `?forward=true${setup ? '&includeRecipientSetup=true' : ''}`;
    const res = await this.fetchFn(url);
    const body = await res.text();
    if (!res.ok) throw new Error(`CCTP fee quote HTTP ${res.status}: ${body.slice(0, 300)}`);
    const quotes = JSON.parse(body) as IrisFeeQuoteRaw[];
    const raw = quotes.find((q) => q.finalityThreshold === 2000);
    if (!raw?.forwardFee) throw new Error(`No standard (2000) forward fee quote: ${body.slice(0, 300)}`);
    const med = raw.forwardFee.med ?? raw.forwardFee.medium ?? 0;
    const low = raw.forwardFee.low ?? med;
    const high = raw.forwardFee.high ?? med;
    return {
      finalityThreshold: 2000,
      minimumFeeBps: raw.minimumFee,
      forwardFeeMicro: { low: BigInt(low), med: BigInt(med), high: BigInt(high) },
      maxFeeStroops: maxFeeStroopsFromQuote(opts.amountStroops, raw),
      includeRecipientSetup: setup,
      raw,
    };
  }

  /**
   * Reads the JSON-RPC sequence only. stellar-sdk 17.2.1 cannot decode protocol-30
   * LedgerHeader XDR (`scpValue.ext.v` = 3).
   */
  async latestLedgerSequence(): Promise<number> {
    const res = await this.fetchFn(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
    });
    const body = (await res.json()) as { result?: { sequence?: number } };
    const sequence = body.result?.sequence;
    if (typeof sequence !== 'number') {
      throw new Error(`getLatestLedger JSON was missing sequence: ${JSON.stringify(body).slice(0, 200)}`);
    }
    return sequence;
  }

  async approve(amountStroops: bigint): Promise<string> {
    const signer = this.requireSigner();
    const sequence = await this.latestLedgerSequence();
    return this.invoke(this.config.usdcSac, 'approve', [
      new Address(signer.publicKey()).toScVal(),
      new Address(this.config.tokenMessengerMinter).toScVal(),
      nativeToScVal(amountStroops, { type: 'i128' }),
      nativeToScVal(sequence + 100, { type: 'u32' }),
    ]);
  }

  async depositForBurnWithHook(params: {
    amountStroops: bigint;
    chain: Exclude<DestinationChain, 'stellar'>;
    mintRecipient: Buffer;
    hook: Buffer;
    maxFeeStroops: bigint;
  }): Promise<string> {
    const signer = this.requireSigner();
    return this.invoke(this.config.tokenMessengerMinter, 'deposit_for_burn_with_hook', [
      new Address(signer.publicKey()).toScVal(),
      nativeToScVal(params.amountStroops, { type: 'i128' }),
      nativeToScVal(cctpDestinationDomain(params.chain), { type: 'u32' }),
      nativeToScVal(params.mintRecipient, { type: 'bytes' }),
      new Address(this.config.usdcSac).toScVal(),
      nativeToScVal(Buffer.alloc(32), { type: 'bytes' }),
      nativeToScVal(params.maxFeeStroops, { type: 'i128' }),
      nativeToScVal(2000, { type: 'u32' }),
      nativeToScVal(params.hook, { type: 'bytes' }),
    ]);
  }

  /**
   * Quotes (med), approves, and burns with the forwarding hook.
   * For Solana, derives the ATA from the owner and includes ATA-setup hook data when needed.
   */
  async burnToDestination(params: {
    amountStroops: bigint;
    chain: Exclude<DestinationChain, 'stellar'>;
    recipientAddress: string;
  }): Promise<{ burnTx: string; quote: CctpFeeQuote; mintRecipient: string; hookKind: 'basic' | 'ata-setup' }> {
    let includeRecipientSetup = false;
    let solanaAta: string | undefined;
    if (params.chain === 'solana') {
      solanaAta = this.deriveSolanaAta(params.recipientAddress);
      includeRecipientSetup = !(await this.ataExists(solanaAta));
    }
    const quote = await this.quoteForwardFee(params.chain, {
      includeRecipientSetup,
      amountStroops: params.amountStroops,
    });
    const mintRecipient = encodeMintRecipient(params.chain, params.recipientAddress, solanaAta);
    const hook = encodeForwardHook(params.chain, {
      includeRecipientSetup,
      solanaOwner: params.recipientAddress,
    });
    await this.approve(params.amountStroops);
    const burnTx = await this.depositForBurnWithHook({
      amountStroops: params.amountStroops,
      chain: params.chain,
      mintRecipient,
      hook,
      maxFeeStroops: quote.maxFeeStroops,
    });
    return {
      burnTx,
      quote,
      mintRecipient: mintRecipient.toString('hex'),
      hookKind: includeRecipientSetup ? 'ata-setup' : 'basic',
    };
  }

  async waitForForward(
    burnTx: string,
    opts: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<{ forwardTxHash: string; message: Record<string, unknown> }> {
    const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
    const pollMs = opts.pollMs ?? 5_000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await this.fetchFn(
        `${this.config.irisUrl}/v2/messages/${CCTP_STELLAR_DOMAIN}?transactionHash=${burnTx}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { messages?: Array<Record<string, unknown> & { status?: string; forwardTxHash?: string }> };
        const msg = data.messages?.[0];
        if (msg && isCctpForwardSuccess(msg)) {
          return { forwardTxHash: msg.forwardTxHash!, message: msg };
        }
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Timed out waiting for CCTP forwardTxHash on Stellar burn ${burnTx}`);
  }

  private requireSigner(): Keypair {
    if (!this.signer) throw new Error('CctpAdapter has no settlement signer');
    return this.signer;
  }

  private async invoke(contractId: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const signer = this.requireSigner();
    const account = await this.server.getAccount(signer.publicKey());
    let fee = '100000';
    try {
      const { sorobanInclusionFee } = await this.server.getFeeStats();
      const p90 = Number(sorobanInclusionFee.p90);
      if (Number.isFinite(p90) && p90 > 0) fee = String(Math.min(p90, 100_000));
    } catch {
      // keep default inclusion fee
    }
    const tx = new TransactionBuilder(account, {
      fee,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(signer);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new Error(`CCTP ${method} submit failed: ${JSON.stringify(sent.errorResult ?? sent)}`);
    }
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
      throw new Error(`CCTP ${method} status ${sent.status}`);
    }
    const result = await this.server.pollTransaction(sent.hash, { attempts: 60 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`CCTP ${method} ${sent.hash} failed: ${result.status}`);
    }
    return sent.hash;
  }
}

export function irisUrlForNetwork(network: 'TESTNET' | 'PUBLIC'): string {
  return network === 'PUBLIC' ? 'https://iris-api.circle.com' : 'https://iris-api-sandbox.circle.com';
}

export function defaultCctpContracts(network: 'TESTNET' | 'PUBLIC'): {
  usdcSac: string;
  tokenMessengerMinter: string;
  solanaUsdcMint: string;
} {
  return network === 'PUBLIC'
    ? {
        usdcSac: MAINNET_USDC_SAC,
        tokenMessengerMinter: MAINNET_TOKEN_MESSENGER_MINTER,
        solanaUsdcMint: SOLANA_MAINNET_USDC_MINT,
      }
    : {
        usdcSac: TESTNET_USDC_SAC,
        tokenMessengerMinter: TESTNET_TOKEN_MESSENGER_MINTER,
        solanaUsdcMint: SOLANA_DEVNET_USDC_MINT,
      };
}

