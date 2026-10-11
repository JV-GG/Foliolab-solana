import {describe, expect, it} from 'vitest';
import {createPublicClient, http} from 'viem';
import {resolveToken} from './tokenMetadata';
import {fetchHistory} from './server';

describe('tokenMetadata', () => {
  it('resolves known tokens synchronously from cache without network', async () => {
    const dummyClient = createPublicClient({transport: http('http://127.0.0.1:8545')});
    const usdt = await resolveToken(dummyClient, '0x55d398326f99059fF775485246999027B3197955');
    expect(usdt.symbol).toBe('USDT');
    expect(usdt.decimals).toBe(18);

    const aapl = await resolveToken(dummyClient, '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4');
    expect(aapl.symbol).toBe('AAPLon');
    expect(aapl.decimals).toBe(18);
  });
});

describe('fetchHistory', () => {
  it('handles query against running chain node', async () => {
    // If anvil is running, test fetching real logs
    if (process.env.CHAIN_RPC_URL) {
      const res = await fetchHistory({limit: 10});
      expect(Array.isArray(res.items)).toBe(true);
      expect(typeof res.latestBlock).toBe('number');
    }
  });
});
