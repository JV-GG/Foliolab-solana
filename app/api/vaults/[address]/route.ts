/**
 * GET /api/vaults/<base58>[?account=<base58>]
 *
 * One vault: name, manager, state, raw share supply, plan, and each holding with its live price
 * and USD value. Amounts are raw base-unit strings; USD figures are display estimates only.
 */
import {cached} from '@/lib/chain/cache';
import {errorResponse, parseKey} from '@/lib/chain/server';
import {readVault} from '@/lib/vaults/read';

export async function GET(request: Request, {params}: {params: Promise<{address: string}>}) {
  const {address} = await params;
  const account = new URL(request.url).searchParams.get('account');
  try {
    const owner = account ? parseKey(account, 'account') : undefined;
    const view = await cached(`vault:${address}:${owner?.toBase58() ?? ''}`, 5_000, () => readVault(address, owner));
    return Response.json(view, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/vaults/[address]');
  }
}
