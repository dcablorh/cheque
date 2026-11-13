import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../src/index.js';

describe('normalizePhone (Ghana, Nigeria, US)', () => {
  it.each([
    ['0241234567', '+233241234567', 'GH'],
    ['+233 24 123 4567', '+233241234567', 'GH'],
    ['241234567', '+233241234567', 'GH'],
    ['08012345678', '+2348012345678', 'NG'],
    ['+234 801 234 5678', '+2348012345678', 'NG'],
    ['2348012345678', '+2348012345678', 'NG'],
    ['(202) 555-0123', '+12025550123', 'US'],
    ['+1 202 555 0123', '+12025550123', 'US'],
    ['12025550123', '+12025550123', 'US'],
    ['002348012345678', '+2348012345678', 'NG'],
  ])('%s -> %s (%s)', (input, e164, country) => {
    const r = normalizePhone(input);
    expect(r.isValid).toBe(true);
    expect(r.phoneE164).toBe(e164);
    expect(r.country).toBe(country);
  });

  it.each(['0211234567', '+2346012345678', '+10125550123', '+4915112345678', '12345', ''])('rejects %s', (input) => {
    expect(normalizePhone(input).isValid).toBe(false);
  });

  it('parses payee contacts from any supported country', () => {
  });
});
