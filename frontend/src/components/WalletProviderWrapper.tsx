'use client';

import { useEffect, useState } from 'react';
import { WalletProvider } from '@/lib/wallet';
import { publicApi, type AppConfig } from '@/lib/api';

export function WalletProviderWrapper({ children }: { children: React.ReactNode }) {
  const [networkPassphrase, setNetworkPassphrase] = useState<string | undefined>();

  useEffect(() => {
    publicApi.get<AppConfig>('/config')
      .then((config) => {
        if (config.networkPassphrase) {
          setNetworkPassphrase(config.networkPassphrase);
        }
      })
      .catch(() => {
        // Silently fail - will use default testnet
      });
  }, []);

  return <WalletProvider networkPassphrase={networkPassphrase}>{children}</WalletProvider>;
}