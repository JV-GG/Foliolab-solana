/**
 * GET /api/vaults[?account=<base58>]
 *
 * Every vault in the registry, newest first, with holdings valued at live prices for display. A
 * total of null means some holding has no price — show it as unavailable, not $0. With `account`,
 * each vault also carries that wallet's shares and their estimated value.
 */
import {errorResponse, parseKey} from '@/lib/chain/server';
import {listVaults} from '@/lib/vaults/read';

export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account');
  try {
    const vaults = await listVaults(account ? parseKey(account, 'account') : undefined);
    return Response.json({vaults}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults');
  }
}
