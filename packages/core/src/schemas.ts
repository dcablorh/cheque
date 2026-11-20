import { z } from 'zod';
import { CORRIDOR_CODES } from './corridors.js';
import { STELLAR_ADDRESS_REGEX } from './addresses.js';

// Ghana E.164 phone regex: +233 followed by 9 digits (e.g. +233241234567, +233501234567)
export const GHANA_PHONE_REGEX = /^\+233\d{9}$/;

export const CreateChequeSchema = z
  .object({
    payeeName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
    /** Recipient email (PRD v4): cheque is addressed to and claimed via this email. */
    payeeEmail: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
    /** Optional client-chosen display id, so the preview number matches the issued cheque. */
    publicCode: z.string().regex(/^CHQ-[2-9A-HJ-NP-Z]{6}$/).optional(),
    /** Stellar account that will deposit USDC. Omit to let the platform account fund the escrow. */
    funderAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'Enter a valid Stellar address').optional(),
    corridor: z.enum(CORRIDOR_CODES).default('GH'),
    /** Face amount in major units of the corridor's currency, e.g. 50.5 (GHS) or 75000 (NGN). */
    amount: z.number().positive('Amount must be greater than zero').max(10_000_000).optional(),
    /** Legacy Ghana-only alias for `amount`; kept so existing GHS clients keep working. */
    amountGhs: z.number().positive().max(10_000_000).optional(),
    note: z.string().trim().max(80, 'Note cannot exceed 80 characters').optional(),
    signature: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Signature must be a PNG image')
      .max(60_000, 'Signature image is too large')
      .optional(),
    expiryHours: z.union([z.literal(24), z.literal(48), z.literal(168), z.literal(720)]).default(48),
  })
  .refine((d) => d.amount !== undefined || d.amountGhs !== undefined, {
    message: 'Enter an amount',
    path: ['amount'],
  })
  .refine((d) => d.amount !== undefined || d.corridor === 'GH', {
    message: 'amountGhs is only accepted for Ghana; send amount with a corridor',
    path: ['amount'],
  });

export type CreateChequeInput = z.infer<typeof CreateChequeSchema>;

export const FundChequeSchema = z.object({
  method: z.enum(['MOMO', 'USDC']),
});

export type FundChequeInput = z.infer<typeof FundChequeSchema>;

export const DestinationChainSchema = z.enum(['stellar', 'base', 'solana']);

export const ValidateDestinationSchema = z.object({
  type: z.enum(['MOMO', 'USDC', 'BANK']),
  chain: DestinationChainSchema.optional(),
  network: z.enum(['MTN', 'TELECEL', 'AIRTELTIGO']).optional(),
  accountRef: z.string().trim().min(4).max(64),
  memo: z.string().trim().max(28).optional(),
}).refine(
  (data) => {
    if (data.type === 'MOMO') {
      return GHANA_PHONE_REGEX.test(data.accountRef) && !!data.network;
    }
    // Address shape for USDC is checked by validatePayoutDestination (chain-aware).
    return true;
  },
  {
    message: 'Invalid destination parameters for the selected payout type',
    path: ['accountRef'],
  }
);

export type ValidateDestinationInput = z.infer<typeof ValidateDestinationSchema>;

export const RedeemChequeSchema = z.object({
  destination: z.object({
    type: z.enum(['MOMO', 'USDC', 'BANK']),
    /** Destination chain for USDC payouts. Defaults to Stellar. */
    chain: DestinationChainSchema.optional(),
    network: z.enum(['MTN', 'TELECEL', 'AIRTELTIGO']).optional(),
    accountRef: z.string().trim().min(4).max(64),
    memo: z.string().trim().max(28).optional(),
    confirmedMismatch: z.boolean().default(false),
  }),
  idempotencyKey: z.string().trim().min(8).max(128),
  sessionToken: z.string().trim().min(16).max(128).optional(),
});

export type RedeemChequeInput = z.infer<typeof RedeemChequeSchema>;
