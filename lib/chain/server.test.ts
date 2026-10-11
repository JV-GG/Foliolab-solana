import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {readVault} from '@/lib/vaults/read';
import {ApiError, CHAIN_DOWN, errorResponse} from './server';

// Nothing listens on port 1, so every RPC call fails to connect.
const DEAD_RPC = 'http://127.0.0.1:1';
const VAULT = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';

describe('when the chain node is down', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.CHAIN_RPC_URL;
    process.env.CHAIN_RPC_URL = DEAD_RPC;
  });
  afterEach(() => {
    process.env.CHAIN_RPC_URL = saved;
  });

  it('says the node is unreachable, not that the vault does not exist', async () => {
    const error = await readVault(VAULT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).message).toBe(CHAIN_DOWN);
  }, 30_000);
});

describe('errorResponse', () => {
  it('passes an ApiError through with its status', async () => {
    const res = errorResponse(new ApiError('nope', 418), 'test');
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({error: 'nope'});
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = errorResponse(new Error('secret internals'), 'test');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({error: 'Unexpected server error'});
  });
});
