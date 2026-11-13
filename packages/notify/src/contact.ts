import { normalizePhone } from './phone.js';

export type ContactType = 'PHONE' | 'EMAIL';

/**
 * The channel-agnostic way a payee is reached. `value` is always normalized:
 * E.164 for phones, lowercase trimmed address for emails.
 */
export interface PayeeContact {
  type: ContactType;
  value: string;
}

// Pragmatic RFC 5322 subset: one @, no spaces, dotted domain, TLD of 2+ letters.
const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function normalizeEmail(input: string): { email: string; isValid: boolean } {
  const email = String(input ?? '').trim().toLowerCase();
  return { email, isValid: email.length <= 254 && EMAIL_REGEX.test(email) };
}

/**
 * Parses user input into a normalized contact, or returns null if it is neither
 * a valid supported phone number nor a valid email address.
 */
export function parsePayeeContact(input: string, hintType?: ContactType): PayeeContact | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const looksLikeEmail = hintType === 'EMAIL' || (hintType === undefined && raw.includes('@'));
  if (looksLikeEmail) {
    const { email, isValid } = normalizeEmail(raw);
    return isValid ? { type: 'EMAIL', value: email } : null;
  }

  const phone = normalizePhone(raw);
  return phone.isValid ? { type: 'PHONE', value: phone.phoneE164 } : null;
}

/** Stable key for OTP sessions and rate limits. */
export function contactKey(contact: PayeeContact): string {
  return `${contact.type.toLowerCase()}:${contact.value}`;
}

/** Masks a contact for logs and unauthenticated UI: "k***@gmail.com", "+233 24 XXX 4567". */
export function maskContact(contact: PayeeContact): string {
  if (contact.type === 'PHONE') {
    const v = contact.value;
    return v.length > 8 ? `${v.slice(0, 4)} ${v.slice(4, 6)} XXX ${v.slice(-4)}` : '••••';
  }
  const [local, domain] = contact.value.split('@');
  if (!local || !domain) return '••••';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
