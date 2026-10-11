/**
 * GET /api/prices?vault=0x…[&include=0x…,0x…]
 *
 * Returns a freshly signed PriceUpdate for every stock the vault holds, ready to pass to
 * `vault.deposit(amount, update, signature, minShares)` or `vault.rebalance(t, update, signature)`.
 * For a trade that buys a stock the vault does not hold yet, pass it in `include`. Valid for
 * 60 seconds, so fetch it right before sending. Amounts are strings (raw base units).
 */
import {errorResponse} from '@/lib/chain/server';
import {signPricesForVault} from '@/lib/pricing/signer';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const include = (q.get('include') ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  try {
    return Response.json(await signPricesForVault(q.get('vault') ?? '', include), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/prices');
  }
}
