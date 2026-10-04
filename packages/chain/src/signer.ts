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

/**
 * Signer backed by a secret key loaded from environment variables or memory.
 */
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

export type KmsSignHashFunction = (hash: Buffer) => Promise<Buffer>;

/**
 * KMS-backed signer allowing pluggable remote signing (AWS KMS, GCP Cloud KMS, Azure Key Vault, or HashiCorp Vault).
 */
export class KmsSigner implements KeySigner {
  private publicKey: string;
  private signHashFn: KmsSignHashFunction;

  constructor(publicKey: string, signHashFn: KmsSignHashFunction) {
    this.publicKey = publicKey;
    this.signHashFn = signHashFn;
  }

  async getPublicKey(): Promise<string> {
    return this.publicKey;
  }

  async signTransaction<T extends Transaction | FeeBumpTransaction>(tx: T): Promise<T> {
    const hash = tx.hash();
    const signature = await this.signHashFn(hash);
    const keypair = Keypair.fromPublicKey(this.publicKey);
    // Decorate signature onto transaction
    tx.addSignature(this.publicKey, signature.toString('base64'));
    return tx;
  }

  async signHash(hash: Buffer): Promise<Buffer> {
    return this.signHashFn(hash);
  }
}
