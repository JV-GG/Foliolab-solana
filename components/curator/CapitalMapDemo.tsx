'use client';

import Link from 'next/link';
import type {Address} from 'viem';
import type {VaultView} from '@/lib/contracts/hooks';
import {AssetMap} from './AssetMap';
import type {MapHolder} from './useIslandOverlay';

const DEMO_VAULT_ADDRESS = '0x1111111111111111111111111111111111111111' as Address;

const DEMO_VAULT: VaultView = {
  address: DEMO_VAULT_ADDRESS,
  name: 'Visual Demo Vault',
  symbol: 'DEMO',
  manager: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address,
  state: 'ACTIVE',
  totalSupply: '100000000000000000000',
  holdings: [
    {
      asset: '0x55d398326f99059fF775485246999027B3197955' as Address,
      symbol: 'USDT',
      decimals: 18,
      amount: '40000000000000000000',
      priceUsd: '1',
      valueUsd: '40',
    },
    {
      asset: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4' as Address,
      symbol: 'AAPLon',
      decimals: 18,
      amount: '1000000000000000000',
      priceUsd: '35',
      valueUsd: '35',
    },
    {
      asset: '0xa9ee28c80f960b889dfbd1902055218cba016f75' as Address,
      symbol: 'NVDAon',
      decimals: 18,
      amount: '1000000000000000000',
      priceUsd: '25',
      valueUsd: '25',
    },
  ],
  totalValueUsd: '100',
  sharePriceUsd: '1',
  plan: {version: 1, text: 'Visual demonstration only.'},
  position: {shares: '50000000000000000000', valueUsd: '50'},
  pricedAt: 0,
};

const DEMO_HOLDERS: MapHolder[] = [
  {
    id: 'demo-wallet-a',
    address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    label: 'Wallet A',
    shares: '50000000000000000000',
    valueUsd: '50',
    current: true,
    kind: 'wallet',
  },
  {
    id: 'demo-wallet-b',
    address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    label: 'Wallet B',
    shares: '30000000000000000000',
    valueUsd: '30',
    current: false,
    kind: 'wallet',
  },
  {
    id: 'demo-wallet-c',
    address: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    label: 'Wallet C',
    shares: '20000000000000000000',
    valueUsd: '20',
    current: false,
    kind: 'wallet',
  },
];

export function CapitalMapDemo() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#07111f] text-[#e8eef7]">
      <header className="relative flex h-[64px] min-w-0 items-center gap-3 overflow-hidden border-b border-[#203047] bg-[#0a1422] px-4 sm:px-6">
        <Link href="/curator" className="flex items-center gap-2 text-[17px] font-[850] text-white no-underline">
          <span className="grid h-7 w-7 place-items-center bg-[#f2d23d] font-mono text-[13px] text-[#101725] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">F</span>
          <span>FOLIO LAB</span>
        </Link>
        <span className="absolute right-4 shrink-0 rounded border border-[#e6c52d] bg-[#2c2812] px-2 py-1.5 text-center font-mono text-[8px] font-[800] tracking-[0.5px] text-[#f4d83f] sm:right-6 sm:px-3 sm:text-[9px] sm:tracking-[0.8px]"><span className="sm:hidden">VISUAL DEMO</span><span className="hidden sm:inline">VISUAL DEMO · NO TRANSACTIONS</span></span>
      </header>

      <main className="block min-h-[calc(100dvh-64px)] min-w-0 p-3 lg:grid lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-3">
        <aside className="w-[calc(100vw-24px)] min-w-0 max-w-full overflow-hidden rounded-xl border border-[#26374d] bg-[#0d1827] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.3)] lg:w-auto">
          <p className="font-mono text-[9px] font-[800] tracking-[1.5px] text-[#65dac8]">LAYER COMPREHENSION TEST</p>
          <h1 className="mt-2 text-[21px] font-[850] tracking-[-0.5px] text-white">Asset mix + investor territories</h1>
          <p className="mt-2 break-words text-[11px] leading-[1.6] text-[#8fa1b8]">Static, isolated display data. It does not call an API, connect a wallet or send a transaction.</p>

          <DemoSection title="Asset colors">
            <DemoRow color="#55d7c2" label="USDT" value="40%" />
            <DemoRow color="#a985ef" label="AAPLon" value="35%" />
            <DemoRow color="#f1c85b" label="NVDAon" value="25%" />
          </DemoSection>

          <DemoSection title="Investor territories">
            <DemoRow outline label="Wallet A · YOU" value="50%" />
            <DemoRow outline label="Wallet B" value="30%" />
            <DemoRow outline label="Wallet C" value="20%" />
          </DemoSection>

          <div className="mt-4 rounded-lg border border-[#34495f] bg-[#091421] p-3 text-[10px] leading-[1.55] text-[#98a9bd]">
            Asset tint and territory boundaries are independent layers. Each territory repeats the same 40 / 35 / 25 portfolio mix because every shareholder owns a proportional interest in the whole vault.
          </div>
          <Link href="/curator" className="mt-4 inline-flex rounded-md border border-[#e6c52d] bg-[#f2d23d] px-4 py-2 text-[11px] font-[850] text-[#111827] no-underline hover:bg-[#ffe768]">Back to real curator data</Link>
        </aside>

        <section className="mt-3 flex min-h-[620px] w-[calc(100vw-24px)] min-w-0 max-w-full overflow-hidden rounded-xl border border-[#26374d] bg-[#081827] shadow-[0_20px_70px_rgba(0,0,0,0.32)] lg:mt-0 lg:w-auto">
          <AssetMap
            demo
            vaults={[DEMO_VAULT]}
            selectedAddress={DEMO_VAULT_ADDRESS}
            connectedAddress={DEMO_HOLDERS[0].address as Address}
            holdersByVault={{[DEMO_VAULT_ADDRESS.toLowerCase()]: DEMO_HOLDERS}}
            onSelect={() => undefined}
          />
        </section>
      </main>
    </div>
  );
}

function DemoSection({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section className="mt-5 border-t border-[#263a50] pt-4">
      <h2 className="font-mono text-[9px] font-[800] tracking-[1px] text-[#bdcada]">{title.toUpperCase()}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function DemoRow({color, label, value, outline = false}: {color?: string; label: string; value: string; outline?: boolean}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-[#d2dce8]">
      <span className={`h-3 w-3 rounded-sm ${outline ? 'border border-[#deebda] bg-transparent' : ''}`} style={color ? {backgroundColor: color} : undefined} />
      <span>{label}</span>
      <span className="ml-auto font-mono text-[#8fa3bb]">{value}</span>
    </div>
  );
}
