/**
 * Pure rules for turning Binance quotes into contract prices. No network, no keys.
 *
 * The contract wants `prices[i]` = settlement-token base units for ONE WHOLE `assets[i]` token
 * (spec §5). Binance quotes are USD decimal strings; USDT is treated as exactly $1.
 */
import type {RwaToken} from '@/lib/binance/types';

/** Default: refuse when token and reference price differ by more than 2%. */
export const DEFAULT_MAX_DIVERGENCE_BPS = 200;

/**
 * Converts a USD decimal string to base units with `decimals` places, truncating any extra
 * digits. Truncation rounds a price down by at most one base unit, which is negligible against
 * the contract rounding the vault value up.
 */
export function usdToUnits(usd: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(usd.trim());
  if (!match) throw new Error(`Not a plain decimal price: "${usd}"`);
  const [, whole, fraction = ''] = match;
  const scaled = whole + fraction.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(scaled);
}

/** Absolute gap between two prices in basis points of the reference price. */
export function divergenceBps(tokenPrice: number, referencePrice: number): number {
  return (Math.abs(tokenPrice - referencePrice) / referencePrice) * 10_000;
}

export type Verdict = {ok: true; priceUsd: string} | {ok: false; reason: string};

export interface PriceRules {
  maxDivergenceBps: number;
  /**
   * When true, a token Binance does not report as trading is refused.
   *
   * Decided 10 Oct 2026: this checks the TOKEN's status (`reasonCode`), not the US market's
   * (`marketStatus`). Ondo tokens keep trading off-hours and at weekends, and deposits are
   * allowed then; the divergence check against the reference price is the guard.
   */
  requireOpenMarket: boolean;
}

/** Decides whether one Binance row is safe to sign. */
export function judgeQuote(token: RwaToken | undefined, rules: PriceRules): Verdict {
  if (!token) return {ok: false, reason: 'not listed by Binance on BSC'};

  const status = token.statusInfo;
  if (rules.requireOpenMarket && !(status?.openState && status.reasonCode === 'TRADING')) {
    const why = status?.reasonMsg ?? status?.reasonCode ?? 'unknown status';
    return {ok: false, reason: `market not trading (${why})`};
  }

  const tokenPrice = Number(token.tokenPrice);
  if (!token.tokenPrice || !Number.isFinite(tokenPrice) || tokenPrice <= 0) {
    return {ok: false, reason: 'no token price'};
  }

  const referencePrice = Number(token.referencePrice);
  if (token.referencePrice && Number.isFinite(referencePrice) && referencePrice > 0) {
    const gap = divergenceBps(tokenPrice, referencePrice);
    if (gap > rules.maxDivergenceBps) {
      return {
        ok: false,
        reason: `token price ${tokenPrice} is ${Math.round(gap)} bps from reference ${referencePrice}`,
      };
    }
  }

  return {ok: true, priceUsd: token.tokenPrice};
}

/** FolioVault.MAX_TRADE_LOSS_BPS: `rebalance` reverts when a trade loses more than this. */
export const MAX_TRADE_LOSS_BPS = 200;

export interface TradeLeg {
  amount: bigint;
  decimals: number;
  priceUsd: number;
}

/**
 * How much value a trade gives up at the given prices, in percent; negative when it gains.
 * Display only: the contract does the binding check with signed prices.
 */
export function tradeLossPercent(sold: TradeLeg, bought: TradeLeg): number {
  const value = (leg: TradeLeg) => (Number(leg.amount) / 10 ** leg.decimals) * leg.priceUsd;
  return (1 - value(bought) / value(sold)) * 100;
}
