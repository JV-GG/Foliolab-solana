/** Response shapes captured from live mainnet calls on 18 September 2026. */

export interface StatusInfo {
  openState: boolean;
  marketStatus: string | null;
  reasonCode: 'TRADING' | 'UNSUPPORTED' | 'ASSET_PAUSED' | string;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export interface RwaToken {
  binanceChainId: string;
  tokenContractAddress: string;
  platformId: string;
  /** 1 = single equity, 3 = leveraged ETF product. Absent on some rows. */
  assetType?: number;
  tokenName: string;
  tokenSymbol: string;
  tokenLogoUrl: string | null;
  decimals: string;
  underlyingTicker: string;
  underlyingName: string;
  tokenToShareRatio: string;
  tags: string[] | null;
  statusInfo: StatusInfo | null;
  /** On-chain token price, USD. */
  tokenPrice: string | null;
  /** Underlying reference price, USD. The pair is the divergence signal. */
  referencePrice: string | null;
  volume24H: string | null;
  marketCap: string | null;
  peRatioTTM: string | null;
}

export interface RwaPlatform {
  platformId: string;
  tickerCount: number;
  chainDistribution: {binanceChainId: string; tokenCount: number}[];
  website: string;
  logoUrl: string | null;
}

export interface Chain {
  binanceChainId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  nativeTokenSymbol?: string;
  nativeTokenDecimals?: number;
}

/** Explicit success/failure so the UI can never silently show fabricated data. */
export type Outcome<T> = {ok: true; data: T; ms: number} | {ok: false; error: string};
