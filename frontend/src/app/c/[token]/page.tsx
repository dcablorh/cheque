'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Clock, ShieldCheck, Smartphone, Wallet, XCircle } from 'lucide-react';
import { ApiError, fmtMoney, publicApi, timeLeft } from '@/lib/api';
import { COUNTRIES, type CountryCode } from '@/lib/countries';
import { ChequePaper, ErrorNote, CorridorMap, Logo, Spinner } from '@/components/ui';

interface PublicCheque {
  publicCode: string;
  corridor?: CountryCode;
  state: string;
  payee: string;
  senderFirstName: string | null;
  amount: string;
  currency: string;
  note: string | null;
  expiresAt: string;
}
interface ClaimStatus extends PublicCheque {
  destination: string | null;
  txHash: string | null;
  network: string;
}

type Step = 'summary' | 'code' | 'destination';

const DEAD: Record<string, { title: string; body: string }> = {
  CANCELLED: { title: 'Cheque cancelled', body: 'The sender cancelled this cheque.' },
  EXPIRED: { title: 'Cheque expired', body: 'This cheque was not claimed in time and is being returned to the sender.' },
  REFUNDING: { title: 'Cheque expired', body: 'This cheque was not claimed in time and is being returned to the sender.' },
  REFUNDED: { title: 'Cheque expired', body: 'This cheque was not claimed in time and has been returned to the sender.' },
  PENDING_FUNDING: { title: 'Not ready yet', body: 'The sender is still funding this cheque. Try again in a minute.' },
};

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>();
  const [cheque, setCheque] = useState<ClaimStatus | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>('summary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [sentVia, setSentVia] = useState('');
  const idem = useRef('');

  const sKey = `cheque.claim.${token}`;
  const getSession = () => {
    try { return sessionStorage.getItem(sKey) ?? ''; } catch { return ''; }
  };

  const refresh = useCallback(async () => {
    try {
      setCheque(await publicApi.get<ClaimStatus>(`/claim/${token}/status`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
    }
  }, [token]);

  useEffect(() => {
    idem.current = crypto.randomUUID();
    refresh();
    if (getSession()) setStep('destination');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Poll while a payout is in flight.
  useEffect(() => {
    if (!cheque || !['AUTHORIZED', 'SETTLING'].includes(cheque.state)) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [cheque, refresh]);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const r = await publicApi.post<{ channel: string }>(`/claim/${token}/otp`);
      setSentVia(r.channel);
      setStep('code');
      refresh();
    });

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const r = await publicApi.post<{ sessionToken: string }>(`/claim/${token}/verify`, { otp: code });
      try { sessionStorage.setItem(sKey, r.sessionToken); } catch { /* ignore */ }
      setStep('destination');
    });
  };

  const redeem = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await publicApi.post(`/claim/${token}/redeem`, {
        sessionToken: getSession(),
        destination: { type: 'USDC', accountRef: address.trim() },
        idempotencyKey: idem.current,
      });
      await refresh();
    });
  };

  if (missing) return <Shell><Dead icon={XCircle} title="Link not valid" body="This cheque link doesn't exist. Check that you copied the whole link." /></Shell>;
  if (!cheque) return <Shell><div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand-500" /></div></Shell>;

  const paper = (
    <ChequePaper currency={cheque.currency} amountValue={cheque.amount} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payee} from={cheque.senderFirstName} note={cheque.note} code={cheque.publicCode} />
  );

  if (cheque.state === 'SETTLED') {
    return (
      <Shell>
        <ChequePaper currency={cheque.currency} amountValue={cheque.amount} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payee} from={cheque.senderFirstName} note={cheque.note} code={cheque.publicCode} stamp="Paid" />
        <div className="card mt-5 animate-rise space-y-3 p-7 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-brand-600" />
          <h1 className="display ">{fmtMoney(cheque.amount, cheque.currency)} delivered</h1>
          <p className="break-all text-sm text-ink-soft">Sent to <span className="font-mono text-xs">{cheque.destination}</span></p>
          {cheque.txHash && (
            <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline underline-offset-4"
              target="_blank" rel="noreferrer"
              href={`https://stellar.expert/explorer/${cheque.network === 'PUBLIC' ? 'public' : 'testnet'}/tx/${cheque.txHash}`}>
              View receipt on Stellar <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </Shell>
    );
  }

  if (['AUTHORIZED', 'SETTLING'].includes(cheque.state)) {
    return (
      <Shell>
        {paper}
        <div className="card mt-5 flex items-center gap-4 p-6">
          <Spinner className="h-6 w-6 text-brand-500" />
          <div>
            <p className="font-semibold">Sending your money…</p>
            <p className="text-sm text-ink-soft">This usually takes under a minute. You can keep this page open.</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (DEAD[cheque.state]) {
    return <Shell><Dead icon={cheque.state === 'PENDING_FUNDING' ? Clock : XCircle} {...DEAD[cheque.state]} /></Shell>;
  }

  return (
    <Shell>
      <div className="animate-rise space-y-5">
        {paper}
        <p className="eyebrow flex items-center justify-center gap-2 text-ink-mute">
          <Clock className="h-3.5 w-3.5" /> {timeLeft(cheque.expiresAt)}
        </p>

        {step === 'summary' && (
          <div className="card space-y-4 p-6">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <p className="text-sm text-ink-soft">
                To keep this safe, we&apos;ll send a one-time code to the contact this cheque was written for, then you
                choose where the money goes.
              </p>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full py-4" onClick={sendCode} disabled={busy}>
              {busy && <Spinner />} Claim {fmtMoney(cheque.amount, cheque.currency)}
            </button>
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={verify} className="card space-y-4 p-6">
            <div>
              <h2 className="display ">Enter your code</h2>
              <p className="mt-1 text-sm text-ink-soft">
                We sent a 6-digit code {sentVia ? `by ${sentVia.toLowerCase()}` : ''} to the contact on this cheque.
              </p>
            </div>
            <input className="field text-center font-mono text-2xl tracking-[.5em]" inputMode="numeric" maxLength={6}
              autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy && <Spinner />} Verify</button>
            <button type="button" className="w-full text-sm text-ink-soft underline underline-offset-4" onClick={sendCode} disabled={busy}>Resend code</button>
          </form>
        )}

        {step === 'destination' && (
          <form onSubmit={redeem} className="card space-y-5 p-6">
            <div>
              <h2 className="display ">Where should it go?</h2>
              <p className="mt-1 text-sm text-ink-soft">Choose how you want to receive {fmtMoney(cheque.amount, cheque.currency)}.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border-2 border-night bg-brand-50 p-4">
                <Wallet className="mb-2 h-5 w-5 text-brand-700" />
                <p className="font-semibold">USDC wallet</p>
                <p className="text-xs text-ink-soft">Stellar address · arrives in seconds</p>
              </div>
              <div className="rounded-[10px] border border-ink/10 bg-ink/[.03] p-4 opacity-60">
                <Smartphone className="mb-2 h-5 w-5 text-ink-mute" />
                <p className="font-semibold">{COUNTRIES[cheque.corridor ?? 'GH'].localRail}</p>
                <p className="text-xs text-ink-soft">Coming soon</p>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="addr">Stellar address</label>
              <input id="addr" className="field font-mono text-sm" placeholder="G…" spellCheck={false} autoCapitalize="characters"
                value={address} onChange={(e) => setAddress(e.target.value)} />
              <p className="mt-1.5 text-xs text-ink-mute">Must be a Stellar account that already holds a USDC trustline.</p>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full py-4" disabled={busy || address.trim().length !== 56}>
              {busy && <Spinner />} Get my {fmtMoney(cheque.amount, cheque.currency)}
            </button>
          </form>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-night pb-28 pt-5 text-paper">
        <div className="relative z-10 mx-auto flex h-10 max-w-xl items-center justify-between px-5">
          <Logo tone="light" />
          <span className="eyebrow !text-[11px] text-brand-500">Held in escrow</span>
        </div>
        <CorridorMap className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full" />
      </div>
      <main className="mx-auto -mt-16 max-w-xl px-5 pb-16">
        {children}
        <p className="eyebrow mt-8 text-center !text-[11px] text-sage">Secured by on-chain escrow on Stellar</p>
      </main>
    </div>
  );
}

function Dead({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="card animate-rise space-y-3 p-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-night/5"><Icon className="h-7 w-7 text-ink-mute" /></span>
      <h1 className="display ">{title}</h1>
      <p className="text-sm text-ink-soft">{body}</p>
    </div>
  );
}
