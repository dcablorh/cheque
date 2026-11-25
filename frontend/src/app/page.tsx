import Link from 'next/link';
import {
  ArrowRight,
  Check,
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
import { Reveal } from '@/components/Reveal';

const CHANNELS = ['WhatsApp', 'Telegram', 'Instagram', 'Messenger', 'iMessage', 'SMS', 'Email'];

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

/** Corridors live today, in cheque order. */
const LIVE_COUNTRIES = [
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS', symbol: '₵', local: 'Mobile Money', note: 'MTN, Telecel and AT' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', symbol: '₦', local: 'Bank transfer', note: 'Any Nigerian bank account' },
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD', symbol: '$', local: 'Bank transfer (ACH)', note: 'Routing and account number' },
];

/** Corridors on the roadmap — the ticker and the waitlist row are built for this list to grow. */
const COMING_COUNTRIES = [
  { name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { name: 'Philippines', flag: '🇵🇭', currency: 'PHP' },
  { name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
  { name: 'India', flag: '🇮🇳', currency: 'INR' },
  { name: 'Brazil', flag: '🇧🇷', currency: 'BRL' },
  { name: 'Eurozone', flag: '🇪🇺', currency: 'EUR' },
  { name: 'Canada', flag: '🇨🇦', currency: 'CAD' },
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

function SectionHead({ eyebrow, title, light, n }: { eyebrow: string; title: React.ReactNode; light?: boolean; n?: string }) {
  return (
    <Reveal>
      <div className="flex items-baseline gap-4">
        {n && <span className={`eyebrow ${light ? 'text-brand-500' : 'text-brand-700'}`}>{n}</span>}
        <p className={`eyebrow border-b pb-4 ${light ? 'border-sage text-brand-500' : 'border-sage/50 text-brand-700'}`}>
          {eyebrow}
        </p>
      </div>
      <h2 className="display mt-8 text-[clamp(44px,8vw,110px)]">{title}</h2>
    </Reveal>
  );
}

export default function Home() {
  return (
    <>
      <nav className="sticky top-0 z-40 bg-night text-paper">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
          <Logo tone="light" />
          <div className="flex items-center gap-3">
            <Link href="/app" className="btn-primary !px-4 !py-2.5 focus-visible:ring-offset-night sm:!px-5">
              Write a cheque
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="relative overflow-hidden bg-night text-paper">
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-[34vw] pt-16 text-center sm:pt-24 md:pb-72">
          <h1 className="display mt-6 text-[clamp(56px,12vw,170px)] !leading-[.9] tracking-[-.02em]">
            <span className="block animate-rise [animation-delay:60ms]">If you can send a message,</span>
            <span className="block animate-rise text-brand-500 [animation-delay:160ms]">you can send money.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-lg animate-rise text-base text-paper/80 [animation-delay:260ms]">
            Cross-border digital cheques. Send the link on WhatsApp, Telegram or Instagram. Your recipient needs no
            account and no app. They open it and decide where the money goes. Unclaimed cheques come straight back.
          </p>
          <div className="mx-auto mt-8 flex w-full max-w-xs animate-rise flex-col gap-3 [animation-delay:340ms] sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <Link href="/app" className="btn-primary w-full px-9 py-4 focus-visible:ring-offset-night sm:w-auto">
              Write a cheque <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="btn-ghost-light w-full px-9 py-4 focus-visible:ring-offset-night sm:w-auto"
            >
              How it works
            </a>
          </div>
        </div>
        <CorridorMap className="pointer-events-none absolute inset-x-0 bottom-0 h-[34vw] min-h-[200px] w-full md:h-[300px]" />
        <Patch kind="chat" label="Send in any chat" rotate={-8} size={132} className="absolute left-[6%] top-24 z-10 hidden lg:block" />
        <Patch kind="coin" label="Their money" rotate={7} size={116} className="absolute right-[7%] top-40 z-10 hidden lg:block" />
      </header>

      {/* works with any messaging app */}
      <section aria-label="Works with" className="border-b border-sage/40 bg-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-5 gap-y-3 px-5 py-6 sm:gap-x-8">
          <span className="eyebrow w-full text-center text-sage sm:w-auto">Send it on</span>
          {CHANNELS.map((c) => (
            <span key={c} className="display text-[18px] text-night/70 !leading-none sm:text-[22px]">
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* cheque showcase */}
      <section className="relative mx-auto max-w-[1200px] px-5 pb-28 pt-24">
        <Reveal className="relative mx-auto max-w-[760px]">
          <div className="-rotate-2">
            <ChequePaper currency="GHS" amountValue={500} date="12 Nov 2026" amount="₵500.00" payee="Kojo Mensah" from="Ama" note="For rent, thank you" code="CHQ-82F9K2" stamp="Paid" />
          </div>
          <div className="absolute -bottom-9 left-4 z-10 rotate-[-4deg] bg-brand-500 px-4 py-2 text-xs font-medium uppercase tracking-[.18em] text-night">
            Held in escrow until claimed
          </div>
        </Reveal>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-28">
        <SectionHead n="01" eyebrow="How it works" title={<>Four steps.<br />No sign-up for them.</>} />
        <ol className="mt-14 divide-y divide-sage/50 border-y border-sage/50">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="grid gap-3 py-8 md:grid-cols-[120px_1fr_1fr] md:items-start md:gap-4 md:py-10">
              <p className="eyebrow text-brand-700">{s.n}</p>
              <h3 className="display text-[clamp(36px,5vw,64px)]">{s.title}</h3>
              <p className="max-w-md text-base text-ink-soft md:pt-2">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* countries — built to scale from three corridors to dozens */}
      <section id="countries" className="scroll-mt-20 overflow-hidden bg-night text-paper">
        <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-24">
          <SectionHead light n="02" eyebrow="Countries" title={<>Pay them in<br /><span className="text-brand-500">their money.</span></>} />
          <Reveal delay={120}>
            <p className="mt-8 max-w-lg text-paper/80">
              Write the cheque for the country your recipient lives in. They see the amount in their own currency, and
              can cash out to USDC on Stellar today.
            </p>
          </Reveal>
        </div>

        {/* ticker: one pill per corridor, live first, roadmap behind it. Scales to any count. */}
        <Reveal delay={200}>
          <div
            aria-hidden
            className="overflow-hidden py-2 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
          >
            <div className="marquee-track">
              {[...LIVE_COUNTRIES, ...COMING_COUNTRIES, ...LIVE_COUNTRIES, ...COMING_COUNTRIES].map((c, i) => {
                const live = 'code' in c;
                return (
                  <span
                    key={`${c.name}-${i}`}
                    className={`mr-3 inline-flex shrink-0 items-center gap-3 rounded-full border py-2.5 pl-4 pr-5 ${
                      live ? 'border-brand-500/70 bg-night-800' : 'border-sage/40 bg-transparent opacity-70'
                    }`}
                  >
                    <span className="text-lg" aria-hidden>{c.flag}</span>
                    <span className="display text-[17px] !leading-none">{c.name}</span>
                    <span className={`text-[11px] font-medium uppercase tracking-[.18em] ${live ? 'text-brand-500' : 'text-moss'}`}>
                      {c.currency}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </Reveal>

        {/* live corridors: one row each, so new countries are one array entry away */}
        <div className="mx-auto max-w-[1200px] px-5 pb-24 pt-10">
          <Reveal>
            <ul className="divide-y divide-sage/50 border-y border-sage/50">
              {LIVE_COUNTRIES.map((c) => (
                <li key={c.code} className="grid gap-x-6 gap-y-3 py-7 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                  <span className="display grid h-16 w-16 place-items-center rounded-full bg-night-800 text-[30px] !leading-none" aria-hidden>
                    {c.symbol}
                  </span>
                  <div className="min-w-0">
                    <h3 className="display text-[clamp(28px,4vw,44px)]">{c.name}</h3>
                    <p className="mt-1 text-sm text-paper/70">
                      <span className="font-medium text-paper">{c.currency}</span> · cash out to {c.local.toLowerCase()}
                      <span className="text-paper/50"> — {c.note}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-night">
                      <Wallet className="h-3.5 w-3.5" /> USDC wallet · Live
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-paper/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-paper/80">
                      {c.local} · Soon
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-8 flex items-center gap-3 text-sm text-paper/70">
              <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" aria-hidden />
              New corridors land every month — {COMING_COUNTRIES[0].name}, {COMING_COUNTRIES[1].name} and
              {' '}{COMING_COUNTRIES[2].name} are next in line.
            </p>
          </Reveal>
        </div>
      </section>

      {/* why */}
      <section id="why" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-28">
        <SectionHead n="03" eyebrow="Why cheques" title={<>The simplest way<br />to send it home.</>} />
        <div className="mt-14 grid gap-px overflow-hidden rounded-[20px] border border-sage/50 bg-sage/50 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90} className="bg-paper p-7">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-night text-brand-500">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="display mt-6 text-[30px] !leading-[.95]">{f.title}</h3>
              <p className="mt-3 text-sm text-ink-soft">{f.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* escrow */}
      <section id="escrow" className="scroll-mt-20 bg-night text-paper">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow border-b border-sage pb-4 text-brand-500">04 · Escrow</p>
              <h2 className="display mt-8 text-[clamp(44px,8vw,101px)]">
                Not claimed?
                <br />
                <span className="text-brand-500">It comes back.</span>
              </h2>
              <p className="mt-6 max-w-md text-paper/80">
                Every cheque has an expiry. Until it is claimed, the money sits in an on-chain escrow. If nobody claims
                it, the escrow returns it to you automatically.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-paper/90">
                {[
                  'Funds are locked the moment you issue the cheque',
                  'Cancel any time before the recipient starts claiming',
                  'Expired cheques are refunded without you asking',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <Patch kind="chat" label="Send in any chat app" rotate={-8} size={150} />
              <Patch kind="globe" label="Across borders" rotate={8} size={150} />
            </div>
          </div>
          <div className="mt-20 grid divide-y divide-sage/60 border-y border-sage/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { k: '~5s', v: 'to settle on Stellar' },
              { k: '100%', v: 'returned if unclaimed' },
              { k: '0', v: 'apps for the recipient' },
            ].map((s) => (
              <div key={s.v} className="px-6 py-10">
                <p className="display text-[clamp(64px,10vw,96px)] text-paper">{s.k}</p>
                <p className="eyebrow mt-3 text-moss">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <SectionHead n="05" eyebrow="Pricing" title={<>One flat fee.<br />No surprises.</>} />
          <div className="card p-8">
            <p className="display text-[clamp(72px,12vw,120px)] !leading-none">1%</p>
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
      <section id="faq" className="mx-auto max-w-[900px] scroll-mt-20 px-5 pb-28">
        <SectionHead n="06" eyebrow="FAQ" title="Questions." />
        <div className="mt-12 divide-y divide-sage/50 border-y border-sage/50">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-night [&::-webkit-details-marker]:hidden">
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
          <h2 className="display text-[clamp(52px,11vw,137px)]">
            Write your
            <br />
            first cheque.
          </h2>
          <p className="mx-auto mt-6 max-w-sm">It takes under a minute. If you can send a message, you can send a cheque.</p>
          <Link
            href="/app"
            className="btn mt-8 bg-night px-10 py-4 text-paper hover:bg-night-800 focus-visible:ring-offset-brand-500"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-night text-paper">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm text-paper/70">
              Cross-border digital cheques, settled on Stellar. Send a link, get paid.
            </p>
          </div>
          <div>
            <p className="eyebrow text-moss">Get started</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/app" className="text-paper/80 transition hover:text-brand-500">Write a cheque</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sage/40">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-5">
            <span className="eyebrow !text-[11px] text-moss">Cross-border digital cheques</span>
            <span className="eyebrow !text-[11px] text-moss">sencheq</span>
          </div>
        </div>
      </footer>
    </>
  );
}
