/**
 * Shared Solana client for Folio Lab: program handles, PDAs, token accounts and the signed-price
 * instruction. Used by the setup script, the API routes and the browser, so it must not read any
 * secret. Program layout and rules: anchor/README.md.
 */
import {AnchorProvider, BN, Program, type Wallet} from '@anchor-lang/core';
import {
  Connection,
  Ed25519Program,
  PublicKey,
  type AccountMeta,
  type TransactionInstruction,
} from '@solana/web3.js';
import {getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import folioIdl from './idl/folio_vault.json';
import routerIdl from './idl/mock_router.json';
import type {FolioVault} from './idl/folio_vault';
import type {MockRouter} from './idl/mock_router';

export {BN};
export type {FolioVault, MockRouter};

export const FOLIO_PROGRAM_ID = new PublicKey(folioIdl.address);
export const ROUTER_PROGRAM_ID = new PublicKey(routerIdl.address);
export const PRICE_DOMAIN = new TextEncoder().encode('FOLIO_LAB_PRICES_V1');
export const MAX_PRICE_AGE_S = 60;
export const VAULT_STATES = ['Draft', 'Seeded', 'Active', 'Paused', 'Closed'] as const;
export type VaultStateName = (typeof VAULT_STATES)[number];

/** A wallet that cannot sign, for read-only program access (server reads, unconnected browser). */
const readOnlyWallet: Wallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error('read-only');
  },
  signAllTransactions: async () => {
    throw new Error('read-only');
  },
} as unknown as Wallet;

export function folioProgram(connection: Connection, wallet: Wallet = readOnlyWallet): Program<FolioVault> {
  const provider = new AnchorProvider(connection, wallet, {commitment: 'confirmed'});
  return new Program<FolioVault>(folioIdl as FolioVault, provider);
}

export function routerProgram(connection: Connection, wallet: Wallet = readOnlyWallet): Program<MockRouter> {
  const provider = new AnchorProvider(connection, wallet, {commitment: 'confirmed'});
  return new Program<MockRouter>(routerIdl as MockRouter, provider);
}

// ---- PDAs

export function registryPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('registry')], FOLIO_PROGRAM_ID)[0];
}

/** 8-byte little-endian integer. DataView, not Buffer: the browser's Buffer polyfill has no BigInt writers. */
function le64(value: bigint | string | number | BN, signed = false): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  const n = BigInt(value.toString());
  if (signed) view.setBigInt64(0, n, true);
  else view.setBigUint64(0, n, true);
  return out;
}

export function vaultPda(index: number | bigint | BN, registry = registryPda()): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), registry.toBuffer(), Buffer.from(le64(index))],
    FOLIO_PROGRAM_ID,
  )[0];
}

export function positionPda(vault: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), vault.toBuffer(), owner.toBuffer()],
    FOLIO_PROGRAM_ID,
  )[0];
}

export function poolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('pool')], ROUTER_PROGRAM_ID)[0];
}

export function proposalPda(vault: PublicKey, id: number | bigint | BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('proposal'), vault.toBuffer(), Buffer.from(le64(id))],
    FOLIO_PROGRAM_ID,
  )[0];
}

export function voteRecordPda(proposal: PublicKey, voter: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vote'), proposal.toBuffer(), voter.toBuffer()],
    FOLIO_PROGRAM_ID,
  )[0];
}

export const KEEPER_FEE_LAMPORTS = 20_000;
export const MIN_PROPOSAL_BOND_LAMPORTS = 50_000_000; // 0.05 SOL
export const DRIFT_BAND_BPS = 100; // 1%
export const QUORUM_BPS = 2_000; // 20%
export const TIMELOCK_SECONDS = 172_800; // 48h
export const REBALANCE_INTERVAL_SECONDS = 43_200; // 12h

// ---- token accounts

/** The token program that owns `mint` (legacy SPL Token or Token-2022). */
export async function tokenProgramOf(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID)) return info.owner;
  throw new Error(`${mint.toBase58()} is not a token mint`);
}

export async function tokenProgramsOf(connection: Connection, mints: PublicKey[]): Promise<Map<string, PublicKey>> {
  const infos = await connection.getMultipleAccountsInfo(mints);
  const out = new Map<string, PublicKey>();
  infos.forEach((info, i) => {
    if (!info) throw new Error(`Mint ${mints[i].toBase58()} not found`);
    out.set(mints[i].toBase58(), info.owner);
  });
  return out;
}

/** Associated token account of `owner` (a PDA is fine) for `mint` under `tokenProgram`. */
export function ata(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}

/**
 * remaining_accounts the program expects for each held mint, in `vault.held` order:
 * `[mint, vault_ata]`, plus `recipient_ata` when `recipient` is given (for `redeem`).
 */
export function heldAccounts(
  vault: PublicKey,
  held: PublicKey[],
  programs: Map<string, PublicKey>,
  recipient?: PublicKey,
): AccountMeta[] {
  return held.flatMap((mint) => {
    const program = programs.get(mint.toBase58());
    if (!program) throw new Error(`No token program for ${mint.toBase58()}`);
    const metas: AccountMeta[] = [
      {pubkey: mint, isSigner: false, isWritable: false},
      {pubkey: ata(vault, mint, program), isSigner: false, isWritable: true},
    ];
    if (recipient) metas.push({pubkey: ata(recipient, mint, program), isSigner: false, isWritable: true});
    return metas;
  });
}

// ---- signed prices

/** What the program's `PriceUpdate` argument looks like on the client. */
export interface PriceUpdateArg {
  mints: PublicKey[];
  prices: BN[];
  timestamp: BN;
}

/** JSON form returned by /api/prices (numbers as strings, bytes as base64). */
export interface SignedPricesJson {
  update: {mints: string[]; prices: string[]; timestamp: string};
  message: string;
  signature: string;
  signer: string;
  expiresAt: number;
}

/**
 * The exact bytes the price signer signs:
 * domain || registry || timestamp (i64 LE) || count (u8) || (mint || price u64 LE)*
 */
export function priceMessage(
  registry: PublicKey,
  update: {mints: (PublicKey | string)[]; prices: (bigint | string | BN)[]; timestamp: bigint | string | BN},
): Uint8Array {
  if (update.mints.length !== update.prices.length) throw new Error('mints and prices differ in length');
  if (update.mints.length > 255) throw new Error('too many prices');
  const out = new Uint8Array(PRICE_DOMAIN.length + 32 + 8 + 1 + update.mints.length * 40);
  let o = 0;
  out.set(PRICE_DOMAIN, o);
  o += PRICE_DOMAIN.length;
  out.set(registry.toBytes(), o);
  o += 32;
  out.set(le64(update.timestamp, true), o);
  o += 8;
  out[o] = update.mints.length;
  o += 1;
  update.mints.forEach((mint, i) => {
    out.set(new PublicKey(mint).toBytes(), o);
    o += 32;
    out.set(le64(update.prices[i]), o);
    o += 8;
  });
  return out;
}

export function toPriceArg(json: SignedPricesJson['update']): PriceUpdateArg {
  return {
    mints: json.mints.map((m) => new PublicKey(m)),
    prices: json.prices.map((p) => new BN(p)),
    timestamp: new BN(json.timestamp),
  };
}

/** The Ed25519 verify instruction that must sit directly before `deposit` / `rebalance`. */
export function priceSignatureIx(signed: SignedPricesJson): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: new PublicKey(signed.signer).toBytes(),
    message: Buffer.from(signed.message, 'base64'),
    signature: Buffer.from(signed.signature, 'base64'),
  });
}

/** `usd` like "231.45" → USDC base units (6 decimals), truncating extra digits. */
export function usdToUnits(usd: string | number, decimals = 6): bigint {
  const s = typeof usd === 'number' ? usd.toFixed(decimals) : usd.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Not a plain decimal: "${usd}"`);
  return BigInt(m[1] + (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0'));
}

export function vaultStateName(state: Record<string, unknown>): VaultStateName {
  const key = Object.keys(state)[0] ?? 'draft';
  return (key.charAt(0).toUpperCase() + key.slice(1)) as VaultStateName;
}
