/**
 * Activity history rebuilt from the program's Anchor events (`emit!` logs) in each vault's
 * recent transactions. No indexer: reads the last SIGNATURES_PER_VAULT transactions per vault.
 */
import {EventParser} from '@anchor-lang/core';
import {PublicKey} from '@solana/web3.js';
import {connection} from '@/lib/chain/server';
import {folioProgram, registryPda, vaultPda, FOLIO_PROGRAM_ID} from '@/lib/solana/program';
import {formatUnits} from '@/lib/domain/format';
import {resolveToken} from './tokenMetadata';
import type {ActivityItem, HistoryResponse} from './types';

const SIGNATURES_PER_VAULT = 15;
const CHUNK_SIZE = 4;

// Cache parsed activities by transaction signature to avoid re-querying immutable history
const txCache = new Map<string, ActivityItem[]>();

interface VaultInfo {
  address: string;
  name: string;
}

async function vaultsToScan(specific?: string): Promise<VaultInfo[]> {
  const program = folioProgram(connection());
  let addresses: PublicKey[];
  if (specific) {
    addresses = [new PublicKey(specific)];
  } else {
    const registry = await program.account.registry.fetchNullable(registryPda());
    const count = registry?.vaultCount.toNumber() ?? 0;
    addresses = Array.from({length: count}, (_, i) => vaultPda(i));
  }
  const accounts = await program.account.vault.fetchMultiple(addresses);
  return addresses.flatMap((a, i) => (accounts[i] ? [{address: a.toBase58(), name: accounts[i]!.name}] : []));
}

type EventData = Record<string, unknown> & {vault: PublicKey};
const str = (v: unknown) => (v as {toString(): string}).toString();
/** USDC amounts and shares both have 6 decimals. */
const usd = (v: unknown) => formatUnits(str(v), 6);
const key = (v: unknown) => (v as PublicKey).toBase58();

export async function fetchHistory(options?: {vault?: string; account?: string; limit?: number}): Promise<HistoryResponse> {
  const conn = connection();
  let latestBlock = 0;
  try {
    latestBlock = await conn.getSlot();
  } catch {
    // ignore slot error
  }

  let vaults: VaultInfo[] = [];
  try {
    vaults = await vaultsToScan(options?.vault);
  } catch (err) {
    console.warn('[history] vaultsToScan failed:', err);
    return {items: [], latestBlock};
  }

  const names = new Map(vaults.map((v) => [v.address, v.name]));
  const account = options?.account ?? null;

  let signatures: {signature: string; slot: number; blockTime?: number | null}[] = [];
  try {
    signatures = (
      await Promise.all(vaults.map((v) => conn.getSignaturesForAddress(new PublicKey(v.address), {limit: SIGNATURES_PER_VAULT})))
    )
      .flat()
      .filter((s) => !s.err);
  } catch (err) {
    console.warn('[history] getSignaturesForAddress failed:', err);
  }

  const unique = [...new Map(signatures.map((s) => [s.signature, s])).values()];
  unique.sort((a, b) => b.slot - a.slot);

  const limit = options?.limit ?? 50;
  const toFetch = unique.slice(0, limit).filter((s) => !txCache.has(s.signature));

  // Fetch uncached transactions in small chunks to avoid RPC 429 errors
  const parser = new EventParser(FOLIO_PROGRAM_ID, folioProgram(conn).coder);
  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    try {
      const txs = await conn.getTransactions(
        chunk.map((s) => s.signature),
        {commitment: 'confirmed', maxSupportedTransactionVersion: 0},
      );

      txs.forEach((tx, t) => {
        const sig = chunk[t].signature;
        if (!tx?.meta?.logMessages) {
          txCache.set(sig, []);
          return;
        }

        const txItems: ActivityItem[] = [];
        const base = (vault: string, n: number) => ({
          id: `${sig}:${n}`,
          vault,
          vaultName: names.get(vault) ?? 'Folio Vault',
          vaultSymbol: 'FOLIO',
          txHash: sig,
          blockNumber: tx.slot,
          timestamp: (tx.blockTime ?? 0) * 1000,
        });

        let n = 0;
        for (const event of parser.parseLogs(tx.meta.logMessages)) {
          const d = event.data as EventData;
          const vault = key(d.vault);
          if (!names.has(vault)) continue;
          n += 1;
          switch (event.name) {
            case 'seeded':
              txItems.push({...base(vault, n), type: 'seed', investor: key(d.investor), usdcAmount: usd(d.amount), sharesMinted: usd(d.shares)});
              break;
            case 'deposited':
              txItems.push({
                ...base(vault, n),
                type: 'deposit',
                investor: key(d.investor),
                usdcAmount: usd(d.amount),
                sharesMinted: usd(d.shares),
                priceTimestamp: Number(str(d.priceTimestamp)) * 1000,
              });
              break;
            case 'redeemed': {
              const mints = (d.mints as PublicKey[]).map((m) => m.toBase58());
              const amounts = (d.amounts as unknown[]).map(str);
              txItems.push({
                ...base(vault, n),
                type: 'redeem',
                investor: key(d.investor),
                sharesBurned: usd(d.shares),
                payouts: mints.map((asset, i) => {
                  const meta = resolveToken(asset);
                  return {asset, ...meta, amount: formatUnits(amounts[i], meta.decimals)};
                }),
              });
              break;
            }
            case 'rebalanced': {
              const [sell, buy] = [key(d.sellMint), key(d.buyMint)];
              txItems.push({
                ...base(vault, n),
                type: 'rebalance',
                sellToken: sell,
                sellSymbol: resolveToken(sell).symbol,
                sellAmount: formatUnits(str(d.sold), resolveToken(sell).decimals),
                buyToken: buy,
                buySymbol: resolveToken(buy).symbol,
                buyAmount: formatUnits(str(d.bought), resolveToken(buy).decimals),
                planVersion: Number(str(d.planVersion)),
              });
              break;
            }
            case 'planPosted':
              txItems.push({...base(vault, n), type: 'plan', version: Number(str(d.version)), planText: String(d.plan)});
              break;
          }
        }
        txCache.set(sig, txItems);
      });
    } catch (err) {
      console.warn('[history] Failed to fetch transaction chunk (rate-limited):', err);
      break;
    }
  }

  const allItems: ActivityItem[] = [];
  for (const s of unique) {
    const cached = txCache.get(s.signature);
    if (!cached) continue;
    for (const item of cached) {
      item.vaultName = names.get(item.vault) ?? item.vaultName;
      if (account) {
        if ('investor' in item && item.investor !== account) continue;
        if (item.type === 'rebalance' || item.type === 'plan') continue;
      }
      allItems.push(item);
    }
  }

  allItems.sort((a, b) => b.blockNumber - a.blockNumber || b.id.localeCompare(a.id));
  return {items: allItems.slice(0, limit), latestBlock};
}
