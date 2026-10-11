/**
 * Vault read model for display: on-chain balances valued at Binance prices.
 *
 * Display only — the contract never uses these numbers. A holding without a price is reported as
 * unavailable and makes the vault total unavailable too; it is never counted as $0 (PRD P07).
 */
import {formatUnits, getAddress, isAddress, type Address} from 'viem';
import {getRwaTokens} from '@/lib/binance/queries';
import {ApiError, isChainDown, publicClient, vaultReadError} from '@/lib/chain/server';
import {erc20Abi, folioVaultAbi, vaultFactoryAbi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';

export const VAULT_STATES = ['DRAFT', 'SEEDED', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;

export interface Holding {
  asset: Address;
  symbol: string;
  decimals: number;
  /** Raw base units. */
  amount: string;
  priceUsd: string | null;
  valueUsd: string | null;
}

export interface VaultView {
  address: Address;
  name: string;
  symbol: string;
  manager: Address;
  state: (typeof VAULT_STATES)[number];
  /** Raw shares, 18 decimals. */
  totalSupply: string;
  holdings: Holding[];
  totalValueUsd: string | null;
  sharePriceUsd: string | null;
  /** The curator's published plan, or null until one is posted on-chain. */
  plan: CuratorPlan | null;
  /** The requested account's stake, when an account was given. */
  position: {shares: string; valueUsd: string | null} | null;
  /** Unix ms when the prices were read. */
  pricedAt: number;
}

/** Free text, never enforced by the contract; every `setPlan` bumps the version. */
export interface CuratorPlan {
  version: number;
  text: string;
}

type PriceBook = Map<string, {symbol: string; price: string | null}>;

/**
 * FolioVault's plan getters (egg branch, 3a86e49). Not in `lib/contracts/abis.ts` until Part 1
 * regenerates it after the deploy; switch to `folioVaultAbi` then and delete this.
 */
export const vaultPlanAbi = [
  {type: 'function', name: 'plan', inputs: [], outputs: [{name: '', type: 'string'}], stateMutability: 'view'},
  {type: 'function', name: 'planVersion', inputs: [], outputs: [{name: '', type: 'uint64'}], stateMutability: 'view'},
] as const;

/** Null while no plan has been posted (version 0). */
export function toPlan(text: string, version: bigint): CuratorPlan | null {
  if (version === BigInt(0)) return null;
  return {version: Number(version), text};
}

/** Binance quotes for BSC, keyed by lowercase token address. Missing on API failure. */
async function priceBook(): Promise<PriceBook> {
  const listing = await getRwaTokens();
  if (!listing.ok) return new Map();
  return new Map(
    listing.data
      .filter((t) => t.binanceChainId === '56')
      .map((t) => [t.tokenContractAddress.toLowerCase(), {symbol: t.tokenSymbol, price: t.tokenPrice}]),
  );
}

export async function readVault(vaultParam: string, account?: Address, prices?: PriceBook): Promise<VaultView> {
  if (!isAddress(vaultParam)) throw new ApiError('vault must be an address', 400);
  const address = getAddress(vaultParam);
  const client = publicClient();
  const v = {address, abi: folioVaultAbi} as const;

  let core;
  try {
    core = await Promise.all([
      client.readContract({...v, functionName: 'name'}),
      client.readContract({...v, functionName: 'symbol'}),
      client.readContract({...v, functionName: 'manager'}),
      client.readContract({...v, functionName: 'state'}),
      client.readContract({...v, functionName: 'totalSupply'}),
      client.readContract({...v, functionName: 'holdings'}),
      client.readContract({...v, functionName: 'settlementToken'}),
      account ? client.readContract({...v, functionName: 'balanceOf', args: [account]}) : null,
    ]);
  } catch (error) {
    throw vaultReadError(error, address);
  }
  const [name, symbol, manager, state, totalSupply, [assets, amounts], settlement, shares] = core;
  const book = prices ?? (await priceBook());

  const holdings: Holding[] = await Promise.all(
    assets.map(async (asset, i) => {
      const [decimals, onchainSymbol] = await Promise.all([
        client.readContract({address: asset, abi: erc20Abi, functionName: 'decimals'}),
        client.readContract({address: asset, abi: erc20Abi, functionName: 'symbol'}).catch(() => ''),
      ]);
      const isSettlement = getAddress(asset) === getAddress(settlement);
      const quote = book.get(asset.toLowerCase());
      const priceUsd = isSettlement ? '1' : (quote?.price ?? null);
      const units = Number(formatUnits(amounts[i], decimals));
      return {
        asset: getAddress(asset),
        symbol: isSettlement ? 'USDT' : quote?.symbol || onchainSymbol || `${asset.slice(0, 6)}…${asset.slice(-4)}`,
        decimals,
        amount: amounts[i].toString(),
        priceUsd,
        valueUsd: priceUsd === null ? null : String(units * Number(priceUsd)),
      };
    }),
  );

  let plan: CuratorPlan | null = null;
  try {
    const [text, version] = await Promise.all([
      client.readContract({address, abi: vaultPlanAbi, functionName: 'plan'}),
      client.readContract({address, abi: vaultPlanAbi, functionName: 'planVersion'}),
    ]);
    plan = toPlan(text, version);
  } catch (error) {
    if (isChainDown(error)) throw error;
    // Reverted: a vault deployed before setPlan existed has no plan getters.
  }

  // Zero balances need no price, matching the contract's own valuation.
  const priced = holdings.filter((h) => h.amount !== '0');
  const complete = priced.every((h) => h.valueUsd !== null);
  const total = complete ? priced.reduce((sum, h) => sum + Number(h.valueUsd), 0) : null;
  const supply = Number(formatUnits(totalSupply, 18));
  const sharePrice = total === null || supply === 0 ? null : total / supply;
  const position =
    shares === null
      ? null
      : {
          shares: shares.toString(),
          valueUsd: sharePrice === null ? null : String(Number(formatUnits(shares, 18)) * sharePrice),
        };

  return {
    address,
    name,
    symbol,
    manager,
    state: VAULT_STATES[state] ?? 'DRAFT',
    totalSupply: totalSupply.toString(),
    holdings,
    totalValueUsd: total === null ? null : String(total),
    sharePriceUsd: sharePrice === null ? null : String(sharePrice),
    plan,
    position,
    pricedAt: Date.now(),
  };
}

/** Every vault the factory created, newest first. */
export async function listVaults(account?: Address): Promise<VaultView[]> {
  const client = publicClient();
  const chainId = await client.getChainId();
  const factory = process.env.FACTORY_ADDRESS || deploymentFor(chainId)?.factory;
  if (!factory || !isAddress(factory)) {
    throw new ApiError(`No factory address for chain ${chainId}; set FACTORY_ADDRESS`, 500);
  }

  const count = await client.readContract({address: factory, abi: vaultFactoryAbi, functionName: 'vaultCount'});
  const addresses = await Promise.all(
    Array.from({length: Number(count)}, (_, i) =>
      client.readContract({address: factory, abi: vaultFactoryAbi, functionName: 'vaults', args: [BigInt(i)]}),
    ),
  );
  // Dev only: vaults deployed outside the factory. Comma-separated addresses.
  const extra = (process.env.DEV_EXTRA_VAULTS ?? '').split(',').map((a) => a.trim()).filter((a) => isAddress(a));
  const book = await priceBook();
  const vaults = await Promise.all([...addresses, ...extra].map((a) => readVault(a, account, book)));
  return vaults.reverse();
}
