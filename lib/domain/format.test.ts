import { describe, expect, test } from 'vitest';
import { floorToCents, money, pct, tokenAmount } from './format';

describe('money', () => {
  test('formats as US dollars with two decimals', () => {
    expect(money(10_000)).toBe('$10,000.00');
  });
});

describe('pct', () => {
  test('prefixes a gain with a plus sign', () => {
    expect(pct(5)).toBe('+5.00%');
  });

  test('keeps the minus sign on a loss', () => {
    expect(pct(-2.5)).toBe('-2.50%');
  });
});

describe('floorToCents', () => {
  test('rounds down rather than up, so max never exceeds the limit', () => {
    expect(floorToCents(99.999)).toBe('99.99');
  });
});

describe('tokenAmount', () => {
  test('formats 18-decimal amounts', () => {
    expect(tokenAmount('1500000000000000000', 18)).toBe('1.5');
    expect(tokenAmount('99999000000000000000', 18)).toBe('99.999');
  });

  test('truncates to the requested digits', () => {
    expect(tokenAmount('100123061335385592039', 18, 4)).toBe('100.123');
  });

  test('groups thousands and drops a zero fraction', () => {
    expect(tokenAmount('1234000000', 6)).toBe('1,234');
  });
});
