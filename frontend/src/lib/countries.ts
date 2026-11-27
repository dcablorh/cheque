/** Countries the app supports. Keep in step with packages/core/src/corridors.ts. */
export type CountryCode = 'GH' | 'NG' | 'US';

export interface Country {
  code: CountryCode;
  name: string;
  /** Emoji flag. Only for data/logs — render visuals with <Flag code={code} />, since Windows has no flag emoji glyphs. */
  flag: string;
  currency: 'GHS' | 'NGN' | 'USD';
  symbol: string;
  /** What the recipient can cash out to locally (not yet live; USDC on Stellar is). */
  localRail: string;
}

export const COUNTRIES: Record<CountryCode, Country> = {
  GH: {
    code: 'GH',
    name: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    symbol: '₵',
    localRail: 'Mobile Money',
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    symbol: '₦',
    localRail: 'Bank transfer',
  },
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: '$',
    localRail: 'Bank transfer (ACH)',
  },
};

export const COUNTRY_LIST = Object.values(COUNTRIES);

