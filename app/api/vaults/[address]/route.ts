/**
 * GET /api/vaults/0x…
 *
 * One vault: name, manager, state, raw share supply, and each holding with its Binance price
 * and USD value. Amounts are raw base-unit strings; USD figures are display estimates only.
 */
import {errorResponse} from '@/lib/chain/server';
import {readVault} from '@/lib/vaults/read';

export async function GET(_request: Request, ctx: RouteContext<'/api/vaults/[address]'>) {
  const {address} = await ctx.params;
  try {
    return Response.json(await readVault(address), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults/[address]');
  }
}
