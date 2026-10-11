'use client';

import {useReadContracts} from 'wagmi';
import type {Address} from 'viem';
import {erc20Abi} from '@/lib/contracts/abis';
import {shortAddress} from '@/lib/domain/format';

interface TokenIdentity {
  address?: Address;
  asset?: Address;
  symbol: string;
}

export function useTokenSymbols(tokens: TokenIdentity[]) {
  const contracts = tokens.map((token) => ({
    address: token.address ?? token.asset!,
    abi: erc20Abi,
    functionName: 'symbol' as const,
  }));
  const {data} = useReadContracts({
    contracts,
    query: {enabled: contracts.length > 0, staleTime: Infinity},
  });
  const onchain = new Map<string, string>();
  data?.forEach((result, index) => {
    if (result.status === 'success' && typeof result.result === 'string' && result.result.trim()) {
      const address = tokens[index].address ?? tokens[index].asset;
      if (address) onchain.set(address.toLowerCase(), result.result.trim());
    }
  });

  return (address: Address, fallback: string) => {
    const chainSymbol = onchain.get(address.toLowerCase());
    if (chainSymbol) return chainSymbol;
    if (fallback && !/^0x[0-9a-f]{8,}$/i.test(fallback)) return fallback;
    return shortAddress(address);
  };
}
