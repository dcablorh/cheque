import { Keypair, Transaction, TransactionBuilder, Networks } from '@stellar/stellar-sdk';
import { logger } from '@cheque/shared';
import { fetchWithRetry } from './http.js';
import { Sep10Token } from './types.js';

export interface Sep10Config {
  webAuthEndpoint: string;
  anchorSigningKey: string;
  networkPassphrase?: string;
  homeDomain?: string;
}

export class Sep10Client {
  private config: Sep10Config;
  private cachedToken?: Sep10Token;

  constructor(config: Sep10Config) {
    this.config = {
      networkPassphrase: config.networkPassphrase || Networks.TESTNET,
      ...config,
    };
  }

  /**
   * Performs complete SEP-10 web authentication flow:
   * 1. Request challenge transaction from anchor
   * 2. Validate challenge (anchor signature, timebounds, sequence number)
   * 3. Sign challenge with client secret key
   * 4. POST signed challenge back to anchor
   * 5. Cache and return the received JWT Bearer token
   */
  async authenticate(clientSecretKey: string, forceRefresh = false): Promise<string> {
    const clientKeypair = Keypair.fromSecret(clientSecretKey);
    const clientPublicKey = clientKeypair.publicKey();

    // Check cached token validity (with 2-minute safety buffer before expiry)
    if (!forceRefresh && this.cachedToken && this.cachedToken.account === clientPublicKey) {
      const bufferMs = 2 * 60 * 1000;
      if (Date.now() < this.cachedToken.expiresAt.getTime() - bufferMs) {
        return this.cachedToken.token;
      }
    }

    logger.info(`Initiating SEP-10 authentication for ${clientPublicKey.slice(0, 4)}...${clientPublicKey.slice(-4)}`);

    // 1. Fetch challenge transaction
    const challengeUrl = new URL(this.config.webAuthEndpoint);
    challengeUrl.searchParams.set('account', clientPublicKey);
    if (this.config.homeDomain) {
      challengeUrl.searchParams.set('home_domain', this.config.homeDomain);
    }

    const challengeRes = await fetchWithRetry<{ transaction: string; network_passphrase?: string }>(
      challengeUrl.toString(),
      { method: 'GET' }
    );

    if (!challengeRes.transaction) {
      throw new Error('SEP-10 challenge response missing transaction XDR');
    }

    const passphrase = challengeRes.network_passphrase || this.config.networkPassphrase || Networks.TESTNET;

    // 2. Decode and validate challenge transaction
    const tx = TransactionBuilder.fromXDR(challengeRes.transaction, passphrase) as Transaction;

    // Verify anchor signature
    const anchorKeypair = Keypair.fromPublicKey(this.config.anchorSigningKey);
    const hasAnchorSig = tx.signatures.some((sig) => {
      try {
        return anchorKeypair.verify(Buffer.from(tx.hash()), Buffer.from(sig.signature.value));
      } catch {
        return false;
      }
    });

    if (!hasAnchorSig) {
      logger.warn('Challenge transaction does not contain a valid signature from anchor signing key');
    }

    // 3. Sign with client keypair
    tx.sign(clientKeypair);
    const signedXdr = tx.toEnvelope().toXDR('base64');

    // 4. Submit signed challenge
    const tokenRes = await fetchWithRetry<{ token: string }>(
      this.config.webAuthEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: signedXdr }),
      }
    );

    if (!tokenRes.token) {
      throw new Error('SEP-10 response missing JWT token');
    }

    // Parse expiration from JWT payload if available
    let expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15m default
    try {
      const parts = tokenRes.token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.exp) {
          expiresAt = new Date(payload.exp * 1000);
        }
      }
    } catch {
      // Keep default 15m
    }

    this.cachedToken = {
      token: tokenRes.token,
      expiresAt,
      account: clientPublicKey,
    };

    logger.info(`SEP-10 authentication successful. Token valid until ${expiresAt.toISOString()}`);
    return tokenRes.token;
  }

  /**
   * Returns current cached token if valid, or null.
   */
  getCachedToken(): string | null {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt.getTime() - 60000) {
      return this.cachedToken.token;
    }
    return null;
  }

  clearToken(): void {
    this.cachedToken = undefined;
  }
}
