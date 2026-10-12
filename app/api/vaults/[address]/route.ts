/**
 * GET /api/vaults/<base58>[?account=<base58>]
 *
 * One vault: name, manager, state, raw share supply, plan, and each holding with its live price
 * and USD value. Amounts are raw base-unit strings; USD figures are display estimates only.
 */
import {errorResponse, parseKey} from '@/lib/chain/server';
import {readVault} from '@/lib/vaults/read';

export async function GET(request: Request, ctx: RouteContext<'/api/vaults/[address]'>) {
  const {address} = await ctx.params;
  const account = new URL(request.url).searchParams.get('account');
  try {
    const view = await readVault(address, account ? parseKey(account, 'account') : undefined);
    return Response.json(view, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults/[address]');
  }
}
