'use client';

import {money, shortAddress, tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {allocation} from './allocation';

export type TradeType = 'invest' | 'withdraw';
interface Props { vault: VaultView; connected: boolean; onTrade: (type: TradeType) => void; }

export function DetailPanel({vault, connected, onTrade}: Props) {
  const slices = allocation(vault);
  const held = vault.holdings.filter((holding) => holding.amount !== '0');
  const hasShares = Boolean(vault.position && vault.position.shares !== '0');
  const pricesMissing = held.some((holding) => holding.valueUsd === null);
  const acceptsDeposits = vault.state === 'ACTIVE' && !pricesMissing;
  const shares = BigInt(vault.position?.shares ?? '0');
  const supply = BigInt(vault.totalSupply);
  const sharePpm = supply > BigInt(0) ? Number(shares * BigInt(1_000_000) / supply) : null;
  const sharePercent = sharePpm === null ? null : sharePpm / 10_000;

  return (
    <article aria-label="Selected vault" className="folio-enter min-w-0 max-w-full overflow-x-clip">
      <header className="grid gap-10 border-b border-[#aeb8ad] pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Vault details</p><span className={`folio-status ${vault.state === 'ACTIVE' ? 'folio-status-active' : vault.state === 'CLOSED' ? 'folio-status-closed' : 'folio-status-neutral'}`}>{vault.state}</span></div>
          <h1 className="page-title mt-5 break-words">{vault.name}</h1>
          <p className="mt-4 text-[11px] text-[#737d75]">Managed by {shortAddress(vault.manager)} · {vault.symbol}</p>
        </div>
        <dl className="grid min-w-0 max-w-full grid-cols-2 gap-x-10 gap-y-4 lg:min-w-[390px] lg:text-right">
          <LargeMetric label="Vault value" value={vault.totalValueUsd === null ? 'Unavailable' : money(Number(vault.totalValueUsd))} />
          <LargeMetric label="Share price" value={vault.sharePriceUsd === null ? 'Unavailable' : money(Number(vault.sharePriceUsd))} />
        </dl>
      </header>

      <div className="grid gap-16 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] lg:gap-20">
        <section className="min-w-0">
          <SectionTitle eyebrow="Current composition">Holdings</SectionTitle>
          {slices.length > 0 && <div className="mt-7 flex h-2 gap-px overflow-hidden rounded-full bg-[#dce1da]">{slices.map((slice) => slice.percent === null ? null : <span key={slice.symbol} style={{width: `${slice.percent}%`, background: slice.color}} />)}</div>}
          <div className="mt-4 border-t border-[#cdd3ca]">
            {held.length ? held.map((holding) => {
              const slice = slices.find((entry) => entry.symbol === holding.symbol);
              return (
                <div key={holding.asset} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#cdd3ca] py-5">
                  <span className="flex min-w-0 items-center gap-3"><i className="h-3 w-3 shrink-0 rounded-full" style={{background: slice?.color ?? '#7c887e'}} /><span className="min-w-0"><strong className="block truncate text-[13px]">{holding.symbol}</strong><small className="mt-1 block text-[9px] text-[#7b847c]">{tokenAmount(holding.amount, holding.decimals, 4)} units</small></span></span>
                  <strong className="text-[13px]">{holding.valueUsd === null ? 'Price unavailable' : money(Number(holding.valueUsd))}</strong>
                </div>
              );
            }) : <EmptyLine>No assets are held yet.</EmptyLine>}
          </div>
          {pricesMissing && <p className="mt-5 border-l-2 border-[#b28b13] pl-4 text-[11px] leading-6 text-[#71600e]">A non-zero holding has no live price. Total value, allocation and deposits remain unavailable; withdrawals still work.</p>}

          <section className="mt-16">
            <div className="flex items-end justify-between gap-4"><SectionTitle eyebrow="Manager guidance">Published plan</SectionTitle>{vault.plan && <span className="text-[10px] font-bold text-[#717b72]">VERSION {vault.plan.version}</span>}</div>
            {vault.plan ? <><p className="font-editorial mt-7 whitespace-pre-wrap break-words border-y border-[#cdd3ca] py-7 text-[clamp(20px,2.4vw,30px)] leading-[1.45] tracking-[-0.02em] text-[#35463b]">“{vault.plan.text}”</p><p className="mt-3 text-[10px] leading-5 text-[#7a837b]">Advisory text posted on-chain by the manager; it is not mechanically enforced.</p></> : <EmptyLine>No plan has been published. This vault cannot rebalance until a plan exists.</EmptyLine>}
          </section>
        </section>

        <aside className="min-w-0 self-start lg:sticky lg:top-28">
          <SectionTitle eyebrow="Connected wallet">Your position</SectionTitle>
          {!connected ? <EmptyLine>Connect a wallet to load your shares and territory.</EmptyLine> : vault.position === null ? <EmptyLine>Position data is unavailable for this wallet.</EmptyLine> : (
            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-[#cdd3ca] py-7">
              <Metric label="Shares" value={tokenAmount(vault.position.shares, 18, 6)} />
              <Metric label="Vault share" value={sharePercent === null ? 'Unavailable' : `${formatPercent(sharePercent)}%`} />
              <div className="col-span-2"><Metric label="Estimated position" value={vault.position.valueUsd === null ? 'Unavailable' : money(Number(vault.position.valueUsd))} /></div>
            </dl>
          )}
          <p className="mt-6 text-[12px] leading-6 text-[#5d6960]">Withdrawals return your proportional share of every held token in kind—including stock tokens and USDT—not a guaranteed cash amount.</p>
          <div className="mt-8 grid gap-3">
            <button type="button" disabled={!connected || !acceptsDeposits} onClick={() => onTrade('invest')} className="folio-button-primary w-full">{!connected ? 'Connect wallet to deposit' : acceptsDeposits ? 'Deposit USDT' : pricesMissing && vault.state === 'ACTIVE' ? 'Deposit unavailable: missing prices' : `Deposits closed · ${vault.state}`}</button>
            <button type="button" disabled={!hasShares} onClick={() => onTrade('withdraw')} className="folio-button-secondary w-full">{hasShares ? 'Withdraw in kind' : 'No shares to withdraw'}</button>
          </div>
        </aside>
      </div>
    </article>
  );
}

function SectionTitle({eyebrow, children}: {eyebrow: string; children: string}) { return <div><p className="eyebrow">{eyebrow}</p><h2 className="font-editorial mt-2 text-[31px] font-medium tracking-[-0.04em]">{children}</h2></div>; }
function LargeMetric({label, value}: {label: string; value: string}) { return <div><dt className="text-[9px] uppercase tracking-[.12em] text-[#788179]">{label}</dt><dd className="mt-2 text-[clamp(22px,3vw,34px)] font-semibold tracking-[-0.04em]">{value}</dd></div>; }
function Metric({label, value}: {label: string; value: string}) { return <div><dt className="text-[9px] uppercase tracking-[.11em] text-[#7b847c]">{label}</dt><dd className="mt-2 truncate text-[15px] font-semibold" title={value}>{value}</dd></div>; }
function EmptyLine({children}: {children: React.ReactNode}) { return <p className="mt-6 border-y border-dashed border-[#b8c0b7] py-5 text-[12px] leading-6 text-[#707a72]">{children}</p>; }
function formatPercent(value: number) { if (!Number.isFinite(value)) return 'Unavailable'; return value >= 0.01 && value < 99.99 ? value.toFixed(2).replace(/\.00$/, '') : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); }
