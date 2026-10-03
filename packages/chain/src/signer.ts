import { Keypair, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';

/**
 * KMS-style signer interface.
 * Abstracts whether keys come from memory/env, AWS KMS, Google Cloud KMS, or Vault.
 */
export interface KeySigner {
  getPublicKey(): Promise<string>;
  signTransaction<T extends Transaction | FeeBumpTransaction>(tx: T): Promise<T>;
  signHash(hash: Buffer): Promise<Buffer>;
}

export class EnvKeypairSigner implements KeySigner {
  private keypair: Keypair;

  constructor(secretKey: string) {
    if (!secretKey.startsWith('S') || secretKey.length !== 56) {
      throw new Error('Invalid Stellar secret key format');
    }
    this.keypair = Keypair.fromSecret(secretKey);
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async signTransaction<T extends Transaction | FeeBumpTransaction>(tx: T): Promise<T> {
    tx.sign(this.keypair);
    return tx;
  }

  async signHash(hash: Buffer): Promise<Buffer> {
    return this.keypair.sign(hash);
  }
}
