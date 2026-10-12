/**
 * Builds and signs the price update `deposit` and `rebalance` need (message format: anchor/README.md).
 *
 * Server-only: reads PRICE_SIGNER_SECRET_KEY. Import from Route Handlers, never from a client
 * component. The backend supplies prices only — the program multiplies them by its own balances,
 * so this never tells the vault how much it holds.
 */
import nacl from 'tweetnacl';
import {Keypair, PublicKey} from '@solana/web3.js';
import {ApiError, connection, parseKey, vaultReadError} from '@/lib/chain/server';
import {folioProgram, priceMessage, registryPda, MAX_PRICE_AGE_S, type SignedPricesJson} from '@/lib/solana/program';
import {usdToUnits} from './rules';
import {quoteMints, type Quote} from './source';

/** Backdates the timestamp so a server clock slightly ahead of the cluster is not "in the future". */
const CLOCK_SKEW_S = 3;

export interface SignedPrices extends SignedPricesJson {
  quotes: Quote[];
}

let signerCache: Keypair | undefined;
function signer(): Keypair {
  if (signerCache) return signerCache;
  const raw = process.env.PRICE_SIGNER_SECRET_KEY?.trim();
  if (!raw) throw new ApiError('PRICE_SIGNER_SECRET_KEY is not configured', 500);
  try {
    signerCache = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    throw new ApiError('PRICE_SIGNER_SECRET_KEY must be the JSON array from a solana-keygen file', 500);
  }
  return signerCache;
}

/**
 * @param include Extra mints to price, for a `rebalance` that buys a stock the vault does not
 *        hold yet. Each must be an approved asset in the registry.
 */
export async function signPricesForVault(vaultParam: string, include: string[] = []): Promise<SignedPrices> {
  const vault = parseKey(vaultParam, 'vault');
  const extra = include.map((m) => parseKey(m, 'include'));
  const key = signer();
  const program = folioProgram(connection());
  const registryAddress = registryPda();

  let held: PublicKey[];
  try {
    held = (await program.account.vault.fetch(vault)).held;
  } catch (error) {
    throw vaultReadError(error, vault.toBase58());
  }
  const registry = await program.account.registry.fetch(registryAddress);
  if (!registry.priceSigner.equals(key.publicKey)) {
    throw new ApiError(
      `This server signs as ${key.publicKey.toBase58()}, but the registry expects ${registry.priceSigner.toBase58()}`,
      500,
    );
  }
  const usdc = registry.settlementMint.toBase58();
  const allowed = new Set(registry.assets.map((a) => a.toBase58()));
  const notAllowed = extra.map((m) => m.toBase58()).filter((m) => m !== usdc && !allowed.has(m));
  if (notAllowed.length) throw new ApiError(`Not an approved asset: ${notAllowed.join(', ')}`, 400);

  // USDC is valued at par by the program and needs no price. Each mint appears once.
  const stocks = [...new Set([...held, ...extra].map((m) => m.toBase58()))].filter((m) => m !== usdc);
  const {quotes, refused} = await quoteMints(stocks);
  // One unpriced holding makes the program fail anyway; refuse here with a reason instead.
  if (refused.length) {
    const which = refused.map((r) => `${r.symbol}: ${r.reason}`).join('; ');
    throw new ApiError(`Some holdings have no safe price right now, so deposits and trades are paused. ${which}`, 503, refused);
  }

  const timestamp = String(Math.floor(Date.now() / 1000) - CLOCK_SKEW_S);
  const update = {
    mints: quotes.map((q) => q.mint),
    prices: quotes.map((q) => usdToUnits(q.priceUsd, 6).toString()),
    timestamp,
  };
  const message = priceMessage(registryAddress, update);
  const signature = nacl.sign.detached(message, key.secretKey);

  return {
    update,
    message: Buffer.from(message).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
    signer: key.publicKey.toBase58(),
    expiresAt: Number(timestamp) + MAX_PRICE_AGE_S,
    quotes,
  };
}
