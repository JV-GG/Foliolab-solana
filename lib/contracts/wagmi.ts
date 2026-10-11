/**
 * Wallet configuration. The app targets one chain: BSC mainnet in production, the local anvil
 * (scripts/dev-chain.sh) in development. Override with NEXT_PUBLIC_CHAIN=bsc|local.
 */
import {createConfig, http} from 'wagmi';
import {bsc, foundry} from 'wagmi/chains';
import {injected} from 'wagmi/connectors';

const target = process.env.NEXT_PUBLIC_CHAIN ?? (process.env.NODE_ENV === 'production' ? 'bsc' : 'local');

/** The chain every read and transaction goes to. */
export const appChain = target === 'bsc' ? bsc : foundry;

/** What users see; viem calls the local chain "Foundry", which means nothing to them. */
export const appChainLabel = appChain.id === bsc.id ? 'BNB Smart Chain' : 'Local test chain';

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? (process.env.NODE_ENV === 'production' ? 'https://bsc-dataseed.bnbchain.org' : 'http://127.0.0.1:8545');

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: {[appChain.id]: http(rpcUrl)} as Record<typeof appChain.id, ReturnType<typeof http>>,
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
