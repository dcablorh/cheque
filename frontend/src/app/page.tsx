import Link from 'next/link';
import {
  ArrowRight,
  Check,
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

const COUNTRIES = [
  {
    code: 'GH',
    name: 'Ghana',
    currency: 'GHS',
    symbol: '₵',
    range: '₵5 – ₵2,000',
    local: 'Mobile Money',
    note: 'MTN, Telecel and AT',
  },
  {
    code: 'NG',
    name: 'Nigeria',
    currency: 'NGN',
    symbol: '₦',
    range: '₦2,000 – ₦1,000,000',
    local: 'Bank transfer',
    note: 'Any Nigerian bank account',
  },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    symbol: '$',
    range: '$5 – $2,000',
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
      <p className={`eyebrow border-b pb-4 ${light ? 'border-sage text-brand-500' : 'border-sage/50 text-brand-700'}`}>
        {eyebrow}
      </p>
      <h2 className="display mt-8 text-[clamp(44px,8vw,110px)]">{title}</h2>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <nav className="sticky top-0 z-40 bg-night text-paper">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
          <Logo tone="light" />
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="btn hidden !px-5 !py-2.5 border border-paper text-paper hover:bg-paper/10 focus-visible:ring-offset-night sm:inline-flex"
            >
              Log in
            </Link>
            <Link href="/app" className="btn-primary !px-4 !py-2.5 focus-visible:ring-offset-night sm:!px-5">
              Write a cheque
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="relative overflow-hidden bg-night text-paper">
        <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-[34vw] pt-16 text-center sm:pt-24 md:pb-72">
          <p className="eyebrow animate-rise text-brand-500">Ghana · Nigeria · United States</p>
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
              className="btn w-full border border-paper/60 px-9 py-4 text-paper hover:bg-paper/10 focus-visible:ring-offset-night sm:w-auto"
            >
              How it works
            </a>
          </div>
        </div>
        <CorridorMap className="pointer-events-none absolute inset-x-0 bottom-0 h-[34vw] min-h-[200px] w-full md:h-[300px]" />
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
        <div className="relative mx-auto max-w-[760px]">
          <div className="-rotate-2">
            <ChequePaper currency="GHS" amountValue={500} date="12 Nov 2026" amount="₵500.00" payee="Kojo Mensah" from="Ama" note="For rent, thank you" code="CHQ-82F9K2" stamp="Paid" />
          </div>
          <div className="absolute -bottom-9 left-4 z-10 rotate-[-4deg] bg-brand-500 px-4 py-2 text-xs font-medium uppercase tracking-[.18em] text-night">
            Held in escrow until claimed
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-28">
        <SectionHead eyebrow="How it works" title={<>Four steps.<br />No sign-up for them.</>} />
        <ol className="mt-14 divide-y divide-sage/50 border-y border-sage/50">
          {STEPS.map((s) => (
            <li key={s.n} className="grid gap-3 py-8 md:grid-cols-[120px_1fr_1fr] md:items-start md:gap-4 md:py-10">
              <p className="eyebrow text-brand-700">{s.n}</p>
              <h3 className="display text-[clamp(36px,5vw,64px)]">{s.title}</h3>
              <p className="max-w-md text-base text-ink-soft md:pt-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* countries */}
      <section id="countries" className="scroll-mt-20 bg-night text-paper">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <SectionHead light eyebrow="Countries" title={<>Pay them in<br /><span className="text-brand-500">their money.</span></>} />
          <p className="mt-8 max-w-lg text-paper/80">
            Write the cheque for the country your recipient lives in. They see the amount in their own currency, and
            can cash out to USDC on Stellar today.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {COUNTRIES.map((c) => (
              <article key={c.code} className="flex flex-col rounded-[20px] border border-sage/60 bg-night-800 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="eyebrow text-moss">{c.currency}</p>
                    <h3 className="display mt-3 text-[34px] whitespace-nowrap">{c.name}</h3>
                  </div>
                  <span className="display grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-[30px] text-night">
                    {c.symbol}
                  </span>
                </div>
                <p className="mt-5 text-sm text-paper/70">Per cheque</p>
                <p className="display text-[26px] !leading-none">{c.range}</p>
                <ul className="mt-6 space-y-3 border-t border-sage/50 pt-5 text-sm">
                  <li className="flex items-start gap-3">
                    <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span>
                      USDC wallet on Stellar
                      <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-night">Live</span>
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-paper/80">
                    {c.code === 'GH' ? (
                      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-river" />
                    ) : (
                      <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-river" />
                    )}
                    <span>
                      {c.local} <span className="text-paper/50">· {c.note}</span>
                      <span className="ml-2 rounded-full border border-paper/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-paper/80">Soon</span>
                    </span>
                  </li>
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* why */}
      <section id="why" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-28">
        <SectionHead eyebrow="Why cheques" title={<>The simplest way<br />to send it home.</>} />
        <div className="mt-14 grid gap-px overflow-hidden rounded-[20px] border border-sage/50 bg-sage/50 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-paper p-7">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-night text-brand-500">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="display mt-6 text-[30px] !leading-[.95]">{f.title}</h3>
              <p className="mt-3 text-sm text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* escrow */}
      <section id="escrow" className="scroll-mt-20 bg-night text-paper">
        <div className="mx-auto max-w-[1200px] px-5 py-24">
          <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow border-b border-sage pb-4 text-brand-500">Escrow</p>
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
          <SectionHead eyebrow="Pricing" title={<>One flat fee.<br />No surprises.</>} />
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
        <SectionHead eyebrow="FAQ" title="Questions." />
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
              Cross-border digital cheques between Ghana, Nigeria and the United States, settled on Stellar.
            </p>
          </div>
          <div>
            <p className="eyebrow text-moss">Get started</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link href="/app" className="text-paper/80 transition hover:text-brand-500">Write a cheque</Link></li>
              <li><Link href="/app" className="text-paper/80 transition hover:text-brand-500">Log in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sage/40">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-5">
            <span className="eyebrow !text-[11px] text-moss">Settled on Stellar</span>
            <span className="eyebrow !text-[11px] text-moss">Ghana · Nigeria · United States</span>
          </div>
        </div>
      </footer>
    </>
  );
}
