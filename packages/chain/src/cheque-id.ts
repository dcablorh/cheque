import crypto from 'node:crypto';

/**
 * Canonical mapping from an off-chain cheque UUID to the contract's `BytesN<32>` id:
 * sha256(utf8(uuid)). This matches the `digest(c.id::text, 'sha256')` join used by the
 * Postgres reconciliation view, so on-chain events can always be tied back to a row.
 */
export function deriveChequeIdHex(chequeUuid: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chequeUuid)) {
    throw new Error(`Invalid cheque UUID: ${chequeUuid}`);
  }
  return crypto.createHash('sha256').update(chequeUuid.toLowerCase(), 'utf8').digest('hex');
}

/** Strictly decodes a 32-byte hex id. Never pads or truncates. */
export function chequeIdHexToBytes(chequeIdHex: string): Buffer {
  const clean = chequeIdHex.startsWith('0x') ? chequeIdHex.slice(2) : chequeIdHex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`Cheque id must be exactly 32 bytes (64 hex chars), got ${clean.length} chars`);
  }
  return Buffer.from(clean, 'hex');
}
