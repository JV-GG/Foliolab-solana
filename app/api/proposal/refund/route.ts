/**
 * POST /api/proposal/refund — Immediately refunds the 0.05 SOL governance proposal bond to the curator.
 *
 * When a curator proposes a strategy amendment on devnet, a 0.05 SOL bond is posted.
 * Once the rebalance is performed or the proposal cycle concludes, this endpoint refunds
 * the bond immediately to the curator's wallet so testing and demo flows remain frictionless.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {ApiError, connection, errorResponse, parseKey} from '@/lib/chain/server';
import {folioProgram} from '@/lib/solana/program';

import {isProposalClosed, markProposalClosed, adoptProposalStrategy} from '@/lib/vaults/proposals';

function getRefundSponsor(): Keypair {
  const secretKeyRaw = (process.env.KEEPER_SECRET_KEY || process.env.GUARDIAN_SECRET_KEY || process.env.FAUCET_SECRET_KEY)?.trim();
  if (!secretKeyRaw) {
    throw new ApiError('No server keypair configured to refund proposal bond', 500);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyRaw)));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {vault: vaultAddress, curator: curatorAddress, proposalId, approved, targets, plan} = body;

    if (!vaultAddress) {
      throw new ApiError('Missing { vault } in JSON body', 400);
    }

    if (isProposalClosed(vaultAddress, proposalId)) {
      return Response.json({
        ok: true,
        alreadyRefunded: true,
        message: 'Proposal bond was already refunded and concluded.',
      });
    }

    const conn = connection();
    const vaultPk = parseKey(vaultAddress, 'vault');
    const sponsor = getRefundSponsor();

    let recipient: PublicKey;
    if (curatorAddress) {
      recipient = parseKey(curatorAddress, 'curator');
    } else {
      const program = folioProgram(conn);
      const v = await program.account.vault.fetch(vaultPk);
      recipient = v.manager;
    }

    // Transfer 0.05 SOL (50,000,000 lamports) bond refund
    const refundLamports = 50_000_000;
    const {blockhash, lastValidBlockHeight} = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({feePayer: sponsor.publicKey, blockhash, lastValidBlockHeight}).add(
      SystemProgram.transfer({
        fromPubkey: sponsor.publicKey,
        toPubkey: recipient,
        lamports: refundLamports,
      }),
    );

    const signature = await sendAndConfirmTransaction(conn, tx, [sponsor], {commitment: 'confirmed'});
    if (approved && targets && Array.isArray(targets) && targets.length > 0) {
      adoptProposalStrategy(vaultAddress, targets, plan);
    }
    markProposalClosed(vaultAddress, proposalId);

    return Response.json({
      ok: true,
      signature,
      recipient: recipient.toBase58(),
      refundedLamports: refundLamports,
      refundedSol: '0.05 SOL',
    });
  } catch (error) {
    return errorResponse(error, 'api/proposal/refund');
  }
}
