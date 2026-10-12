/**
 * Which cluster the app talks to and the addresses deployed there. Safe in the browser.
 * `addresses.json` is written by `npm run setup:solana`.
 */
import {PublicKey} from '@solana/web3.js';
import addresses from './addresses.json';

export type Cluster = 'devnet' | 'localnet' | 'mainnet-beta';

export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  /** Ticker of the real stock this mock tracks, used to price it ("AAPL"). Absent for USDC. */
  underlying?: string;
}

export interface Deployment {
  registry: string;
  usdc: string;
  /** Mint authority of every mock token; the devnet faucet signs with it. */
  faucet: string;
  tokens: TokenInfo[];
  vaults: string[];
}

export const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as Cluster;

const DEFAULT_RPC: Record<Cluster, string> = {
  devnet: 'https://api.devnet.solana.com',
  localnet: 'http://127.0.0.1:8899',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC[CLUSTER];

export function deployment(cluster: Cluster = CLUSTER): Deployment {
  const d = (addresses as Record<string, Deployment | undefined>)[cluster];
  if (!d) throw new Error(`Folio Lab is not set up on ${cluster}: run npm run setup:solana`);
  return d;
}

export function tokenByMint(mint: string | PublicKey, cluster: Cluster = CLUSTER): TokenInfo | undefined {
  const key = typeof mint === 'string' ? mint : mint.toBase58();
  const d = (addresses as Record<string, Deployment | undefined>)[cluster];
  return d?.tokens.find((t) => t.mint === key);
}

export function explorerUrl(kind: 'tx' | 'address', value: string, cluster: Cluster = CLUSTER): string {
  const suffix =
    cluster === 'mainnet-beta'
      ? ''
      : cluster === 'localnet'
        ? `?cluster=custom&customUrl=${encodeURIComponent(DEFAULT_RPC.localnet)}`
        : `?cluster=${cluster}`;
  return `https://explorer.solana.com/${kind}/${value}${suffix}`;
}
