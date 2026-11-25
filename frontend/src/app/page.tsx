import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Landmark,
  Lock,
  MessageCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Wallet,
  Zap,
} from 'lucide-react';
import { ChequePaper, CorridorMap, Logo, Patch } from '@/components/ui';
import { ChequeCalculator } from '@/components/ChequeCalculator';

const CHANNELS = ['WhatsApp', 'Telegram', 'Instagram', 'Messenger', 'iMessage', 'SMS', 'Email'];

const NAV_LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#countries', label: 'Countries' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

const STEPS = [
  {
    n: '01',
    title: 'Write the cheque',
    body: 'The recipient’s name and an amount. Pick the country they live in and we show the exact amount in their currency.',
  },
  {
    n: '02',
    title: 'Send the link',
    body: 'Paste it into any chat. If you can message them, you can pay them. Nothing for them to install.',
  },
  {
    n: '03',
    title: 'They open it',
    body: 'Whoever holds the link can claim the cheque. They see the amount and choose where the money goes.',
  },
  {
    n: '04',
    title: 'They cash it',
    body: 'Funds settle on Stellar in seconds, straight to the USDC wallet they choose. Local cash-out is rolling out country by country.',
  },
];

const COUNTRIES = [
  {
    code: 'GH',
    name: 'Ghana',
    currency: 'GHS',
    symbol: '₵',
    range: '₵1.5 – ₵1,000,000',
    local: 'Mobile Money',
    note: 'MTN, Telecel and AT',
  },
  {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    symbol: '₦',
    range: '₦1.5 – ₦1,000,000',
    local: 'Bank transfer',
    note: 'Any Nigerian bank account',
  },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    symbol: '$',
    range: '$1.5 – $1,000,000',
    local: 'Bank transfer (ACH)',
    note: 'Routing and account number',
  },
];

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Works in any chat',
    body: 'A cheque is a link. Send it on WhatsApp, Telegram, Instagram, iMessage, SMS or email.',
  },
  {
    icon: Smartphone,
    title: 'No app, no account',
    body: 'Your recipient needs the link and a minute. There is nothing to sign up for.',
  },
  {
    icon: ShieldCheck,
    title: 'The link is the key',
    body: 'Each link is a long random secret that cannot be guessed. Send it only to the person it is for.',
  },
  {
    icon: Lock,
    title: 'Held in escrow',
    body: 'The money sits in an on-chain escrow from the moment you issue the cheque until it is claimed.',
  },
  {
    icon: RotateCcw,
    title: 'Unclaimed comes back',
    body: 'Every cheque has an expiry. If nobody claims it in time, the escrow returns it automatically.',
  },
  {
    icon: Zap,
    title: 'Settled in seconds',
    body: 'Payments settle on Stellar, so there are no multi-day waits and no correspondent banks.',
  },
];

const SAFE = [
  {
    icon: Lock,
    title: 'Held in escrow',
    body: 'Your money is locked in an on-chain escrow the moment you issue the cheque.',
  },
  {
    icon: ShieldCheck,
    title: 'The link is the key',
    body: 'Every cheque is a long random secret that cannot be guessed. Only whoever holds it can claim.',
  },
  {
    icon: RotateCcw,
    title: 'Nothing is lost',
    body: 'Cancel any time before claiming starts, and expired cheques are refunded without you asking.',
  },
];

const FAQ = [
  {
    q: 'Does my recipient need an account or an app?',
    a: 'No. They open the link and choose where the money goes. That is all.',
  },
  {
    q: 'Which countries can I send to?',
    a: 'Ghana, Nigeria and the United States today. Each cheque is written in the recipient’s currency: cedis, naira or dollars.',
  },
  {
    q: 'How does the recipient receive the money?',
    a: 'Today they can receive USDC to any Stellar wallet. Cash-out to Mobile Money in Ghana and to bank accounts in Nigeria and the US is being connected next. The claim page tells them what is available for their cheque.',
  },
  {
    q: 'What if I send the cheque to the wrong person?',
    a: 'You can cancel and get your money back any time before the recipient starts claiming it. After that, it is on its way to whoever claimed it.',
  },
  {
    q: 'What if it is never claimed?',
    a: 'Every cheque has an expiry (24 hours, 48 hours or 7 days, you choose). If it is still unclaimed when it expires, the escrow returns the money automatically.',
  },
  {
    q: 'How much does it cost?',
    a: 'A flat 1% of the cheque amount, shown before you issue it. The recipient pays nothing to claim.',
  },
  {
    q: 'Is the link safe to share in a group chat?',
    a: 'Only share it with the person it is for. Anyone who holds the link can claim the cheque, so keep it out of public groups.',
  },
];

function SectionHead({ eyebrow, title, light }: { eyebrow: string; title: React.ReactNode; light?: boolean }) {
  return (
    <div>
      <p className={`flex items-center gap-2 text-sm font-semibold ${light ? 'text-brand-500' : 'text-brand-700'}`}>
        <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${light ? 'bg-brand-500' : 'bg-brand-600'}`} />
        {eyebrow}
      </p>
      <h2 className="display mt-4 max-w-3xl text-[clamp(34px,5.5vw,64px)]">{title}</h2>
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* nav — light and sticky, pill CTAs */}
      <nav className="sticky top-0 z-40 border-b border-sage/40 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
          <Logo tone="dark" />
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink transition hover:bg-night/5"
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app" className="btn-primary !px-5 focus-visible:ring-offset-paper">
              Write a cheque
            </Link>
          </div>
        </div>
      </nav>

      {/* hero — big sentence-case headline over the cheque calculator */}
      <header className="relative overflow-hidden bg-paper">
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-20 pt-14 text-center sm:pt-20">
          <h1 className="display mx-auto max-w-5xl text-[clamp(44px,8vw,118px)]">
            <span className="block animate-rise [animation-delay:60ms]">If you can send a message,</span>
            <span className="block animate-rise text-brand-700 [animation-delay:160ms]">you can send money.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-rise text-lg text-ink-soft [animation-delay:260ms]">
            Cross-border digital cheques. Send the link on WhatsApp, Telegram or Instagram. Your recipient needs no
            account and no app. Unclaimed cheques come straight back.
          </p>
          <div className="mx-auto mt-10 max-w-[560px] animate-rise [animation-delay:340ms]">
            <ChequeCalculator />
          </div>
          <a
            href="#how"
            className="mt-8 inline-flex animate-rise items-center gap-1.5 text-sm font-semibold text-ink [animation-delay:420ms] hover:text-brand-700"
          >
            See how it works <ChevronDown className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* works with any messaging app */}
      <section aria-label="Works with" className="border-y border-sage/40 bg-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-5 py-6 sm:gap-x-8">
          <span className="text-sm font-semibold text-ink-mute">Send it on</span>
          {CHANNELS.map((c) => (
            <span key={c} className="text-lg font-bold text-night/70 sm:text-xl">
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* cheque showcase */}
      <section className="mx-auto max-w-[1200px] px-5 pb-24 pt-20">
        <div className="relative mx-auto max-w-[760px]">
          <div className="-rotate-2">
            <ChequePaper currency="GHS" amountValue={500} date="12 Nov 2026" amount="₵500.00" payee="Kojo Mensah" from="Ama" note="For rent, thank you" code="CHQ-82F9K2" stamp="Paid" />
          </div>
          <div className="absolute -bottom-9 left-4 z-10 rotate-[-4deg] rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold uppercase tracking-[.14em] text-night">
            Held in escrow until claimed
          </div>
        </div>
      </section>

      {/* trust band — big numbers over the corridor map */}
      <section className="relative overflow-hidden bg-night text-paper">
        <CorridorMap className="pointer-events-none absolute inset-x-0 bottom-0 h-[300px] w-full opacity-90" />
        <div className="relative mx-auto max-w-[1200px] px-5 pb-40 pt-24">
          <h2 className="display mx-auto max-w-3xl text-center text-[clamp(34px,5.5vw,64px)]">
            Built to move money<br className="hidden sm:block" /> across borders, safely.
          </h2>
          <div className="mt-16 grid gap-10 text-center sm:grid-cols-3">
            {[
              { k: '~5s', v: 'to settle on Stellar' },
              { k: '100%', v: 'returned if unclaimed' },
              { k: '0', v: 'apps for the recipient' },
            ].map((s) => (
              <div key={s.v}>
                <p className="display text-[clamp(56px,8vw,88px)] text-brand-500">{s.k}</p>
                <p className="mt-2 text-sm font-medium text-paper/80">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-24">
        <SectionHead eyebrow="How it works" title={<>Four steps. No sign-up for them.</>} />
        <ol className="mt-12 grid gap-5 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-[24px] border border-sage/60 bg-[#faf7f1] p-7">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-sm font-bold text-night">
                {s.n}
              </span>
              <h3 className="display mt-5 text-[28px]">{s.title}</h3>
              <p className="mt-2 max-w-md text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* countries */}
      <section id="countries" className="scroll-mt-20 bg-paper">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <SectionHead
            eyebrow="Countries"
            title={<>Pay them in their money.</>}
          />
          <p className="mt-5 max-w-lg text-ink-soft">
            Write the cheque for the country your recipient lives in. They see the amount in their own currency, and
            can cash out to USDC on Stellar today.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {COUNTRIES.map((c) => (
              <article key={c.code} className="flex flex-col rounded-[24px] border border-sage/60 bg-[#faf7f1] p-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-mute">{c.currency}</p>
                    <h3 className="display mt-2 text-[34px] whitespace-nowrap">{c.name}</h3>
                  </div>
                  <span className="display grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-[30px] text-night">
                    {c.symbol}
                  </span>
                </div>
                <p className="mt-6 text-sm text-ink-mute">Per cheque</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{c.range}</p>
                <ul className="mt-6 space-y-3 border-t border-sage/50 pt-5 text-sm">
                  <li className="flex items-start gap-3">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                    <span>
                      USDC wallet on Stellar
                      <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-night">Live</span>
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-ink-soft">
                    {c.code === 'GH' ? (
                      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" />
                    ) : (
                      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" />
                    )}
                    <span>
                      {c.local} <span className="text-ink-mute">· {c.note}</span>
                      <span className="ml-2 rounded-full border border-sage px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">Soon</span>
                    </span>
                  </li>
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* why */}
      <section id="why" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-24">
        <SectionHead eyebrow="Why cheques" title={<>The simplest way to send it home.</>} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[24px] border border-sage/60 bg-[#faf7f1] p-7">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-night text-brand-500">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="display mt-5 text-[26px]">{f.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* safe at every step */}
      <section id="escrow" className="scroll-mt-20 px-5 py-6">
        <div className="mx-auto max-w-[1200px] rounded-[32px] bg-brand-100 p-8 sm:p-14">
          <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand-600" />
                Safe at every step
              </p>
              <h2 className="display mt-4 text-[clamp(34px,5.5vw,64px)]">
                Not claimed?
                <br />
                It comes back.
              </h2>
              <p className="mt-5 max-w-md text-ink-soft">
                Every cheque has an expiry. Until it is claimed, the money sits in an on-chain escrow. If nobody claims
                it, the escrow returns it to you automatically.
              </p>
              <Link href="/app" className="btn-primary mt-8">
                Write a cheque <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <Patch kind="chat" label="Send in any chat app" rotate={-8} size={150} />
              <Patch kind="globe" label="Across borders" rotate={8} size={150} />
            </div>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {SAFE.map((s) => (
              <div key={s.title} className="rounded-[24px] bg-paper p-6">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-night text-brand-500">
                  <s.icon className="h-5 w-5" />
                </span>
                <h3 className="display mt-4 text-[22px]">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-24">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <SectionHead eyebrow="Pricing" title={<>One flat fee. No surprises.</>} />
          <div className="card p-8">
            <p className="display text-[clamp(64px,10vw,110px)]">1%</p>
            <p className="mt-2 text-sm text-ink-soft">of the cheque amount, shown before you issue it.</p>
            <ul className="mt-6 space-y-3 border-t border-sage/50 pt-6 text-sm">
              {[
                'Recipients pay nothing to claim',
                'No monthly fee, no minimum spend',
                'You see the exact total before you confirm',
                'Cancel or let it expire for a refund',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/app" className="btn-primary mt-8 w-full py-4">
              Write a cheque <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="mx-auto max-w-[900px] scroll-mt-20 px-5 pb-24">
        <SectionHead eyebrow="FAQ" title="Questions." />
        <div className="mt-10 divide-y divide-sage/50 border-y border-sage/50">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-night [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="h-5 w-5 shrink-0 transition group-open:rotate-45" />
              </summary>
              <p className="mt-3 max-w-2xl text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section id="start" className="bg-brand-500 text-night">
        <div className="mx-auto max-w-[1200px] px-5 py-24 text-center">
          <h2 className="display mx-auto max-w-4xl text-[clamp(44px,8vw,110px)]">
            Write your first cheque.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-lg">It takes under a minute. If you can send a message, you can send a cheque.</p>
          <Link
            href="/app"
            className="btn mt-8 bg-night px-10 py-4 text-paper hover:bg-night-800 focus-visible:ring-offset-brand-500"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-night text-paper">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm text-paper/70">
              Cross-border digital cheques, settled on Stellar. Send a link, get paid.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-paper">Get started</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/app" className="text-paper/80 transition hover:text-brand-500">Write a cheque</Link></li>
              <li><Link href="/#how" className="text-paper/80 transition hover:text-brand-500">How it works</Link></li>
              <li><Link href="/#pricing" className="text-paper/80 transition hover:text-brand-500">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-paper">Learn more</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/#countries" className="text-paper/80 transition hover:text-brand-500">Countries</Link></li>
              <li><Link href="/#escrow" className="text-paper/80 transition hover:text-brand-500">Safety &amp; escrow</Link></li>
              <li><Link href="/#faq" className="text-paper/80 transition hover:text-brand-500">FAQ</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sage/40">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-5">
            <span className="text-xs font-medium uppercase tracking-[.18em] text-paper/50">Settled on Stellar</span>
            <span className="text-xs font-medium uppercase tracking-[.18em] text-paper/50">sencheq</span>
          </div>
        </div>
      </footer>
    </>
  );
}
