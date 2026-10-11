import type {VaultView} from '@/lib/contracts/hooks';
import {assetColor} from './curator/capitalMapModel';

export interface Slice {
  symbol: string;
  color: string;
  /** Share of the vault's value, 0–100. Null when some price is unavailable. */
  percent: number | null;
}

/** Current allocation by value, from actual holdings (not the curator's target). */
export function allocation(vault: VaultView): Slice[] {
  const total = vault.totalValueUsd === null ? null : Number(vault.totalValueUsd);
  return vault.holdings
    .filter((h) => h.amount !== '0')
    .map((h) => ({
      symbol: h.symbol,
      color: assetColor(h.asset),
      percent: total && h.valueUsd !== null ? (Number(h.valueUsd) / total) * 100 : null,
    }));
}
