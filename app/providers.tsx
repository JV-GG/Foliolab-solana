'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useState, type ReactNode} from 'react';
import {WagmiProvider} from 'wagmi';
import {ToastProvider} from '@/components/Toast';
import {wagmiConfig} from '@/lib/contracts/wagmi';

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
