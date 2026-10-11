import {isAddress, getAddress} from 'viem';
import {ApiError, errorResponse, publicClient} from '@/lib/chain/server';
import {folioVaultAbi, assetRegistryAbi} from '@/lib/contracts/abis';

export async function POST(
  _request: Request,
  props: { params: Promise<{ address: string }> }
) {
  const { address } = await props.params;
  if (!address || !isAddress(address)) {
    return errorResponse(new ApiError('Invalid vault address', 400), 'api/vaults/[address]/activate');
  }

  const vault = getAddress(address);
  const rpc = process.env.CHAIN_RPC_URL || process.env.BSC_RPC_URL || 'http://127.0.0.1:8545';
  const isLocal = rpc.includes('127.0.0.1') || rpc.includes('localhost');

  if (!isLocal && process.env.NODE_ENV === 'production') {
    return errorResponse(new ApiError('Vault activation must be submitted directly by the protocol Guardian.', 403), 'api/vaults/[address]/activate');
  }

  try {
    const client = publicClient();
    const [regAddr, state] = await Promise.all([
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'registry'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'state'}),
    ]);

    if (state !== 1) { // 1 = SEEDED
      throw new ApiError(`Vault cannot be activated from current state (state: ${state}). Vault must be SEEDED first.`, 400);
    }

    const guardian = await client.readContract({address: regAddr, abi: assetRegistryAbi, functionName: 'guardian'});

    // On local Anvil fork, impersonate the guardian to execute activation
    await fetch(rpc, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'anvil_impersonateAccount', params: [guardian]}),
    });

    const activateTx = await fetch(rpc, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_sendTransaction',
        params: [{from: guardian, to: vault, data: '0x0f15f4c0', gas: '0x100000'}],
      }),
    }).then((r) => r.json());

    if (activateTx.error) {
      throw new ApiError(activateTx.error.message || 'Failed to activate vault on test chain', 500);
    }

    // Mine the block immediately so state updates right away
    await fetch(rpc, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 3, method: 'evm_mine'}),
    });

    return Response.json({ok: true, hash: activateTx.result, vault});
  } catch (err) {
    return errorResponse(err, 'api/vaults/[address]/activate');
  }
}
