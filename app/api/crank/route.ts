/**
 * /api/crank — Permissionless autonomous keeper crank endpoint for Folio Lab index vaults.
 *
 * GET /api/crank?vault=<address>  -> checks target weights vs current holdings and drift
 * POST /api/crank { vault }       -> executes the rebalancing trade via keeper and reimburses 20,000 lamports from gas tank
 */
import {Keypair} from '@solana/web3.js';
import {ApiError, errorResponse, parseKey} from '@/lib/chain/server';
import {readVault} from '@/lib/vaults/read';
import {evaluateRebalance, executeRebalanceCrank} from '@/lib/trade/crank';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const vaultParam = url.searchParams.get('vault');
  if (!vaultParam) {
    return errorResponse(new ApiError('Missing ?vault= query parameter', 400), 'api/crank');
  }

  try {
    const vault = await readVault(vaultParam);
    const recommendation = evaluateRebalance(vault);
    return Response.json({
      vault: vault.address,
      state: vault.state,
      targets: vault.targets,
      gasTankLamports: vault.gasTankLamports,
      recommendation,
    });
  } catch (error) {
    return errorResponse(error, 'api/crank');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const vaultParam = body.vault;
    if (!vaultParam) {
      throw new ApiError('Missing { vault } in JSON body', 400);
    }

    const secretKeyRaw = (process.env.KEEPER_SECRET_KEY || process.env.GUARDIAN_SECRET_KEY)?.trim();
    if (!secretKeyRaw) {
      throw new ApiError('Neither KEEPER_SECRET_KEY nor GUARDIAN_SECRET_KEY is configured on server', 500);
    }

    const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyRaw)));
    const result = await executeRebalanceCrank(vaultParam, keeper);

    return Response.json({
      ok: true,
      signature: result.signature,
      sellAmount: result.sellAmount,
      buyMint: result.buyMint,
    });
  } catch (error) {
    return errorResponse(error, 'api/crank');
  }
}
