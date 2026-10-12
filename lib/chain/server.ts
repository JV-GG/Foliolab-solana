/**
 * Server-side Solana access for Route Handlers. SOLANA_RPC_URL is the server's RPC (may carry an
 * API key); it falls back to the public one for the configured cluster.
 */
import {Connection, PublicKey} from '@solana/web3.js';
import {PUBLIC_RPC_URL} from '@/lib/solana/config';

/** A failure a Route Handler can return as-is; `status` is the HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const CHAIN_DOWN =
  'The Solana RPC is not responding. Check SOLANA_RPC_URL (locally: is solana-test-validator running?) and try again.';

export const RATE_LIMITED =
  'The Solana devnet RPC is rate-limiting this app right now. Wait a few seconds and try again.';

function errorText(error: unknown): string {
  return String((error as {message?: string})?.message ?? error);
}

/** True when the RPC answered "too many requests" (HTTP 429), as free public endpoints often do. */
export function isRateLimited(error: unknown): boolean {
  return /\b429\b|rate limit/i.test(errorText(error));
}

/** True when an error means the RPC could not be reached, not that a read failed. */
export function isChainDown(error: unknown): boolean {
  return isRateLimited(error) || /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|failed to get/i.test(errorText(error));
}

function chainDownMessage(error: unknown): string {
  return isRateLimited(error) ? RATE_LIMITED : CHAIN_DOWN;
}

/** A failed read of a supposed vault: either the RPC is down, or the address is not a vault. */
export function vaultReadError(error: unknown, address: string): ApiError {
  return isChainDown(error) ? new ApiError(chainDownMessage(error), 503) : new ApiError(`${address} is not a Folio vault on this cluster`, 404);
}

let cached: Connection | undefined;
export function connection(): Connection {
  cached ??= new Connection(process.env.SOLANA_RPC_URL || PUBLIC_RPC_URL, 'confirmed');
  return cached;
}

/** Parses a base58 address from a request, or throws a 400. */
export function parseKey(value: string | null | undefined, name: string): PublicKey {
  try {
    if (!value) throw new Error();
    return new PublicKey(value);
  } catch {
    throw new ApiError(`${name} must be a Solana address`, 400);
  }
}

/** Shapes any thrown value into a JSON Response, logging what is not an ApiError. */
export function errorResponse(error: unknown, route: string): Response {
  const headers = {'Cache-Control': 'no-store'};
  if (error instanceof ApiError) {
    return Response.json({error: error.message, details: error.details}, {status: error.status, headers});
  }
  if (isChainDown(error)) return Response.json({error: chainDownMessage(error)}, {status: 503, headers});
  console.error(`[${route}]`, error);
  return Response.json({error: 'Unexpected server error'}, {status: 500, headers});
}
