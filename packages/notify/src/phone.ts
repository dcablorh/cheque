export type GhanaCarrier = 'MTN' | 'TELECEL' | 'AIRTELTIGO' | 'UNKNOWN';

export interface NormalizedGhanaPhone {
  raw: string;
  phoneE164: string; // +233XXXXXXXXX
  nationalNumber: string; // 9 digits without leading 0
  carrier: GhanaCarrier;
  isValid: boolean;
  carrierPrefix: string;
}

/**
 * Carrier prefix mapping for Ghana mobile networks:
 * - MTN Ghana: 024, 054, 055, 059, 053
 * - Telecel Ghana (formerly Vodafone): 020, 050
 * - AT (AirtelTigo): 027, 057, 026, 056
 */
const CARRIER_PREFIX_MAP: Record<string, GhanaCarrier> = {
  '24': 'MTN',
  '54': 'MTN',
  '55': 'MTN',
  '59': 'MTN',
  '53': 'MTN',
  '20': 'TELECEL',
  '50': 'TELECEL',
  '27': 'AIRTELTIGO',
  '57': 'AIRTELTIGO',
  '26': 'AIRTELTIGO',
  '56': 'AIRTELTIGO',
};

/**
 * Normalizes and validates any Ghana phone number input into E.164 (+233XXXXXXXXX).
 * Handles formats: "0241234567", "241234567", "+233 24 123 4567", "00233241234567".
 */
export function normalizeGhanaPhone(input: string): NormalizedGhanaPhone {
  const raw = String(input ?? '').trim();
  // Strip non-digits except leading plus
  let cleaned = raw.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('00233')) {
    cleaned = '+233' + cleaned.slice(5);
  } else if (cleaned.startsWith('233') && !cleaned.startsWith('+233')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+233' + cleaned.slice(1);
  } else if (!cleaned.startsWith('+') && cleaned.length === 9) {
    cleaned = '+233' + cleaned;
  }

  // A valid Ghana E.164 number is +233 followed by exactly 9 digits
  const match = /^\+233([235]\d{8})$/.exec(cleaned);
  if (!match) {
    return {
      raw,
      phoneE164: cleaned,
      nationalNumber: '',
      carrier: 'UNKNOWN',
      isValid: false,
      carrierPrefix: '',
    };
  }

  const nationalNumber = match[1]; // 9 digits, e.g. "241234567"
  const carrierPrefix = nationalNumber.slice(0, 2);
  const carrier = CARRIER_PREFIX_MAP[carrierPrefix] ?? 'UNKNOWN';

  return {
    raw,
    phoneE164: `+233${nationalNumber}`,
    nationalNumber,
    carrier,
    isValid: carrier !== 'UNKNOWN',
    carrierPrefix,
  };
}

/**
 * Formats an E.164 Ghana number into clean display format: "+233 24 123 4567"
 */
export function formatGhanaPhoneDisplay(phoneE164: string): string {
  const norm = normalizeGhanaPhone(phoneE164);
  if (!norm.isValid) return phoneE164;
  const n = norm.nationalNumber;
  return `+233 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}

export type PhoneCountry = 'GH' | 'NG' | 'US';

export interface NormalizedPhone {
  raw: string;
  phoneE164: string;
  country: PhoneCountry | null;
  isValid: boolean;
}

const NG_MOBILE = /^\+234([789]\d{9})$/;
// NANP: area code and exchange both start 2-9.
const US_NUMBER = /^\+1([2-9]\d{2}[2-9]\d{6})$/;

/**
 * Normalizes a phone number for any supported country (Ghana, Nigeria, US) into E.164.
 *
 * Numbers with a country code ("+234 801 234 5678", "00233241234567") are identified by it.
 * Local formats are resolved by their shape, which is unambiguous across the three:
 *   9 digits  (241234567)    -> Ghana
 *   10 digits starting 0     -> Ghana   (0241234567)
 *   11 digits starting 0     -> Nigeria (08012345678)
 *   10 digits starting 2-9   -> US      (2025550123)
 *   11 digits starting 1     -> US      (12025550123)
 */
export function normalizePhone(input: string): NormalizedPhone {
  const raw = String(input ?? '').trim();
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);

  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 9) cleaned = '+233' + cleaned;
    else if (cleaned.length === 10 && cleaned.startsWith('0')) cleaned = '+233' + cleaned.slice(1);
    else if (cleaned.length === 11 && cleaned.startsWith('0')) cleaned = '+234' + cleaned.slice(1);
    else if (cleaned.length === 10) cleaned = '+1' + cleaned;
    else if (cleaned.length === 11 && cleaned.startsWith('1')) cleaned = '+' + cleaned;
    else if (cleaned.startsWith('233') || cleaned.startsWith('234')) cleaned = '+' + cleaned;
  }

  if (cleaned.startsWith('+233')) {
    const gh = normalizeGhanaPhone(cleaned);
    return { raw, phoneE164: gh.phoneE164, country: gh.isValid ? 'GH' : null, isValid: gh.isValid };
  }
  const ng = NG_MOBILE.exec(cleaned);
  if (ng) return { raw, phoneE164: `+234${ng[1]}`, country: 'NG', isValid: true };
  const us = US_NUMBER.exec(cleaned);
  if (us) return { raw, phoneE164: `+1${us[1]}`, country: 'US', isValid: true };
  return { raw, phoneE164: cleaned, country: null, isValid: false };
}

export const PHONE_ERROR = 'Enter a valid Ghana (+233), Nigeria (+234) or US (+1) phone number.';
