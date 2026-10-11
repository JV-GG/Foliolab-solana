'use client';

import {money, tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';

interface Props { vaults: VaultView[]; connected: boolean; onSelect: (address: string) => void; onExplore: () => void; }

export function PositionsList({vaults, connected, onSelect, onExplore}: Props) {
  const owned = vaults.filter((vault) => vault.position && vault.position.shares !== '0');
  if (!connected || !owned.length) {
    return (
      <div className="grid min-h-[360px] place-items-center border-y border-[#cdd3ca] px-6 py-16 text-center">
        <div className="max-w-[460px]">
          <span className="font-editorial text-[54px] text-[#829087]">{connected ? '0' : '↗'}</span>
          <h2 className="font-editorial mt-4 text-[32px] font-medium tracking-[-0.035em]">{connected ? 'No positions yet' : 'Connect your wallet'}</h2>
          <p className="mt-3 text-[13px] leading-6 text-[#6b746c]">{connected ? 'Vaults appear here when this wallet has a positive current share balance.' : 'A wallet connection lets Folio read current shares and investor territories. A disconnected wallet is never treated as a zero balance.'}</p>
          <button type="button" onClick={onExplore} className="folio-button-primary mt-7">Explore vaults</button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[#aeb8ad]">
      {owned.map((vault) => {
        const shares = BigInt(vault.position!.shares);
        const supply = BigInt(vault.totalSupply);
        const ppm = supply > BigInt(0) ? Number(shares * BigInt(1_000_000) / supply) : null;
        const ownership = ppm === null ? null : ppm / 10_000;
        return (
          <article key={vault.address} className="grid gap-7 border-b border-[#cdd3ca] py-8 md:grid-cols-[minmax(0,1fr)_minmax(360px,.8fr)_auto] md:items-center">
            <div><p className="eyebrow text-[#237b68]">Active position</p><h3 className="font-editorial mt-3 text-[31px] font-medium tracking-[-0.04em]">{vault.name}</h3><p className="mt-2 text-[10px] text-[#778078]">{vault.symbol} shares represent a proportional claim on every holding.</p></div>
            <dl className="grid grid-cols-3 gap-5">
              <Metric label="Estimated value" value={vault.position!.valueUsd === null ? 'Unavailable' : money(Number(vault.position!.valueUsd))} />
              <Metric label="Vault share" value={ownership === null ? 'Unavailable' : `${formatPercent(ownership)}%`} />
              <Metric label="Shares" value={tokenAmount(shares, 18, 6)} />
            </dl>
            <button type="button" onClick={() => onSelect(vault.address)} className="folio-button-secondary">Open position</button>
          </article>
        );
      })}
    </div>
  );
}

function Metric({label, value}: {label: string; value: string}) { return <div className="min-w-0"><dt className="text-[8px] uppercase tracking-[.11em] text-[#7a837b]">{label}</dt><dd className="mt-2 truncate text-[13px] font-semibold text-[#2b3a30]">{value}</dd></div>; }
function formatPercent(value: number) { return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); }
