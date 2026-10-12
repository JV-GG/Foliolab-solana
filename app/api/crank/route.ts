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
    const force = url.searchParams.get('force') === 'true';
    const targetsParam = url.searchParams.get('targets');
    let customTargets = undefined;
    if (targetsParam) {
      try {
        customTargets = JSON.parse(targetsParam);
      } catch {}
    }
    const vault = await readVault(vaultParam);
    const recommendation = evaluateRebalance(vault, force, customTargets ?? vault.onChainTargets);
    return Response.json({
      vault: vault.address,
      state: vault.state,
      targets: customTargets ?? vault.onChainTargets ?? vault.targets,
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
    const force = body.force === true;
    const customTargets = Array.isArray(body.targets) ? body.targets : undefined;
    const result = await executeRebalanceCrank(vaultParam, keeper, force, customTargets);

    return Response.json({
      ok: true,
      trades: result.trades,
      message: result.message,
    });
  } catch (error) {
    return errorResponse(error, 'api/crank');
  }
}
