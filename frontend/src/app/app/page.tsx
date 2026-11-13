'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy, LogOut, MessageCircle, Plus, RefreshCw, Send } from 'lucide-react';
import {
  ApiError,
  authed,
  fmtMoney,
  publicApi,
  session,
  timeLeft,
  type AppConfig,
  type ChequeSummary,
} from '@/lib/api';
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

  const c = COUNTRIES[country];
  const e164 = toE164(phone, country);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!e164) return setError(`Enter a valid ${c.name} number, e.g. ${c.phonePlaceholder}.`);
    setBusy(true);
    setError('');
    try {
      await publicApi.post('/auth/otp/request', { phone: e164 });
      setStep('code');
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
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
              {busy && <Spinner />} Verify and continue
            </button>
            <button type="button" className="w-full text-sm text-ink-soft underline" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>
              Use a different number
            </button>
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
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-6">
      <header className="flex items-center justify-between">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-ink-soft sm:block">{s?.name ?? s?.phone}</span>
          <button className="btn-ghost !px-3" onClick={onSignOut} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
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
                    {c.publicCode} · {['ACTIVE', 'CLAIMING'].includes(c.state) ? timeLeft(c.expiresAt) : new Date(c.createdAt).toLocaleDateString()}
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
  const [kind, setKind] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [contact, setContact] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [hours, setHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const country = COUNTRIES[corridor];
  const limits = config.corridors.find((x) => x.code === corridor) ?? config.corridors[0];
  const value = kind === 'PHONE' ? toE164(contact, corridor) : contact.trim().toLowerCase();
  const amt = Number(amount);
  const fee = useMemo(() => (amt > 0 ? (amt * config.feeBps) / 10000 : 0), [amt, config.feeBps]);
  const valid = name.trim().length >= 2 && !!value && !!limits && amt >= limits.minAmount && amt <= limits.maxAmount;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await authed<{ id: string; claimUrl: string }>('/cheques', {
        method: 'POST',
        body: JSON.stringify({
          payeeName: name.trim(),
          payeeContact: { type: kind, value },
          corridor,
          amount: amt,
          note: note.trim() || undefined,
          expiryHours: hours,
        }),
      });
      saveLink(r.id, r.claimUrl);
      onCreated(r.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid animate-rise gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card space-y-5 p-6">
        <div>
          <h1 className="display ">New cheque</h1>
          <p className="mt-1 text-sm text-ink-soft">Funds are escrowed on-chain the moment you issue it.</p>
        </div>

        <div>
          <label className="label" htmlFor="corridor">Sending to</label>
          <select id="corridor" className="field" value={corridor}
            onChange={(e) => { setCorridor(e.target.value as CountryCode); setContact(''); setAmount(''); }}>
            {config.corridors.map((x) => (
              <option key={x.code} value={x.code}>{COUNTRIES[x.code].flag} {x.name} · {x.currency}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-mute">
            They can cash out to {country.localRail.toLowerCase()} or a USDC wallet.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="payee">Recipient name</label>
          <input id="payee" className="field" placeholder="Kojo Mensah" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label !mb-0" htmlFor="contact">{kind === 'PHONE' ? 'Phone number' : 'Email'}</label>
            <button type="button" className="text-xs font-semibold text-brand-700 underline"
              onClick={() => { setKind(kind === 'PHONE' ? 'EMAIL' : 'PHONE'); setContact(''); }}>
              Use {kind === 'PHONE' ? 'email' : 'phone'} instead
            </button>
          </div>
          <input id="contact" className="field" inputMode={kind === 'PHONE' ? 'tel' : 'email'}
            placeholder={kind === 'PHONE' ? country.phonePlaceholder : 'name@example.com'} value={contact} onChange={(e) => setContact(e.target.value)} />
          {kind === 'PHONE' && value && (
            <p className="mt-1.5 text-sm text-ink-soft">Sending to <span className="font-mono font-semibold text-ink">{value}</span> — double-check this.</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="amount">Amount ({country.currency})</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 display text-3xl text-ink-mute">{country.symbol}</span>
            <input id="amount" className="field pl-10 display text-3xl tabular-nums" inputMode="decimal" placeholder="0.00"
              value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          {limits && (
            <p className="mt-1.5 text-xs text-ink-mute">
              Between {fmtMoney(limits.minAmount, country.currency)} and {fmtMoney(limits.maxAmount, country.currency)}.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="note">Note <span className="font-normal normal-case text-ink-mute">(optional)</span></label>
          <input id="note" className="field" maxLength={80} placeholder="For rent" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div>
          <span className="label">Expires after</span>
          <div className="flex gap-2">
            {EXPIRIES.map((x) => (
              <button type="button" key={x.h} onClick={() => setHours(x.h)} aria-pressed={hours === x.h}
                className={`flex-1 rounded-[10px] border px-3 py-2.5 text-sm font-semibold transition ${hours === x.h ? 'border-night bg-night text-paper' : 'border-ink/15 bg-white text-ink-soft hover:border-ink/30'}`}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <ChequePaper compact currency={country.currency} amountValue={amt || 0} amount={fmtMoney(amt || 0, country.currency)} payee={name.trim() || 'Recipient name'} note={note.trim() || null}
          from={session.get()?.name ?? 'You'} code="CHQ-••••••" />
        <div className="card space-y-2 p-5 text-sm">
          <Row k="Cheque amount" v={fmtMoney(amt || 0, country.currency)} />
          <Row k={`Fee (${config.feeBps / 100}%)`} v={fmtMoney(fee, country.currency)} />
          <div className="border-t border-ink/10 pt-2"><Row k="You pay" v={fmtMoney((amt || 0) + fee, country.currency)} bold /></div>
          <p className="pt-1 text-xs text-ink-mute">Unclaimed cheques are refunded automatically when they expire.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-3">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary flex-1" disabled={!valid || busy}>
            {busy ? <Spinner /> : <Send className="h-4 w-4" />} Issue cheque
          </button>
        </div>
      </aside>
    </form>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
      <span>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- share / detail */

function SharePanel({ cheque, id, onBack }: { cheque?: ChequeSummary; id: string; onBack: () => void }) {
  const [url, setUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setUrl(readLinks()[id]), [id]);

  if (!cheque) return <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brand-600" /></div>;

  const live = cheque.state === 'ACTIVE';
  const waText = url
    ? `Hi ${cheque.payeeName.split(' ')[0]}, I've sent you a ${fmtMoney(cheque.amount, cheque.currency)} cheque. Open to claim: ${url}`
    : '';
  const wa = cheque.payeeContact.type === 'PHONE'
    ? `https://wa.me/${cheque.payeeContact.value.replace('+', '')}?text=${encodeURIComponent(waText)}`
    : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  async function cancel() {
    if (!confirm('Cancel this cheque and refund it?')) return;
    setBusy(true);
    setError('');
    try {
      await authed(`/cheques/${id}/cancel`, { method: 'POST' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 animate-rise">
      <button onClick={onBack} className="mb-4 text-sm font-semibold text-ink-soft hover:text-ink">← All cheques</button>
      <ChequePaper currency={cheque.currency} amountValue={cheque.amount} date={new Date(cheque.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payeeName} note={cheque.note} code={cheque.publicCode}
        stamp={cheque.state === 'SETTLED' ? 'Paid' : cheque.state === 'CANCELLED' ? 'Void' : undefined}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <StatusPill state={cheque.state} />
            <span className="text-ink-soft">
              {cheque.payeeContact.value} · {['ACTIVE', 'CLAIMING'].includes(cheque.state) ? timeLeft(cheque.expiresAt) : ''}
            </span>
          </div>
        } />

      {cheque.state === 'PENDING_FUNDING' && (
        <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-gold-400/50 bg-gold-300/30 px-4 py-3 text-sm text-[#5c4300]">
          <Spinner /> Locking funds in escrow on Stellar. This usually takes a few seconds.
        </p>
      )}

      {live && (
        <div className="card mt-5 space-y-4 p-6">
          <div>
            <h2 className="display ">Send it to {cheque.payeeName.split(' ')[0]}</h2>
            <p className="mt-1 text-sm text-ink-soft">Share the claim link. Only the number or email on the cheque can unlock it.</p>
          </div>
          {url ? (
            <>
              <div className="flex items-center gap-2 rounded-[10px] border border-ink/10 bg-paper px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
                <button onClick={copy} className="btn-ghost !px-3 !py-2">{copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />}</button>
              </div>
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
