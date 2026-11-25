'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RotateCcw, Zap } from 'lucide-react';

const CURRENCIES = [
  { code: 'GHS', symbol: '₵', country: 'Ghana', min: 1.5 },
  { code: 'NGN', symbol: '₦', country: 'Nigeria', min: 1.5 },
  { code: 'USD', symbol: '$', country: 'United States', min: 1.5 },
];

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The landing-page cheque calculator, laid out like the classic money-transfer widget:
 * "You write" on one side, "They get" on the other, with the flat fee spelled out.
 */
export function ChequeCalculator() {
  const [amount, setAmount] = useState('500');
  const [cur, setCur] = useState(0);
  const c = CURRENCIES[cur];

  const value = Math.max(0, Math.round((parseFloat(amount) || 0) * 100) / 100);
  const fee = Math.round(value * 1) / 100; // flat 1%
  const theyGet = Math.max(0, Math.round((value - fee) * 100) / 100);
  const belowMin = value > 0 && value < c.min;

  return (
    <div className="card mx-auto w-full max-w-[560px] overflow-hidden p-0 text-left">
      {/* You write */}
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="calc-amount" className="text-sm font-medium text-ink-soft">
            You write the cheque for
          </label>
          <span className="rounded-full bg-brand-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-night">
            1% flat fee
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-sage/60 bg-paper px-4 py-3 focus-within:border-night focus-within:ring-2 focus-within:ring-brand-500">
          <input
            id="calc-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="min-w-0 flex-1 bg-transparent text-[28px] font-bold tabular-nums text-ink outline-none placeholder:text-moss sm:text-[32px]"
            placeholder="0.00"
            aria-describedby="calc-hint"
          />
          <label className="shrink-0">
            <span className="sr-only">Currency</span>
            <select
              value={cur}
              onChange={(e) => setCur(Number(e.target.value))}
              className="cursor-pointer appearance-none rounded-full bg-night px-4 py-2.5 text-sm font-semibold text-paper outline-none"
            >
              {CURRENCIES.map((x, i) => (
                <option key={x.code} value={i}>
                  {x.symbol} {x.code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p id="calc-hint" className={`mt-2 text-xs ${belowMin ? 'font-medium text-cedi' : 'text-ink-mute'}`}>
          {belowMin
            ? `Minimum cheque is ${c.symbol}${fmt(c.min)}.`
            : `Paid to someone in ${c.country}.`}
        </p>
      </div>

      {/* They get */}
      <div className="border-y border-sage/50 bg-paper p-5 sm:p-6">
        <p className="text-sm font-medium text-ink-soft">They get, when they claim it</p>
        <p className="mt-2 text-[32px] font-black leading-none tracking-[-.02em] text-ink sm:text-[40px]">
          {c.symbol}
          <span className="tabular-nums">{fmt(theyGet)}</span>
          <span className="ml-2 align-middle text-sm font-semibold text-ink-mute">{c.code}</span>
        </p>
      </div>

      {/* Summary rows */}
      <dl className="space-y-2.5 p-5 text-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-ink-soft">
            <Zap className="h-4 w-4 text-brand-700" /> Arrives
          </dt>
          <dd className="font-medium text-ink">In seconds, once claimed</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-ink-soft">
            <RotateCcw className="h-4 w-4 text-brand-700" /> If unclaimed
          </dt>
          <dd className="font-medium text-ink">Returned to you, automatically</dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-sage/50 pt-3">
          <dt className="text-ink-soft">Total fees</dt>
          <dd className="font-medium text-ink">
            {c.symbol}
            {fmt(fee)} <span className="text-ink-mute">· included</span>
          </dd>
        </div>
      </dl>

      <div className="p-5 pt-0 sm:p-6 sm:pt-0">
        <Link href="/app" className="btn-primary w-full py-4 text-base">
          Write a cheque <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-3 text-center text-xs text-ink-mute">
          The recipient needs no account and no app — just the link.
        </p>
      </div>
    </div>
  );
}
