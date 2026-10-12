import type {VaultView} from '@/lib/contracts/hooks';
import type {BuiltTrade} from '@/lib/trade/build';
import type {SignedPricesJson} from '@/lib/solana/program';
import {deployment} from '@/lib/solana/config';

export interface CuratorAsset {
  /** Mint address. */
  address: string;
  symbol: string;
  decimals: number;
}

/** What /api/trade returns. */
export type TradeQuote = BuiltTrade;

/** What /api/prices returns. */
export interface SignedPrices extends SignedPricesJson {
  quotes: {mint: string; symbol: string; priceUsd: string}[];
}

/** The stock tokens of this deployment (lib/solana/addresses.json). */
export function stocks(): CuratorAsset[] {
  return deployment()
    .tokens.filter((t) => t.underlying)
    .map((t) => ({address: t.mint, symbol: t.symbol, decimals: t.decimals}));
}

/** Assets the curator can sell or buy: USDC first, then every listed stock. */
export function curatorAssets(vault: VaultView): CuratorAsset[] {
  const d = deployment();
  const usdc = d.tokens.find((t) => t.mint === d.usdc);
  const settlement = vault.holdings.find((holding) => holding.asset === d.usdc);
  const assets = [
    {address: d.usdc, symbol: 'USDC', decimals: settlement?.decimals ?? usdc?.decimals ?? 6},
    ...stocks(),
  ];
  return assets.filter((asset, index) => assets.findIndex((candidate) => candidate.address === asset.address) === index);
}

export const MAX_PLAN_BYTES = 1000;

/** The program validates the plan's byte length, so count encoded bytes rather than JS characters. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Solana addresses are case-sensitive base58, so compare them exactly. */
export function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left === right);
}
