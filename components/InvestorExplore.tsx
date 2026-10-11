'use client';

import {useState} from 'react';
import Link from 'next/link';
import {useConnection} from 'wagmi';
import {AssetMap} from '@/components/curator/AssetMap';
import {money, shortAddress} from '@/lib/domain/format';
import {useVaults, type VaultView} from '@/lib/contracts/hooks';
import {appChainLabel} from '@/lib/contracts/wagmi';
import {Header} from './Header';
import {AnimatedBrandFooter} from './AnimatedBrandFooter';
import {StrategyCard} from './StrategyCard';

type ExploreView = 'map' | 'list';

export function InvestorExplore() {
  const {address} = useConnection();
  const {data: vaults = [], isLoading, error, refetch, isFetching} = useVaults();
  const [view, setView] = useState<ExploreView>('map');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const selected = vaults.find((vault) => vault.address === selectedAddress) ?? vaults[0] ?? null;

  return (
    <div className="min-h-[100dvh] bg-[#ebeee7]">
      <Header />
      <main className="site-container pb-8 pt-8 sm:pt-12">
        <div className="grid gap-6 border-b border-[#aeb8ad] pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="eyebrow">Explore · {appChainLabel}</p>
            <h1 className="page-title mt-3">Vaults, mapped<br />with context.</h1>
            <p className="mt-3 max-w-[620px] text-[14px] leading-7 text-[#5e6961]">Each island is one vault. Open the list for a conventional comparison, or select an island to inspect the portfolio without losing the wider landscape.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="folio-segmented inline-flex" role="group" aria-label="Vault presentation">
              <button type="button" className="folio-segment" data-active={view === 'map'} onClick={() => setView('map')}>Map</button>
              <button type="button" className="folio-segment" data-active={view === 'list'} onClick={() => setView('list')}>List</button>
            </div>
            <button type="button" disabled={isFetching} onClick={() => void refetch()} className="folio-button-quiet">{isFetching ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>

        {error ? <Notice title="Vault data unavailable" detail={error.message} /> : isLoading ? <Notice title="Reading the archipelago" detail="Loading current vaults, holdings and connected-wallet positions…" /> : !vaults.length ? <Notice title="No vaults yet" detail="No curator vaults are visible on this network." /> : view === 'map' ? (
          <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="map-frame flex h-[520px] min-h-0 sm:h-[620px] lg:h-[680px]">
              <AssetMap vaults={vaults} selectedAddress={selected?.address ?? null} connectedAddress={address} onSelect={setSelectedAddress} />
            </div>
            {selected && <SelectedVault vault={selected} />}
          </div>
        ) : (
          <div className="mt-10 grid gap-x-10 lg:grid-cols-2">
            {vaults.map((vault, index) => <StrategyCard key={vault.address} vault={vault} index={index} selected={vault.address === selected?.address} onSelect={() => setSelectedAddress(vault.address)} />)}
          </div>
        )}
      </main>
      <AnimatedBrandFooter />
    </div>
  );
}

function SelectedVault({vault}: {vault: VaultView}) {
  const assets = vault.holdings.filter((holding) => holding.amount !== '0');
  return (
    <aside className="self-start border-t border-[#879388] pt-5">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">Selected vault</span><span className={`folio-status ${vault.state === 'ACTIVE' ? 'folio-status-active' : 'folio-status-neutral'}`}>{vault.state}</span></div>
      <h2 className="font-editorial mt-7 text-[34px] font-medium leading-none tracking-[-0.04em]">{vault.name}</h2>
      <p className="mt-3 text-[11px] text-[#778078]">Manager {shortAddress(vault.manager)}</p>
      <dl className="mt-9 grid grid-cols-2 gap-x-4 gap-y-7 border-y border-[#cdd3ca] py-6">
        <Metric label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
        <Metric label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
        <Metric label="Assets" value={String(assets.length)} />
        <Metric label="Plan" value={vault.plan ? `Version ${vault.plan.version}` : 'Not published'} />
      </dl>
      <p className="mt-5 line-clamp-4 text-[12px] leading-6 text-[#626d64]">{vault.plan?.text ?? 'This manager has not published an on-chain investment plan yet.'}</p>
      <Link href={`/vaults/${vault.address}`} className="folio-button-primary mt-7 w-full">Open vault details</Link>
    </aside>
  );
}

function Metric({label, value}: {label: string; value: string}) { return <div><dt className="text-[9px] uppercase tracking-[.12em] text-[#7c857d]">{label}</dt><dd className="mt-2 truncate text-[14px] font-semibold text-[#2b3a30]">{value}</dd></div>; }
function Notice({title, detail}: {title: string; detail: string}) { return <div className="min-h-[360px] border-b border-[#cdd3ca] py-24 text-center"><h2 className="font-editorial text-[32px] font-medium">{title}</h2><p className="mx-auto mt-3 max-w-[520px] text-[13px] leading-6 text-[#6b746c]">{detail}</p></div>; }
