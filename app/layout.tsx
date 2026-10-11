import type {Metadata} from 'next';
import {Fraunces, Inter} from 'next/font/google';
import {Providers} from './providers';
import './globals.css';

const inter = Inter({subsets: ['latin'], display: 'swap', variable: '--font-inter'});
const fraunces = Fraunces({subsets: ['latin'], display: 'swap', variable: '--font-fraunces'});

export const metadata: Metadata = {
  title: 'Folio Lab — pooled stock portfolios on BNB Chain',
  description: "Deposit USDT into a curator's vault of tokenized US stocks. Withdraw your share any time.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9.6' fill='%23213a30'/%3E%3Cpath d='M6.25 10.45 16 5.15l9.75 5.3L16 15.8 6.25 10.45Z' fill='%23f4f3ea'/%3E%3Cpath d='M6.25 13.05 14.85 17.75v9.1l-8.6-4.72v-9.08Z' fill='%239ec8b8'/%3E%3Cpath d='m25.75 13.05-8.6 4.7v9.1l8.6-4.72v-9.08Z' fill='%23e2b84f'/%3E%3Cpath d='m16 7.75 5.05 2.74L16 13.25l-5.05-2.76L16 7.75Z' fill='%23213a30' fill-opacity='.18'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
