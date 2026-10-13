import {ApiError, errorResponse, parseKey} from '@/lib/chain/server';
import {getPickedTokens, savePickedTokens} from '@/lib/vaults/proposals';

export async function GET(
  _request: Request,
  {params}: {params: Promise<{address: string}>},
) {
  try {
    const {address} = await params;
    const vaultPk = parseKey(address, 'address');
    const tokens = getPickedTokens(vaultPk.toBase58()) ?? [];
    return Response.json({ok: true, vault: vaultPk.toBase58(), tokens});
  } catch (error) {
    return errorResponse(error, 'api/vaults/tokens/get');
  }
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{address: string}>},
) {
  try {
    const {address} = await params;
    const vaultPk = parseKey(address, 'address');
    const body = await request.json().catch(() => ({}));
    const tokens = Array.isArray(body.tokens) ? body.tokens.map(String) : [];
    if (tokens.length === 0) {
      throw new ApiError('Missing tokens array in body', 400);
    }
    savePickedTokens(vaultPk.toBase58(), tokens);
    return Response.json({ok: true, vault: vaultPk.toBase58(), tokens});
  } catch (error) {
    return errorResponse(error, 'api/vaults/tokens/post');
  }
}
