/**
 * Live USD prices for the vault's stock tokens, server-side.
 *
 * The devnet tokens are mocks of real xStocks, so each is priced from its `underlying` ticker via
 * the Binance Web3 RWA listing (Ondo's tokenized stock on BSC, judged by `judgeQuote`). With
 * PRICE_SOURCE=static, fixed demo prices are used instead — for offline demos only, never on
 * mainnet.
 */
import {getRwaTokens} from '@/lib/binance/queries';
import type {RwaToken} from '@/lib/binance/types';
import {CLUSTER, tokenByMint} from '@/lib/solana/config';
import {ApiError} from '@/lib/chain/server';
import {DEFAULT_MAX_DIVERGENCE_BPS, judgeQuote, type PriceRules} from './rules';

const STATIC_PRICES: Record<string, string> = {AAPL: '255.00', NVDA: '185.00', TSLA: '430.00'};

export interface Quote {
  mint: string;
  symbol: string;
  priceUsd: string;
}

export interface Refusal {
  mint: string;
  symbol: string;
  reason: string;
}

function rules(): PriceRules {
  const bps = Number(process.env.PRICE_MAX_DIVERGENCE_BPS);
  return {
    maxDivergenceBps: Number.isFinite(bps) && bps > 0 ? bps : DEFAULT_MAX_DIVERGENCE_BPS,
    requireOpenMarket: process.env.PRICE_REQUIRE_OPEN_MARKET !== 'false',
  };
}

function useStatic(): boolean {
  return process.env.PRICE_SOURCE === 'static' && CLUSTER !== 'mainnet-beta';
}

/** One Binance row per underlying ticker, preferring BSC (where the Ondo tokens trade). */
async function rowsByTicker(): Promise<Map<string, RwaToken>> {
  const listing = await getRwaTokens();
  if (!listing.ok) {
    throw new ApiError(`Live stock prices are unavailable right now, so deposits and trades are paused. (${listing.error})`, 503);
  }
  const out = new Map<string, RwaToken>();
  for (const row of listing.data) {
    const ticker = row.underlyingTicker?.toUpperCase();
    if (!ticker) continue;
    const current = out.get(ticker);
    if (!current || (current.binanceChainId !== '56' && row.binanceChainId === '56')) out.set(ticker, row);
  }
  return out;
}

/**
 * Prices every mint in `mints` (USDC excluded by the caller). Returns quotes for the ones that are
 * safe to sign and refusals, with a reason, for the rest.
 */
export async function quoteMints(
  mints: string[],
  strict = true,
): Promise<{quotes: Quote[]; refused: Refusal[]}> {
  const quotes: Quote[] = [];
  const refused: Refusal[] = [];
  if (mints.length === 0) return {quotes, refused};
  const rows = useStatic() ? undefined : await rowsByTicker();

  for (const mint of mints) {
    const token = tokenByMint(mint);
    const symbol = token?.symbol ?? mint.slice(0, 4);
    if (!token?.underlying) {
      refused.push({mint, symbol, reason: 'unknown token'});
      continue;
    }
    if (!rows) {
      quotes.push({mint, symbol, priceUsd: STATIC_PRICES[token.underlying] ?? '100.00'});
      continue;
    }
    const verdict = judgeQuote(
      rows.get(token.underlying),
      strict ? rules() : {maxDivergenceBps: Number.POSITIVE_INFINITY, requireOpenMarket: false},
    );
    if (verdict.ok) quotes.push({mint, symbol, priceUsd: verdict.priceUsd});
    else refused.push({mint, symbol, reason: verdict.reason});
  }
  return {quotes, refused};
}

/** Best-effort display prices (market open or not): never throws, missing prices are simply absent. */
export async function displayPrices(mints: string[]): Promise<Map<string, string>> {
  try {
    const {quotes} = await quoteMints(mints, false);
    return new Map(quotes.map((q) => [q.mint, q.priceUsd]));
  } catch {
    return new Map();
  }
}
