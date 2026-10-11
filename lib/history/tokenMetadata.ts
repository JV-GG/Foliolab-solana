import {getAddress, type Address, type PublicClient} from 'viem';
import {erc20Abi} from '@/lib/contracts/abis';

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

const KNOWN_TOKENS: Record<string, TokenMeta> = {
  '0x55d398326f99059ff775485246999027b3197955': {symbol: 'USDT', decimals: 18},
  '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4': {symbol: 'AAPLon', decimals: 18},
  '0xee5496460e42845eee9ebf9eb77b3b27b40974e7': {symbol: 'NVDAon', decimals: 18},
  '0x981a7b93666b69d5f66ad8a99a7707e77ba8b880': {symbol: 'AVGOon', decimals: 18},
  '0x9d54e4eb831b9e49ff383e2b2d6199d530a2cae0': {symbol: 'TSMon', decimals: 18},
  '0xb0f93fe9b9ff13cb21d51b8ab7b96b996765793e': {symbol: 'GOOGLon', decimals: 18},
  '0xc3af3a44c78f2b565259f89b2b6149d2ea09c0f3': {symbol: 'MSFTon', decimals: 18},
  '0xdcabb5eeec6c1b14d642be9e94a84d351f0a0f73': {symbol: 'AMZNon', decimals: 18},
  '0x787a9a403c9457223e752945d5a498d7b056d4d9': {symbol: 'AMDon', decimals: 18},
  '0xd8412fffa3c332c64188fafc708f22a0789b37e': {symbol: 'QQQon', decimals: 18},
  '0x7c98616147413697e012e4a7d0d9df2a838d745e': {symbol: 'SPYon', decimals: 18},
};

const cache = new Map<string, TokenMeta>();

export async function resolveToken(client: PublicClient, address: Address): Promise<TokenMeta> {
  const lower = address.toLowerCase();
  if (KNOWN_TOKENS[lower]) return KNOWN_TOKENS[lower];
  if (cache.has(lower)) return cache.get(lower)!;

  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({address, abi: erc20Abi, functionName: 'symbol'}),
      client.readContract({address, abi: erc20Abi, functionName: 'decimals'}),
    ]);
    const meta: TokenMeta = {symbol, decimals};
    cache.set(lower, meta);
    return meta;
  } catch {
    const fallback: TokenMeta = {
      symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
      decimals: 18,
    };
    cache.set(lower, fallback);
    return fallback;
  }
}
