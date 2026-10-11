/**
 * Server-side reads against the Binance Web3 API.
 *
 * Only ever imported from Server Components and Route Handlers, so the API
 * secret stays out of the client bundle. Every function returns an Outcome:
 * a failed call is surfaced, never replaced with placeholder numbers.
 */
import {BSC_CHAIN_ID, host, loadCredentials, request} from './client.ts';
import type {Chain, Outcome, RwaPlatform, RwaToken} from './types.ts';

/**
 * `fetch failed` on its own says nothing. The actionable detail is in
 * `error.cause.code` — ENOTFOUND is DNS, UND_ERR_CONNECT_TIMEOUT is a blocked
 * or filtered connection, ECONNREFUSED is nothing listening, CERT_* is TLS.
 */
function describeNetworkError(error: unknown): string {
  const err = error as {name?: string; message?: string; cause?: {code?: string; message?: string}};
  const code = err.cause?.code ?? err.cause?.message;

  const hint: Record<string, string> = {
    ENOTFOUND: 'DNS could not resolve the host.',
    EAI_AGAIN: 'DNS lookup failed temporarily.',
    UND_ERR_CONNECT_TIMEOUT: 'TCP connect timed out — the host is reachable by name but the connection is blocked or filtered.',
    ECONNREFUSED: 'Connection refused — nothing is listening at that address.',
    ECONNRESET: 'Connection reset by the remote end.',
    CERT_HAS_EXPIRED: 'TLS certificate rejected.',
  };

  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return `Request timed out after 15s reaching ${host()}. Run: node api/doctor.ts`;
  }

  return [
    `Could not reach ${host()}`,
    code ? `(${code})` : '',
    code && hint[code] ? `— ${hint[code]}` : '',
    'Run: node api/doctor.ts',
  ]
    .filter(Boolean)
    .join(' ');
}

interface Envelope<T> {
  code?: number | string;
  msg?: string;
  data?: T;
  success?: boolean;
}

/**
 * The API answers with HTTP 200 even for errors, so success is read from the
 * envelope rather than the status code.
 */
async function read<T>(
  path: string,
  query?: Record<string, string | number>,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<Outcome<T>> {
  let credentials;
  try {
    credentials = loadCredentials();
  } catch (error) {
    return {ok: false, error: (error as Error).message};
  }

  try {
    const result = await request(credentials, {method, path, query, body});
    const envelope = result.body as Envelope<T>;

    if (envelope?.success === false || envelope?.data === undefined) {
      return {ok: false, error: envelope?.msg ?? `Unexpected response (HTTP ${result.httpStatus})`};
    }
    return {ok: true, data: envelope.data as T, ms: result.durationMs};
  } catch (error) {
    return {ok: false, error: describeNetworkError(error)};
  }
}

export function getRwaTokens(): Promise<Outcome<RwaToken[]>> {
  return read<RwaToken[]>('/api/v1/dex/market/rwa/tokens', {limit: 500});
}

export function getRwaPlatforms(): Promise<Outcome<RwaPlatform[]>> {
  return read<RwaPlatform[]>('/api/v1/dex/market/rwa/platforms');
}

export function getMarketChains(): Promise<Outcome<Chain[]>> {
  return read<Chain[]>('/api/v1/dex/market/supported/chain');
}

export function getWalletChains(): Promise<Outcome<Chain[]>> {
  return read<Chain[]>('/api/v1/dex/balance/supported/chain');
}

export function getTradingChains(): Promise<Outcome<Chain[]>> {
  return read<Chain[]>('/api/v1/dex/aggregator/supported/chain');
}

export function getUnderlyingMarket(tokenContractAddress: string): Promise<Outcome<unknown>> {
  return read('/api/v1/dex/market/rwa/underlying-market', {
    binanceChainId: BSC_CHAIN_ID,
    tokenContractAddress,
  });
}

/** One route from `/aggregator/quote`. Only the fields the trade builder relies on. */
export interface AggregatorQuote {
  quoteId: string;
  executionMode: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  approveTarget: string;
  dexRouterList: {dexProtocol: {dexName: string; percent: string}}[];
}

/** `/aggregator/swap` response: an unsigned transaction for `userWalletAddress` to send. */
export interface AggregatorSwap {
  executionMode: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    minReceiveAmount: string;
    slippagePercent: string;
    signatureData: unknown;
  };
  rfq: unknown;
}

/**
 * Ondo tokens need `userWalletAddress` even to quote: the market maker prices for that taker,
 * so it must be the address that will actually send the swap (for a vault, the vault itself).
 */
export function getSwapQuote(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
}): Promise<Outcome<AggregatorQuote[]>> {
  return read<AggregatorQuote[]>('/api/v1/dex/aggregator/quote', {binanceChainId: BSC_CHAIN_ID, ...params});
}

/** Builds an unsigned swap. Executes nothing; the returned transaction must still be sent. */
export function buildSwap(params: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  quoteId: string;
  slippagePercent: string;
}): Promise<Outcome<AggregatorSwap>> {
  return read<AggregatorSwap>('/api/v1/dex/aggregator/swap', {binanceChainId: BSC_CHAIN_ID, ...params});
}
