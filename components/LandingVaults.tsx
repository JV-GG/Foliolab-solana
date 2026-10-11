'use client';

import Link from 'next/link';
import {money, shortAddress} from '@/lib/domain/format';
import {useVaults} from '@/lib/contracts/hooks';

export function LandingVaults() {
  const {data: vaults = [], isLoading, error} = useVaults();

  if (isLoading) return <LandingState>Reading vaults from the network…</LandingState>;
  if (error) return <LandingState error>Live vault data is temporarily unavailable.</LandingState>;
  if (!vaults.length) return <LandingState>No vaults have been published on this network yet.</LandingState>;

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.55fr_28px] gap-6 border-b border-[#c9cec5] px-2 py-3 text-[9px] font-bold uppercase tracking-[.12em] text-[#7b857d] md:grid">
        <span>Vault</span><span>Value</span><span>Share price</span><span>Assets</span><span />
      </div>
      {vaults.slice(0, 4).map((vault) => {
        const heldAssets = vault.holdings.filter((holding) => holding.amount !== '0').length;
        return (
          <Link key={vault.address} href={`/vaults/${vault.address}`} className="group relative grid gap-5 border-b border-[#c9cec5] px-2 py-6 text-[#26372d] no-underline outline-none transition-colors duration-200 hover:text-[#172b21] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237b68] md:grid-cols-[minmax(0,1.5fr)_0.7fr_0.7fr_0.55fr_28px] md:items-center md:gap-6 md:py-7">
            <span className="min-w-0 pr-10 md:pr-0">
              <span className="flex flex-wrap items-center gap-2.5">
                <strong className="truncate text-[20px] font-semibold tracking-[-0.028em]">{vault.name}</strong>
                <span className={`folio-status ${vault.state === 'ACTIVE' ? 'folio-status-active' : vault.state === 'CLOSED' ? 'folio-status-closed' : 'folio-status-neutral'}`}>{vault.state}</span>
              </span>
              <span className="mt-2 block text-[10px] text-[#78827a]">Managed by {shortAddress(vault.manager)} · {vault.plan ? `Plan v${vault.plan.version}` : 'Plan not published'}</span>
            </span>
            <span className="grid grid-cols-3 gap-3 md:contents">
              <VaultMetric label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
              <VaultMetric label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
              <VaultMetric label="Assets" value={String(heldAssets)} />
            </span>
            <span aria-hidden="true" className="absolute right-2 top-7 text-[18px] leading-none text-[#657168] transition-transform duration-200 group-hover:translate-x-1 group-focus-visible:translate-x-1 md:static md:justify-self-end">→</span>
          </Link>
        );
      })}
    </div>
  );
}

function VaultMetric({label, value}: {label: string; value: string}) {
  return <span className="min-w-0"><small className="mb-1 block text-[8px] font-bold uppercase tracking-[.08em] text-[#879088] md:hidden">{label}</small><strong className="block truncate text-[12px] font-semibold text-[#35463c] sm:text-[13px]">{value}</strong></span>;
}

function LandingState({children, error = false}: {children: React.ReactNode; error?: boolean}) {
  return <div className={`mt-9 border-y border-[#c9cec5] py-12 text-center text-[13px] ${error ? 'text-[#944b4b]' : 'text-[#68736a]'}`}>{children}</div>;
}
