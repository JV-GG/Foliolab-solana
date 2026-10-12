/**
 * POST /api/faucet  {account: <base58>} — devnet/localnet only.
 *
 * Mints FAUCET_AMOUNT mock USDC to the wallet, creating its USDC account if needed. The server signs
 * and pays as the mint authority (FAUCET_SECRET_KEY, which needs a little SOL), so the user's wallet
 * is not involved: wallets such as Phantom edit transactions before sending, which would void a
 * server signature. Refused on mainnet.
 */
import {Keypair, Transaction, sendAndConfirmTransaction} from '@solana/web3.js';
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
    if ((await conn.getBalance(faucet.publicKey)) < 5_000_000) {
      throw new ApiError('The test-USDC faucet is out of devnet SOL for fees. Ask the team to top it up.', 503);
    }
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, target, account, usdc, TOKEN_PROGRAM_ID),
      createMintToInstruction(usdc, target, faucet.publicKey, FAUCET_AMOUNT, [], TOKEN_PROGRAM_ID),
    );
    const signature = await sendAndConfirmTransaction(conn, tx, [faucet], {commitment: 'confirmed'});
    return Response.json({signature, amount: FAUCET_AMOUNT.toString()}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return errorResponse(error, 'api/faucet');
  }
}
