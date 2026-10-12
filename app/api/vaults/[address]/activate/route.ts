/**
 * POST /api/vaults/<base58>/activate — devnet/localnet demo helper.
 *
 * Activation is the guardian's job. So a judge's freshly seeded vault can go live without waiting
 * for us, the demo server holds a guardian key (GUARDIAN_SECRET_KEY) that can do nothing but
 * activate, pause and unpause. Refused on mainnet.
 */
import {Keypair, sendAndConfirmTransaction, Transaction} from '@solana/web3.js';
import {ApiError, connection, errorResponse, parseKey} from '@/lib/chain/server';
import {CLUSTER} from '@/lib/solana/config';
import {folioProgram, registryPda, vaultStateName} from '@/lib/solana/program';

export async function POST(_request: Request, props: {params: Promise<{address: string}>}) {
  const {address} = await props.params;
  try {
    if (CLUSTER === 'mainnet-beta') throw new ApiError('Vault activation must be submitted by the protocol guardian.', 403);
    const raw = process.env.GUARDIAN_SECRET_KEY?.trim();
    if (!raw) throw new ApiError('GUARDIAN_SECRET_KEY is not configured on this server', 500);
    const guardian = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    const vault = parseKey(address, 'vault');

    const conn = connection();
    const program = folioProgram(conn);
    const v = await program.account.vault.fetch(vault).catch(() => {
      throw new ApiError(`${vault.toBase58()} is not a Folio vault on this cluster`, 404);
    });
    const state = vaultStateName(v.state as Record<string, unknown>);
    if (state !== 'Seeded') throw new ApiError(`Vault is ${state}; it must be Seeded to activate`, 400);

    const ix = await program.methods.activate().accountsPartial({guardian: guardian.publicKey, registry: registryPda(), vault}).instruction();
    const signature = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [guardian], {commitment: 'confirmed'});
    return Response.json({ok: true, signature, vault: vault.toBase58()});
  } catch (error) {
    return errorResponse(error, 'api/vaults/[address]/activate');
  }
}
