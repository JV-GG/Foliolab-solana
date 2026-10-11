/**
 * GET /api/trade?vault=0x…&sell=0x…&buy=0x…&amount=…[&slippage=1]
 *
 * Builds a `TradeRequest` for `vault.rebalance(t)`: a Binance quote with the vault as the
 * trader, its router calldata, and the minimum the contract must receive. `amount` is in the
 * sell token's base units. Quotes go stale within seconds, so fetch right before signing.
 */
import {errorResponse} from '@/lib/chain/server';
import {buildTrade} from '@/lib/trade/build';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  try {
    const built = await buildTrade({
      vault: q.get('vault') ?? '',
      sell: q.get('sell') ?? '',
      buy: q.get('buy') ?? '',
      amount: q.get('amount') ?? '',
      slippage: q.get('slippage') ?? undefined,
    });
    return Response.json(built, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/trade');
  }
}
