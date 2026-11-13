/**
 * Payment corridors: where a cheque is issued from, the currency the payee is paid in,
 * and how the payee can cash out. Adding a country means adding an entry here, an anchor
 * for its currency (see packages/ramps), and a FX rate in the env.
 */

export const CORRIDOR_CODES = ['GH', 'NG', 'US'] as const;
export type CorridorCode = (typeof CORRIDOR_CODES)[number];

export const FIAT_CURRENCIES = ['GHS', 'NGN', 'USD'] as const;
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];

export type PayoutMethodType = 'MOMO' | 'BANK' | 'USDC';

export interface Corridor {
  code: CorridorCode;
  name: string;
  currency: FiatCurrency;
  /** Minor units per major unit (2 for all four currencies supported today). */
  minorExponent: number;
  /** Smallest and largest face amount the sender may issue, in major units. */
  minAmount: number;
  maxAmount: number;
  /** Phone dialing prefix (digits only) that payee phone numbers must use. */
  dialCode: string;
  /** Payout rails the payee can choose in this corridor. USDC on Stellar is always available. */
  payoutMethods: readonly PayoutMethodType[];
  /** Whether payee contacts may be email addresses (email OTP and e-mail notifications). */
  allowEmailPayee: boolean;
}

export const CORRIDORS: Readonly<Record<CorridorCode, Corridor>> = {
  GH: {
    code: 'GH',
    name: 'Ghana',
    currency: 'GHS',
    minorExponent: 2,
    minAmount: 5,
    maxAmount: 2000,
    dialCode: '233',
    payoutMethods: ['MOMO', 'USDC'],
    allowEmailPayee: true,
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    minorExponent: 2,
    minAmount: 2000,
    maxAmount: 1_000_000,
    dialCode: '234',
    payoutMethods: ['BANK', 'USDC'],
    allowEmailPayee: true,
  },
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    minorExponent: 2,
    minAmount: 5,
    maxAmount: 2000,
    dialCode: '1',
    payoutMethods: ['BANK', 'USDC'],
    allowEmailPayee: true,
  },
};

export function isCorridorCode(value: string): value is CorridorCode {
  return (CORRIDOR_CODES as readonly string[]).includes(value);
}

export function getCorridor(code: string): Corridor {
  if (!isCorridorCode(code)) {
    throw new Error(`Unknown corridor: ${code}`);
  }
  return CORRIDORS[code];
}

/**
 * Parses a comma-separated list such as "GH,NG" from env. Throws on unknown codes so a typo
 * never silently disables or enables a corridor.
 */
export function parseEnabledCorridors(raw: string): CorridorCode[] {
  const codes = raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) {
    throw new Error('ENABLED_CORRIDORS must list at least one corridor');
  }
  const unique = [...new Set(codes)];
  for (const code of unique) {
    if (!isCorridorCode(code)) {
      throw new Error(`ENABLED_CORRIDORS contains unknown corridor "${code}"`);
    }
  }
  return unique as CorridorCode[];
}

/** E.164 shape check only; the corridor check below enforces the country. */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** Returns an error message, or null when the payee phone belongs to the corridor's country. */
export function validatePayeePhone(corridor: Corridor, e164: string): string | null {
  if (!E164_REGEX.test(e164)) {
    return 'Enter the phone number in international format, e.g. +233241234567';
  }
  const digits = e164.slice(1);
  if (!digits.startsWith(corridor.dialCode)) {
    return `Payee phone must be a ${corridor.name} number starting with +${corridor.dialCode}`;
  }
  // NANP (+1) numbers are exactly 11 digits including the country code.
  if (corridor.dialCode === '1' && digits.length !== 11) {
    return `Payee phone must be a valid ${corridor.name} number (+1 followed by 10 digits)`;
  }
  return null;
}

/** Returns an error message, or null when the face amount (in major units) is allowed. */
export function validateFaceAmount(corridor: Corridor, amount: number): string | null {
  if (!Number.isFinite(amount)) return 'Amount must be a number';
  if (amount < corridor.minAmount) {
    return `Minimum ${corridor.currency} cheque amount is ${corridor.minAmount.toLocaleString('en-US')}`;
  }
  if (amount > corridor.maxAmount) {
    return `Maximum ${corridor.currency} cheque amount is ${corridor.maxAmount.toLocaleString('en-US')}`;
  }
  return null;
}

/**
 * Checks a payout destination against the corridor's rails.
 * Returns an error message, or null when it is well formed for that rail.
 */
export function validatePayoutDestination(
  corridor: Corridor,
  destination: { type: PayoutMethodType; accountRef: string; network?: string }
): string | null {
  if (!corridor.payoutMethods.includes(destination.type)) {
    return `${destination.type} payouts are not available in ${corridor.name}. Choose ${corridor.payoutMethods.join(' or ')}.`;
  }
  switch (destination.type) {
    case 'USDC':
      return /^G[A-Z2-7]{55}$/.test(destination.accountRef)
        ? null
        : 'Enter a valid Stellar address (starts with G, 56 characters).';
    case 'MOMO':
      return validatePayeePhone(corridor, destination.accountRef) ?? (destination.network ? null : 'Choose a mobile money network.');
    case 'BANK':
      return validateBankAccountRef(corridor, destination.accountRef);
  }
}

function validateBankAccountRef(corridor: Corridor, accountRef: string): string | null {
  switch (corridor.code) {
    case 'NG':
      // NUBAN: 10-digit account number.
      return /^\d{10}$/.test(accountRef) ? null : 'Enter your 10-digit Nigerian bank account number (NUBAN).';
    case 'US':
      // ACH: 9-digit routing number and account number, written as routing:account.
      return /^\d{9}:\d{4,17}$/.test(accountRef)
        ? null
        : 'Enter US bank details as routing:account (9-digit routing number, then account number).';
    case 'GH':
      return 'Bank payouts are not offered in Ghana; use mobile money or USDC.';
  }
}
