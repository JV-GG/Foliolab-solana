/**
 * GET /api/history[?vault=<base58>][&account=<base58>][&limit=50]
 *
 * Recent vault activity (seed, deposit, redeem, rebalance, plan) decoded from the program's events.
 */
import {cached} from '@/lib/chain/cache';
import {errorResponse, parseKey} from '@/lib/chain/server';
import {fetchHistory} from '@/lib/history/server';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const vault = searchParams.get('vault');
  const account = searchParams.get('account');
  const limitParam = searchParams.get('limit');
  try {
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const options = {
      vault: vault ? parseKey(vault, 'vault').toBase58() : undefined,
      account: account ? parseKey(account, 'account').toBase58() : undefined,
      limit,
    };
    const history = await cached(`history:${options.vault ?? ''}:${options.account ?? ''}:${limit}`, 20_000, () =>
      fetchHistory(options),
    );
    return Response.json(history, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/history');
  }
}
