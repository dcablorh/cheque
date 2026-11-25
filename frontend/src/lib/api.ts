export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const KEY = 'cheque.session.v1';
interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
  name?: string;
}

export const session = {
  get(): Session | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(s: Session) {
    localStorage.setItem(KEY, JSON.stringify(s));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new ApiError(body.message ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const publicApi = {
  get: <T,>(path: string, headers?: Record<string, string>) => request<T>(path, { headers }),
  post: <T,>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
};

/** Authenticated call with one transparent refresh-token retry. */
export async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = session.get();
  if (!s) throw new ApiError('Please sign in.', 401);
  try {
    return await request<T>(path, init, s.accessToken);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    try {
      const r = await request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
      session.set({ ...s, accessToken: r.accessToken, refreshToken: r.refreshToken });
      return await request<T>(path, init, r.accessToken);
    } catch {
      session.clear();
      throw new ApiError('Your session expired. Please sign in again.', 401);
    }
  }
}

export interface ChequeSummary {
  id: string;
  publicCode: string;
  state: string;
  payeeName: string;
  payeeEmail?: string | null;
  corridor?: string;
  amount: string;
  currency: string;
  note: string | null;
  signature?: string | null;
  funderAddress?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface ChequeDetail extends ChequeSummary {
  payout?: {
    destChain: DestinationChain;
    status: string | null;
    feeUsdc: string | null;
    netUsdc: string | null;
    burnTxHash: string | null;
    forwardTxHash: string | null;
    explorerUrl: string | null;
    lastError: string | null;
  } | null;
}

export interface CorridorConfig {
  code: 'GH' | 'NG' | 'US';
  name: string;
  currency: 'GHS' | 'NGN' | 'USD';
  minAmount: number;
  maxAmount: number;
  dialCode: string;
  payoutMethods: string[];
  /** Units of this currency per 1 USDC. */
  perUsdc: string;
}

export interface AppConfig {
  network: string;
  chainEnabled: boolean;
  walletFunding?: boolean;
  cctpEnabled?: boolean;
  usdc?: { code: string; issuer: string };
  horizonUrl?: string;
  networkPassphrase?: string;
  feeBps: number;
  corridors: CorridorConfig[];
}


/** Formats a major-unit amount in its corridor currency, e.g. ("1500.00", "NGN") -> "₦1,500.00". */
export function fmtMoney(v: string | number, currency: string = 'GHS') {
  const locale = { GHS: 'en-GH', NGN: 'en-NG', USD: 'en-US' }[currency] ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
}

/** Short, human date for cheques and receipts, e.g. "13 Nov 2026". */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Keeps digits and at most one decimal point with two decimals, so typing never produces NaN. */
export function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

/** A Stellar public key: G followed by 55 base32 characters. */
export function isStellarAddress(v: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(v.trim());
}

export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3.6e6);
  if (h >= 48) return `${Math.floor(h / 24)} days left`;
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

export const STATE_LABEL: Record<string, { label: string; tone: 'green' | 'amber' | 'gray' | 'red' | 'blue' }> = {
  DRAFT: { label: 'Draft', tone: 'gray' },
  PENDING_FUNDING: { label: 'Funding…', tone: 'amber' },
  ACTIVE: { label: 'Ready to claim', tone: 'green' },
  CLAIMING: { label: 'Being claimed', tone: 'blue' },
  AUTHORIZED: { label: 'Paying out', tone: 'blue' },
  SETTLING: { label: 'Paying out', tone: 'blue' },
  SETTLED: { label: 'Paid', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'gray' },
  EXPIRED: { label: 'Expired', tone: 'gray' },
  REFUNDING: { label: 'Refunding', tone: 'amber' },
  REFUNDED: { label: 'Refunded', tone: 'gray' },
  REFUND_REVIEW: { label: 'Under review', tone: 'red' },
};

/** Local currency -> USDC at the platform rate (rounded to 2 dp for display). */
export function toUsdc(local: number, perUsdc: string | number): number {
  const r = Number(perUsdc);
  return r > 0 ? Math.round((local / r) * 100) / 100 : 0;
}

/** USDC -> local currency at the platform rate. */
export function fromUsdc(usdc: number, perUsdc: string | number): number {
  return Math.round(usdc * Number(perUsdc) * 100) / 100;
}


export type DestinationChain = 'stellar' | 'base' | 'solana';

/** EVM address: 0x + 40 hex characters (checksum not enforced in the browser). */
export function isEvmAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

/**
 * Solana owner wallet (base58 public key). Token-account addresses are rejected
 * later by the API (off-curve / ATA). This is a shape check only so the claim
 * page does not import @cheque/core.
 */
export function isSolanaOwnerAddress(v: string): boolean {
  const s = v.trim();
  if (s.length < 32 || s.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return false;
  return !isStellarAddress(s) && !isEvmAddress(s);
}

export function isDestinationAddress(chain: DestinationChain, v: string): boolean {
  if (chain === 'stellar') return isStellarAddress(v);
  if (chain === 'base') return isEvmAddress(v);
  return isSolanaOwnerAddress(v);
}

/** Which network an address belongs to, by shape. Powers the claim page's auto-detect. */
export function detectDestinationChain(v: string): DestinationChain | null {
  const s = v.trim();
  if (!s) return null;
  if (isStellarAddress(s)) return 'stellar';
  if (isEvmAddress(s)) return 'base';
  if (isSolanaOwnerAddress(s)) return 'solana';
  return null;
}

export function explorerTxUrl(
  chain: DestinationChain,
  txHash: string,
  network: string = 'TESTNET',
): string {
  const mainnet = network === 'PUBLIC';
  if (chain === 'base') return mainnet ? `https://basescan.org/tx/${txHash}` : `https://sepolia.basescan.org/tx/${txHash}`;
  if (chain === 'solana') {
    return mainnet
      ? `https://explorer.solana.com/tx/${txHash}`
      : `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  }
  return `https://stellar.expert/explorer/${mainnet ? 'public' : 'testnet'}/tx/${txHash}`;
}
