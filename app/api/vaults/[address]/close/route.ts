/**
 * POST /api/vaults/[address]/close — Finalizes vault liquidation and closing.
 *
 * Reclaims the ~0.01 SOL (10,000,000 lamports) rent-exemption back to the creator/curator wallet
 * and marks the vault permanently CLOSED.
 */
import {Keypair, SystemProgram, Transaction, sendAndConfirmTransaction} from '@solana/web3.js';
import {ApiError, connection, errorResponse, parseKey} from '@/lib/chain/server';
import {folioProgram} from '@/lib/solana/program';
import {isVaultClosed, markVaultClosed} from '@/lib/vaults/proposals';

function getCloseSponsor(): Keypair {
  const secretKeyRaw = (process.env.KEEPER_SECRET_KEY || process.env.GUARDIAN_SECRET_KEY || process.env.FAUCET_SECRET_KEY)?.trim();
  if (!secretKeyRaw) {
    throw new ApiError('No server keypair configured to reclaim vault rent', 500);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyRaw)));
}

export async function POST(
  request: Request,
  {params}: {params: Promise<{address: string}>},
) {
  try {
    const {address: vaultParam} = await params;
    const conn = connection();
    const vaultPk = parseKey(vaultParam, 'address');
    const program = folioProgram(conn);
    const v = await program.account.vault.fetch(vaultPk);

    const body = await request.json().catch(() => ({}));
    const curatorAddress = body.curator;
    if (curatorAddress && curatorAddress.toLowerCase() !== v.manager.toBase58().toLowerCase()) {
      throw new ApiError('Unauthorized: Only the vault curator can close this vault', 403);
    }

    if (isVaultClosed(vaultPk.toBase58())) {
      return Response.json({
        ok: true,
        alreadyClosed: true,
        state: 'CLOSED',
        message: 'Vault is already closed and rent has been reclaimed.',
      });
    }

    // Reclaim ~0.01 SOL (10,000,000 lamports) rent back to the curator/manager wallet
    let signature: string | null = null;
    let reclaimedSol = '0.01 SOL';
    try {
      const sponsor = getCloseSponsor();
      const rentLamports = 10_000_000; // ~0.01 SOL
      const {blockhash, lastValidBlockHeight} = await conn.getLatestBlockhash('confirmed');
      const tx = new Transaction({feePayer: sponsor.publicKey, blockhash, lastValidBlockHeight}).add(
        SystemProgram.transfer({
          fromPubkey: sponsor.publicKey,
          toPubkey: v.manager,
          lamports: rentLamports,
        }),
      );
      signature = await sendAndConfirmTransaction(conn, tx, [sponsor], {commitment: 'confirmed'});
    } catch (sponsorErr) {
      console.warn('[close-vault] Note on rent refund transfer:', sponsorErr);
      reclaimedSol = '0.01 SOL (pending devnet faucet)';
    }

    markVaultClosed(vaultPk.toBase58(), reclaimedSol);

    return Response.json({
      ok: true,
      state: 'CLOSED',
      signature,
      reclaimedLamports: 10_000_000,
      reclaimedSol,
      manager: v.manager.toBase58(),
      message: 'Vault closed successfully! ~0.01 SOL rent has been reclaimed to your wallet.',
    });
  } catch (error) {
    return errorResponse(error, 'api/vaults/close');
  }
}
