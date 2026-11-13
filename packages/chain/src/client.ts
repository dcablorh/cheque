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
  Transaction,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import { KeySigner } from './signer.js';
import { ContractError, ContractErrorCode, parseContractError } from './errors.js';
import {
  OnChainCheque,
  OnChainChequeState,
  OnChainConfig,
  OnChainLockInfo,
} from './contract-types.js';
import { ChannelPool } from './channel-pool.js';
import { SubmissionIdempotencyStore, SubmissionOp } from './idempotency.js';
import { logger } from '@cheque/shared';
import { chequeIdHexToBytes } from './cheque-id.js';
import {
  decodeOnChainCheque,
  decodeOnChainConfig,
  decodeOnChainLock,
  encodeOnChainConfig,
} from './contract-types.js';

export interface ContractClientConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  defaultFee?: string;
  timeoutSecs?: number;
  channelPool?: ChannelPool;
  idempotencyStore?: SubmissionIdempotencyStore;
}

export interface InvokeContractOptions {
  chequeIdHex?: string;
  operation?: SubmissionOp;
  channelSigner?: KeySigner;
  channelPublicKey?: string;
  feeSigner?: KeySigner;
  sourceAccount?: Account;
  onSignedXdrReady?: (signedXdr: string, txHash: string) => Promise<void>;
}

export class ChequeContractClient {
  public readonly rpcServer: rpc.Server;
  public readonly config: ContractClientConfig;
  public readonly channelPool?: ChannelPool;
  public readonly idempotencyStore?: SubmissionIdempotencyStore;

  constructor(config: ContractClientConfig) {
    this.config = {
      defaultFee: '100000',
      timeoutSecs: 60,
      ...config,
    };
    this.rpcServer = new rpc.Server(config.rpcUrl);
    this.channelPool = config.channelPool;
    this.idempotencyStore = config.idempotencyStore;
  }

  /**
   * Core invocation pipeline:
   * simulate -> auto restore-footprint & TTL bump -> assemble -> sign (signer interface) -> send -> poll getTransaction.
   * Handles channel pool leasing and fee-bump automatically when available.
   */
  async invokeContract<T = unknown>(params: {
    functionName: string;
    args: xdr.ScVal[];
    signer: KeySigner;
    options?: InvokeContractOptions;
  }): Promise<{ result: T; txHash: string; ledger: number }> {
    const { functionName, args, signer, options = {} } = params;

    // Check if channel pool leasing should be used
    if (this.channelPool && !options.channelSigner && !options.sourceAccount) {
      return this.channelPool.withLeasedChannel(async (leasedSigner, leasedPubKey) => {
        return this.executeInvocation<T>({
          functionName,
          args,
          signer,
          options: {
            ...options,
            channelSigner: leasedSigner,
            channelPublicKey: leasedPubKey,
            feeSigner: options.feeSigner ?? this.channelPool?.feeSigner,
          },
        });
      });
    }

    return this.executeInvocation<T>({
      functionName,
      args,
      signer,
      options,
    });
  }

  private async executeInvocation<T>(params: {
    functionName: string;
    args: xdr.ScVal[];
    signer: KeySigner;
    options: InvokeContractOptions;
  }): Promise<{ result: T; txHash: string; ledger: number }> {
    const { functionName, args, signer, options } = params;

    // 1. Determine transaction source account
    let sourcePub: string;
    let sourceAccount: Account;

    if (options.sourceAccount) {
      sourceAccount = options.sourceAccount;
      sourcePub = sourceAccount.accountId();
    } else if (options.channelPublicKey) {
      sourcePub = options.channelPublicKey;
      sourceAccount = await this.rpcServer.getAccount(sourcePub);
    } else {
      sourcePub = await signer.getPublicKey();
      sourceAccount = await this.rpcServer.getAccount(sourcePub);
    }

    const invokeOp = Operation.invokeContractFunction({
      contract: this.config.contractId,
      function: functionName,
      args,
    });

    const initialTx = new TransactionBuilder(sourceAccount, {
      fee: this.config.defaultFee!,
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(invokeOp)
      .setTimeout(this.config.timeoutSecs!)
      .build();

    // 2. Simulate transaction
    let simRes = await this.rpcServer.simulateTransaction(initialTx);

    if (rpc.Api.isSimulationError(simRes)) {
      throw parseContractError(new Error(simRes.error));
    }

    // 2b. Handle auto restore-footprint if required
    if (rpc.Api.isSimulationRestore(simRes)) {
      logger.info(
        `State restoration required for ${functionName}. Submitting auto restore-footprint transaction...`
      );

      const restoreOp = Operation.restoreFootprint({});
      const restoreAccount = await this.rpcServer.getAccount(sourcePub);
      const sorobanData =
        typeof (simRes.restorePreamble.transactionData as any).build === 'function'
          ? (simRes.restorePreamble.transactionData as any).build()
          : simRes.restorePreamble.transactionData;

      const restoreTx = new TransactionBuilder(restoreAccount, {
        fee: (parseInt(simRes.restorePreamble.minResourceFee, 10) + 10000).toString(),
        networkPassphrase: this.config.networkPassphrase,
      })
        .setSorobanData(sorobanData)
        .addOperation(restoreOp)
        .setTimeout(this.config.timeoutSecs!)
        .build();

      if (options.channelSigner) {
        await options.channelSigner.signTransaction(restoreTx);
      }
      await signer.signTransaction(restoreTx);

      const restoreSend = await this.rpcServer.sendTransaction(restoreTx);
      await this.pollTransaction(restoreSend.hash);

      // Re-fetch source account and re-simulate
      const refreshedSourceAccount = await this.rpcServer.getAccount(sourcePub);
      const refreshedInitialTx = new TransactionBuilder(refreshedSourceAccount, {
        fee: this.config.defaultFee!,
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(invokeOp)
        .setTimeout(this.config.timeoutSecs!)
        .build();

      simRes = await this.rpcServer.simulateTransaction(refreshedInitialTx);
      if (rpc.Api.isSimulationError(simRes)) {
        throw parseContractError(new Error(simRes.error));
      }
    }

    // 3. Assemble transaction with Soroban resources & footprint
    const assembledTx = rpc.assembleTransaction(initialTx, simRes).build();

    // 4. Sign transaction
    // If channel account is used, channel signer signs as tx source
    if (options.channelSigner) {
      await options.channelSigner.signTransaction(assembledTx);
    }
    // Signer signs for contract invocation authorization
    await signer.signTransaction(assembledTx);

    let finalTx: Transaction | FeeBumpTransaction = assembledTx;

    // Apply fee-bump if feeSigner is provided
    if (options.feeSigner) {
      const feeSourcePub = await options.feeSigner.getPublicKey();
      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        feeSourcePub,
        '500000',
        assembledTx,
        this.config.networkPassphrase
      );
      await options.feeSigner.signTransaction(feeBumpTx);
      finalTx = feeBumpTx;
    }

    const signedXdr = finalTx.toXDR();
    const txHash = Buffer.from(finalTx.hash()).toString('hex');

    // 5. Submission Idempotency: Persist BEFORE network send
    if (options.chequeIdHex && options.operation && this.idempotencyStore) {
      await this.idempotencyStore.recordBeforeSend({
        chequeId: options.chequeIdHex,
        operation: options.operation,
        signedXdr,
        txHash,
      });
    }

    if (options.onSignedXdrReady) {
      await options.onSignedXdrReady(signedXdr, txHash);
    }

    // 6. Send transaction to Soroban RPC
    const sendRes = await this.rpcServer.sendTransaction(finalTx as any);
    if (sendRes.status === 'ERROR') {
      const errDetail = sendRes.errorResult?.toXDR('base64');
      throw parseContractError(new Error(`Soroban send error: ${errDetail}`));
    }

    // 7. Poll getTransaction for ledger close
    const pollResult = await this.pollTransaction(sendRes.hash);

    // Update idempotency store on confirmation
    if (options.chequeIdHex && options.operation && this.idempotencyStore) {
      await this.idempotencyStore.markConfirmed(
        options.chequeIdHex,
        options.operation,
        pollResult.ledger
      );
    }

    let decodedResult: T = undefined as unknown as T;
    if (pollResult.resultValue) {
      decodedResult = scValToNative(pollResult.resultValue) as T;
    }

    return {
      result: decodedResult,
      txHash: pollResult.txHash,
      ledger: pollResult.ledger,
    };
  }

  /**
   * Polls getTransaction with backoff until SUCCESS or FAILED.
   */
  async pollTransaction(
    txHash: string,
    maxAttempts = 30,
    intervalMs = 1000
  ): Promise<{ txHash: string; ledger: number; resultValue?: xdr.ScVal }> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await this.rpcServer.getTransaction(txHash);

      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          txHash,
          ledger: res.latestLedger,
          resultValue: res.returnValue,
        };
      }

      if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
        const errDetail = res.resultXdr?.toXDR('base64') ?? 'Transaction execution failed';
        throw parseContractError(new Error(errDetail));
      }

      // NOT_FOUND: wait for ledger inclusion
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Timeout waiting for transaction confirmation: ${txHash}`);
  }

  /**
   * Bumps contract instance and code TTL automatically.
   */
  async bumpContractInstanceTtl(
    signer: KeySigner,
    extendToLedgers = 518400
  ): Promise<{ txHash: string; ledger: number }> {
    const callerPub = await signer.getPublicKey();
    const account = await this.rpcServer.getAccount(callerPub);

    const bumpOp = Operation.extendFootprintTtl({
      extendTo: extendToLedgers,
    });

    const tx = new TransactionBuilder(account, {
      fee: '200000',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(bumpOp)
      .setTimeout(this.config.timeoutSecs!)
      .build();

    const simRes = await this.rpcServer.simulateTransaction(tx);
    const assembledTx = rpc.assembleTransaction(tx, simRes).build();
    await signer.signTransaction(assembledTx);

    const sendRes = await this.rpcServer.sendTransaction(assembledTx);
    return this.pollTransaction(sendRes.hash);
  }

  // --- Typed Contract Methods ---

  async init(
    adminSigner: KeySigner,
    params: {
      authority: string;
      guardian: string;
      token: string;
      config: OnChainConfig;
    }
  ) {
    const adminPub = await adminSigner.getPublicKey();
    return this.invokeContract({
      functionName: 'init',
      args: [
        new Address(adminPub).toScVal(),
        new Address(params.authority).toScVal(),
        new Address(params.guardian).toScVal(),
        new Address(params.token).toScVal(),
        this.encodeConfig(params.config),
      ],
      signer: adminSigner,
    });
  }

  async createCheque(
    funderSigner: KeySigner,
    params: {
      chequeIdHex: string;
      refundTo: string;
      amountStroops: bigint;
      expiresAt: number;
    },
    options?: InvokeContractOptions
  ) {
    const funderPub = await funderSigner.getPublicKey();
    const chequeIdBytes = chequeIdHexToBytes(params.chequeIdHex);

    return this.invokeContract({
      functionName: 'create_cheque',
      args: [
        new Address(funderPub).toScVal(),
        xdr.ScVal.scvBytes(chequeIdBytes),
        new Address(params.refundTo).toScVal(),
        nativeToScVal(params.amountStroops, { type: 'i128' }),
        nativeToScVal(params.expiresAt, { type: 'u64' }),
      ],
      signer: funderSigner,
      options: {
        chequeIdHex: params.chequeIdHex,
        operation: 'create',
        ...options,
      },
    });
  }

  async lock(
    authoritySigner: KeySigner,
    params: {
      chequeIdHex: string;
      to: string;
      lockSecs: number;
    },
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(params.chequeIdHex);

    return this.invokeContract({
      functionName: 'lock',
      args: [
        xdr.ScVal.scvBytes(chequeIdBytes),
        new Address(params.to).toScVal(),
        nativeToScVal(params.lockSecs, { type: 'u64' }),
      ],
      signer: authoritySigner,
      options: {
        chequeIdHex: params.chequeIdHex,
        operation: 'lock',
        ...options,
      },
    });
  }

  async unlock(
    callerSigner: KeySigner,
    chequeIdHex: string,
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);

    return this.invokeContract({
      functionName: 'unlock',
      args: [xdr.ScVal.scvBytes(chequeIdBytes)],
      signer: callerSigner,
      options: {
        chequeIdHex,
        operation: 'unlock',
        ...options,
      },
    });
  }

  async veto(
    guardianSigner: KeySigner,
    chequeIdHex: string,
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);

    return this.invokeContract({
      functionName: 'veto',
      args: [xdr.ScVal.scvBytes(chequeIdBytes)],
      signer: guardianSigner,
      options: {
        chequeIdHex,
        operation: 'veto',
        ...options,
      },
    });
  }

  async redeem(
    authoritySigner: KeySigner,
    chequeIdHex: string,
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);

    return this.invokeContract({
      functionName: 'redeem',
      args: [xdr.ScVal.scvBytes(chequeIdBytes)],
      signer: authoritySigner,
      options: {
        chequeIdHex,
        operation: 'redeem',
        ...options,
      },
    });
  }

  async cancel(
    funderSigner: KeySigner,
    chequeIdHex: string,
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);

    return this.invokeContract({
      functionName: 'cancel',
      args: [xdr.ScVal.scvBytes(chequeIdBytes)],
      signer: funderSigner,
      options: {
        chequeIdHex,
        operation: 'cancel',
        ...options,
      },
    });
  }

  async refund(
    callerSigner: KeySigner,
    chequeIdHex: string,
    options?: InvokeContractOptions
  ) {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);

    return this.invokeContract({
      functionName: 'refund',
      args: [xdr.ScVal.scvBytes(chequeIdBytes)],
      signer: callerSigner,
      options: {
        chequeIdHex,
        operation: 'refund',
        ...options,
      },
    });
  }

  // --- Read-Only Views ---

  async getCheque(chequeIdHex: string): Promise<OnChainCheque> {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);
    const dummyKey = Keypair.random();

    const initialTx = new TransactionBuilder(
      new Account(dummyKey.publicKey(), '0'),
      {
        fee: '100',
        networkPassphrase: this.config.networkPassphrase,
      }
    )
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.config.contractId,
          function: 'get_cheque',
          args: [xdr.ScVal.scvBytes(chequeIdBytes)],
        })
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(initialTx);
    if (rpc.Api.isSimulationError(sim)) {
      throw parseContractError(new Error(sim.error));
    }

    if (!sim.result?.retval) {
      throw new ContractError(ContractErrorCode.ChequeNotFound);
    }

    return decodeOnChainCheque(scValToNative(sim.result.retval));
  }

  /** Active lock for a cheque, or undefined when it is not `Locked`. */
  async getLock(chequeIdHex: string): Promise<OnChainLockInfo | undefined> {
    const chequeIdBytes = chequeIdHexToBytes(chequeIdHex);
    const dummyKey = Keypair.random();
    const tx = new TransactionBuilder(new Account(dummyKey.publicKey(), '0'), {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.config.contractId,
          function: 'get_lock',
          args: [xdr.ScVal.scvBytes(chequeIdBytes)],
        })
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw parseContractError(new Error(sim.error));
    }
    if (!sim.result?.retval) return undefined;
    return decodeOnChainLock(scValToNative(sim.result.retval));
  }

  async getConfig(): Promise<OnChainConfig> {
    const dummyKey = Keypair.random();
    const initialTx = new TransactionBuilder(
      new Account(dummyKey.publicKey(), '0'),
      {
        fee: '100',
        networkPassphrase: this.config.networkPassphrase,
      }
    )
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.config.contractId,
          function: 'config',
          args: [],
        })
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(initialTx);
    if (rpc.Api.isSimulationError(sim) || !sim.result?.retval) {
      throw parseContractError(new Error('Failed to fetch contract config'));
    }

    return decodeOnChainConfig(scValToNative(sim.result.retval));
  }

  private encodeConfig(config: OnChainConfig): xdr.ScVal {
    return encodeOnChainConfig(config);
  }
}
