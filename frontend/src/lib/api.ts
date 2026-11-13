export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  phone: string;
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
  get: <T,>(path: string) => request<T>(path),
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
  payeeContact: { type: 'PHONE' | 'EMAIL'; value: string };
  corridor?: string;
  amount: string;
  currency: string;
  note: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CorridorConfig {
  code: 'GH' | 'NG' | 'US';
  name: string;
  currency: 'GHS' | 'NGN' | 'USD';
  minAmount: number;
  maxAmount: number;
  dialCode: string;
  payoutMethods: string[];
}

export interface AppConfig {
  network: string;
  chainEnabled: boolean;
  feeBps: number;
  corridors: CorridorConfig[];
}


/** Formats a major-unit amount in its corridor currency, e.g. ("1500.00", "NGN") -> "₦1,500.00". */
export function fmtMoney(v: string | number, currency: string = 'GHS') {
  const locale = { GHS: 'en-GH', NGN: 'en-NG', USD: 'en-US' }[currency] ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
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
