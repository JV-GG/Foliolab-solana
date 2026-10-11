/**
 * Server-side chain access for Route Handlers. CHAIN_RPC_URL points at the local anvil in
 * development (.env.local) and at BSC in production; BSC_RPC_URL is the fallback.
 */
import {BaseError, HttpRequestError, TimeoutError, createPublicClient, http} from 'viem';

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
  'The blockchain node is not responding. Check CHAIN_RPC_URL (locally: is anvil running?) and try again.';

/** True when an error means the RPC node could not be reached, not that a call reverted. */
export function isChainDown(error: unknown): boolean {
  return error instanceof BaseError && Boolean(error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError));
}

/** A failed read of a supposed vault: either the node is down, or the address is not a vault. */
export function vaultReadError(error: unknown, address: string): ApiError {
  return isChainDown(error) ? new ApiError(CHAIN_DOWN, 503) : new ApiError(`${address} is not a Folio vault on this chain`, 404);
}

export function publicClient() {
  const url = process.env.CHAIN_RPC_URL || process.env.BSC_RPC_URL || (process.env.NODE_ENV === 'production' ? 'https://bsc-dataseed.bnbchain.org' : undefined);
  if (!url) throw new ApiError('CHAIN_RPC_URL is not configured', 500);
  return createPublicClient({transport: http(url)});
}

/** Shapes any thrown value into a JSON Response, logging what is not an ApiError. */
export function errorResponse(error: unknown, route: string): Response {
  const headers = {'Cache-Control': 'no-store'};
  if (error instanceof ApiError) {
    return Response.json({error: error.message, details: error.details}, {status: error.status, headers});
  }
  if (isChainDown(error)) return Response.json({error: CHAIN_DOWN}, {status: 503, headers});
  console.error(`[${route}]`, error);
  return Response.json({error: 'Unexpected server error'}, {status: 500, headers});
}
