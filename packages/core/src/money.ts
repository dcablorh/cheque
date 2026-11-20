export const GHS_PESEWAS_FACTOR = 100;
export const USDC_STROOPS_FACTOR = 10_000_000n;
/** CCTP and most non-Stellar USDC use 6 decimals (micro-USDC). */
export const USDC_MICRO_FACTOR = 1_000_000n;
/** 1 micro-USDC = 10 stroops. The 7th Stellar decimal is dropped at the CCTP boundary. */
export const STROOPS_PER_MICRO = 10n;
/** Minimum net USDC (6 decimals) a cross-chain claim may deliver after the forwarding fee. */
export const MIN_CCTP_NET_MICRO = 500_000n; // 0.50 USDC


declare const BrandSymbol: unique symbol;

/**
 * Branded integer pesewas type (1 GHS = 100 pesewas).
 */
export type Pesewas = number & { readonly [BrandSymbol]: 'Pesewas' };

/**
 * Branded integer stroops type on Stellar (1 USDC = 10,000,000 stroops).
 */
export type Stroops = bigint & { readonly [BrandSymbol]: 'Stroops' };

export type RoundingMode = 'ROUND_HALF_UP' | 'ROUND_UP' | 'ROUND_DOWN' | 'ROUND_HALF_EVEN';

export function assertIntegerNonNegative(value: number | bigint, fieldName: string): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${fieldName} must be a safe integer, received: ${value}`);
    }
    if (value < 0) {
      throw new Error(`${fieldName} cannot be negative, received: ${value}`);
    }
  } else {
    if (value < 0n) {
      throw new Error(`${fieldName} cannot be negative, received: ${value}`);
    }
  }
}

/**
 * Applies explicit rounding on numeric division.
 */
export function roundDivision(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'ROUND_HALF_UP'
): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero');
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  if (remainder === 0n) {
    return quotient;
  }

  switch (mode) {
    case 'ROUND_DOWN':
      return quotient;
    case 'ROUND_UP':
      return quotient + 1n;
    case 'ROUND_HALF_UP': {
      // If remainder * 2 >= denominator, round up
      if (remainder * 2n >= denominator) {
        return quotient + 1n;
      }
      return quotient;
    }
    case 'ROUND_HALF_EVEN': {
      const twiceRemainder = remainder * 2n;
      if (twiceRemainder > denominator) {
        return quotient + 1n;
      } else if (twiceRemainder < denominator) {
        return quotient;
      } else {
        // Exactly half: round to nearest even quotient
        return quotient % 2n === 0n ? quotient : quotient + 1n;
      }
    }
  }
}

/**
 * Converts a GHS amount string or number to branded Pesewas.
 */
export function ghsToPesewas(amount: string | number): Pesewas {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid GHS amount: ${amount}`);
    }
    amount = amount.toFixed(2);
  }

  const trimmed = amount.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid GHS amount format: "${amount}". Expected decimal e.g. "50.00"`);
  }

  const whole = parseInt(match[1], 10);
  const fraction = match[2] ? match[2].padEnd(2, '0') : '00';
  const minor = whole * GHS_PESEWAS_FACTOR + parseInt(fraction, 10);
  assertIntegerNonNegative(minor, 'GHS pesewas');
  return minor as Pesewas;
}

export function toPesewas(pesewas: number): Pesewas {
  assertIntegerNonNegative(pesewas, 'pesewas');
  return Math.trunc(pesewas) as Pesewas;
}

export function toStroops(stroops: bigint | number): Stroops {
  const big = typeof stroops === 'bigint' ? stroops : BigInt(Math.trunc(stroops));
  assertIntegerNonNegative(big, 'stroops');
  return big as Stroops;
}

/**
 * Formats pesewas as a GHS currency string, e.g. 50050 -> "500.50"
 */
export function pesewasToGhsString(pesewas: Pesewas | number): string {
  assertIntegerNonNegative(pesewas, 'pesewas');
  const whole = Math.floor(pesewas / GHS_PESEWAS_FACTOR);
  const frac = (pesewas % GHS_PESEWAS_FACTOR).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

/**
 * Converts a USDC amount string or number to branded Stroops (7 decimals on Stellar).
 */
export function usdcToStroops(amount: string | number): Stroops {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid USDC amount: ${amount}`);
    }
    amount = amount.toFixed(7);
  }

  const trimmed = amount.trim();
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid USDC amount format: "${amount}". Up to 7 decimal places allowed.`);
  }

  const whole = BigInt(match[1]);
  const fraction = match[2] ? match[2].padEnd(7, '0') : '0000000';
  const stroops = whole * USDC_STROOPS_FACTOR + BigInt(fraction);
  assertIntegerNonNegative(stroops, 'USDC stroops');
  return stroops as Stroops;
}

/**
 * Formats stroops as a USDC decimal string, e.g. 32500000n -> "3.2500000"
 */
export function stroopsToUsdcString(stroops: Stroops | bigint | number): string {
  const big = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  assertIntegerNonNegative(big, 'stroops');
  const whole = big / USDC_STROOPS_FACTOR;
  const frac = (big % USDC_STROOPS_FACTOR).toString().padStart(7, '0');
  return `${whole}.${frac}`;
}

/**
 * Converts GHS Pesewas to USDC Stroops using FX rate (GHS per USD) with explicit rounding.
 * e.g. rate = "15.500000" means 15.50 GHS = 1 USD.
 * Formula: USDC Stroops = (Pesewas / 100) / rate * 10,000,000
 * = (Pesewas * 100,000) / rate
 */
export function convertGhsToUsdcStroops(
  pesewas: Pesewas | number,
  fxRateGhsPerUsd: string | number,
  roundingMode: RoundingMode = 'ROUND_HALF_UP'
): Stroops {
  assertIntegerNonNegative(pesewas, 'pesewas');
  const rateStr = typeof fxRateGhsPerUsd === 'number' ? fxRateGhsPerUsd.toFixed(6) : fxRateGhsPerUsd.trim();
  const [wholeStr, fracStr = ''] = rateStr.split('.');
  const rateDecimals = fracStr.length;
  const rateScaled = BigInt(wholeStr + fracStr);

  if (rateScaled <= 0n) {
    throw new Error(`Invalid FX rate: ${fxRateGhsPerUsd}`);
  }

  // 100_000 * 10^(rateDecimals)
  const scale = 100_000n * (10n ** BigInt(rateDecimals));
  const numerator = BigInt(pesewas) * scale;
  const stroops = roundDivision(numerator, rateScaled, roundingMode);

  return stroops as Stroops;
}

/**
 * Converts USDC Stroops to GHS Pesewas using FX rate with explicit rounding.
 */
export function convertUsdcStroopsToGhs(
  stroops: Stroops | bigint | number,
  fxRateGhsPerUsd: string | number,
  roundingMode: RoundingMode = 'ROUND_HALF_UP'
): Pesewas {
  const stroopsBig = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  assertIntegerNonNegative(stroopsBig, 'stroops');

  const rateStr = typeof fxRateGhsPerUsd === 'number' ? fxRateGhsPerUsd.toFixed(6) : fxRateGhsPerUsd.trim();
  const [wholeStr, fracStr = ''] = rateStr.split('.');
  const rateDecimals = fracStr.length;
  const rateScaled = BigInt(wholeStr + fracStr);

  const numerator = stroopsBig * rateScaled;
  const denominator = 100_000n * (10n ** BigInt(rateDecimals));

  const pesewasBig = roundDivision(numerator, denominator, roundingMode);
  return Number(pesewasBig) as Pesewas;
}

export function addMinor(a: number, b: number): number {
  assertIntegerNonNegative(a, 'a');
  assertIntegerNonNegative(b, 'b');
  const sum = a + b;
  assertIntegerNonNegative(sum, 'sum');
  return sum;
}

export function subMinor(a: number, b: number): number {
  assertIntegerNonNegative(a, 'a');
  assertIntegerNonNegative(b, 'b');
  if (a < b) {
    throw new Error(`Cannot subtract ${b} from ${a}: negative minor amount`);
  }
  return a - b;
}

/**
 * Converts fiat minor units to USDC stroops for any corridor currency.
 * `fxRatePerUsd` is the amount of that currency per 1 USD (e.g. "1550.000000" for NGN).
 */
export function convertFiatMinorToStroops(
  minor: Pesewas | number,
  fxRatePerUsd: string | number,
  roundingMode: RoundingMode = 'ROUND_HALF_UP'
): Stroops {
  return convertGhsToUsdcStroops(minor, fxRatePerUsd, roundingMode);
}

/** Inverse of convertFiatMinorToStroops. */
export function convertStroopsToFiatMinor(
  stroops: Stroops | bigint | number,
  fxRatePerUsd: string | number,
  roundingMode: RoundingMode = 'ROUND_HALF_UP'
): number {
  return convertUsdcStroopsToGhs(stroops, fxRatePerUsd, roundingMode);
}

/**
 * Parses a decimal major-unit amount (number or string) into integer minor units.
 * Two decimal places, like "1234.50" -> 123450.
 */
export function decimalToMinor(amount: string | number): number {
  return ghsToPesewas(amount);
}

/** Formats integer minor units for display, e.g. (123450) -> "1234.50". */
export function minorToDecimalString(minor: number): string {
  return pesewasToGhsString(minor);
}


/**
 * Drops the 7th Stellar decimal so the amount is representable in CCTP's 6-decimal units.
 * Dust stays in the source Stellar account.
 */
export function quantizeStroopsToSixDecimals(stroops: Stroops | bigint | number): Stroops {
  const big = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  assertIntegerNonNegative(big, 'stroops');
  return ((big / STROOPS_PER_MICRO) * STROOPS_PER_MICRO) as Stroops;
}

/** Converts 7-decimal stroops to 6-decimal micro-USDC, truncating the 7th decimal. */
export function stroopsToMicroUsdc(stroops: Stroops | bigint | number): bigint {
  const big = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  assertIntegerNonNegative(big, 'stroops');
  return big / STROOPS_PER_MICRO;
}

/** Converts 6-decimal micro-USDC to 7-decimal stroops. */
export function microUsdcToStroops(micro: bigint | number): Stroops {
  const big = typeof micro === 'bigint' ? micro : BigInt(micro);
  assertIntegerNonNegative(big, 'micro-USDC');
  return (big * STROOPS_PER_MICRO) as Stroops;
}

/** Formats 6-decimal micro-USDC, e.g. 1947031n -> "1.947031". */
export function microUsdcToString(micro: bigint | number): string {
  const big = typeof micro === 'bigint' ? micro : BigInt(micro);
  assertIntegerNonNegative(big, 'micro-USDC');
  const whole = big / USDC_MICRO_FACTOR;
  const frac = (big % USDC_MICRO_FACTOR).toString().padStart(6, '0');
  return `${whole}.${frac}`;
}
