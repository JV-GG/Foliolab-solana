'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ConnectionProvider, WalletProvider} from '@solana/wallet-adapter-react';
import {WalletModalProvider} from '@solana/wallet-adapter-react-ui';
import {useState, type ReactNode} from 'react';
import {ToastProvider} from '@/components/Toast';
import {PUBLIC_RPC_URL} from '@/lib/solana/config';
import '@solana/wallet-adapter-react-ui/styles.css';

/** Wallets are discovered through Wallet Standard (Phantom, Solflare, Backpack, ...), so none are listed. */
const wallets: never[] = [];

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ConnectionProvider endpoint={PUBLIC_RPC_URL} config={{commitment: 'confirmed'}}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>{children}</ToastProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
