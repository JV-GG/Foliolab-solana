import {describe, expect, it} from 'vitest';
import {PublicKey} from '@solana/web3.js';
import {PRICE_DOMAIN, priceMessage, registryPda, vaultPda} from './program';

describe('vaultPda', () => {
  it('derives the deployed demo vault (index 0)', () => {
    expect(vaultPda(0).toBase58()).toBe('67rk8UrKidmPj9ajLKbsX7qyHdgzhqxD9EGyUrgNUN39');
  });
});

describe('priceMessage', () => {
  it('lays out domain, registry, timestamp, count and (mint, price) pairs little-endian', () => {
    const mint = new PublicKey('AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ');
    const registry = registryPda();
    const m = priceMessage(registry, {mints: [mint], prices: ['255000000'], timestamp: '1791787633'});
    expect(m.length).toBe(PRICE_DOMAIN.length + 32 + 8 + 1 + 40);
    const view = new DataView(m.buffer);
    let o = PRICE_DOMAIN.length;
    expect(new PublicKey(m.slice(o, o + 32)).equals(registry)).toBe(true);
    o += 32;
    expect(view.getBigInt64(o, true)).toBe(BigInt(1791787633));
    o += 8;
    expect(m[o]).toBe(1);
    o += 1;
    expect(new PublicKey(m.slice(o, o + 32)).equals(mint)).toBe(true);
    expect(view.getBigUint64(o + 32, true)).toBe(BigInt(255000000));
  });
});
