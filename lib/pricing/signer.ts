/**
 * Builds and signs the EIP-712 `PriceUpdate` a vault's `deposit()` and `rebalance()` need.
 *
 * Server-only: reads PRICE_SIGNER_PRIVATE_KEY. Import from Route Handlers, never from a client
 * component. The backend supplies prices only — the contract multiplies them by its own
 * balances (spec §1), so this never tells the vault how much it holds.
 */
import {getAddress, isAddress, type Address, type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {getRwaTokens} from '@/lib/binance/queries';
import {ApiError, publicClient, vaultReadError} from '@/lib/chain/server';
import {assetRegistryAbi, erc20Abi, folioVaultAbi} from '@/lib/contracts/abis';
import {DEFAULT_MAX_DIVERGENCE_BPS, judgeQuote, usdToUnits, type PriceRules} from './rules';

/** The contract rejects anything older than this (AssetRegistry.MAX_PRICE_AGE). */
const MAX_PRICE_AGE_S = 60;
/** Backdates the timestamp so a server clock slightly ahead of the chain is not "in the future". */
const CLOCK_SKEW_S = 3;

export interface SignedPrices {
  update: {assets: Address[]; prices: string[]; timestamp: string};
  signature: Hex;
  /** Unix seconds after which the contract will reject this update. */
  expiresAt: number;
  quotes: {asset: Address; symbol: string; priceUsd: string}[];
}

function signer() {
  const raw = process.env.PRICE_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) throw new ApiError('PRICE_SIGNER_PRIVATE_KEY is not configured', 500);
  const key = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(key);
}

function rules(): PriceRules {
  const bps = Number(process.env.PRICE_MAX_DIVERGENCE_BPS);
  return {
    maxDivergenceBps: Number.isFinite(bps) && bps > 0 ? bps : DEFAULT_MAX_DIVERGENCE_BPS,
    requireOpenMarket: process.env.PRICE_REQUIRE_OPEN_MARKET !== 'false',
  };
}

/**
 * @param include Extra tokens to price, for a `rebalance` that buys a stock the vault does not
 *        hold yet. Each must be an approved asset in the registry.
 */
export async function signPricesForVault(vaultParam: string, include: string[] = []): Promise<SignedPrices> {
  if (!isAddress(vaultParam)) throw new ApiError('vault must be an address', 400);
  const vault = getAddress(vaultParam);
  for (const a of include) if (!isAddress(a)) throw new ApiError('include must be a list of addresses', 400);
  const account = signer();
  const client = publicClient();

  let held: readonly Address[];
  let registry: Address;
  let settlement: Address;
  try {
    [held, registry, settlement] = await Promise.all([
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'heldAssets'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'registry'}),
      client.readContract({address: vault, abi: folioVaultAbi, functionName: 'settlementToken'}),
    ]);
  } catch (error) {
    throw vaultReadError(error, vault);
  }

  const [chainId, onchainSigner, settlementDecimals] = await Promise.all([
    client.getChainId(),
    client.readContract({address: registry, abi: assetRegistryAbi, functionName: 'priceSigner'}),
    client.readContract({address: settlement, abi: erc20Abi, functionName: 'decimals'}),
  ]);
  if (getAddress(onchainSigner) !== account.address) {
    throw new ApiError(
      `This server signs as ${account.address}, but the registry expects ${onchainSigner}`,
      500,
    );
  }

  // USDT is valued at par by the contract and needs no price. The contract uses the first match
  // for an asset listed twice, so each appears once.
  const extra = include.map((a) => getAddress(a)).filter((a) => a !== getAddress(settlement));
  const allowed = await Promise.all(
    extra.map((a) => client.readContract({address: registry, abi: assetRegistryAbi, functionName: 'isAsset', args: [a]})),
  );
  const notAllowed = extra.filter((_, i) => !allowed[i]);
  if (notAllowed.length) throw new ApiError(`Not an approved asset: ${notAllowed.join(', ')}`, 400);
  const stocks = [...new Set([...held.map((a) => getAddress(a)), ...extra])].filter((a) => a !== getAddress(settlement));
  const quotes: SignedPrices['quotes'] = [];
  const prices: bigint[] = [];

  if (stocks.length > 0) {
    const listing = await getRwaTokens();
    if (!listing.ok) {
      throw new ApiError(`Live stock prices are unavailable right now, so deposits and trades are paused. (${listing.error})`, 503);
    }
    const bsc = new Map(
      listing.data
        .filter((t) => t.binanceChainId === '56')
        .map((t) => [t.tokenContractAddress.toLowerCase(), t]),
    );

    const refused: {asset: Address; reason: string}[] = [];
    for (const asset of stocks) {
      const token = bsc.get(asset.toLowerCase());
      const verdict = judgeQuote(token, rules());
      if (!verdict.ok) {
        refused.push({asset, reason: verdict.reason});
        continue;
      }
      prices.push(usdToUnits(verdict.priceUsd, settlementDecimals));
      quotes.push({asset: getAddress(asset), symbol: token!.tokenSymbol, priceUsd: verdict.priceUsd});
    }
    // One unpriced holding makes the contract revert anyway; refuse here with a reason instead.
    if (refused.length) {
      const which = refused.map((r) => `${bsc.get(r.asset.toLowerCase())?.tokenSymbol ?? r.asset}: ${r.reason}`).join('; ');
      throw new ApiError(`Some holdings have no safe price right now, so deposits and trades are paused. ${which}`, 503, refused);
    }
  }

  // The contract rejects a timestamp ahead of block.timestamp, so never sign past the chain's clock.
  let latest = await client.getBlock({blockTag: 'latest'});
  const now = BigInt(Math.floor(Date.now() / 1000) - CLOCK_SKEW_S);
  if (now - latest.timestamp > BigInt(5)) {
    try {
      await client.request({method: 'anvil_setIntervalMining' as any, params: [1] as any});
      await client.request({method: 'evm_mine' as any});
      latest = await client.getBlock({blockTag: 'latest'});
    } catch {
      // Non-anvil RPC or method unsupported; proceed normally
    }
  }
  const timestamp = now < latest.timestamp ? now : latest.timestamp;
  const assets = quotes.map((q) => q.asset);
  const signature = await account.signTypedData({
    domain: {name: 'Folio Lab', version: '1', chainId, verifyingContract: registry},
    types: {
      PriceUpdate: [
        {name: 'assets', type: 'address[]'},
        {name: 'prices', type: 'uint256[]'},
        {name: 'timestamp', type: 'uint64'},
      ],
    },
    primaryType: 'PriceUpdate',
    message: {assets, prices, timestamp},
  });

  return {
    update: {assets, prices: prices.map(String), timestamp: String(timestamp)},
    signature,
    expiresAt: Number(timestamp) + MAX_PRICE_AGE_S,
    quotes,
  };
}
