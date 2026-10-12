/**
 * Builds the swap a manager passes to `rebalance(max_sell, min_buy, route_data, prices)`.
 *
 * Devnet/localnet: the route is a `mock_router.swap` instruction that fills at the live price less
 * a 0.3% fee. Mainnet (not built yet): a Jupiter `/swap-instructions` route with the vault PDA as
 * the user. Either way the route is opaque to the program; its balance, authority and 2% loss
 * checks at the signed prices are what make it safe. This module refuses what the program would
 * reject and fills in honest bounds. Signed prices come from `/api/prices?include=<buy mint>`.
 */
import {PublicKey} from '@solana/web3.js';
import {ApiError, connection, parseKey, vaultReadError} from '@/lib/chain/server';
import {displayPrices} from '@/lib/pricing/source';
import {MAX_TRADE_LOSS_BPS, tradeLossPercent} from '@/lib/pricing/rules';
import {
  BN,
  ata,
  folioProgram,
  poolPda,
  registryPda,
  routerProgram,
  tokenProgramsOf,
  vaultStateName,
  ROUTER_PROGRAM_ID,
} from '@/lib/solana/program';
import {CLUSTER, tokenByMint} from '@/lib/solana/config';

export const DEFAULT_SLIPPAGE_PERCENT = '1';
/** Compute units to request for the rebalance transaction (a mock swap uses well under this). */
export const REBALANCE_COMPUTE_UNITS = 400_000;
/** The mock router's fee, in basis points. */
const MOCK_FEE_BPS = BigInt(30);
const MAX_ASSETS = 10;

export interface RouteAccount {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/** Everything `rebalance` needs besides the signed prices. Amounts are raw base units. */
export interface TradeRequest {
  router: string;
  sellMint: string;
  buyMint: string;
  maxSell: string;
  minBuy: string;
  /** The router instruction's data, base64. */
  routeData: string;
  /** The router instruction's accounts in order, vault marked not signer. Append after the held accounts. */
  routeAccounts: RouteAccount[];
}

export interface BuiltTrade {
  trade: TradeRequest;
  quote: {
    expectedBuyAmount: string;
    slippagePercent: string;
    route: string[];
    /** Value the quote gives up at live prices, in percent; null when unpriced. */
    lossPercent: number | null;
  };
  computeUnits: number;
  /** Problems the program will reject on; shown, not thrown. */
  warnings: string[];
}

export interface TradeParams {
  vault: string;
  sell: string;
  buy: string;
  amount: string;
  slippage?: string;
}

function priceUnits(usd: string): bigint {
  const [whole, frac = ''] = usd.split('.');
  return BigInt(whole + frac.slice(0, 6).padEnd(6, '0'));
}

export async function buildTrade(params: TradeParams): Promise<BuiltTrade> {
  if (CLUSTER === 'mainnet-beta') throw new ApiError('Mainnet routing through Jupiter is not built yet', 501);
  const vault = parseKey(params.vault, 'vault');
  const sell = parseKey(params.sell, 'sell');
  const buy = parseKey(params.buy, 'buy');
  if (sell.equals(buy)) throw new ApiError('sell and buy must differ', 400);
  if (!/^[1-9]\d*$/.test(params.amount)) {
    throw new ApiError('amount must be a positive integer in the sell token’s base units', 400);
  }
  const slippage = params.slippage ?? DEFAULT_SLIPPAGE_PERCENT;
  const slippageBps = Math.round(Number(slippage) * 100);
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 500) {
    throw new ApiError('slippage must be a percentage between 0 and 5', 400);
  }
  const amountIn = BigInt(params.amount);

  const conn = connection();
  const program = folioProgram(conn);
  let v;
  try {
    v = await program.account.vault.fetch(vault);
  } catch (error) {
    throw vaultReadError(error, vault.toBase58());
  }
  const registry = await program.account.registry.fetch(registryPda());
  const usdc = registry.settlementMint.toBase58();
  const programs = await tokenProgramsOf(conn, [sell, buy]);
  const [sellInfo, buyInfo] = [tokenByMint(sell), tokenByMint(buy)];
  if (!sellInfo || !buyInfo) throw new ApiError('Unknown token on this cluster', 400);

  // Quote: both legs in USDC units per whole token.
  const live = await displayPrices([sell, buy].map((m) => m.toBase58()).filter((m) => m !== usdc));
  const priceOf = (mint: PublicKey) => (mint.toBase58() === usdc ? '1' : live.get(mint.toBase58()));
  const [sellUsd, buyUsd] = [priceOf(sell), priceOf(buy)];
  if (!sellUsd || !buyUsd) throw new ApiError(`No live price for ${!sellUsd ? sellInfo.symbol : buyInfo.symbol}`, 503);
  const expected =
    (amountIn * priceUnits(sellUsd) * BigInt(10) ** BigInt(buyInfo.decimals) * (BigInt(10_000) - MOCK_FEE_BPS)) /
    (priceUnits(buyUsd) * BigInt(10) ** BigInt(sellInfo.decimals) * BigInt(10_000));
  if (expected === BigInt(0)) throw new ApiError('Amount too small to buy anything', 400);
  const minBuy = (expected * BigInt(10_000 - slippageBps)) / BigInt(10_000);

  const pool = poolPda();
  const [sellProgram, buyProgram] = [programs.get(sell.toBase58())!, programs.get(buy.toBase58())!];
  const route = await routerProgram(conn)
    .methods.swap(new BN(amountIn.toString()), new BN(expected.toString()))
    .accountsPartial({
      user: vault,
      userSrc: ata(vault, sell, sellProgram),
      userDst: ata(vault, buy, buyProgram),
      pool,
      poolSrc: ata(pool, sell, sellProgram),
      poolDst: ata(pool, buy, buyProgram),
      srcMint: sell,
      dstMint: buy,
      srcTokenProgram: sellProgram,
      dstTokenProgram: buyProgram,
    })
    .instruction();

  const lossPercent = tradeLossPercent(
    {amount: amountIn, decimals: sellInfo.decimals, priceUsd: Number(sellUsd)},
    {amount: expected, decimals: buyInfo.decimals, priceUsd: Number(buyUsd)},
  );

  // Checks the program would fail on, as readable warnings.
  const warnings: string[] = [];
  const held = v.held.map((m) => m.toBase58());
  const state = vaultStateName(v.state as Record<string, unknown>);
  if (state !== 'Active') warnings.push(`The vault is ${state}; it can only trade while Active`);
  if (v.planVersion.isZero()) warnings.push('The curator must post a plan (set_plan) before the first trade');
  if (!registry.routers.some((r) => r.equals(ROUTER_PROGRAM_ID))) warnings.push('The router is not allowlisted in the registry');
  if (buy.toBase58() !== usdc && !registry.assets.some((a) => a.equals(buy))) warnings.push(`${buyInfo.symbol} is not an approved asset`);
  if (!held.includes(sell.toBase58())) warnings.push(`The vault does not hold ${sellInfo.symbol}`);
  else {
    const balance = await conn.getTokenAccountBalance(ata(vault, sell, sellProgram)).catch(() => null);
    if (balance && BigInt(balance.value.amount) < amountIn) {
      warnings.push(`The vault holds only ${balance.value.uiAmountString} ${sellInfo.symbol}`);
    }
  }
  if (!held.includes(buy.toBase58()) && held.length >= MAX_ASSETS) {
    warnings.push(`The vault already holds ${MAX_ASSETS} tokens; sell one out before buying another`);
  }
  if (lossPercent * 100 > MAX_TRADE_LOSS_BPS) {
    warnings.push(`This route loses ${lossPercent.toFixed(2)}%, over the vault's 2% cap; the program will reject it`);
  }

  return {
    trade: {
      router: ROUTER_PROGRAM_ID.toBase58(),
      sellMint: sell.toBase58(),
      buyMint: buy.toBase58(),
      maxSell: amountIn.toString(),
      minBuy: minBuy.toString(),
      routeData: Buffer.from(route.data).toString('base64'),
      // The vault cannot sign the transaction; the program signs for it inside the CPI.
      routeAccounts: route.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: k.pubkey.equals(vault) ? false : k.isSigner,
        isWritable: k.isWritable,
      })),
    },
    quote: {
      expectedBuyAmount: expected.toString(),
      slippagePercent: slippage,
      route: [`${sellInfo.symbol} → ${buyInfo.symbol} (mock router, 0.3% fee)`],
      lossPercent: Number.isFinite(lossPercent) ? lossPercent : null,
    },
    computeUnits: REBALANCE_COMPUTE_UNITS,
    warnings,
  };
}
