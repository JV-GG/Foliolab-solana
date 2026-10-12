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

const SIGNATURES_PER_VAULT = 40;

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
  // The program's coder uses the camelCase IDL, so events arrive as `planPosted`, `sellMint`, ...
  const parser = new EventParser(FOLIO_PROGRAM_ID, folioProgram(conn).coder);
  const vaults = await vaultsToScan(options?.vault);
  const names = new Map(vaults.map((v) => [v.address, v.name]));
  const account = options?.account ?? null;

  const signatures = (
    await Promise.all(vaults.map((v) => conn.getSignaturesForAddress(new PublicKey(v.address), {limit: SIGNATURES_PER_VAULT})))
  )
    .flat()
    .filter((s) => !s.err);
  const unique = [...new Map(signatures.map((s) => [s.signature, s])).values()];
  const txs = await conn.getTransactions(
    unique.map((s) => s.signature),
    {commitment: 'confirmed', maxSupportedTransactionVersion: 0},
  );

  const items: ActivityItem[] = [];
  txs.forEach((tx, t) => {
    if (!tx?.meta?.logMessages) return;
    const sig = unique[t].signature;
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
          if (account && key(d.investor) !== account) break;
          items.push({...base(vault, n), type: 'seed', investor: key(d.investor), usdtAmount: usd(d.amount), sharesMinted: usd(d.shares)});
          break;
        case 'deposited':
          if (account && key(d.investor) !== account) break;
          items.push({
            ...base(vault, n),
            type: 'deposit',
            investor: key(d.investor),
            usdtAmount: usd(d.amount),
            sharesMinted: usd(d.shares),
            priceTimestamp: Number(str(d.priceTimestamp)) * 1000,
          });
          break;
        case 'redeemed': {
          if (account && key(d.investor) !== account) break;
          const mints = (d.mints as PublicKey[]).map((m) => m.toBase58());
          const amounts = (d.amounts as unknown[]).map(str);
          items.push({
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
          if (account) break; // a vault-level trade, not the account's own action
          const [sell, buy] = [key(d.sellMint), key(d.buyMint)];
          items.push({
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
          if (account) break;
          items.push({...base(vault, n), type: 'plan', version: Number(str(d.version)), planText: String(d.plan)});
          break;
      }
    }
  });

  items.sort((a, b) => b.blockNumber - a.blockNumber || b.id.localeCompare(a.id));
  const limit = options?.limit ?? 50;
  return {items: items.slice(0, limit), latestBlock: await conn.getSlot()};
}
