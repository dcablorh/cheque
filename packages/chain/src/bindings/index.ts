/**
 * Generated TypeScript bindings for ChequeContract
 * Corresponds to output from `stellar contract bindings typescript`
 */

import {
  rpc,
  Address,
  Operation,
  TransactionBuilder,
  xdr,
  scValToNative,
  nativeToScVal,
  Account,
  Keypair,
} from '@stellar/stellar-sdk';
import { KeySigner } from '../signer.js';
import { parseContractError } from '../errors.js';
import {
  OnChainCheque,
  OnChainChequeState,
  OnChainConfig,
  OnChainLockInfo,
} from '../contract-types.js';

export interface ContractErrorMap {
  [code: number]: string;
}

export const CONTRACT_ERRORS: ContractErrorMap = {
  1: 'AlreadyInitialized',
  2: 'NotInitialized',
  3: 'Unauthorized',
  4: 'ChequeAlreadyExists',
  5: 'ChequeNotFound',
  6: 'InvalidState',
  7: 'ChequeExpired',
  8: 'ChequeNotExpired',
  9: 'AmountOutOfBounds',
  10: 'LockExpired',
  11: 'LockNotExpired',
  12: 'DelayNotMet',
  13: 'DelayPassed',
  14: 'ContractPaused',
  15: 'InvalidLockDuration',
  16: 'NoPendingAdmin',
  17: 'InvalidExpiry',
};

export interface ChequeContractOptions {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  defaultFee?: string;
  timeoutSecs?: number;
}

/**
 * Standard bindings client generated for ChequeContract.
 */
export class ChequeContractBindings {
  public readonly contractId: string;
  public readonly rpcServer: rpc.Server;
  public readonly networkPassphrase: string;
  public readonly defaultFee: string;
  public readonly timeoutSecs: number;

  constructor(options: ChequeContractOptions) {
    this.contractId = options.contractId;
    this.rpcServer = new rpc.Server(options.rpcUrl);
    this.networkPassphrase = options.networkPassphrase;
    this.defaultFee = options.defaultFee ?? '100000';
    this.timeoutSecs = options.timeoutSecs ?? 60;
  }

  // --- ScVal Serialization Helpers ---

  public static encodeBytes32(hex: string): xdr.ScVal {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    return xdr.ScVal.scvBytes(Buffer.from(clean, 'hex'));
  }

  public static encodeAddress(addr: string): xdr.ScVal {
    return new Address(addr).toScVal();
  }

  public static encodeI128(val: bigint | number): xdr.ScVal {
    return nativeToScVal(BigInt(val), { type: 'i128' });
  }

  public static encodeU64(val: bigint | number): xdr.ScVal {
    return nativeToScVal(BigInt(val), { type: 'u64' });
  }

  public static encodeConfig(config: OnChainConfig): xdr.ScVal {
    return nativeToScVal(
      {
        min_amount: config.minAmount,
        max_amount: config.maxAmount,
        max_lock_secs: config.maxLockSecs,
        delay_threshold: config.delayThreshold,
        delay_secs: config.delaySecs,
        paused: config.paused,
      },
      { type: 'object' }
    );
  }

  public static decodeCheque(val: xdr.ScVal): OnChainCheque {
    return scValToNative(val) as OnChainCheque;
  }

  public static decodeConfig(val: xdr.ScVal): OnChainConfig {
    return scValToNative(val) as OnChainConfig;
  }
}
