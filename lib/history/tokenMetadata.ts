import {tokenByMint} from '@/lib/solana/config';

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

/** Symbol and decimals for a mint of this deployment; a shortened address for anything else. */
export function resolveToken(mint: string): TokenMeta {
  const info = tokenByMint(mint);
  if (info) return {symbol: info.symbol, decimals: info.decimals};
  return {symbol: `${mint.slice(0, 4)}…${mint.slice(-4)}`, decimals: 0};
}
