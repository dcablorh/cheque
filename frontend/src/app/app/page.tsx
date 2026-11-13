'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, LogOut, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
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
  type ChequeSummary,
} from '@/lib/api';
import { SignaturePad } from '@/components/SignaturePad';
import { DepositCard } from '@/components/DepositCard';
import { WalletButton } from '@/components/WalletButton';
import { useWallet } from '@/lib/wallet';
import { ChequePaper, ErrorNote, Logo, Spinner, StatusPill } from '@/components/ui';
import { COUNTRIES, COUNTRY_LIST, toE164, type CountryCode } from '@/lib/countries';

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

type View = 'list' | 'new' | { shared: string };

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
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<CountryCode>('GH');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [notice, setNotice] = useState('');

  const c = COUNTRIES[country];
  const e164 = toE164(phone, country);

  // Count down before a new code can be requested, so people do not spam the SMS endpoint.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!e164) return setError(`Enter a valid ${c.name} number, e.g. ${c.phonePlaceholder}.`);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await publicApi.post('/auth/otp/request', { phone: e164 });
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
        '/auth/otp/verify',
        { phone: e164, otp: code, name: name.trim() || undefined }
      );
      session.set({ accessToken: t.accessToken, refreshToken: t.refreshToken, phone: e164!, name: t.user?.name });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-8 px-5 py-10">
      <Link href="/" className="justify-self-center">
        <Logo />
      </Link>
      <div className="card animate-rise p-7">
        <h1 className="display ">{step === 'phone' ? 'Welcome back' : 'Enter your code'}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {step === 'phone'
            ? 'Sign in with your phone number. We will text you a one-time code.'
            : `We sent a 6-digit code to ${e164}.`}
        </p>

        {step === 'phone' ? (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="phone">Phone number</label>
              <div className="flex gap-2">
                <select aria-label="Country" className="field !w-auto shrink-0 !px-3" value={country}
                  onChange={(e) => { setCountry(e.target.value as CountryCode); setError(''); }}>
                  {COUNTRY_LIST.map((x) => (
                    <option key={x.code} value={x.code}>{x.flag} +{x.dialCode}</option>
                  ))}
                </select>
                <input id="phone" className="field min-w-0 flex-1" inputMode="tel" autoComplete="tel" placeholder={c.phonePlaceholder}
                  value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
              </div>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full" disabled={busy || !phone}>
              {busy && <Spinner />} Send code
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4">
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
            {notice && <p className="text-sm text-brand-700">{notice}</p>}
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy && <Spinner />} Verify and continue
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="text-ink-soft underline disabled:no-underline disabled:opacity-50"
                onClick={() => { setStep('phone'); setCode(''); setError(''); setNotice(''); }}>
                Use a different number
              </button>
              <button type="button" className="text-ink-soft underline disabled:no-underline disabled:opacity-50"
                onClick={() => requestCode()} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
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
    <main className="mx-auto max-w-4xl px-5 pb-20 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-2">
          <WalletButton />
          <span className="hidden text-sm text-ink-soft sm:block">{s?.name ?? s?.phone}</span>
          <button className="btn-ghost !px-3" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>

      {config && !config.chainEnabled && (
        <p className="mt-6 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          Settlement is not configured on this server yet, so new cheques cannot be issued.
        </p>
      )}

      {view === 'new' && config && (
        <NewCheque config={config} onCancel={() => setView('list')} onCreated={(id) => { load(); setView({ shared: id }); }} />
      )}

      {typeof view === 'object' && (
        <SharePanel cheque={shared} id={view.shared} onBack={() => setView('list')} />
      )}

      {view === 'list' && (
        <>
          <div className="mt-10 flex items-end justify-between">
            <div>
              <h1 className="display ">Your cheques</h1>
              <p className="mt-1 text-sm text-ink-soft">Everything you have sent, and where it stands.</p>
            </div>
            <button className="btn-primary" onClick={() => setView('new')} disabled={!!config && !config.chainEnabled}>
              <Plus className="h-4 w-4" /> New cheque
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <ErrorNote>{error}</ErrorNote>
            {cheques === null && !error && <div className="flex justify-center py-16"><Spinner className="h-6 w-6 text-brand-600" /></div>}
            {cheques?.length === 0 && (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-night text-brand-500"><Send className="h-6 w-6" /></div>
                <h2 className="display ">Write your first cheque</h2>
                <p className="mt-1 max-w-xs text-sm text-ink-soft">It takes under a minute. If you can send a message, you can send a cheque.</p>
              </div>
            )}
            {cheques?.map((c) => (
              <button key={c.id} onClick={() => setView({ shared: c.id })}
                className="card flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-night/30 sm:flex-nowrap sm:p-5">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <p className="truncate display ">{c.payeeName}</p>
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

function NewCheque({ config, onCancel, onCreated }: { config: AppConfig; onCancel: () => void; onCreated: (id: string) => void }) {
  const [corridor, setCorridor] = useState<CountryCode>(config.corridors[0]?.code ?? 'GH');
  const [name, setName] = useState('');
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
      if (config.walletFunding && address) {
        try {
          await runWalletTx(r.id, 'create', sign);
        } catch (err) {
          // The cheque exists; the share screen offers "Deposit now" to retry.
          saveLink(r.id, r.claimUrl);
        }
      }
      onCreated(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const input = '!px-3 !py-2.5 !text-sm';
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
                className={`flex-1 rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${hours === x.h ? 'border-night bg-night text-paper' : 'border-ink/15 bg-white text-ink-soft hover:border-ink/30'}`}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        </div>
        <div className="flex flex-col">
          <span className="label !mb-1 !text-[10px]">Your signature <span className="font-normal normal-case">(optional, appears on the cheque)</span></span>
          <div className="relative flex-1 overflow-hidden rounded-[10px] border border-sage/60 bg-white">
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

function SharePanel({ cheque, id, onBack }: { cheque?: ChequeSummary; id: string; onBack: () => void }) {
  const { sign } = useWallet();
  const [url, setUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setUrl(readLinks()[id]), [id]);

  if (!cheque) return <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  const live = cheque.state === 'ACTIVE';
  const waText = url
    ? `Hi ${cheque.payeeName.split(' ')[0]}, I've sent you a ${fmtMoney(cheque.amount, cheque.currency)} cheque. Open to claim: ${url}`
    : '';
  const wa = `https://wa.me/?text=${encodeURIComponent(waText)}`;

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message || 'Deposit failed.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm('Cancel this cheque and refund it?')) return;
    setBusy(true);
    setError('');
    try {
      if (cheque?.funderAddress) await runWalletTx(id, 'cancel', sign);
      else await authed(`/cheques/${id}/cancel`, { method: 'POST' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

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
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          <span>Waiting for your USDC deposit. Approve it in your wallet to activate this cheque.</span>
          <button type="button" className="btn-primary !py-2" onClick={depositNow} disabled={busy}>
            {busy && <Spinner />} Deposit now
          </button>
        </div>
      )}
      {cheque.state === 'PENDING_FUNDING' && !cheque.funderAddress && (
        <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          <Spinner /> Locking funds in escrow on Stellar. This usually takes a few seconds.
        </p>
      )}

      {live && (
        <div className="card mt-5 space-y-4 p-6">
          <div>
            <h2 className="display ">Send it to {cheque.payeeName.split(' ')[0]}</h2>
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
              <a href={wa} target="_blank" rel="noreferrer" className="btn-primary w-full">
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp
              </a>
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
        <div className="mt-5 flex justify-end">
          <button className="btn-danger" onClick={cancel} disabled={busy}>{busy && <Spinner />} Cancel &amp; refund</button>
        </div>
      )}
      {cheque.state === 'SETTLED' && (
        <p className="mt-5 rounded-[10px] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          Delivered. {cheque.payeeName} has been paid.
        </p>
      )}
      <p className="mt-6 text-center text-xs text-ink-mute">
        <button onClick={() => location.reload()} className="inline-flex items-center gap-1 underline"><RefreshCw className="h-3 w-3" />Refresh</button>
      </p>
    </div>
  );
}
