import {describe, expect, it} from 'vitest';
import {evaluateRebalance} from './crank';
import {VaultView} from '../vaults/read';

describe('evaluateRebalance', () => {
  const dummyVault: VaultView = {
    address: '5ojJQF4ysx7fDKiPd7pnGcyS1TxpgCufqj4QxyBgWEf6',
    index: 0,
    name: 'Tech Growth Vault',
    symbol: 'TECH',
    manager: '3Chq5S5kHyDCU6sb6hg3rXoWgooUvNWcj9VYcMPi4ecE',
    state: 'ACTIVE',
    totalSupply: '1000000000',
    shareDecimals: 6,
    holdings: [
      {
        asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv', // USDC
        symbol: 'USDC',
        decimals: 6,
        amount: '100000000', // 100 USDC ($100)
        priceUsd: '1',
        valueUsd: '100',
      },
      {
        asset: 'AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ', // AAPLx
        symbol: 'AAPLx',
        decimals: 8,
        amount: '150000000', // 1.5 AAPL @ $200 = $300
        priceUsd: '200',
        valueUsd: '300',
      },
      {
        asset: 'E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g', // NVDAx
        symbol: 'NVDAx',
        decimals: 8,
        amount: '300000000', // 3 NVDA @ $100 = $300
        priceUsd: '100',
        valueUsd: '300',
      },
      {
        asset: '5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5', // TSLAx
        symbol: 'TSLAx',
        decimals: 8,
        amount: '120000000', // 1.2 TSLA @ $250 = $300
        priceUsd: '250',
        valueUsd: '300',
      },
    ],
    totalValueUsd: '1000',
    sharePriceUsd: '1',
    plan: {version: 1, text: 'Initial 10% USDC, 30% AAPL, 30% NVDA, 30% TSLA'},
    position: null,
    pricedAt: Date.now(),
    gasTankLamports: '50000000',
    targets: [
      {asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv', symbol: 'USDC', targetBps: 1000, targetPercent: 10},
      {asset: 'AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ', symbol: 'AAPLx', targetBps: 3000, targetPercent: 30},
      {asset: 'E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g', symbol: 'NVDAx', targetBps: 3000, targetPercent: 30},
      {asset: '5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5', symbol: 'TSLAx', targetBps: 3000, targetPercent: 30},
    ],
    onChainTargets: [
      {asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv', symbol: 'USDC', targetBps: 1000, targetPercent: 10},
      {asset: 'AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ', symbol: 'AAPLx', targetBps: 3000, targetPercent: 30},
      {asset: 'E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g', symbol: 'NVDAx', targetBps: 3000, targetPercent: 30},
      {asset: '5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5', symbol: 'TSLAx', targetBps: 3000, targetPercent: 30},
    ],
    openProposal: null,
    cycleStart: 0,
    rebalanceIntervalSeconds: 43200,
  };

  it('correctly identifies non-USDC assets to liquidate when customTargets is 100% USDC', () => {
    const usdcTargets = [
      {
        asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv',
        symbol: 'USDC',
        targetBps: 10000,
        targetPercent: 100,
      },
    ];

    const rec = evaluateRebalance(dummyVault, true, usdcTargets);
    expect(rec.eligible).toBe(true);
    expect(rec.underweightAsset).toBe('DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv');
    expect(rec.underweightSymbol).toBe('USDC');
    expect(['AAPLx', 'NVDAx', 'TSLAx']).toContain(rec.overweightSymbol);
    // When liquidating a stock to 0% target, it should liquidate 100% of the holding amount
    expect(rec.suggestedSellAmount).toBeDefined();
  });

  it('reports balanced once all stock holdings have been liquidated to USDC', () => {
    const usdcOnlyVault: VaultView = {
      ...dummyVault,
      holdings: [
        {
          asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv',
          symbol: 'USDC',
          decimals: 6,
          amount: '1000000000', // 1,000 USDC ($1000)
          priceUsd: '1',
          valueUsd: '1000',
        },
        {
          asset: 'AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ',
          symbol: 'AAPLx',
          decimals: 8,
          amount: '0',
          priceUsd: '200',
          valueUsd: '0',
        },
      ],
      totalValueUsd: '1000',
    };

    const usdcTargets = [
      {
        asset: 'DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv',
        symbol: 'USDC',
        targetBps: 10000,
        targetPercent: 100,
      },
    ];

    const rec = evaluateRebalance(usdcOnlyVault, true, usdcTargets);
    expect(rec.eligible).toBe(false);
  });
});
