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
    if (n > 0) parts.push('and');
  }
  if (n >= 20) {
    parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0 || parts.length === 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

/** 1234 -> "one thousand, two hundred and thirty-four". Supports up to billions. */
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
  return groups.join(', ');
}

const CURRENCY_WORDS: Record<string, string> = {
  GHS: 'Ghana cedis',
  NGN: 'Nigerian naira',
  USD: 'US dollars',
};

export function currencyWords(currency: string): string {
  return CURRENCY_WORDS[currency] ?? currency;
}

/**
 * The legal amount line on a bank cheque: "Five hundred and 00/100".
 * The currency name is rendered separately at the end of the line.
 */
export function amountInWords(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  const fixed = n.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const words = integerToWords(Number(whole));
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} and ${cents}/100`;
}
