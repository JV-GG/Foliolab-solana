/**
 * GET /api/vaults[?account=0x…]
 *
 * Every vault the factory created, newest first, with holdings valued at Binance prices for
 * display. A total of null means some holding has no price — show it as unavailable, not $0.
 * With `account`, each vault also carries that wallet's shares and their estimated value.
 */
import {getAddress, isAddress} from 'viem';
import {ApiError, errorResponse} from '@/lib/chain/server';
import {listVaults} from '@/lib/vaults/read';

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account');
  try {
    if (account !== null && !isAddress(account)) throw new ApiError('account must be an address', 400);
    const vaults = await listVaults(account ? getAddress(account) : undefined);
    return Response.json({vaults}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults');
  }
}
