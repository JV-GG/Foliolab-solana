/**
 * Deployed contract addresses per chain. Part 1 fills in BSC mainnet (56) after deploying.
 *
 * 31337 is the local anvil chain set up by `scripts/dev-chain.sh`. A fresh anvil plus that
 * script always produces these same addresses, because deployment order is fixed.
 */
import type {Address} from 'viem';

export interface Deployment {
  registry: Address;
  factory: Address;
  usdt: Address;
}

export const DEPLOYMENTS: Partial<Record<number, Deployment>> = {
  31337: {
    registry: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    factory: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
  },
  56: {
    registry: '0x9262e9FA139113B32621581FD38250C7Da257ba7',
    factory: '0x4F0e39A8d9D3cB7a4D77B77aD310CC3969F15603',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
  },
};

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId];
}
