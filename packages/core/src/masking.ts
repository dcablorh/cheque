/**
 * Masks a Ghana / E.164 phone number for UI display and logs.
 * Example: "+233241234567" -> "+233 24 XXX 4567"
 * Example: "0241234567" -> "024 XXX 4567"
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\s+/g, '');
  
  if (cleaned.startsWith('+233') && cleaned.length >= 12) {
    const prefix = cleaned.slice(0, 4); // +233
    const network = cleaned.slice(4, 6); // 24
    const last4 = cleaned.slice(-4);
    return `${prefix} ${network} XXX ${last4}`;
  }
  
  if (cleaned.startsWith('233') && cleaned.length >= 11) {
    const prefix = '+233';
    const network = cleaned.slice(3, 5);
    const last4 = cleaned.slice(-4);
    return `${prefix} ${network} XXX ${last4}`;
  }

  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    const network = cleaned.slice(0, 3); // 024
    const last4 = cleaned.slice(-4);
    return `${network} XXX ${last4}`;
  }

  // Fallback mask if unexpected length
  if (cleaned.length > 4) {
    const visibleStart = cleaned.slice(0, Math.min(3, cleaned.length - 4));
    const visibleEnd = cleaned.slice(-4);
    return `${visibleStart}••••${visibleEnd}`;
  }

  return '••••';
}

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
