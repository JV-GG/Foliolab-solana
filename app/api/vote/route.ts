/**
 * /api/vote — Gasless Voting Sponsor Relayer for Folio Lab investors.
 *
 * Investors should not pay gas or account rent to exercise their governance rights.
 *
 * 1. GET /api/vote/sponsor  -> returns { sponsor: <publicKey> }
 * 2. POST /api/vote/prepare -> builds a sponsored transaction (rent covered + network fee paid by sponsor)
 *                              partially signs with sponsor, and returns { transaction: base64 }
 * 3. POST /api/vote/submit  -> receives investor-signed transaction, broadcasts to devnet, and confirms
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {ApiError, connection, errorResponse, parseKey} from '@/lib/chain/server';
import {folioProgram, positionPda, voteRecordPda} from '@/lib/solana/program';

function getSponsorKeypair(): Keypair {
  const secretKeyRaw = (process.env.KEEPER_SECRET_KEY || process.env.GUARDIAN_SECRET_KEY || process.env.FAUCET_SECRET_KEY)?.trim();
  if (!secretKeyRaw) {
    throw new ApiError('No sponsor keypair configured on server for gasless voting', 500);
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyRaw)));
}

export async function GET() {
  try {
    const sponsor = getSponsorKeypair();
    return Response.json({
      sponsor: sponsor.publicKey.toBase58(),
    });
  } catch (error) {
    return errorResponse(error, 'api/vote');
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || (body.signedTx ? 'submit' : 'prepare');
    const conn = connection();
    const sponsor = getSponsorKeypair();

    if (action === 'submit') {
      const {signedTx} = body;
      if (!signedTx) {
        throw new ApiError('Missing { signedTx } in request body', 400);
      }

      const txBuffer = Buffer.from(signedTx, 'base64');
      const tx = Transaction.from(txBuffer);

      // Verify that sponsor signature is intact or re-sign if needed
      if (!tx.verifySignatures()) {
        tx.partialSign(sponsor);
      }

      const raw = tx.serialize();
      const signature = await conn.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await conn.confirmTransaction(signature, 'confirmed');

      return Response.json({
        ok: true,
        signature,
      });
    }

    // Action === 'prepare': build gasless sponsored voting transaction
    const {vault: vaultParam, proposal: proposalParam, voter: voterParam, isYes} = body;
    if (!vaultParam || !proposalParam || !voterParam || typeof isYes !== 'boolean') {
      throw new ApiError('Missing vault, proposal, voter, or isYes in request body', 400);
    }

    const vault = parseKey(vaultParam, 'vault');
    const proposal = parseKey(proposalParam, 'proposal');
    const voter = parseKey(voterParam, 'voter');

    const program = folioProgram(conn);
    const voteRecord = voteRecordPda(proposal, voter);

    // Build the vote instruction
    const voteIx = await program.methods
      .vote(isYes)
      .accountsPartial({
        voter,
        vault,
        proposal,
        position: positionPda(vault, voter),
        voteRecord,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const bh = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({
      feePayer: sponsor.publicKey, // Sponsor pays the transaction network gas fee
      recentBlockhash: bh.blockhash,
    });

    // Sponsor funds 0.0015 SOL so the voter pays 0 SOL rent for voteRecord
    tx.add(
      SystemProgram.transfer({
        fromPubkey: sponsor.publicKey,
        toPubkey: voter,
        lamports: 1_500_000,
      }),
      voteIx,
    );

    // Sponsor signs as feePayer and rent transferrer
    tx.partialSign(sponsor);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return Response.json({
      ok: true,
      transaction: serialized.toString('base64'),
      sponsor: sponsor.publicKey.toBase58(),
    });
  } catch (error) {
    return errorResponse(error, 'api/vote');
  }
}
