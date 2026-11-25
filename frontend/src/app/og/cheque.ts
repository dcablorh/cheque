import { fmtDate, fmtMoney } from '@/lib/api';
import { maskName, type ChequeCardProps } from './cheque-card';

/** The public shape of a cheque, as returned by `GET /api/claim/:token`. */
export interface PublicChequeView {
  publicCode: string;
  state: string;
  /** Already masked by the API ("Amina I******"). */
  payee: string;
  senderFirstName?: string | null;
  amount: string;
  currency: string;
  note?: string | null;
  expiresAt: string;
  createdAt?: string;
  corridor?: string;
}

/** Labels shown on the preview badge. Kept local so no client module is pulled in. */
const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_FUNDING: 'Funding',
  ACTIVE: 'Ready to claim',
  CLAIMING: 'Being claimed',
  AUTHORIZED: 'Paying out',
  SETTLING: 'Paying out',
  SETTLED: 'Paid',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REFUNDING: 'Refunding',
  REFUNDED: 'Refunded',
  REFUND_REVIEW: 'Under review',
};

function apiBase(origin?: string | null): string | null {
  const configured = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  const path = configured.startsWith('http') ? '' : configured || '/api';
  if (configured.startsWith('http')) return configured.replace(/\/+$/, '');
  const base = origin || (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (base.startsWith('http')) return `${base.replace(/\/+$/, '')}${path.replace(/\/+$/, '')}`;
  return null;
}

/**
 * Reads the public cheque for a claim link. Server-side only.
 *
 * Uses the unauthenticated `GET /claim/:token` endpoint, which returns the
 * masked payee name; the OTP-gated full name is never requested here.
 */
export async function fetchPublicCheque(token: string, origin?: string | null): Promise<PublicChequeView | null> {
  const base = apiBase(origin);
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/claim/${encodeURIComponent(token)}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PublicChequeView;
    if (!body || typeof body.payee !== 'string') return null;
    return body;
  } catch {
    return null;
  }
}

/** Sample cheque used when the link is unknown or the API is unreachable. */
const SAMPLE: PublicChequeView = {
  publicCode: 'CHQ-82F9K2',
  state: 'ACTIVE',
  payee: 'Kojo Mensah',
  senderFirstName: 'Ama',
  amount: '500.00',
  currency: 'GHS',
  note: 'For rent, thank you',
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};

/**
 * Turns a public cheque into the card props. The payee name is masked again here
 * as a hard guarantee (the masking is idempotent), so an unmasked name can never
 * reach a social preview, whatever the API returns.
 */
export function chequeToProps(cheque: PublicChequeView): ChequeCardProps {
  const amount = fmtMoney(cheque.amount, cheque.currency);
  const from = cheque.senderFirstName?.trim() || null;
  const state = STATE_LABEL[cheque.state] ?? 'Cheque';
  const live = ['DRAFT', 'PENDING_FUNDING', 'ACTIVE', 'CLAIMING', 'AUTHORIZED', 'SETTLING'].includes(cheque.state);
  return {
    amount,
    amountValue: cheque.amount,
    payee: maskName(cheque.payee),
    from,
    currency: cheque.currency,
    code: cheque.publicCode,
    date: cheque.createdAt ? fmtDate(cheque.createdAt) : undefined,
    expires: fmtDate(cheque.expiresAt),
    note: cheque.note,
    stateLabel: state,
    title: amount,
    subtitle: from
      ? `${from} sent you a cheque${live ? ' · open the link to claim it' : ''}`
      : 'Someone sent you a cheque',
  };
}

export const sampleProps = () => chequeToProps(SAMPLE);
