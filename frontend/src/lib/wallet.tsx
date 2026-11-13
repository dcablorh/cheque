'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO } from './demo';

const KEY = 'cheque.wallet.v1';
const DEMO_ADDRESS = 'GDEMOWALLETDEMOWALLETDEMOWALLETDEMOWALLETDEMOWALLETDEMO7';

interface WalletCtx {
  address: string | null;
  busy: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Asks the wallet to sign a transaction XDR; resolves with the signed XDR. */
  sign: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const Ctx = createContext<WalletCtx | null>(null);

let kitReady: Promise<typeof import('@creit.tech/stellar-wallets-kit/sdk')['StellarWalletsKit']> | null = null;

/** Loads the wallet kit on first use only: it touches `window`, so it can never run on the server. */
function loadKit() {
  if (!kitReady) {
    kitReady = (async () => {
      const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@creit.tech/stellar-wallets-kit/modules/utils'),
        import('@creit.tech/stellar-wallets-kit/types'),
      ]);
      StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
      return StellarWalletsKit;
    })();
  }
  return kitReady;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setAddress(localStorage.getItem(KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const remember = (a: string | null) => {
    setAddress(a);
    try {
      if (a) localStorage.setItem(KEY, a);
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  const connect = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (DEMO) return remember(DEMO_ADDRESS);
      const kit = await loadKit();
      const { address: a } = await kit.authModal();
      remember(a);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? '';
      // Closing the picker is not an error worth showing.
      if (!/closed|cancel|reject|denied/i.test(msg)) setError(msg || 'Could not connect the wallet.');
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (!DEMO) await (await loadKit()).disconnect();
    } catch {
      /* ignore */
    }
    remember(null);
  }, []);

  const sign = useCallback(
    async (xdr: string, networkPassphrase: string) => {
      if (!address) throw new Error('Connect a wallet first.');
      if (DEMO) return xdr;
      const kit = await loadKit();
      const { signedTxXdr } = await kit.signTransaction(xdr, { networkPassphrase, address });
      return signedTxXdr;
    },
    [address]
  );

  const value = useMemo(() => ({ address, busy, error, connect, disconnect, sign }), [address, busy, error, connect, disconnect, sign]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet must be used inside <WalletProvider>');
  return v;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export interface UsdcBalance {
  /** null when the account does not exist or has no USDC trustline. */
  usdc: number | null;
  exists: boolean;
}

/** USDC balance of a Stellar account via Horizon. */
export async function fetchUsdcBalance(
  address: string,
  horizonUrl: string,
  usdc: { code: string; issuer: string }
): Promise<UsdcBalance> {
  if (DEMO) return { usdc: 2500, exists: true };
  const res = await fetch(`${horizonUrl}/accounts/${address}`);
  if (res.status === 404) return { usdc: null, exists: false };
  if (!res.ok) throw new Error('Could not read the wallet balance.');
  const body = (await res.json()) as { balances: Array<{ asset_code?: string; asset_issuer?: string; balance: string }> };
  const b = body.balances.find((x) => x.asset_code === usdc.code && x.asset_issuer === usdc.issuer);
  return { usdc: b ? Number(b.balance) : null, exists: true };
}
