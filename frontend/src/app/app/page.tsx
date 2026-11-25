'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, ExternalLink, LogOut, Mail, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
import {
  ApiError,
  authed,
  fmtDate,
  fmtMoney,
  publicApi,
  sanitizeAmount,
  session,
  timeLeft,
  type AppConfig,
  type ChequeDetail,
  type ChequeSummary,
} from '@/lib/api';
import { SignaturePad } from '@/components/SignaturePad';
import { DepositCard } from '@/components/DepositCard';
import { WalletButton } from '@/components/WalletButton';
import { shortAddress, useWallet } from '@/lib/wallet';
import { ChequePaper, DotsLoader, ErrorNote, Logo, Patch, Skeleton, Spinner, StatusPill, SuccessNote } from '@/components/ui';
import { COUNTRIES, COUNTRY_LIST, type CountryCode } from '@/lib/countries';

const LINKS_KEY = 'cheque.links.v1';
const readLinks = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const saveLink = (id: string, url: string) => {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify({ ...readLinks(), [id]: url }));
  } catch {
    /* storage unavailable */
  }
};

/** prepare -> wallet signs -> submit, for a deposit ('create') or a cancel. */
async function runWalletTx(
  id: string,
  op: 'create' | 'cancel',
  sign: (xdr: string, networkPassphrase: string) => Promise<string>
) {
  const prep = await authed<{ xdr: string; networkPassphrase: string }>(`/cheques/${id}/tx/prepare`, {
    method: 'POST',
    body: JSON.stringify({ op }),
  });
  const signedXdr = await sign(prep.xdr, prep.networkPassphrase);
  return authed<{ state: string; txHash: string }>(`/cheques/${id}/tx/submit`, {
    method: 'POST',
    body: JSON.stringify({ op, signedXdr }),
  });
}

type View = 'list' | 'new' | { shared: string; depositError?: string };

export default function SenderApp() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(!!session.get());
    setReady(true);
  }, []);

  if (!ready) return null;
  return signedIn ? (
    <Dashboard onSignOut={() => { session.clear(); setSignedIn(false); }} />
  ) : (
    <SignIn onDone={() => setSignedIn(true)} />
  );
}

/* -------------------------------------------------------------------------- sign in */

function SignIn({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return setError('Enter a valid email address.');
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await publicApi.post('/auth/email/otp/request', { email: email.trim() });
      setStep('code');
      setResendIn(30);
      setNotice(step === 'code' ? 'A new code is on its way.' : '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const t = await publicApi.post<{ accessToken: string; refreshToken: string; user: { name?: string } }>(
        '/auth/email/otp/verify',
        { email: email.trim(), otp: code, name: name.trim() || undefined }
      );
      session.set({ accessToken: t.accessToken, refreshToken: t.refreshToken, email: email.trim(), name: t.user?.name });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* poster panel */}
      <aside className="relative hidden overflow-hidden bg-night text-paper lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Link href="/" className="justify-self-start">
          <Logo tone="light" />
        </Link>
        <div className="relative">
          <p className="eyebrow text-brand-500">Cross-border cheques</p>
          <h2 className="display mt-6 text-[clamp(56px,6.5vw,96px)]">
            Money moves
            <br />
            <span className="text-brand-500">like a message.</span>
          </h2>
          <p className="mt-6 max-w-sm text-paper/75">
            Write a cheque, send the link on any chat app. Your recipient needs no account and no app — they open it
            and choose where the money goes.
          </p>
          <Patch kind="globe" label="Across borders" rotate={-7} size={148} className="absolute -right-6 -top-28 hidden xl:block" />
          <Patch kind="chat" label="Send in any chat" rotate={8} size={120} className="absolute -bottom-24 right-24 hidden xl:block" />
        </div>
        <p className="eyebrow !text-[11px] text-moss">Cross-border digital cheques</p>
      </aside>

      {/* form column */}
      <div className="relative flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between lg:hidden">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-ink lg:mt-0"
          >
            ← Back to home
          </Link>

          <h1 className="display mt-8 text-[clamp(40px,7vw,58px)]">{step === 'email' ? 'Welcome back.' : 'Enter your code.'}</h1>
          <p className="mt-3 text-ink-soft">
            {step === 'email'
              ? 'Sign in with your email. We will send you a one-time code.'
              : `We sent a 6-digit code to ${email}.`}
          </p>

          {step === 'email' ? (
            <form onSubmit={requestCode} className="mt-8 space-y-5">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <input id="email" className="field" type="email" autoComplete="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <ErrorNote>{error}</ErrorNote>
              <button className="btn-primary w-full" disabled={busy || !email.trim()}>
                {busy && <Spinner />} Send code
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-8 space-y-5">
              <div>
                <label className="label" htmlFor="code">6-digit code</label>
                <input id="code" className="field text-center font-mono text-2xl tracking-[.5em]" inputMode="numeric"
                  maxLength={6} autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="name">Your name <span className="font-normal normal-case text-ink-mute">(first time only)</span></label>
                <input id="name" className="field" placeholder="Ama Owusu" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {notice && <p className="text-sm font-medium text-brand-700">{notice}</p>}
              <ErrorNote>{error}</ErrorNote>
              <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
                {busy && <Spinner />} Verify and continue
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="text-ink-soft underline underline-offset-4 disabled:no-underline disabled:opacity-50"
                  onClick={() => { setStep('email'); setCode(''); setError(''); setNotice(''); }}>
                  Use a different email
                </button>
                <button type="button" className="text-ink-soft underline underline-offset-4 disabled:no-underline disabled:opacity-50"
                  onClick={() => requestCode()} disabled={busy || resendIn > 0}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- dashboard */

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<View>('list');
  const [cheques, setCheques] = useState<ChequeSummary[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState('');
  const s = session.get();

  const load = useCallback(async () => {
    try {
      const r = await authed<{ cheques: ChequeSummary[] }>('/cheques');
      setCheques(r.cheques);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onSignOut();
      setError(e instanceof ApiError ? e.message : 'Could not load cheques.');
    }
  }, [onSignOut]);

  useEffect(() => {
    load();
    publicApi.get<AppConfig>('/config').then(setConfig).catch(() => undefined);
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const shared = typeof view === 'object' ? cheques?.find((c) => c.id === view.shared) : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-5 sm:px-5 sm:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Link href="/" className="shrink-0"><Logo /></Link>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <WalletButton />
          <span className="hidden max-w-[12rem] truncate text-sm text-ink-soft md:block">{s?.name ?? s?.email}</span>
          <button className="btn-ghost !px-3 !py-2.5" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {config && !config.chainEnabled && (
        <p className="mt-6 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          Settlement is not configured on this server yet, so new cheques cannot be issued.
        </p>
      )}

      {view === 'new' && config && (
        <NewCheque
          config={config}
          onCancel={() => setView('list')}
          onCreated={(id, depositError) => {
            load();
            setView({ shared: id, depositError });
          }}
        />
      )}

      {typeof view === 'object' && (
        <SharePanel
          cheque={shared}
          id={view.shared}
          initialError={view.depositError}
          onRefresh={load}
          onBack={() => setView('list')}
        />
      )}

      {view === 'list' && (
        <>
          <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="display ">Your cheques</h1>
              <p className="mt-1 text-sm text-ink-soft">Everything you have sent, and where it stands.</p>
            </div>
            <button className="btn-primary w-full sm:w-auto" onClick={() => setView('new')} disabled={!!config && !config.chainEnabled}>
              <Plus className="h-4 w-4" /> New cheque
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <ErrorNote>{error}</ErrorNote>
            {cheques === null && !error && (
              <div className="space-y-3" aria-busy="true" aria-label="Loading cheques">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[76px] w-full rounded-[20px]" />
                ))}
                <div className="flex justify-center pt-4"><DotsLoader /></div>
              </div>
            )}
            {cheques?.length === 0 && (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-night text-brand-500"><Send className="h-6 w-6" /></div>
                <h2 className="display ">Write your first cheque</h2>
                <p className="mt-1 max-w-xs text-sm text-ink-soft">It takes under a minute. If you can send a message, you can send a cheque.</p>
              </div>
            )}
            {cheques?.map((c) => (
              <button key={c.id} onClick={() => setView({ shared: c.id })}
                className="card flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-night/30 sm:flex-nowrap sm:p-5">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <p className="truncate display ">{c.payeeName}</p>
                  <p className="mt-1 truncate font-mono text-xs text-ink-mute">
                    {c.publicCode} · {['ACTIVE', 'CLAIMING'].includes(c.state) ? timeLeft(c.expiresAt) : fmtDate(c.createdAt)}
                  </p>
                </div>
                <StatusPill state={c.state} />
                <p className="ml-auto text-right display text-2xl tabular-nums sm:ml-0 sm:min-w-24">{fmtMoney(c.amount, c.currency)}</p>
                <ChevronRight className="hidden h-4 w-4 text-ink-mute sm:block" />
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- new cheque */

const EXPIRIES = [
  { h: 24, label: '24 hours' },
  { h: 48, label: '48 hours' },
  { h: 168, label: '7 days' },
];

function NewCheque({
  config,
  onCancel,
  onCreated,
}: {
  config: AppConfig;
  onCancel: () => void;
  onCreated: (id: string, depositError?: string) => void;
}) {
  const [corridor, setCorridor] = useState<CountryCode>(config.corridors[0]?.code ?? 'GH');
  const [name, setName] = useState('');
  const [payeeEmail, setPayeeEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [depositOk, setDepositOk] = useState(false);
  const { address, sign } = useWallet();
  const [chequeNo] = useState(() => {
    const cs = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    return 'CHQ-' + Array.from({ length: 6 }, () => cs[Math.floor(Math.random() * cs.length)]).join('');
  });
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const [hours, setHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const country = COUNTRIES[corridor];
  const limits = config.corridors.find((x) => x.code === corridor) ?? config.corridors[0];
  const amt = Number(amount);
  const fee = useMemo(() => (amt > 0 ? (amt * config.feeBps) / 10000 : 0), [amt, config.feeBps]);
  const outOfRange = !!limits && amt > 0 && (amt < limits.minAmount || amt > limits.maxAmount);
  const valid = name.trim().length >= 2 && !!limits && amt >= limits.minAmount && amt <= limits.maxAmount && depositOk;
  // Tell the sender what is still missing, instead of leaving a silently disabled button.
  const missing: string[] = [];
  if (name.trim().length < 2) missing.push('recipient name');
  if (!limits || amt <= 0) missing.push('amount');
  else if (outOfRange) missing.push('an amount within the limits');
  if (config.walletFunding && !depositOk) missing.push('a USDC wallet with enough funds');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await authed<{ id: string; claimUrl: string }>('/cheques', {
        method: 'POST',
        body: JSON.stringify({
          payeeName: name.trim(),
          payeeEmail: payeeEmail.trim() || undefined,
          corridor,
          amount: amt,
          note: note.trim() || undefined,
          signature: signature ?? undefined,
          publicCode: chequeNo,
          funderAddress: config.walletFunding ? address ?? undefined : undefined,
          expiryHours: hours,
        }),
      });
      saveLink(r.id, r.claimUrl);
      let depositError: string | undefined;
      if (config.walletFunding && address) {
        try {
          await runWalletTx(r.id, 'create', sign);
        } catch (err) {
          // The cheque exists; the share screen offers "Deposit now" to retry.
          depositError =
            err instanceof ApiError
              ? err.message
              : (err as Error)?.message || 'Wallet deposit was not completed. Click "Deposit now" below to finish funding.';
        }
      }
      onCreated(r.id, depositError);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // 16px on phones so iOS does not zoom when a field is focused; 14px from sm up.
  const input = '!px-3 !py-2.5 !text-base sm:!text-sm';
  return (
    <form onSubmit={submit} className="mt-6 animate-rise space-y-5">
      <div>
        <h1 className="display">New cheque</h1>
        <p className="mt-1 text-sm text-ink-soft">Write it, share the link. Whoever holds the link can claim it.</p>
      </div>

      <ChequePaper currency={country.currency} amountValue={amt || 0} amount={fmtMoney(amt || 0, country.currency)} payee={name.trim() || 'Recipient name'} note={note.trim() || null}
        from={session.get()?.name ?? 'You'} code={chequeNo} date={today} signature={signature} />

      <div className="card grid gap-5 p-4 md:grid-cols-2">
        <div className="space-y-3">
        <div>
          <label className="label !mb-1 !text-[10px]" htmlFor="corridor">Sending to</label>
          <select id="corridor" className={`field ${input}`} value={corridor}
            onChange={(e) => { setCorridor(e.target.value as CountryCode); setAmount(''); }}>
            {config.corridors.map((x) => (
              <option key={x.code} value={x.code}>{COUNTRIES[x.code].flag} {x.name} · {x.currency}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label !mb-1 !text-[10px]" htmlFor="payee">Recipient name</label>
          <input id="payee" className={`field ${input}`} placeholder="Kojo Mensah" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="label !mb-1 !text-[10px]" htmlFor="payeeEmail">Recipient email <span className="font-normal normal-case text-ink-mute">(for claim alert)</span></label>
          <input id="payeeEmail" className={`field ${input}`} type="email" placeholder="kojo@example.com" value={payeeEmail} onChange={(e) => setPayeeEmail(e.target.value)} />
        </div>

        <div>
          <label className="label !mb-1 !text-[10px]" htmlFor="amount">Amount ({country.currency})</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">{country.symbol}</span>
            <input id="amount" className={`field ${input} !pl-8 tabular-nums`} inputMode="decimal" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(sanitizeAmount(e.target.value))} />
          </div>
          {limits && (
            <p className={`mt-1 text-[11px] ${outOfRange ? 'font-semibold text-cedi' : 'text-ink-mute'}`}>
              {outOfRange
                ? amt > limits.maxAmount
                  ? `Too high: the most you can send is ${fmtMoney(limits.maxAmount, country.currency)}.`
                  : `Too low: the least you can send is ${fmtMoney(limits.minAmount, country.currency)}.`
                : `${fmtMoney(limits.minAmount, country.currency)} to ${fmtMoney(limits.maxAmount, country.currency)}`}
            </p>
          )}
        </div>

        <div>
          <label className="label !mb-1 !text-[10px]" htmlFor="note">Note <span className="font-normal normal-case">(optional)</span></label>
          <input id="note" className={`field ${input}`} maxLength={80} placeholder="For rent" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div>
          <span className="label !mb-1 !text-[10px]">Expires after</span>
          <div className="flex gap-2">
            {EXPIRIES.map((x) => (
              <button type="button" key={x.h} onClick={() => setHours(x.h)} aria-pressed={hours === x.h}
                className={`min-h-[40px] flex-1 rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${hours === x.h ? 'border-night bg-night text-paper' : 'border-ink/15 bg-[#faf7f1] text-ink-soft hover:border-ink/30'}`}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        </div>
        <div className="flex flex-col">
          <span className="label !mb-1 !text-[10px]">Your signature <span className="font-normal normal-case">(optional, appears on the cheque)</span></span>
          <div className="relative flex-1 overflow-hidden rounded-[10px] border border-sage/60 bg-[#faf7f1]">
            <SignaturePad onChange={setSignature} className="h-full min-h-[190px]" hint="Draw your signature here" />
          </div>
        </div>
      </div>

      {limits && (
        <DepositCard
          config={config}
          corridor={limits}
          amount={amt || 0}
          fee={fee}
          onAmountChange={(v) => setAmount(v > 0 ? String(v) : '')}
          onReady={setDepositOk}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xs text-xs text-ink-mute">
          {!valid && !busy && missing.length > 0
            ? `To issue, add ${missing.join(', ')}.`
            : 'Unclaimed cheques are refunded to the depositing wallet when they expire.'}
        </p>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-primary" disabled={!valid || busy}>
            {busy ? <Spinner /> : <Send className="h-4 w-4" />} {busy ? 'Issuing…' : 'Issue cheque'}
          </button>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- share / detail */

function SharePanel({
  cheque,
  id,
  initialError,
  onRefresh,
  onBack,
}: {
  cheque?: ChequeSummary;
  id: string;
  initialError?: string;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const { address, sign } = useWallet();
  const [url, setUrl] = useState<string>();
  const [detail, setDetail] = useState<ChequeDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');

  useEffect(() => setUrl(readLinks()[id]), [id]);
  useEffect(() => {
    setError(initialError ?? '');
  }, [initialError, id]);
  useEffect(() => {
    let live = true;
    authed<ChequeDetail>(`/cheques/${id}`)
      .then((d) => live && setDetail(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, cheque?.state]);

  if (!cheque) return <div className="flex justify-center py-24"><DotsLoader /></div>;

  const live = cheque.state === 'ACTIVE';
  const walletMismatch = !!cheque.funderAddress && !!address && address !== cheque.funderAddress;
  const needsWalletConnect = !!cheque.funderAddress && !address;
  const payeeEmail = detail?.payeeEmail ?? cheque.payeeEmail ?? null;
  const payout = detail?.payout ?? null;
  const shareMsg = url
    ? `Hi ${cheque.payeeName.split(' ')[0]}, I've sent you a ${fmtMoney(cheque.amount, cheque.currency)} cheque. Open to claim: ${url}`
    : '';
  const allShares = url
    ? [
        {
          label: 'WhatsApp',
          href: `https://wa.me/?text=${encodeURIComponent(shareMsg)}`,
          icon: MessageCircle,
        },
        {
          label: 'Telegram',
          href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
            `I've sent you a ${fmtMoney(cheque.amount, cheque.currency)} cheque. Open to claim:`
          )}`,
          icon: Send,
        },
        {
          label: 'Email',
          href: `mailto:?subject=${encodeURIComponent('A cheque for you')}&body=${encodeURIComponent(shareMsg)}`,
          icon: Mail,
        },
      ]
    : [];
  const primaryShare = allShares[0];
  const otherShares = allShares.slice(1);

  async function copy() {
    if (!url) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). Let them select the text instead.
      setCopyFailed(true);
    }
  }

  async function depositNow() {
    setBusy(true);
    setError('');
    try {
      await runWalletTx(id, 'create', sign);
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Deposit failed.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const isUnfunded = cheque?.state === 'PENDING_FUNDING';
    if (!confirm(isUnfunded ? 'Discard this unfunded cheque?' : 'Cancel this cheque and refund it?')) return;
    setBusy(true);
    setError('');
    try {
      if (cheque?.funderAddress && !isUnfunded) await runWalletTx(id, 'cancel', sign);
      else await authed(`/cheques/${id}/cancel`, { method: 'POST' });
      onRefresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  const destLabel = payout?.destChain === 'base' ? 'Base' : payout?.destChain === 'solana' ? 'Solana' : 'Stellar';

  return (
    <div className="mt-8 animate-rise">
      <button onClick={onBack} className="mb-4 text-sm font-semibold text-ink-soft hover:text-ink">← All cheques</button>
      <ChequePaper currency={cheque.currency} amountValue={cheque.amount} date={fmtDate(cheque.createdAt)} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payeeName} note={cheque.note} signature={cheque.signature} code={cheque.publicCode}
        stamp={cheque.state === 'SETTLED' ? 'Paid' : cheque.state === 'CANCELLED' ? 'Void' : undefined}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <StatusPill state={cheque.state} />
            <span className="text-ink-soft">
              {['ACTIVE', 'CLAIMING'].includes(cheque.state) ? timeLeft(cheque.expiresAt) : ''}
            </span>
          </div>
        } />

      {cheque.state === 'PENDING_FUNDING' && cheque.funderAddress && (
        <div className="mt-4 space-y-3 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {needsWalletConnect
                ? `Connect wallet ${shortAddress(cheque.funderAddress)} to approve the USDC deposit.`
                : walletMismatch
                  ? `Wrong wallet connected. Switch to ${shortAddress(cheque.funderAddress)} to deposit.`
                  : 'Waiting for your USDC deposit. Approve it in your wallet to activate this cheque.'}
            </span>
            <div className="flex items-center gap-2">
              {needsWalletConnect ? (
                <WalletButton />
              ) : (
                <button type="button" className="btn-primary !py-2" onClick={depositNow} disabled={busy || walletMismatch}>
                  {busy && <Spinner />} Deposit now
                </button>
              )}
              <button type="button" className="btn-ghost !py-2" onClick={cancel} disabled={busy}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
      {cheque.state === 'PENDING_FUNDING' && !cheque.funderAddress && (
        <p className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          <DotsLoader className="shrink-0" /> Locking funds in escrow. This usually takes a few seconds.
        </p>
      )}

      {payeeEmail && ['PENDING_FUNDING', 'ACTIVE'].includes(cheque.state) && (
        <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-sage/60 bg-paper px-4 py-2.5 text-xs text-ink-soft">
          <Mail className="h-3.5 w-3.5 shrink-0 text-brand-700" />
          {cheque.state === 'ACTIVE'
            ? `Claim alert queued for ${payeeEmail}. They will verify this email before claiming.`
            : `Claim alert will be emailed to ${payeeEmail} as soon as funding confirms.`}
        </p>
      )}

      {live && (
        <div className="card mt-5 space-y-4 p-6">
          <div>
            <h2 className="display  ">Send it to {cheque.payeeName.split(' ')[0]}</h2>
            <p className="mt-1 text-sm text-ink-soft">Share the claim link. Whoever holds this link can claim the money, so send it only to them.</p>
          </div>
          {url ? (
            <>
              <div className="flex items-center gap-2 rounded-[10px] border border-ink/10 bg-paper px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-sm" title={url}>{url}</code>
                <button onClick={copy} className="btn-ghost !px-3 !py-2" aria-label={copied ? 'Link copied' : 'Copy claim link'} title="Copy link">
                  {copied ? <Check className="h-4 w-4 text-brand-700" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {copyFailed && <p className="text-xs text-cedi">Could not copy automatically. Select the link above and copy it.</p>}
              {primaryShare && (
                <a href={primaryShare.href} target="_blank" rel="noreferrer" className="btn-primary w-full">
                  <primaryShare.icon className="h-4 w-4" /> Send on {primaryShare.label}
                </a>
              )}
              <div className="grid grid-cols-2 gap-3">
                {otherShares.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="btn-ghost w-full">
                    <s.icon className="h-4 w-4" /> {s.label}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-[10px] bg-paper px-4 py-3 text-sm text-ink-soft">
              The claim link is only shown once, on the device that created this cheque, and isn&apos;t available here.
            </p>
          )}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {live && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {walletMismatch && (
            <span className="text-xs text-cedi">Connect {shortAddress(cheque.funderAddress!)} to cancel.</span>
          )}
          {needsWalletConnect ? (
            <WalletButton />
          ) : (
            <button className="btn-danger" onClick={cancel} disabled={busy || walletMismatch}>{busy && <Spinner />} Cancel & refund</button>
          )}
        </div>
      )}
      {cheque.state === 'SETTLED' && (
        <SuccessNote className="mt-5">
          <span className="font-semibold">Delivered.</span> {cheque.payeeName} has been paid{payout ? ` on ${destLabel}` : ''}.
          {payout?.explorerUrl && (
            <>
              {' '}
              <a
                href={payout.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-4"
              >
                View receipt <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </SuccessNote>
      )}
      <p className="mt-6 text-center text-xs text-ink-mute">
        <button onClick={onRefresh} className="inline-flex items-center gap-1 underline"><RefreshCw className="h-3 w-3" />Refresh</button>
      </p>
    </div>
  );
}