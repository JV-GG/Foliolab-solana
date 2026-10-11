'use client';

import {tokenAmount} from '@/lib/domain/format';
import type {VaultView} from '@/lib/contracts/hooks';
import {assetColor, assetMix, SHARE_SCALE, sharePartsPerMillion} from './capitalMapModel';
import {useTokenSymbols} from './useTokenSymbols';

function dollars(value: string | null) {
  if (value === null) return 'Valuation unavailable';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: amount < 100 ? 2 : 0}).format(amount);
}

export function VaultOverviewCard({vault}: {vault: VaultView}) {
  const holdings = vault.holdings.filter((holding) => BigInt(holding.amount) > BigInt(0));
  const mix = assetMix(vault.holdings);
  const tokenSymbol = useTokenSymbols(holdings);
  const total = mix.status === 'ready' ? mix.assets.reduce((sum, asset) => sum + asset.value, 0) : null;
  const walletShare = vault.position ? sharePartsPerMillion(vault.position.shares, vault.totalSupply) : null;

  return (
    <section className="border-b border-[#cdd3ca] px-4 py-5">
      <div className="flex items-end justify-between gap-3"><div className="min-w-0"><span className="eyebrow">Portfolio valuation</span><p className="mt-2 truncate text-[26px] font-semibold tracking-[-0.04em] tabular-nums">{dollars(vault.totalValueUsd)}</p></div><span className="shrink-0 text-[10px] font-semibold text-[#6b746c]">{holdings.length} {holdings.length === 1 ? 'asset' : 'assets'}</span></div>
      {mix.status === 'unpriced' && <div className="mt-4 border-l-2 border-[#b18b15] pl-3 text-[11px] leading-5 text-[#6f5c0d]"><strong>Asset ratios uncalculated:</strong> a non-zero holding is awaiting an oracle price.</div>}

      {holdings.length === 0 ? <p className="mt-5 border-y border-dashed border-[#b8c0b7] py-4 text-center text-[11px] text-[#6b746c]">No non-zero holdings in this vault yet.</p> : (
        <div className="mt-5 border-t border-[#cdd3ca]">
          {holdings.map((holding) => {
            const value = holding.valueUsd === null ? null : Number(holding.valueUsd);
            const share = total !== null && value !== null && total > 0 ? Math.max(0, Math.min(100, value / total * 100)) : null;
            const color = assetColor(holding.asset);
            return (
              <div key={holding.asset} className="border-b border-[#cdd3ca] py-3">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor: color}} /><strong className="min-w-0 flex-1 truncate text-[12px]">{tokenSymbol(holding.asset, holding.symbol)}</strong><span className="shrink-0 text-[10px] font-bold tabular-nums">{share === null ? '—' : `${share.toFixed(1)}%`}</span></div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] text-[#717b72]"><span className="truncate">{tokenAmount(holding.amount, holding.decimals, 4)} units</span><span className="shrink-0 font-semibold text-[#3d4a41]">{holding.valueUsd === null ? 'Unpriced' : dollars(holding.valueUsd)}</span></div>
                {share !== null && <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#dce1da]"><span className="block h-full rounded-full" style={{width: `${share}%`, backgroundColor: color}} /></span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 border-t border-[#cdd3ca] pt-4">
        <div className="flex items-center justify-between gap-2"><span className="eyebrow">Manager wallet share</span><span className="h-2 w-5 border-t border-dashed border-[#237b68]" aria-hidden="true" /></div>
        {vault.position === null ? <p className="mt-3 text-[11px] text-[#6b746c]">Wallet position was not queried.</p> : BigInt(vault.position.shares) === BigInt(0) ? <p className="mt-3 text-[11px] text-[#6b746c]">0 shares held in connected wallet.</p> : <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]"><div><dt className="text-[#7b847c]">Shares</dt><dd className="mt-1 truncate font-semibold">{tokenAmount(vault.position.shares, 18, 6)}</dd></div><div><dt className="text-[#7b847c]">Vault share</dt><dd className="mt-1 font-bold text-[#237b68]">{formatShare(walletShare)}</dd></div><div className="col-span-2"><dt className="text-[#7b847c]">Estimated value</dt><dd className="mt-1 font-bold">{dollars(vault.position.valueUsd)}</dd></div></dl>}
        <p className="mt-3 text-[9px] leading-4 text-[#7b847c]">Remaining share: {formatOtherShare(walletShare)}. Map terrain is decorative; it does not represent TVL.</p>
      </div>
    </section>
  );
}

function formatShare(parts: bigint | null) { return parts === null ? 'Unavailable' : `${(Number(parts) / 10_000).toFixed(4)}%`; }
function formatOtherShare(parts: bigint | null) { return parts === null ? 'Unavailable' : `${(Number(SHARE_SCALE - parts) / 10_000).toFixed(4)}%`; }
