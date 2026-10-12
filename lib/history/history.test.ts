import {describe, expect, it} from 'vitest';
import {resolveToken} from './tokenMetadata';

describe('tokenMetadata', () => {
  it('shortens an unknown mint and gives it no decimals', () => {
    const meta = resolveToken('So11111111111111111111111111111111111111112');
    expect(meta.symbol).toBe('So11…1112');
    expect(meta.decimals).toBe(0);
  });
});
