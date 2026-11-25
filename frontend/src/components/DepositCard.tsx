'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Wallet } from 'lucide-react';
import { fmtMoney, fromUsdc, sanitizeAmount, toUsdc, type AppConfig, type CorridorConfig } from '@/lib/api';
import { fetchUsdcBalance, useWallet, type UsdcBalance } from '@/lib/wallet';
import { WalletButton } from '@/components/WalletButton';

/**
 * Deposit panel: a two-way converter between the cheque's currency and USDC (the asset that is
 * actually deposited), plus the connected wallet's USDC balance and trustline status.
 */
export function DepositCard(props: {
  config: AppConfig;
  corridor: CorridorConfig;
  /** Cheque face amount in the corridor currency. */
  amount: number;
  fee: number;
  onAmountChange: (localAmount: number) => void;
  /** Reports whether the wallet can cover the deposit (true when no wallet is required). */
  onReady: (ok: boolean) => void;
}) {
  const { config, corridor, amount, fee, onAmountChange, onReady } = props;
  const { address } = useWallet();
  const [balance, setBalance] = useState<UsdcBalance | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [usdcText, setUsdcText] = useState('');

  const cur = corridor.currency;
  const total = amount + fee;
  const usdcNeeded = toUsdc(total, corridor.perUsdc);
  const usdcFace = toUsdc(amount, corridor.perUsdc);
  const needsWallet = !!config.walletFunding;

  // Keep the USDC box in step with the local amount unless the user is typing in it.
  useEffect(() => {
    setUsdcText(amount > 0 ? String(usdcFace) : '');
  }, [amount, usdcFace]);

  useEffect(() => {
    if (!address || !config.horizonUrl || !config.usdc) {
      setBalance(null);
      return;
    }
    let live = true;
    setBalanceError('');
    fetchUsdcBalance(address, config.horizonUrl, config.usdc)
      .then((b) => live && setBalance(b))
      .catch((e) => live && setBalanceError(e.message));
    return () => {
      live = false;
    };
  }, [address, config.horizonUrl, config.usdc]);

  const funded = !!balance && balance.usdc !== null && balance.usdc >= usdcNeeded;
  useEffect(() => {
    onReady(!needsWallet || (!!address && funded));
  }, [needsWallet, address, funded, onReady]);

  return (
    <div className="space-y-3 rounded-[10px] border border-sage/60 bg-paper p-3">
      <div className="flex items-center justify-between">
        <span className="label !mb-0 !text-[10px]">Deposit in USDC</span>
        <span className="text-[11px] text-ink-mute">
          1 USDC = {fmtMoney(Number(corridor.perUsdc), cur)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[10px] border border-sage/60 bg-[#faf7f1] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-ink-mute">Cheque ({cur})</p>
          <p className="font-medium tabular-nums">{fmtMoney(amount, cur)}</p>
        </div>
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
        <label className="flex-1 rounded-[10px] border border-sage/60 bg-[#faf7f1] px-3 py-2 focus-within:border-night">
          <span className="block text-[10px] uppercase tracking-wider text-ink-mute">USDC</span>
          <input
            className="w-full bg-transparent font-medium tabular-nums outline-none"
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount in USDC"
            value={usdcText}
            onChange={(e) => {
              const t = sanitizeAmount(e.target.value);
              setUsdcText(t);
              onAmountChange(fromUsdc(Number(t) || 0, corridor.perUsdc));
            }}
          />
        </label>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-soft">
          You deposit <span className="font-semibold text-ink">{usdcNeeded.toFixed(2)} USDC</span>
          <span className="text-ink-mute"> (incl. {config.feeBps / 100}% fee)</span>
        </span>
      </div>

      {needsWallet && (
        <div className="space-y-2 border-t border-sage/40 pt-3">
          {!address ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-ink-soft">
                <Wallet className="h-4 w-4" /> Connect a Stellar wallet to deposit.
              </p>
              <WalletButton />
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {balanceError && <p className="text-cedi">{balanceError}</p>}
              {balance && !balance.exists && (
                <p className="text-cedi">This account isn&apos;t on the Stellar network yet. Fund it with testnet XLM first.</p>
              )}
              {balance && balance.exists && balance.usdc === null && (
                <p className="text-cedi">This wallet has no USDC trustline. Add a USDC trustline in your wallet and fund it with USDC.</p>
              )}
              {balance && balance.usdc !== null && (
                <p className={funded ? 'text-ink-soft' : 'font-semibold text-cedi'}>
                  Wallet balance: {balance.usdc.toFixed(2)} USDC
                  {!funded && amount > 0 && ` · need ${usdcNeeded.toFixed(2)}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
