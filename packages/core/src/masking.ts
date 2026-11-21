/**
 * Masks payee or customer name for unauthenticated landing preview.
 * Example: "Kojo Mensah" -> "K**** M*****"
 * Example: "Kwame" -> "K****"
 */
export function maskName(fullName: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/);
  return words
    .map((word) => {
      if (word.length <= 1) return word;
      return word[0] + '*'.repeat(Math.max(word.length - 1, 4));
    })
    .join(' ');
}

/**
 * Masks an account reference for confirmation receipts.
 * Example for MoMo: "MTN ••• 4821"
 * Example for Stellar: "GABCD...WXYZ"
 */
export function maskAccountRef(ref: string, type: 'MOMO' | 'USDC' | 'BANK', network?: string): string {
  if (!ref) return '';
  if (type === 'MOMO') {
    const last4 = ref.slice(-4);
    return network ? `${network} ••• ${last4}` : `••• ${last4}`;
  }
  if (type === 'USDC') {
    if (ref.length <= 8) return '••••';
    return `${ref.slice(0, 4)}...${ref.slice(-4)}`;
  }
  const last4 = ref.slice(-4);
  return `Bank ••• ${last4}`;
}
