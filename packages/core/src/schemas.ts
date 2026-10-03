import { z } from 'zod';

// Ghana E.164 phone regex: +233 followed by 9 digits (e.g. +233241234567, +233501234567)
export const GHANA_PHONE_REGEX = /^\+233\d{9}$/;

// Stellar Public Key regex: G followed by 55 alphanumeric uppercase characters (56 total)
export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

export const CreateChequeSchema = z.object({
  payeeName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
  payeePhoneE164: z.string().trim().regex(GHANA_PHONE_REGEX, 'Must be a valid Ghana phone number starting with +233 (e.g. +233241234567)'),
  amountGhs: z.number().min(5, 'Minimum cheque amount is ₵5').max(2000, 'V1 maximum cheque amount is ₵2,000'),
  note: z.string().trim().max(80, 'Note cannot exceed 80 characters').optional(),
  expiryHours: z.union([z.literal(24), z.literal(48), z.literal(168), z.literal(720)]).default(48),
});

export type CreateChequeInput = z.infer<typeof CreateChequeSchema>;

export const FundChequeSchema = z.object({
  method: z.enum(['MOMO', 'USDC']),
});

export type FundChequeInput = z.infer<typeof FundChequeSchema>;

export const OtpRequestSchema = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']).default('WHATSAPP'),
});

export type OtpRequestInput = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
  deviceFp: z.string().max(256).optional(),
});

export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;

export const ValidateDestinationSchema = z.object({
  type: z.enum(['MOMO', 'USDC', 'BANK']),
  network: z.enum(['MTN', 'TELECEL', 'AIRTELTIGO']).optional(),
  accountRef: z.string().trim().min(4).max(64),
  memo: z.string().trim().max(28).optional(),
}).refine(
  (data) => {
    if (data.type === 'MOMO') {
      return GHANA_PHONE_REGEX.test(data.accountRef) && !!data.network;
    }
    if (data.type === 'USDC') {
      return STELLAR_ADDRESS_REGEX.test(data.accountRef);
    }
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
    network: z.enum(['MTN', 'TELECEL', 'AIRTELTIGO']).optional(),
    accountRef: z.string().trim().min(4).max(64),
    memo: z.string().trim().max(28).optional(),
    confirmedMismatch: z.boolean().default(false),
  }),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export type RedeemChequeInput = z.infer<typeof RedeemChequeSchema>;
