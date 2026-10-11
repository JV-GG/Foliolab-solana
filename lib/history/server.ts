import {
  formatUnits,
  getAddress,
  isAddress,
  parseEventLogs,
  type Address,
  type Log,
} from 'viem';
import {publicClient} from '@/lib/chain/server';
import {folioVaultAbi, vaultFactoryAbi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import {resolveToken} from './tokenMetadata';
import type {
  ActivityItem,
  DepositActivity,
  HistoryResponse,
  PayoutToken,
  PlanActivity,
  RebalanceActivity,
  RedeemActivity,
  SeedActivity,
} from './types';

const MAX_BLOCK_RANGE = BigInt(45_000);

interface VaultInfo {
  address: Address;
  name: string;
  symbol: string;
}

/** Fetches names and symbols for vaults to label events */
async function getVaultsInfo(client: ReturnType<typeof publicClient>, specificVault?: Address): Promise<Map<string, VaultInfo>> {
  const map = new Map<string, VaultInfo>();

  let addresses: Address[] = [];
  if (specificVault) {
    addresses = [specificVault];
  } else {
    const chainId = await client.getChainId();
    const factory = process.env.FACTORY_ADDRESS || deploymentFor(chainId)?.factory;
    if (factory && isAddress(factory)) {
      try {
        const count = await client.readContract({address: factory, abi: vaultFactoryAbi, functionName: 'vaultCount'});
        addresses = await Promise.all(
          Array.from({length: Number(count)}, (_, i) =>
            client.readContract({address: factory, abi: vaultFactoryAbi, functionName: 'vaults', args: [BigInt(i)]}),
          ),
        );
      } catch {
        // Fallback or ignore
      }
    }
    const extra = (process.env.DEV_EXTRA_VAULTS ?? '').split(',').map((a) => a.trim()).filter((a) => isAddress(a)) as Address[];
    addresses = [...new Set([...addresses, ...extra])];
  }

  await Promise.all(
    addresses.map(async (addr) => {
      try {
        const [name, symbol] = await Promise.all([
          client.readContract({address: addr, abi: folioVaultAbi, functionName: 'name'}),
          client.readContract({address: addr, abi: folioVaultAbi, functionName: 'symbol'}),
        ]);
        map.set(addr.toLowerCase(), {address: addr, name, symbol});
      } catch {
        map.set(addr.toLowerCase(), {address: addr, name: 'Folio Vault', symbol: 'FOLIO'});
      }
    }),
  );

  return map;
}

export async function fetchHistory(options?: {
  vault?: Address;
  account?: Address;
  limit?: number;
}): Promise<HistoryResponse> {
  const client = publicClient();
  const latestBlock = await client.getBlockNumber();
  let minBlock = latestBlock > MAX_BLOCK_RANGE ? latestBlock - MAX_BLOCK_RANGE : BigInt(0);

  // When running on a local Anvil fork, local vault contracts only exist after the fork block.
  // Querying blocks before the fork forces Anvil to query the remote upstream RPC for 45k blocks, which hangs/times out.
  try {
    const meta = (await client.request({method: 'anvil_metadata'} as any)) as {
      forkedNetwork?: {forkBlockNumber?: number | string};
    };
    if (meta?.forkedNetwork?.forkBlockNumber != null) {
      const forkBlock = BigInt(meta.forkedNetwork.forkBlockNumber);
      if (forkBlock + BigInt(1) > minBlock) {
        minBlock = forkBlock + BigInt(1);
      }
    }
  } catch {
    // Not Anvil or anvil_metadata unsupported
  }

  const fromBlock = minBlock > latestBlock ? latestBlock : minBlock;

  const vaultsMap = await getVaultsInfo(client, options?.vault);
  const targetAddresses = Array.from(vaultsMap.values()).map((v) => v.address);

  if (targetAddresses.length === 0) {
    return {items: [], latestBlock: Number(latestBlock)};
  }

  let rawLogs: Log[] = [];
  try {
    rawLogs = await client.getLogs({
      address: targetAddresses.length === 1 ? targetAddresses[0] : targetAddresses,
      fromBlock,
      toBlock: latestBlock,
    });
  } catch (err) {
    console.error('Failed to query logs from chain:', err);
    return {items: [], latestBlock: Number(latestBlock)};
  }

  const parsed = parseEventLogs({
    abi: folioVaultAbi,
    logs: rawLogs,
  });

  // Collect unique block numbers to fetch timestamps in batch
  const blockNumbers = [...new Set(parsed.map((p) => p.blockNumber))];
  const blockTimestamps = new Map<bigint, number>();

  await Promise.all(
    blockNumbers.map(async (b) => {
      try {
        const blk = await client.getBlock({blockNumber: b});
        blockTimestamps.set(b, Number(blk.timestamp) * 1000);
      } catch {
        blockTimestamps.set(b, Date.now());
      }
    }),
  );

  const accountFilter = options?.account ? options.account.toLowerCase() : null;
  const items: ActivityItem[] = [];

  for (const log of parsed) {
    const vaultAddr = log.address.toLowerCase();
    const info = vaultsMap.get(vaultAddr) ?? {
      address: log.address,
      name: 'Folio Vault',
      symbol: 'FOLIO',
    };
    const timestamp = blockTimestamps.get(log.blockNumber) ?? Date.now();
    const txHash = log.transactionHash;
    const blockNumber = Number(log.blockNumber);
    const id = `${txHash}-${log.logIndex}`;

    if (log.eventName === 'Deposited') {
      const args = log.args as {investor: Address; amount: bigint; shares: bigint; vaultValue: bigint; priceTimestamp: bigint};
      if (accountFilter && args.investor.toLowerCase() !== accountFilter) continue;

      const item: DepositActivity = {
        id,
        type: 'deposit',
        vault: info.address,
        vaultName: info.name,
        vaultSymbol: info.symbol,
        txHash,
        blockNumber,
        timestamp,
        investor: args.investor,
        usdtAmount: formatUnits(args.amount, 18),
        sharesMinted: formatUnits(args.shares, 18),
        priceTimestamp: Number(args.priceTimestamp) * 1000,
      };
      items.push(item);
    } else if (log.eventName === 'Redeemed') {
      const args = log.args as {investor: Address; shares: bigint; assets: readonly Address[]; amounts: readonly bigint[]};
      if (accountFilter && args.investor.toLowerCase() !== accountFilter) continue;

      const payouts: PayoutToken[] = await Promise.all(
        args.assets.map(async (asset, idx) => {
          const meta = await resolveToken(client, asset);
          return {
            asset,
            symbol: meta.symbol,
            decimals: meta.decimals,
            amount: formatUnits(args.amounts[idx], meta.decimals),
          };
        }),
      );

      const item: RedeemActivity = {
        id,
        type: 'redeem',
        vault: info.address,
        vaultName: info.name,
        vaultSymbol: info.symbol,
        txHash,
        blockNumber,
        timestamp,
        investor: args.investor,
        sharesBurned: formatUnits(args.shares, 18),
        payouts,
      };
      items.push(item);
    } else if (log.eventName === 'Rebalanced') {
      // Rebalance is a vault-level trade; if user filtered by personal account, skip unless viewing all
      if (accountFilter) continue;

      const args = log.args as {sellToken: Address; buyToken: Address; sold: bigint; bought: bigint; planVersion: bigint};
      const [sellMeta, buyMeta] = await Promise.all([
        resolveToken(client, args.sellToken),
        resolveToken(client, args.buyToken),
      ]);

      const item: RebalanceActivity = {
        id,
        type: 'rebalance',
        vault: info.address,
        vaultName: info.name,
        vaultSymbol: info.symbol,
        txHash,
        blockNumber,
        timestamp,
        sellToken: args.sellToken,
        sellSymbol: sellMeta.symbol,
        sellAmount: formatUnits(args.sold, sellMeta.decimals),
        buyToken: args.buyToken,
        buySymbol: buyMeta.symbol,
        buyAmount: formatUnits(args.bought, buyMeta.decimals),
        planVersion: Number(args.planVersion),
      };
      items.push(item);
    } else if (log.eventName === 'PlanPosted') {
      if (accountFilter) continue;

      const args = log.args as {version: bigint; plan: string};
      const item: PlanActivity = {
        id,
        type: 'plan',
        vault: info.address,
        vaultName: info.name,
        vaultSymbol: info.symbol,
        txHash,
        blockNumber,
        timestamp,
        version: Number(args.version),
        planText: args.plan,
      };
      items.push(item);
    } else if (log.eventName === 'Seeded') {
      const args = log.args as {investor: Address; amount: bigint; shares: bigint};
      if (accountFilter && args.investor.toLowerCase() !== accountFilter) continue;

      const item: SeedActivity = {
        id,
        type: 'seed',
        vault: info.address,
        vaultName: info.name,
        vaultSymbol: info.symbol,
        txHash,
        blockNumber,
        timestamp,
        investor: args.investor,
        usdtAmount: formatUnits(args.amount, 18),
        sharesMinted: formatUnits(args.shares, 18),
      };
      items.push(item);
    }
  }

  // Sort newest first (descending by blockNumber, then logIndex)
  items.sort((a, b) => b.blockNumber - a.blockNumber || b.timestamp - a.timestamp);

  const limit = options?.limit ?? 50;
  return {
    items: items.slice(0, limit),
    latestBlock: Number(latestBlock),
  };
}
