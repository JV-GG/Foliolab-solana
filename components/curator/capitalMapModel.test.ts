import {describe, expect, it} from 'vitest';
import type {Holding} from '@/lib/contracts/hooks';
import {assetAssignments, assetColor, assetMix, generateIslandTerrain, sharePartsPerMillion, territoryCellCount} from './capitalMapModel';
import {allocateTerritories, type MapHolder} from './useIslandOverlay';

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const STOCK = '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4';

function holding(asset: string, amount: string, valueUsd: string | null): Holding {
  return {asset: asset as Holding['asset'], symbol: asset === USDT ? 'USDT' : 'AAPLon', decimals: 18, amount, priceUsd: valueUsd, valueUsd};
}

describe('capital map data rules', () => {
  it('calculates ownership from raw integer shares', () => {
    expect(sharePartsPerMillion('333333333333333333333', '1000000000000000000000')).toBe(BigInt(333_333));
    expect(territoryCellCount('333333333333333333333', '1000000000000000000000', 100)).toBe(33);
  });

  it('draws no tree territory for zero shares and no ratio without supply', () => {
    expect(territoryCellCount('0', '1000000000000000000000', 100)).toBe(0);
    expect(sharePartsPerMillion('0', '0')).toBeNull();
  });

  it('does not treat an unpriced non-zero asset as zero allocation', () => {
    expect(assetMix([holding(USDT, '100', '100'), holding(STOCK, '1', null)]).status).toBe('unpriced');
  });

  it('ignores zero balances when deciding whether the mix is complete', () => {
    expect(assetMix([holding(USDT, '100', '100'), holding(STOCK, '0', null)]).status).toBe('ready');
  });

  it('uses stable colors and preserves the pixel total', () => {
    const mix = assetMix([holding(USDT, '100', '75'), holding(STOCK, '100', '25')]);
    const first = assetAssignments(mix, 40, 'vault-a');
    const second = assetAssignments(mix, 40, 'vault-a');
    expect(first).toEqual(second);
    expect(first).toHaveLength(40);
    expect(first?.filter((color) => color === assetColor(USDT))).toHaveLength(30);
    expect(first?.filter((color) => color === assetColor(STOCK))).toHaveLength(10);
  });

  it('generates stable but distinct terrain from each vault address', () => {
    const first = generateIslandTerrain(USDT);
    const repeated = generateIslandTerrain(USDT);
    const second = generateIslandTerrain(STOCK);
    expect(first).toEqual(repeated);
    expect(first.land.length).toBeGreaterThan(200);
    expect(first.shallowWater.length).toBeGreaterThan(0);
    expect(first.land).not.toEqual(second.land);
    expect(new Set(first.land.map((cell) => cell.terrain))).toEqual(new Set(['sand', 'grass', 'forest', 'mountain']));
  });

  it('allocates exact visual-demo territory ratios from raw shares', () => {
    const holders: MapHolder[] = [
      {id: 'a', address: '0xa', label: 'A', shares: '50', valueUsd: null, current: true, kind: 'wallet'},
      {id: 'b', address: '0xb', label: 'B', shares: '30', valueUsd: null, current: false, kind: 'wallet'},
      {id: 'c', address: '0xc', label: 'C', shares: '20', valueUsd: null, current: false, kind: 'wallet'},
    ];
    const land = Array.from({length: 100}, (_, index) => index);
    const territories = allocateTerritories(land, holders, '100', 'demo-vault', 10);
    expect([...territories].filter((territory) => territory === 0)).toHaveLength(50);
    expect([...territories].filter((territory) => territory === 1)).toHaveLength(30);
    expect([...territories].filter((territory) => territory === 2)).toHaveLength(20);
  });
});
