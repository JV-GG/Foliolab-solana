import {describe, expect, it} from 'vitest';
import {toPlan} from './read';

describe('toPlan', () => {
  it('returns the text with its version', () => {
    expect(toPlan('60% AAPLon, 40% NVDAon', BigInt(2))).toEqual({version: 2, text: '60% AAPLon, 40% NVDAon'});
  });

  it('treats version 0 as no plan posted', () => {
    expect(toPlan('', BigInt(0))).toBeNull();
  });
});
