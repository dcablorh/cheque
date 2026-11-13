'use client';

import { LogOut, Wallet } from 'lucide-react';
import { shortAddress, useWallet } from '@/lib/wallet';
import { Spinner } from '@/components/ui';

/** Connect / connected pill. Shows the short address with a disconnect control once linked. */
export function WalletButton({ className = '' }: { className?: string }) {
  const { address, busy, connect, disconnect } = useWallet();

  if (address) {
    return (
      <span className={`inline-flex items-center gap-2 rounded-[10px] border border-night/70 py-1.5 pl-3 pr-1.5 text-xs font-medium ${className}`}>
        <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />
        <span className="font-mono tracking-wider">{shortAddress(address)}</span>
        <button
          type="button"
          onClick={disconnect}
          aria-label="Disconnect wallet"
          className="grid h-7 w-7 place-items-center rounded-md hover:bg-night/10"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={connect} disabled={busy} className={`btn-ghost !px-4 !py-2.5 ${className}`}>
      {busy ? <Spinner /> : <Wallet className="h-4 w-4" />} Connect wallet
    </button>
  );
}
