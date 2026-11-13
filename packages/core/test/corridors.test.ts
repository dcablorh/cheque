import { describe, it, expect } from 'vitest';
import {
  CORRIDORS,
  getCorridor,
  isCorridorCode,
  parseEnabledCorridors,
  validatePayeePhone,
  validateFaceAmount,
  validatePayoutDestination,
  CreateChequeSchema,
  convertFiatMinorToStroops,
  convertStroopsToFiatMinor,
  decimalToMinor,
  minorToDecimalString,
} from '../src/index.js';

const VALID_STELLAR = 'G' + 'A'.repeat(55);

describe('corridor registry', () => {
  it('defines Ghana, Nigeria and the US with one currency each', () => {
    expect(Object.keys(CORRIDORS).sort()).toEqual(['GH', 'NG', 'US']);
    expect(CORRIDORS.GH.currency).toBe('GHS');
    expect(CORRIDORS.NG.currency).toBe('NGN');
    expect(CORRIDORS.US.currency).toBe('USD');
  });

  it('recognises only known corridor codes', () => {
    expect(isCorridorCode('NG')).toBe(true);
    expect(isCorridorCode('ZA')).toBe(false);
    expect(() => getCorridor('ZA')).toThrow(/Unknown corridor/);
  });

  it('parses ENABLED_CORRIDORS and rejects typos instead of ignoring them', () => {
    expect(parseEnabledCorridors('gh, ng')).toEqual(['GH', 'NG']);
    expect(parseEnabledCorridors('GH,GH')).toEqual(['GH']);
    expect(() => parseEnabledCorridors('GH,XX')).toThrow(/unknown corridor "XX"/);
    expect(() => parseEnabledCorridors(' , ')).toThrow(/at least one/);
  });
});

describe('payee phone per corridor', () => {
  it('accepts a number in the corridor country', () => {
    expect(validatePayeePhone(CORRIDORS.GH, '+233241234567')).toBeNull();
    expect(validatePayeePhone(CORRIDORS.NG, '+2348012345678')).toBeNull();
    expect(validatePayeePhone(CORRIDORS.US, '+12025550123')).toBeNull();
  });

  it('rejects a number from another country', () => {
    expect(validatePayeePhone(CORRIDORS.NG, '+233241234567')).toMatch(/Nigeria/);
    expect(validatePayeePhone(CORRIDORS.GH, '+2348012345678')).toMatch(/Ghana/);
  });

  it('rejects malformed numbers and short NANP numbers', () => {
    expect(validatePayeePhone(CORRIDORS.GH, '0241234567')).toMatch(/international format/);
    expect(validatePayeePhone(CORRIDORS.US, '+12025550')).toMatch(/10 digits/);
  });
});

describe('face amount limits', () => {
  it('enforces the corridor min and max', () => {
    expect(validateFaceAmount(CORRIDORS.GH, 4.99)).toMatch(/Minimum GHS/);
    expect(validateFaceAmount(CORRIDORS.GH, 2000)).toBeNull();
    expect(validateFaceAmount(CORRIDORS.GH, 2000.01)).toMatch(/Maximum GHS/);
    expect(validateFaceAmount(CORRIDORS.NG, 1999)).toMatch(/Minimum NGN/);
    expect(validateFaceAmount(CORRIDORS.NG, 150_000)).toBeNull();
  });
});

describe('payout destinations per corridor', () => {
  it('lets every corridor pay out in USDC', () => {
    for (const c of Object.values(CORRIDORS)) {
      expect(validatePayoutDestination(c, { type: 'USDC', accountRef: VALID_STELLAR })).toBeNull();
    }
  });

  it('refuses a rail the corridor does not offer', () => {
    expect(validatePayoutDestination(CORRIDORS.NG, { type: 'MOMO', accountRef: '+2348012345678', network: 'MTN' }))
      .toMatch(/not available in Nigeria/);
    expect(validatePayoutDestination(CORRIDORS.GH, { type: 'BANK', accountRef: '0123456789' }))
      .toMatch(/not available in Ghana/);
  });

  it('validates Nigerian NUBAN account numbers', () => {
    expect(validatePayoutDestination(CORRIDORS.NG, { type: 'BANK', accountRef: '0123456789' })).toBeNull();
    expect(validatePayoutDestination(CORRIDORS.NG, { type: 'BANK', accountRef: '01234' })).toMatch(/10-digit/);
  });

  it('validates US routing:account', () => {
    expect(validatePayoutDestination(CORRIDORS.US, { type: 'BANK', accountRef: '021000021:1234567890' })).toBeNull();
    expect(validatePayoutDestination(CORRIDORS.US, { type: 'BANK', accountRef: '1234567890' })).toMatch(/routing:account/);
  });

  it('requires a network for Ghana mobile money', () => {
    expect(validatePayoutDestination(CORRIDORS.GH, { type: 'MOMO', accountRef: '+233241234567' }))
      .toMatch(/network/);
    expect(validatePayoutDestination(CORRIDORS.GH, { type: 'MOMO', accountRef: '+233241234567', network: 'MTN' }))
      .toBeNull();
  });
});

describe('fiat to USDC conversion for any corridor currency', () => {
  it('converts NGN kobo at the NGN rate and back', () => {
    // 150,000.00 NGN at 1550 NGN per USD = 96.774193... USD
    const stroops = convertFiatMinorToStroops(15_000_000, '1550.000000');
    expect(stroops).toBe(967_741_935n);
    expect(convertStroopsToFiatMinor(stroops, '1550.000000')).toBe(15_000_000);
  });

  it('gives the same answer for GHS as the original helper', () => {
    // 50.00 GHS at 15.5 GHS per USD = 3.2258064... USD
    expect(convertFiatMinorToStroops(5000, '15.500000')).toBe(32_258_065n);
  });

  it('keeps parse and format of decimal amounts exact', () => {
    expect(decimalToMinor('1234.5')).toBe(123450);
    expect(decimalToMinor(75000)).toBe(7_500_000);
    expect(minorToDecimalString(123450)).toBe('1234.50');
  });
});

describe('CreateChequeSchema with corridors', () => {
  const base = {
    payeeName: 'Ama Mensah',
    payeeContact: { type: 'PHONE', value: '+2348012345678' },
  };

  it('defaults to Ghana when no corridor is sent', () => {
    const r = CreateChequeSchema.safeParse({ ...base, payeeContact: { type: 'PHONE', value: '+233241234567' }, amount: 50 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.corridor).toBe('GH');
  });

  it('accepts the legacy amountGhs alias for Ghana only', () => {
    expect(CreateChequeSchema.safeParse({ ...base, amountGhs: 50 }).success).toBe(true);
    const nigeria = CreateChequeSchema.safeParse({ ...base, corridor: 'NG', amountGhs: 50 });
    expect(nigeria.success).toBe(false);
  });

  it('requires an amount', () => {
    expect(CreateChequeSchema.safeParse({ ...base, corridor: 'NG' }).success).toBe(false);
  });

  it('rejects an unknown corridor', () => {
    expect(CreateChequeSchema.safeParse({ ...base, corridor: 'ZA', amount: 5000 }).success).toBe(false);
  });
});
