export function scrubPiiAndSecrets(message: string): string {
  if (!message) return '';

  return message
    // Mask Ghana phone numbers +233XXXXXXXXX
    .replace(/(\+233)(\d{2})\d{3}(\d{4})/g, '$1 $2 XXX $3')
    // Mask standard 024XXXXXXX
    .replace(/(0\d{2})\d{3}(\d{4})/g, '$1 XXX $2')
    // Mask Stellar secret keys (starts with S, 56 chars)
    .replace(/S[A-Z2-7]{55}/g, 'S••••[REDACTED_SECRET]')
    // Mask potential 6-digit OTPs in messages
    .replace(/\b(OTP|code|pin)\s*[:=]?\s*\d{6}\b/gi, '$1: [REDACTED_OTP]')
    // Mask Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED_TOKEN]');
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.log(`[INFO] ${scrubPiiAndSecrets(msg)}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${scrubPiiAndSecrets(msg)}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[ERROR] ${scrubPiiAndSecrets(msg)}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${scrubPiiAndSecrets(msg)}`, ...args);
    }
  },
};
