'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Clock, ShieldCheck, Smartphone, Wallet, XCircle } from 'lucide-react';
import {
  ApiError,
  detectDestinationChain,
  explorerTxUrl,
  fmtDate,
  fmtMoney,
  isDestinationAddress,
  publicApi,
  timeLeft,
  type DestinationChain,
} from '@/lib/api';
import { COUNTRIES, type CountryCode } from '@/lib/countries';
import { ChequePaper, CorridorMap, DotsLoader, ErrorNote, FailureNote, Logo, ProcessingRail, Skeleton, Spinner } from '@/components/ui';
import { useWallet, shortAddress } from '@/lib/wallet';

interface PublicCheque {
  publicCode: string;
  corridor?: CountryCode;
  state: string;
  payee: string;
  payeeFullName?: string | null;
  senderFirstName: string | null;
  amount: string;
  currency: string;
  note: string | null;
  signature?: string | null;
  expiresAt: string;
  createdAt?: string;
}
interface ClaimStatus extends PublicCheque {
  destination: string | null;
  destinationChain?: DestinationChain | null;
  txHash: string | null;
  burnTxHash?: string | null;
  forwardTxHash?: string | null;
  explorerUrl?: string | null;
  stellarRedeemTx?: string | null;
  feeUsdc?: string | null;
  netUsdc?: string | null;
  payoutStatus?: string | null;
  payoutError?: string | null;
  network: string;
  cctpEnabled?: boolean;
  requiresEmailOtp?: boolean;
}

interface PayoutQuote {
  chain: DestinationChain;
  amountUsdc: string;
  feeUsdc: string;
  netUsdc: string;
  includeRecipientSetup: boolean;
  minNetUsdc: string;
  sufficient?: boolean;
}

type Step = 'summary' | 'verify' | 'destination';

const RAILS: { id: DestinationChain; title: string; hint: string; placeholder: string }[] = [
  { id: 'stellar', title: 'Stellar USDC', hint: 'Held in Soroban escrow · arrives in seconds', placeholder: 'G…' },
  { id: 'base', title: 'Base', hint: 'Bridged from Stellar via CCTP · Base Sepolia on testnet', placeholder: '0x…' },
  { id: 'solana', title: 'Solana', hint: 'Bridged from Stellar via CCTP · paste your wallet, not a token account', placeholder: 'Solana wallet address' },
];

const DEAD: Record<string, { title: string; body: string }> = {
  CANCELLED: { title: 'Cheque cancelled', body: 'The sender cancelled this cheque.' },
  EXPIRED: { title: 'Cheque expired', body: 'This cheque was not claimed in time and is being returned to the sender.' },
  REFUNDING: { title: 'Cheque expired', body: 'This cheque was not claimed in time and is being returned to the sender.' },
  REFUNDED: { title: 'Cheque expired', body: 'This cheque was not claimed in time and has been returned to the sender.' },
  PENDING_FUNDING: { title: 'Not ready yet', body: 'The sender is still funding this cheque. Try again in a minute.' },
};

function chainLabel(chain?: DestinationChain | null): string {
  if (chain === 'base') return 'Base';
  if (chain === 'solana') return 'Solana';
  return 'Stellar';
}

export default function ClaimPage() {
  const { token } = useParams<{ token: string }>();
  const [cheque, setCheque] = useState<ClaimStatus | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState<Step>('summary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [chain, setChain] = useState<DestinationChain>('stellar');
  const [address, setAddress] = useState('');
  const [quote, setQuote] = useState<PayoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const idem = useRef('');
  const { address: walletAddress, connect, busy: walletBusy } = useWallet();

  const refresh = useCallback(async () => {
    try {
      const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(`claim-session-${token}`) : null;
      const t = sessionToken || stored || '';
      setCheque(
        await publicApi.get<ClaimStatus>(`/claim/${token}/status`, t ? { 'x-claim-session': t } : undefined),
      );
      setLoadError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setLoadError(e instanceof ApiError ? e.message : 'Could not load this cheque.');
    }
  }, [token, sessionToken]);

  const addressTouched = address.trim().length > 0;
  const addressValid = isDestinationAddress(chain, address);
  const dateLabel = (c: PublicCheque) => (c.createdAt ? fmtDate(c.createdAt) : undefined);

  useEffect(() => {
    idem.current = crypto.randomUUID();
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Poll while a payout is in flight.
  useEffect(() => {
    if (!cheque || !['AUTHORIZED', 'SETTLING'].includes(cheque.state)) return;
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [cheque, refresh]);

  // Fetch CCTP payout quote only when we're on the destination step and CCTP is enabled.
  useEffect(() => {
    if (!token || step !== 'destination' || chain === 'stellar' || !cheque?.cctpEnabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ chain });
        if (addressValid) q.set('address', address.trim());
        const res = await publicApi.get<PayoutQuote>(`/claim/${token}/payout-quote?${q.toString()}`);
        if (!cancelled) {
          setQuote(res);
          setQuoteError('');
        }
      } catch (e) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(e instanceof ApiError ? e.message : 'Could not estimate the bridging fee.');
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, chain, address, addressValid, step, cheque?.cctpEnabled]);

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

  const redeem = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await publicApi.post(`/claim/${token}/redeem`, {
        destination: { type: 'USDC', chain, accountRef: address.trim() },
        idempotencyKey: idem.current,
        sessionToken: sessionToken || undefined,
      });
      await refresh();
    });
  };

  // The address picks the network: when detection changes, follow it and reset quote state.
  const detectedChain = detectDestinationChain(address);
  useEffect(() => {
    if (!detectedChain || detectedChain === chain) return;
    setChain(detectedChain);
    setQuote(null);
    setError('');
    idem.current = crypto.randomUUID();
  }, [detectedChain, chain]);

  // Autofill Stellar address from connected wallet
  useEffect(() => {
    if (chain === 'stellar' && walletAddress && !address) {
      setAddress(walletAddress);
    }
  }, [chain, walletAddress, address]);

  if (missing) return <Shell><Dead icon={XCircle} title="Link not valid" body="This cheque link doesn't exist. Check that you copied the whole link." /></Shell>;
  if (!cheque) {
    return (
      <Shell>
        {loadError ? (
          <div className="card animate-rise space-y-4 p-8 text-center">
            <p className="font-semibold">We could not load this cheque.</p>
            <p className="text-sm text-ink-soft">{loadError}</p>
            <button className="btn-primary" onClick={() => { setLoadError(''); refresh(); }}>Try again</button>
          </div>
        ) : (
          <div className="space-y-5" aria-busy="true" aria-label="Loading cheque">
            <Skeleton className="h-[268px] w-full rounded-[10px]" />
            <div className="card space-y-4 p-7">
              <Skeleton className="h-8 w-2/3 rounded-[6px]" />
              <Skeleton className="h-4 w-1/2 rounded-[6px]" />
              <Skeleton className="h-12 w-full rounded-[10px]" />
            </div>
            <div className="flex justify-center"><DotsLoader /></div>
          </div>
        )}
      </Shell>
    );
  }

  const paper = (
    <ChequePaper currency={cheque.currency} amountValue={cheque.amount} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payeeFullName ?? cheque.payee} from={cheque.senderFirstName} signature={cheque.signature} date={dateLabel(cheque)} note={cheque.note} code={cheque.publicCode} />
  );

  const receiptHref =
    cheque.explorerUrl ??
    (cheque.txHash ? explorerTxUrl(cheque.destinationChain ?? 'stellar', cheque.txHash, cheque.network) : null);
  const receiptLabel =
    (cheque.destinationChain ?? 'stellar') === 'stellar'
      ? 'View receipt on Stellar'
      : `View receipt on ${chainLabel(cheque.destinationChain)}`;

  if (cheque.state === 'SETTLED') {
    return (
      <Shell>
        <ChequePaper currency={cheque.currency} amountValue={cheque.amount} amount={fmtMoney(cheque.amount, cheque.currency)} payee={cheque.payeeFullName ?? cheque.payee} from={cheque.senderFirstName} signature={cheque.signature} date={dateLabel(cheque)} note={cheque.note} code={cheque.publicCode} stamp="Paid" />
        <div className="card mt-5 animate-rise space-y-4 p-7 text-center" role="status">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-night" aria-hidden>
            <CheckCircle2 className="h-7 w-7" strokeWidth={2.4} />
          </span>
          <h1 className="display">{cheque.netUsdc ? `${cheque.netUsdc} USDC delivered` : `${fmtMoney(cheque.amount, cheque.currency)} delivered`}</h1>
          <p className="break-all text-sm text-ink-soft">
            Sent to {chainLabel(cheque.destinationChain)} <span className="font-mono text-xs">{cheque.destination}</span>
          </p>
          {cheque.feeUsdc && cheque.destinationChain && cheque.destinationChain !== 'stellar' && (
            <p className="text-xs text-ink-mute">Forwarding fee: {cheque.feeUsdc} USDC</p>
          )}
          {receiptHref && (
            <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline underline-offset-4"
              target="_blank" rel="noreferrer"
              href={receiptHref}>
              {receiptLabel} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </Shell>
    );
  }

  if (['AUTHORIZED', 'SETTLING'].includes(cheque.state)) {
    const dest = cheque.destinationChain ?? 'stellar';
    const failed = cheque.payoutStatus === 'FAILED';
    return (
      <Shell>
        {paper}
        <div className="card mt-5 space-y-4 p-6" aria-busy={!failed}>
          {failed ? (
            <FailureNote
              title="Payout needs a manual recovery"
              body={
                <>
                  {cheque.payoutError ?? 'The USDC is still held in the settlement account. No automatic refund was issued.'}
                  <br />
                  Keep this page open — support can complete the payout from here.
                </>
              }
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <DotsLoader className="shrink-0" />
                <div>
                  <p className="font-semibold">
                    {dest === 'stellar' ? 'Sending your money…' : `Bridging to ${chainLabel(dest)}…`}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {dest === 'stellar'
                      ? 'Redeeming the escrow. This usually takes under a minute. You can keep this page open.'
                      : 'The escrow is redeeming, then the bridge mints USDC on the destination chain. Usually under a minute.'}
                  </p>
                </div>
              </div>
              <ProcessingRail
                steps={dest === 'stellar' ? ['Escrow redeemed', 'Delivered'] : ['Escrow redeemed', 'Mint on ' + chainLabel(dest), 'Delivered']}
                active={dest !== 'stellar' && cheque.burnTxHash ? 1 : 0}
              />
              {dest !== 'stellar' && cheque.burnTxHash && (
                <p className="text-xs text-ink-mute">Burn submitted on the source chain. Waiting for the destination mint…</p>
              )}
            </>
          )}
        </div>
      </Shell>
    );
  }

  if (DEAD[cheque.state]) {
    return <Shell><Dead icon={cheque.state === 'PENDING_FUNDING' ? Clock : XCircle} {...DEAD[cheque.state]} /></Shell>;
  }

  const cctpAvailable = cheque.cctpEnabled ?? false;
  const requiresOtp = cheque.requiresEmailOtp ?? false;
  const rail = RAILS.find((r) => r.id === chain)!;
  const netTooLow = quote != null && chain !== 'stellar' && quote.sufficient === false;
  const bridgingBlocked = !!detectedChain && detectedChain !== 'stellar' && !cctpAvailable;

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
                This cheque is funded in USDC in a Stellar (Soroban) escrow. Claim it, then choose a Stellar, Base, or Solana wallet.
              </p>
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full py-4" disabled={busy} onClick={() => run(async () => {
              try {
                const res = await publicApi.post<{ skipped?: boolean }>(`/claim/${token}/otp/send`, {});
                if (res.skipped) {
                  setStep('destination');
                  return;
                }
                setOtpSent(true);
                setStep('verify');
              } catch (e) {
                // If email verification isn't configured, fall through to direct claim.
                if (e instanceof ApiError && e.status === 503) setStep('destination');
                else throw e;
              }
            })}>
              {busy && <Spinner />} Claim {fmtMoney(cheque.amount, cheque.currency)}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={(e) => {
            e.preventDefault();
            return run(async () => {
              const res = await publicApi.post<{ sessionToken: string }>(`/claim/${token}/otp/verify`, { otp: otp.trim() });
              setSessionToken(res.sessionToken);
              try { window.sessionStorage.setItem(`claim-session-${token}`, res.sessionToken); } catch {}
              await refresh();
              setStep('destination');
            });
          }} className="card space-y-5 p-6">
            <div>
              <h2 className="display">Verify your email</h2>
              <p className="mt-1 text-sm text-ink-soft">Enter the 6-digit code we sent to your email.</p>
            </div>
            <div>
              <label className="label" htmlFor="otp">Verification code</label>
              <input id="otp" className="field font-mono text-lg tracking-widest" placeholder="000000" inputMode="numeric" maxLength={6}
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </div>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full py-4" disabled={busy || otp.length !== 6}>
              {busy && <Spinner />} Verify
            </button>
            <button type="button" className="w-full text-sm text-ink-mute underline" disabled={busy} onClick={() => run(async () => {
              await publicApi.post(`/claim/${token}/otp/send`, {});
              setOtpSent(true);
            })}>Resend code</button>
          </form>
        )}

        {step === 'destination' && (
          <form onSubmit={redeem} className="card space-y-5 p-6">
            <div>
              <h2 className="display">Where should it go?</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Paste any wallet address — we recognise the network automatically.
              </p>
            </div>

            <div>
              <label className="label flex items-center justify-between" htmlFor="addr">
                <span>Wallet address</span>
                {detectedChain && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.14em] ${
                      bridgingBlocked ? 'bg-sun/60 text-night' : 'bg-brand-100 text-brand-900'
                    }`}
                  >
                    {rail.title} detected
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <input id="addr" className="field font-mono text-sm flex-1" placeholder="G… · 0x… · Solana address" spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off" aria-invalid={addressTouched && !addressValid} aria-describedby="addr-help"
                  value={address} onChange={(e) => setAddress(e.target.value.trim())} />
                {chain === 'stellar' && !walletAddress && !walletBusy && (
                  <button type="button" className="btn-ghost !px-3 !py-2" onClick={connect}>
                    <Wallet className="h-4 w-4" /> Connect
                  </button>
                )}
                {chain === 'stellar' && walletAddress && (
                  <span className="text-xs text-brand-700" title={walletAddress}>{shortAddress(walletAddress)}</span>
                )}
              </div>
              <p id="addr-help" className={`mt-1.5 text-xs ${addressTouched && !addressValid ? 'font-semibold text-cedi' : 'text-ink-mute'}`}>
                {!addressTouched
                  ? 'Stellar (G…), Base (0x…) or Solana — the network is detected from the address itself.'
                  : !detectedChain
                    ? 'Unrecognised address. Expected Stellar (G…, 56 characters), Base (0x…, 42 characters) or a Solana wallet address.'
                    : bridgingBlocked
                      ? `${rail.title} payouts need bridging configured on this server. Use a Stellar (G…) address for now.`
                      : rail.id === 'stellar'
                        ? 'Stellar wallet detected. It must already hold a USDC trustline.'
                        : rail.id === 'base'
                          ? 'Base wallet detected. You do not need gas on Base — the forwarding fee is taken from the bridged USDC.'
                          : 'Solana wallet detected. Paste your wallet address, not a token account or ATA.'}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-[10px] border border-ink/10 bg-ink/[.03] p-3.5 opacity-70">
              <Smartphone className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden />
              <p className="text-sm">
                <span className="font-semibold">{COUNTRIES[cheque.corridor ?? 'GH'].localRail}</span>
                <span className="text-ink-mute"> — cash-out coming soon. USDC wallets work today.</span>
              </p>
            </div>

            {quote && (
              <div className="rounded-[10px] border border-ink/10 bg-paper p-4 text-sm">
                {chain === 'stellar' ? (
                  <p>You will receive <span className="font-semibold">{quote.amountUsdc} USDC</span> on Stellar.</p>
                ) : (
                  <>
                    <p>Estimated amount received on {chainLabel(chain)}: <span className="font-semibold">{quote.netUsdc} USDC</span></p>
                    <p className="mt-1 text-xs text-ink-mute">
                      Bridging fee from Stellar: {quote.feeUsdc} USDC
                      {quote.includeRecipientSetup ? ' (includes Solana token-account setup)' : ''}
                    </p>
                  </>
                )}
              </div>
            )}
            {quoteError && chain !== 'stellar' && <p className="text-xs text-cedi">{quoteError}</p>}
            {netTooLow && (
              <p className="text-xs font-semibold text-cedi">
                After the forwarding fee this would deliver less than {quote.minNetUsdc} USDC. Claim to a Stellar USDC address instead.
              </p>
            )}

            <ErrorNote>{error}</ErrorNote>
            <button className="btn-primary w-full py-4" disabled={busy || !addressValid || netTooLow || bridgingBlocked}>
              {busy && <Spinner />} {bridgingBlocked ? 'Bridging unavailable' : `Get my ${chain === 'stellar' ? fmtMoney(cheque.amount, cheque.currency) : `${quote?.netUsdc ?? ''} USDC`}`}
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
          <span className="eyebrow !text-[11px] text-brand-500">Secured until claimed</span>
        </div>
        <CorridorMap className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full" />
      </div>
      <main className="mx-auto -mt-16 max-w-xl px-5 pb-16">
        {children}
        <p className="eyebrow mt-8 text-center !text-[10px] !tracking-[.14em] text-sage sm:!text-[11px] sm:!tracking-[.22em]">Secured by on-chain escrow</p>
      </main>
    </div>
  );
}

function Dead({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="card animate-rise space-y-3 p-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-night text-brand-500"><Icon className="h-7 w-7" /></span>
      <h1 className="display">{title}</h1>
      <p className="mx-auto max-w-sm text-sm text-ink-soft">{body}</p>
    </div>
  );
}
