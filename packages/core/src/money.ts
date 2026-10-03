export const GHS_PESEWAS_FACTOR = 100;
export const USDC_STROOPS_FACTOR = 10_000_000;

export function assertIntegerNonNegative(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a safe integer, received: ${value}`);
  }
  if (value < 0) {
    throw new Error(`${fieldName} cannot be negative, received: ${value}`);
  }
}

/**
 * Converts a GHS amount string (e.g. "50.00", "500", "5.5") to pesewas (integer minor units).
 * Uses exact string parsing to avoid binary floating point issues.
 */
export function ghsToPesewas(amount: string | number): number {
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
  return minor;
}

/**
 * Formats pesewas as a GHS currency string, e.g. 50050 -> "500.50"
 */
export function pesewasToGhsString(pesewas: number): string {
  assertIntegerNonNegative(pesewas, 'pesewas');
  const whole = Math.floor(pesewas / GHS_PESEWAS_FACTOR);
  const frac = (pesewas % GHS_PESEWAS_FACTOR).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

/**
 * Converts a USDC amount string (e.g. "32.5000000") to stroops (7 decimals on Stellar).
 * Uses exact string parsing to avoid float rounding.
 */
export function usdcToStroops(amount: string | number): number {
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

  const whole = parseInt(match[1], 10);
  const fraction = match[2] ? match[2].padEnd(7, '0') : '0000000';
  const stroops = whole * USDC_STROOPS_FACTOR + parseInt(fraction, 10);
  assertIntegerNonNegative(stroops, 'USDC stroops');
  return stroops;
}

/**
 * Formats stroops as a USDC decimal string, e.g. 32500000 -> "3.2500000"
 */
export function stroopsToUsdcString(stroops: number): string {
  assertIntegerNonNegative(stroops, 'stroops');
  const whole = Math.floor(stroops / USDC_STROOPS_FACTOR);
  const frac = (stroops % USDC_STROOPS_FACTOR).toString().padStart(7, '0');
  return `${whole}.${frac}`;
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
