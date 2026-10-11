import {getAddress, isAddress} from 'viem';
import {ApiError, errorResponse} from '@/lib/chain/server';
import {fetchHistory} from '@/lib/history/server';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const vaultParam = searchParams.get('vault');
  const accountParam = searchParams.get('account');
  const limitParam = searchParams.get('limit');

  try {
    if (vaultParam && !isAddress(vaultParam)) {
      throw new ApiError('vault must be a valid Ethereum address', 400);
    }
    if (accountParam && !isAddress(accountParam)) {
      throw new ApiError('account must be a valid Ethereum address', 400);
    }

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

    const history = await fetchHistory({
      vault: vaultParam ? getAddress(vaultParam) : undefined,
      account: accountParam ? getAddress(accountParam) : undefined,
      limit,
    });

    return Response.json(history, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'api/history');
  }
}
