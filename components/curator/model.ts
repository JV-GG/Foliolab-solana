import {getAddress, type Address, type Hex} from 'viem';
import type {VaultView} from '@/lib/contracts/hooks';

export interface CuratorAsset {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface TradeQuote {
  trade: {
    router: Address;
    sellToken: Address;
    buyToken: Address;
    maxSellAmount: string;
    minBuyAmount: string;
    callData: Hex;
  };
  quote: {
    expectedBuyAmount: string;
    slippagePercent: string;
    route: string[];
    lossPercent: number | null;
  };
  gasLimit: string;
  warnings: string[];
}

export interface SignedPrices {
  update: {
    assets: Address[];
    prices: string[];
    timestamp: string;
  };
  signature: Hex;
  /** Unix seconds after which the contract rejects this update. */
  expiresAt: number;
  quotes: {asset: Address; symbol: string; priceUsd: string}[];
}

export const STOCKS: readonly CuratorAsset[] = [
  {symbol: 'AAPLon', address: '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4', decimals: 18},
  {symbol: 'NVDAon', address: '0xA9eE28C80f960B889dFbd1902055218cBa016F75', decimals: 18},
  {symbol: 'MSFTon', address: '0x6Bfe75D1ad432050eA973C3A3DcD88F02e2444C3', decimals: 18},
] as const;

/** Assets the curator can target or buy, using the vault's settlement address for USDT. */
export function curatorAssets(vault: VaultView): CuratorAsset[] {
  const settlement = vault.holdings.find((holding) => holding.symbol === 'USDT');
  const assets = settlement
    ? [{address: getAddress(settlement.asset), symbol: 'USDT', decimals: settlement.decimals}, ...STOCKS]
    : [...STOCKS];
  return assets.filter(
    (asset, index) => assets.findIndex((candidate) => candidate.address === asset.address) === index,
  );
}

export const MAX_PLAN_BYTES = 1000;

/** Solidity validates `bytes(plan).length`, so count encoded bytes rather than JS characters. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function sameAddress(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}
