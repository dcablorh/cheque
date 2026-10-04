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
