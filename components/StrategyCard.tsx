'use client';

import Link from 'next/link';
import {money, shortAddress} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

interface Props { vault: VaultView; index: number; selected: boolean; onSelect: () => void; }

export function StrategyCard({vault, index, selected, onSelect}: Props) {
  const slices = allocation(vault);
  return (
    <article className={`group border-b border-[#cdd3ca] py-7 transition ${selected ? 'border-t border-t-[#2b3a30]' : ''}`}>
      <div className="grid gap-5 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-start">
        <span className="hidden pt-1 text-[10px] font-bold text-[#848d85] sm:block">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-editorial truncate text-[28px] font-medium tracking-[-0.04em] text-[#2b3a30]">{vault.name}</h3>
            <span className={`folio-status ${vault.state === 'ACTIVE' ? 'folio-status-active' : vault.state === 'CLOSED' ? 'folio-status-closed' : 'folio-status-neutral'}`}>{vault.state}</span>
          </div>
          <p className="mt-2 text-[10px] text-[#788179]">Manager {shortAddress(vault.manager)} · {vault.symbol}</p>
          <div className="mt-5 flex h-1.5 max-w-[520px] gap-px overflow-hidden rounded-full bg-[#dfe3dc]">
            {slices.map((slice) => slice.percent === null ? null : <span key={slice.symbol} style={{width: `${slice.percent}%`, background: slice.color}} />)}
          </div>
          <p className="mt-2 truncate text-[9px] text-[#7a837b]">{slices.map((slice) => `${slice.symbol} ${slice.percent === null ? 'unavailable' : `${slice.percent.toFixed(0)}%`}`).join(' · ') || 'No holdings'}</p>
        </div>
        <div className="grid min-w-[190px] grid-cols-2 gap-x-6 gap-y-4 sm:text-right">
          <Value label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
          <Value label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
          <button type="button" onClick={onSelect} className="folio-button-quiet min-h-0 py-1 text-[10px]">{selected ? 'Selected' : 'Select'}</button>
          <Link href={`/vaults/${vault.address}`} className="folio-button-quiet min-h-0 py-1 text-[10px]">Details →</Link>
        </div>
      </div>
    </article>
  );
}

function Value({label, value}: {label: string; value: string}) { return <div><span className="block text-[8px] uppercase tracking-[.11em] text-[#7b847c]">{label}</span><strong className="mt-1.5 block truncate text-[12px] text-[#2b3a30]">{value}</strong></div>; }
