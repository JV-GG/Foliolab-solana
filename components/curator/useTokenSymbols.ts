'use client';

import {shortAddress} from '@/lib/domain/format';
import {tokenByMint} from '@/lib/solana/config';

interface TokenIdentity {
  address?: string;
  asset?: string;
  symbol: string;
}

/** Symbol for a mint: this deployment's token list first, then the given fallback, then a short address. */
export function useTokenSymbols(_tokens: TokenIdentity[]) {
  return (address: string, fallback: string) => {
    const known = tokenByMint(address)?.symbol;
    if (known) return known;
    if (fallback && fallback !== address) return fallback;
    return shortAddress(address);
  };
}
