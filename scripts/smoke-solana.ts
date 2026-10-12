/**
 * End-to-end check of the API + program, the way the frontend will use them:
 * faucet → deposit (with /api/prices) → rebalance (with /api/trade + /api/prices) → redeem.
 *
 *   APP_URL=http://localhost:3000 CLUSTER=localnet npm run smoke:solana
 *
 * A fresh investor wallet is generated and airdropped (localnet) or funded by ADMIN_KEYPAIR
 * (devnet). The rebalance is signed by ADMIN_KEYPAIR, the demo vault's manager.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import {
  BN,
  ata,
  folioProgram,
  heldAccounts,
  positionPda,
  priceSignatureIx,
  registryPda,
  toPriceArg,
  tokenProgramsOf,
  type SignedPricesJson,
  ROUTER_PROGRAM_ID,
} from '../lib/solana/program';
import addresses from '../lib/solana/addresses.json';
import type {Deployment} from '../lib/solana/config';

const CLUSTER = process.env.CLUSTER ?? 'localnet';
const APP = process.env.APP_URL ?? 'http://localhost:3000';
const RPC =
  process.env.SOLANA_RPC_URL ?? (CLUSTER === 'localnet' ? 'http://127.0.0.1:8899' : 'https://api.devnet.solana.com');
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

const d = (addresses as Record<string, Deployment>)[CLUSTER];
const connection = new Connection(RPC, 'confirmed');
const program = folioProgram(connection);
const manager = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'))),
);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${APP}${url}`, init);
  const body = await res.json();
  if (!res.ok) throw new Error(`${url}: ${body.error ?? res.status}`);
  return body as T;
}

async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers, {commitment: 'confirmed'});
}

/** Prints a Solana Explorer link for a transaction, for the README's demo section. */
function link(step: string, signature: string) {
  const suffix = CLUSTER === 'localnet' ? `?cluster=custom&customUrl=${encodeURIComponent(RPC)}` : `?cluster=${CLUSTER}`;
  console.log(`  ${step}: https://explorer.solana.com/tx/${signature}${suffix}`);
}

async function main() {
  const vault = new PublicKey(d.vaults[0]);
  const usdc = new PublicKey(d.usdc);
  const investor = Keypair.generate();
  if (CLUSTER === 'localnet') {
    await connection.confirmTransaction(await connection.requestAirdrop(investor.publicKey, 1e9), 'confirmed');
  } else {
    await send([SystemProgram.transfer({fromPubkey: manager.publicKey, toPubkey: investor.publicKey, lamports: 30_000_000})], [manager]);
  }
  console.log(`investor ${investor.publicKey.toBase58()}`);

  // 1. Faucet: server partially signs as mint authority, wallet signs and pays.
  const faucet = await api<{transaction: string}>('/api/faucet', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({account: investor.publicKey.toBase58()}),
  });
  const ftx = Transaction.from(Buffer.from(faucet.transaction, 'base64'));
  ftx.partialSign(investor);
  const faucetSig = await connection.sendRawTransaction(ftx.serialize());
  await connection.confirmTransaction(faucetSig, 'confirmed');
  link('faucet', faucetSig);
  console.log('faucet ok:', (await connection.getTokenAccountBalance(ata(investor.publicKey, usdc, TOKEN_PROGRAM_ID))).value.uiAmountString, 'USDC');

  // 2. Deposit 50 USDC with fresh signed prices.
  const before = await program.account.vault.fetch(vault);
  const signed = await api<SignedPricesJson>(`/api/prices?vault=${vault.toBase58()}`);
  const programs = await tokenProgramsOf(connection, before.held);
  const deposit = await program.methods
    .deposit(new BN(50_000_000), new BN(1), toPriceArg(signed.update))
    .accountsPartial({
      investor: investor.publicKey,
      registry: registryPda(),
      vault,
      position: positionPda(vault, investor.publicKey),
      settlementMint: usdc,
      investorSettlement: ata(investor.publicKey, usdc, TOKEN_PROGRAM_ID),
      vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      instructions: SYSVAR_INSTRUCTIONS,
    })
    .remainingAccounts(heldAccounts(vault, before.held, programs))
    .instruction();
  link('deposit', await send([priceSignatureIx(signed), deposit], [investor]));
  const shares = (await program.account.position.fetch(positionPda(vault, investor.publicKey))).shares;
  console.log(`deposit ok: ${shares.toNumber() / 1e6} shares for 50 USDC`);

  // 3. Rebalance: manager buys NVDAx with 10 USDC via /api/trade.
  const nvda = d.tokens.find((t) => t.symbol === 'NVDAx')!;
  const built = await api<{trade: {maxSell: string; minBuy: string; routeData: string; routeAccounts: {pubkey: string; isSigner: boolean; isWritable: boolean}[]}; warnings: string[]}>(
    `/api/trade?vault=${vault.toBase58()}&sell=${usdc.toBase58()}&buy=${nvda.mint}&amount=10000000`,
  );
  if (built.warnings.length) console.log('trade warnings:', built.warnings);
  const tradePrices = await api<SignedPricesJson>(`/api/prices?vault=${vault.toBase58()}&include=${nvda.mint}`);
  const v = await program.account.vault.fetch(vault);
  const allPrograms = await tokenProgramsOf(connection, [...v.held, new PublicKey(nvda.mint)]);
  const nvdaProgram = allPrograms.get(nvda.mint)!;
  const rebalance = await program.methods
    .rebalance(new BN(built.trade.maxSell), new BN(built.trade.minBuy), Buffer.from(built.trade.routeData, 'base64'), toPriceArg(tradePrices.update))
    .accountsPartial({
      manager: manager.publicKey,
      registry: registryPda(),
      vault,
      sellMint: usdc,
      buyMint: new PublicKey(nvda.mint),
      vaultSell: ata(vault, usdc, TOKEN_PROGRAM_ID),
      vaultBuy: ata(vault, new PublicKey(nvda.mint), nvdaProgram),
      router: ROUTER_PROGRAM_ID,
      sellTokenProgram: TOKEN_PROGRAM_ID,
      buyTokenProgram: nvdaProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      instructions: SYSVAR_INSTRUCTIONS,
    })
    .remainingAccounts([
      ...heldAccounts(vault, v.held, allPrograms),
      ...built.trade.routeAccounts.map((a) => ({...a, pubkey: new PublicKey(a.pubkey)})),
    ])
    .instruction();
  link('rebalance', await send([ComputeBudgetProgram.setComputeUnitLimit({units: 400_000}), priceSignatureIx(tradePrices), rebalance], [manager]));
  console.log('rebalance ok: held', (await program.account.vault.fetch(vault)).held.length, 'assets');

  // 4. Redeem everything: create the investor's token accounts first.
  const after = await program.account.vault.fetch(vault);
  const finalPrograms = await tokenProgramsOf(connection, after.held);
  const createAtas = after.held.map((mint) => {
    const p = finalPrograms.get(mint.toBase58())!;
    return createAssociatedTokenAccountIdempotentInstruction(investor.publicKey, ata(investor.publicKey, mint, p), investor.publicKey, mint, p);
  });
  const redeem = await program.methods
    .redeem(shares, [])
    .accountsPartial({
      owner: investor.publicKey,
      vault,
      position: positionPda(vault, investor.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts(heldAccounts(vault, after.held, finalPrograms, investor.publicKey))
    .instruction();
  link('redeem', await send([...createAtas, redeem], [investor]));
  for (const mint of after.held) {
    const p = finalPrograms.get(mint.toBase58())!;
    const bal = await connection.getTokenAccountBalance(ata(investor.publicKey, mint, p));
    console.log(`  received ${bal.value.uiAmountString} ${d.tokens.find((t) => t.mint === mint.toBase58())?.symbol}`);
  }
  console.log('redeem ok\nSMOKE TEST PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
