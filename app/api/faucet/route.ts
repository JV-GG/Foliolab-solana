/**
 * POST /api/faucet  {account: <base58>} — devnet/localnet only.
 *
 * Returns a transaction that creates the wallet's mock-USDC account if needed and mints it
 * FAUCET_AMOUNT mock USDC. The server signs as the mint authority (FAUCET_SECRET_KEY); the wallet
 * pays the fee and signs last, so the faucet key needs no SOL. Refused on mainnet.
 */
import {Keypair, Transaction} from '@solana/web3.js';
import {createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {ApiError, connection, errorResponse, parseKey} from '@/lib/chain/server';
import {CLUSTER, deployment} from '@/lib/solana/config';
import {ata} from '@/lib/solana/program';

const FAUCET_AMOUNT = BigInt(1_000) * BigInt(1_000_000); // 1,000 USDC

export async function POST(request: Request) {
  try {
    if (CLUSTER === 'mainnet-beta') throw new ApiError('No faucet on mainnet', 403);
    const raw = process.env.FAUCET_SECRET_KEY?.trim();
    if (!raw) throw new ApiError('FAUCET_SECRET_KEY is not configured on this server', 500);
    const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    const body = (await request.json().catch(() => ({}))) as {account?: string};
    const account = parseKey(body.account, 'account');
    const usdc = parseKey(deployment().usdc, 'usdc');
    const target = ata(account, usdc, TOKEN_PROGRAM_ID);

    const conn = connection();
    const {blockhash, lastValidBlockHeight} = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({feePayer: account, blockhash, lastValidBlockHeight}).add(
      createAssociatedTokenAccountIdempotentInstruction(account, target, account, usdc, TOKEN_PROGRAM_ID),
      createMintToInstruction(usdc, target, faucet.publicKey, FAUCET_AMOUNT, [], TOKEN_PROGRAM_ID),
    );
    tx.partialSign(faucet);
    const serialized = tx.serialize({requireAllSignatures: false}).toString('base64');
    return Response.json({transaction: serialized, amount: FAUCET_AMOUNT.toString()}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/faucet');
  }
}
