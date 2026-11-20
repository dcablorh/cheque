import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Try loading .env.local first, then .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Databases
  DATABASE_URL: z.string().url().default('postgresql://cheque_user:cheque_password@localhost:5432/cheque_db'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Stellar Network & Contracts
  STELLAR_NETWORK: z.enum(['TESTNET', 'PUBLIC']).default('TESTNET'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  USDC_ISSUER_ADDRESS: z
    .string()
    .length(56)
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  USDC_ASSET_CODE: z.string().default('USDC'),
  CHEQUE_CONTRACT_ID: z.string().optional(),
  /** USDC Stellar Asset Contract (SAC) id. Defaults to the Circle testnet SAC when unset. */
  USDC_SAC_CONTRACT_ID: z.string().optional(),
  CCTP_TOKEN_MESSENGER_MINTER: z.string().optional(),
  IRIS_API_URL: z.string().url().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_USDC_MINT: z.string().optional(),

  // Keypairs & Signers (Secrets)
  CONTRACT_ADMIN_SECRET: z.string().min(56).optional(),
  CLAIM_AUTHORITY_SECRET: z.string().min(56).optional(),
  GUARDIAN_SECRET: z.string().min(56).optional(),
  FUNDING_ACCOUNT_SECRET: z.string().min(56).optional(),
  SETTLEMENT_ACCOUNT_SECRET: z.string().min(56).optional(),
  FEE_SOURCE_SECRET: z.string().min(56).optional(),
  CHANNEL_ACCOUNT_SECRETS: z.string().optional(), // Comma-separated list of channel secrets

  // Public Keys
  CONTRACT_ADMIN_PUBLIC: z.string().length(56).optional(),
  CLAIM_AUTHORITY_PUBLIC: z.string().length(56).optional(),
  SETTLEMENT_ACCOUNT_PUBLIC: z.string().length(56).optional(),
  FEE_SOURCE_PUBLIC: z.string().length(56).optional(),

  // Pricing (placeholders until the SEP-38 quote service feeds cheques)
  FX_GHS_PER_USDC: z.string().regex(/^\d+(\.\d{1,6})?$/).default('15.500000'),
  FX_NGN_PER_USDC: z.string().regex(/^\d+(\.\d{1,6})?$/).default('1550.000000'),
  FX_USD_PER_USDC: z.string().regex(/^\d+(\.\d{1,6})?$/).default('1.000000'),
  // Comma-separated corridor codes that accept new cheques (GH, NG, US).
  ENABLED_CORRIDORS: z.string().default('GH,NG,US'),
  FEE_BPS: z.coerce.number().int().min(0).max(1000).default(100),

  // SeevCash Sandbox & Webhook
  SEEV_CASH_BASE_URL: z.string().url().optional(),
  SEEV_CASH_API_KEY: z.string().optional(),
  SEEV_CASH_WEBHOOK_SECRET: z.string().optional(),

  // Meta WhatsApp Cloud API
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Real SMS Fallback Provider
  SMS_PROVIDER: z.enum(['HUBTEL', 'ARKESEL', 'TWILIO']).default('HUBTEL'),
  SMS_API_KEY: z.string().optional(),
  SMS_API_SECRET: z.string().optional(),
  SMS_SENDER_ID: z.string().default('CHEQUE'),

  // Transactional email (payee OTP + cheque-received notifications)
  EMAIL_API_KEY: z.string().optional(),

  // Security & App
  JWT_SECRET: z.string().min(32).default('development_jwt_secret_must_be_changed_in_prod'),
  OTP_SALT: z.string().min(32).default('development_otp_salt_must_be_changed_in_prod'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

/**
 * Loads and validates environment variables.
 * Fails fast with clear error reporting if required configuration is missing or malformed.
 */
export function loadEnv(options: { requireSecrets?: boolean } = {}): Env {
  if (cachedEnv && !options.requireSecrets) {
    return cachedEnv;
  }

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ FATAL: Invalid or missing environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Environment validation failed. See logs above.');
  }

  const env = parsed.data;

  // In production or when secrets are required, strictly check critical secrets
  if (options.requireSecrets || env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.CLAIM_AUTHORITY_SECRET) missing.push('CLAIM_AUTHORITY_SECRET');
    if (!env.SETTLEMENT_ACCOUNT_SECRET) missing.push('SETTLEMENT_ACCOUNT_SECRET');
    if (!env.FEE_SOURCE_SECRET) missing.push('FEE_SOURCE_SECRET');
    if (!env.SEEV_CASH_API_KEY) missing.push('SEEV_CASH_API_KEY');
    if (!env.WHATSAPP_API_TOKEN) missing.push('WHATSAPP_API_TOKEN');

    // Reject default/weak JWT and OTP secrets in production or when secrets are required.
    const defaultJwt = 'development_jwt_secret_must_be_changed_in_prod';
    const defaultOtp = 'development_otp_salt_must_be_changed_in_prod';
    if (env.JWT_SECRET === defaultJwt || env.JWT_SECRET.length < 32) missing.push('JWT_SECRET');
    if (env.OTP_SALT === defaultOtp || env.OTP_SALT.length < 32) missing.push('OTP_SALT');

    if (missing.length > 0) {
      console.error('❌ FATAL: Missing required real credentials in environment:');
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
      throw new Error(`Missing required credentials: ${missing.join(', ')}`);
    }
  }

  cachedEnv = env;
  return env;
}
