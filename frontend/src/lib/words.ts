const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion'];

function under1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0 || parts.length === 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** 1234 -> "one thousand two hundred thirty-four". Supports up to billions. */
export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(under1000(chunk) + SCALES[scale]);
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

const UNITS: Record<string, { major: [string, string]; minor: [string, string] }> = {
  GHS: { major: ['cedi', 'cedis'], minor: ['pesewa', 'pesewas'] },
  NGN: { major: ['naira', 'naira'], minor: ['kobo', 'kobo'] },
  USD: { major: ['dollar', 'dollars'], minor: ['cent', 'cents'] },
};

export function currencyWords(currency: string): string {
  return UNITS[currency]?.major[1] ?? currency;
}

const cap = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

/**
 * The amount line, spelled out: "Five hundred ninety dollars and fifty cents".
 * Uses the local currency names (cedis and pesewas, naira and kobo).
 */
export function amountInWords(value: string | number, currency = 'USD'): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  const [whole, cents] = n.toFixed(2).split('.').map(Number);
  const u = UNITS[currency] ?? UNITS.USD;
  const major = `${integerToWords(whole)} ${whole === 1 ? u.major[0] : u.major[1]}`;
  if (!cents) return cap(major);
  return cap(`${major} and ${integerToWords(cents)} ${cents === 1 ? u.minor[0] : u.minor[1]}`);
}
