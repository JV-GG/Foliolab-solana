import {describe, expect, it} from 'vitest';
import type {RwaToken} from '@/lib/binance/types';
import {divergenceBps, judgeQuote, tradeLossPercent, usdToUnits} from './rules';

const rules = {maxDivergenceBps: 200, requireOpenMarket: true};

function token(overrides: Partial<RwaToken> = {}): RwaToken {
  return {
    binanceChainId: '56',
    tokenContractAddress: '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4',
    platformId: 'ondo',
    tokenName: 'Apple (Ondo)',
    tokenSymbol: 'AAPLon',
    tokenLogoUrl: null,
    decimals: '18',
    underlyingTicker: 'AAPL',
    underlyingName: 'Apple',
    tokenToShareRatio: '1',
    tags: null,
    statusInfo: {
      openState: true,
      marketStatus: 'open',
      reasonCode: 'TRADING',
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    },
    tokenPrice: '338.73',
    referencePrice: '337.59',
    volume24H: null,
    marketCap: null,
    peRatioTTM: null,
    ...overrides,
  };
}

describe('usdToUnits', () => {
  it('scales to 18 decimals', () => {
    expect(usdToUnits('338.73', 18)).toBe(BigInt('338730000000000000000'));
  });

  it('scales to 6 decimals', () => {
    expect(usdToUnits('1.5', 6)).toBe(BigInt(1_500_000));
  });

  it('truncates digits beyond the token decimals', () => {
    expect(usdToUnits('540.9725761834783029483579315951393', 6)).toBe(BigInt(540_972_576));
  });

  it('handles whole numbers', () => {
    expect(usdToUnits('383', 18)).toBe(BigInt('383000000000000000000'));
  });

  it('rejects anything that is not a plain decimal', () => {
    expect(() => usdToUnits('1e3', 18)).toThrow();
    expect(() => usdToUnits('-5', 18)).toThrow();
    expect(() => usdToUnits('', 18)).toThrow();
  });
});

describe('divergenceBps', () => {
  it('measures the gap against the reference', () => {
    expect(divergenceBps(102, 100)).toBeCloseTo(200);
    expect(divergenceBps(98, 100)).toBeCloseTo(200);
  });
});

describe('judgeQuote', () => {
  it('accepts a trading token within the divergence limit', () => {
    expect(judgeQuote(token(), rules)).toEqual({ok: true, priceUsd: '338.73'});
  });

  it('refuses an unlisted token', () => {
    expect(judgeQuote(undefined, rules).ok).toBe(false);
  });

  it('refuses a closed market', () => {
    const closed = token({
      statusInfo: {...token().statusInfo!, openState: false, reasonCode: 'CLOSED', reasonMsg: 'weekend'},
    });
    const verdict = judgeQuote(closed, rules);
    expect(verdict).toEqual({ok: false, reason: 'market not trading (weekend)'});
  });

  it('allows a closed market when the rule is off', () => {
    const closed = token({statusInfo: {...token().statusInfo!, openState: false, reasonCode: 'CLOSED'}});
    expect(judgeQuote(closed, {...rules, requireOpenMarket: false}).ok).toBe(true);
  });

  it('refuses a missing or zero price', () => {
    expect(judgeQuote(token({tokenPrice: null}), rules).ok).toBe(false);
    expect(judgeQuote(token({tokenPrice: '0'}), rules).ok).toBe(false);
  });

  it('refuses a token that has drifted from its reference', () => {
    const verdict = judgeQuote(token({tokenPrice: '110', referencePrice: '100'}), rules);
    expect(verdict.ok).toBe(false);
  });

  it('accepts a token with no reference price', () => {
    expect(judgeQuote(token({referencePrice: null}), rules).ok).toBe(true);
  });
});

describe('tradeLossPercent', () => {
  const usdt = (n: number) => ({amount: BigInt(n) * BigInt(10) ** BigInt(18), decimals: 18, priceUsd: 1});

  it('is the share of value given up', () => {
    // 200 USDT for 0.5 of a $392 stock = $196, a 2% loss.
    expect(tradeLossPercent(usdt(200), {amount: BigInt(5e17), decimals: 18, priceUsd: 392})).toBeCloseTo(2);
  });

  it('is negative when the trade gains', () => {
    expect(tradeLossPercent(usdt(100), {amount: BigInt(1e18), decimals: 18, priceUsd: 101})).toBeCloseTo(-1);
  });

  it('flags a route that returns almost nothing', () => {
    expect(tradeLossPercent(usdt(200), {amount: BigInt(126344526547), decimals: 18, priceUsd: 541})).toBeGreaterThan(99);
  });
});
