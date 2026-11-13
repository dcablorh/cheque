/** Countries the app supports. Keep in step with packages/core/src/corridors.ts. */
export type CountryCode = 'GH' | 'NG' | 'US';

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
  dialCode: string;
  currency: 'GHS' | 'NGN' | 'USD';
  symbol: string;
  phonePlaceholder: string;
  /** What the recipient can cash out to locally (not yet live; USDC on Stellar is). */
  localRail: string;
  /** Full E.164 shape for this country's mobile numbers. */
  e164: RegExp;
}

export const COUNTRIES: Record<CountryCode, Country> = {
  GH: {
    code: 'GH',
    name: 'Ghana',
    flag: '🇬🇭',
    dialCode: '233',
    currency: 'GHS',
    symbol: '₵',
    phonePlaceholder: '024 123 4567',
    localRail: 'Mobile Money',
    e164: /^\+233[235]\d{8}$/,
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    dialCode: '234',
    currency: 'NGN',
    symbol: '₦',
    phonePlaceholder: '0801 234 5678',
    localRail: 'Bank transfer',
    e164: /^\+234[789]\d{9}$/,
  },
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    dialCode: '1',
    currency: 'USD',
    symbol: '$',
    phonePlaceholder: '(202) 555 0123',
    localRail: 'Bank transfer (ACH)',
    e164: /^\+1[2-9]\d{2}[2-9]\d{6}$/,
  },
};

export const COUNTRY_LIST = Object.values(COUNTRIES);

/**
 * Turns what a person typed ("024 123 4567", "0801…", "(202) 555-0123", "+233…") into E.164 for the
 * given country, or null when it isn't a valid mobile number there.
 */
export function toE164(input: string, country: CountryCode): string | null {
  const c = COUNTRIES[country];
  let n = input.replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+')) return c.e164.test(n) ? n : null;
  if (n.startsWith(c.dialCode) && n.length > c.dialCode.length + 6) n = n.slice(c.dialCode.length);
  if (n.startsWith('0')) n = n.slice(1);
  const e164 = `+${c.dialCode}${n}`;
  return c.e164.test(e164) ? e164 : null;
}
