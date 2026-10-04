import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { Networks } from '@stellar/stellar-sdk';
import {
  SepAnchorClient,
  maskSensitiveData,
} from '../src/index.js';

const SETTLEMENT_ACCOUNT_SECRET =
  process.env.SETTLEMENT_ACCOUNT_SECRET ||
  'SAGRPTY753S27RIDKIOPAT22GYJPIM3QCIBXSRRAFHOQS7DKOBTUSVIJ';
const SETTLEMENT_ACCOUNT_PUBLIC =
  process.env.SETTLEMENT_ACCOUNT_PUBLIC ||
  'GDZQVWKYUGNPDRMZY7NPMXMYP6BENAG74ET4FEB5RBNO36HJUJUEH642';
const WEBHOOK_SECRET = 'test_seevcash_webhook_secret_key_888';

describe('PII Masking & HTTP Utilities', () => {
  it('masks sensitive phone numbers, keys, tokens, and IDs in log payloads', () => {
    const rawData = {
      phone: '+233244123456',
      mobile_number: '0244123456',
      secret: 'SAGRPTY753S27RIDKIOPAT22GYJPIM3QCIBXSRRAFHOQS7DKOBTUSVIJ',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak',
      id_number: 'GHA-123456789-0',
      normal_field: 'safe_value',
    };

    const masked = maskSensitiveData(rawData) as Record<string, unknown>;

    expect(masked.phone).not.toBe('+233244123456');
    expect(masked.phone).toContain('XXX');
    expect(masked.secret).toBe('[REDACTED]');
    expect(masked.token).toBe('[REDACTED]');
    expect(masked.id_number).toBe('[REDACTED_ID]');
    expect(masked.normal_field).toBe('safe_value');
  });

  it('masks Bearer tokens in authorization strings', () => {
    const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
    const masked = maskSensitiveData(authHeader);
    expect(masked).toBe('Bearer [REDACTED_JWT]');
  });
});

describe('Live Sandbox Acceptance: SeevCash Anchor Client', () => {
  let client: SepAnchorClient;

  beforeAll(async () => {
    client = new SepAnchorClient({
      homeDomain: 'anchor.seevcash.com',
      signerSecret: SETTLEMENT_ACCOUNT_SECRET,
      networkPassphrase: Networks.TESTNET,
      webhookSecret: WEBHOOK_SECRET,
      cacheTtlMs: 60 * 1000,
    });
    await client.init();
  }, 45000);

  it('Step 1: SEP-1 - fetches and caches real stellar.toml from anchor.seevcash.com', async () => {
    const toml = await client.init();

    expect(toml).toBeDefined();
    expect(toml.SIGNING_KEY).toBe('GA2E5D24D2LCGVA3SVVKDP64OTN2M2NLUWRDYINB352HW35ABZ66MPVR');
    expect(toml.TRANSFER_SERVER).toBe('https://anchor.seevcash.com/sep6');
    expect(toml.WEB_AUTH_ENDPOINT).toBe('https://anchor.seevcash.com/auth');
    expect(toml.ANCHOR_QUOTE_SERVER).toBe('https://anchor.seevcash.com/sep38');
    expect(toml.NETWORK_PASSPHRASE).toContain('Test SDF Network');

    const usdc = toml.CURRENCIES?.find((c) => c.code === 'USDC');
    expect(usdc).toBeDefined();
    expect(usdc?.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

    // Test in-memory TTL cache
    const cachedToml = await client.sep1.getToml();
    expect(cachedToml.SIGNING_KEY).toBe(toml.SIGNING_KEY);
  });

  it('Step 2: SEP-10 - completes real challenge signing and receives valid JWT', async () => {
    const token = await client.getAuthToken();

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // Valid JWT structure

    // Decoded payload contains public key and expiration
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload.sub).toBe(SETTLEMENT_ACCOUNT_PUBLIC);
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Verify cached token retrieval
    const cachedToken = client.sep10?.getCachedToken();
    expect(cachedToken).toBe(token);
  });

  it('Step 3: SEP-38 - discovers prices and requests real quote', async () => {
    const usdcAsset = 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const prices = await client.getPrices(usdcAsset);

    expect(prices).toBeDefined();
    expect(prices.buy_assets).toBeDefined();
    expect(Array.isArray(prices.buy_assets)).toBe(true);

    const ghsAsset = prices.buy_assets.find((p) => p.asset.includes('GHS') || p.asset === 'iso4217:GHS');
    expect(ghsAsset).toBeDefined();
    expect(Number(ghsAsset?.price)).toBeGreaterThan(0);

    // Request firm quote for 10 USDC -> GHS
    const quote = await client.getQuote({
      sellAsset: usdcAsset,
      buyAsset: ghsAsset!.asset,
      sellAmount: '10',
    });

    expect(quote).toBeDefined();
    expect(quote.id).toBeDefined();
    expect(quote.sell_asset).toBe(usdcAsset);
    expect(Number(quote.buy_amount)).toBeGreaterThan(0);
    expect(new Date(quote.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('Step 4: SEP-12 & SEP-6 - submits customer KYC and creates real deposit & withdraw objects', async () => {
    // 4a. SEP-6 Info inspection
    const info = await client.sep6!.getInfo();
    expect(info.withdraw?.USDC?.enabled).toBe(true);
    expect(info.deposit?.USDC?.enabled).toBe(true);
    expect(info.deposit?.USDC?.funding_methods).toContain('mobile');

    // 4b. Ensure customer KYC is registered for account via SEP-12
    const kycResult = await client.submitKyc({
      first_name: 'Kwame',
      last_name: 'Mensah',
      email_address: 'kwame.mensah@example.com',
      mobile_number: '+233244123456',
    });
    expect(kycResult.id).toBeDefined();

    const kycStatus = await client.checkKycStatus(kycResult.id);
    expect(kycStatus.status).toBe('ACCEPTED');

    // 4c. Create real withdraw transaction object
    const withdrawRes = await client.withdraw({
      assetCode: 'USDC',
      type: 'mobile',
      dest: '0244123456',
      destExtra: 'MTN',
      amount: '5',
      account: SETTLEMENT_ACCOUNT_PUBLIC,
    });

    expect(withdrawRes).toBeDefined();
    expect(withdrawRes.account_id).toBeDefined(); // Anchor deposit account to send USDC to
    expect(withdrawRes.memo_type).toBeDefined(); // Classic memo required for attribution
    expect(withdrawRes.memo).toBeDefined();
    expect(withdrawRes.id).toBeDefined();

    // 4d. Create real deposit transaction object
    const depositRes = await client.deposit({
      assetCode: 'USDC',
      account: SETTLEMENT_ACCOUNT_PUBLIC,
      amount: '10',
      fundingMethod: 'mobile',
      type: 'mobile',
      extraFields: {
        phone_number: '+233244123456',
        network: 'MTN',
      },
    });

    expect(depositRes).toBeDefined();
    expect(depositRes.id).toBeDefined();
    expect(depositRes.how).toContain('mobile money collection');
  });

  it('Step 5: Webhook - receives, verifies HMAC-SHA256 signature, and deduplicates', () => {
    const rawPayload = JSON.stringify({
      event: 'order.completed',
      order_id: 'seev_order_test_acc_001',
      type: 'withdraw',
      amount: '5.00',
      currency: 'USDC',
      status: 'completed',
      external_reference: 'MOMO_REF_98765',
      timestamp: '2026-10-04T12:00:00Z',
    });

    const validSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    // 5a. Successfully verifies valid signature
    const firstIngest = client.ingestWebhook(rawPayload, validSignature);
    expect(firstIngest.isDuplicate).toBe(false);
    expect(firstIngest.event.order_id).toBe('seev_order_test_acc_001');
    expect(firstIngest.event.status).toBe('completed');

    // 5b. Deduplicates repeated webhook delivery
    const secondIngest = client.ingestWebhook(rawPayload, validSignature);
    expect(secondIngest.isDuplicate).toBe(true);

    // 5c. Rejects tampered signature
    const invalidSignature = 'bad_hex_signature_348912384792183492813401928340192834019283401928';
    expect(() => {
      client.ingestWebhook(rawPayload, invalidSignature);
    }).toThrow(/Invalid anchor webhook HMAC signature/);
  });

  it('Step 6: SEP-24 Hosted Fallback - generates interactive transfer URL when enabled', async () => {
    const hostedClient = new SepAnchorClient({
      homeDomain: 'anchor.seevcash.com',
      signerSecret: SETTLEMENT_ACCOUNT_SECRET,
      networkPassphrase: Networks.TESTNET,
      useHostedSep24: true, // Hosted fallback enabled
    });

    await hostedClient.init();

    const interactiveDeposit = await hostedClient.deposit({
      assetCode: 'USDC',
      account: SETTLEMENT_ACCOUNT_PUBLIC,
      amount: '10',
    });

    expect(interactiveDeposit.type).toBe('interactive_customer_info_needed');
    expect(interactiveDeposit.url).toContain('https://');
    expect(interactiveDeposit.id).toBeDefined();
  });
});
