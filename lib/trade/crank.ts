import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  ComputeBudgetProgram,
  Connection,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {ApiError, connection, parseKey} from '@/lib/chain/server';
import {readVault, type VaultView, type TargetWeight} from '@/lib/vaults/read';
import {buildTrade, REBALANCE_COMPUTE_UNITS} from '@/lib/trade/build';
import {formatSol} from '@/lib/domain/format';
import {signPricesForVault} from '@/lib/pricing/signer';
import {deployment} from '@/lib/solana/config';
import {
  BN,
  ata,
  folioProgram,
  heldAccounts,
  priceSignatureIx,
  registryPda,
  toPriceArg,
  tokenProgramsOf,
  DRIFT_BAND_BPS,
  KEEPER_FEE_LAMPORTS,
} from '@/lib/solana/program';

export interface RebalanceRecommendation {
  eligible: boolean;
  reason?: string;
  overweightAsset?: string;
  overweightSymbol?: string;
  underweightAsset?: string;
  underweightSymbol?: string;
  suggestedSellAmount?: string;
  maxDriftBps?: number;
}

/**
 * Calculates drift against target weights and identifies the optimal trade to rebalance.
 */
export function evaluateRebalance(
  vault: VaultView,
  ignoreCooldown: boolean = false,
  customTargets?: TargetWeight[],
): RebalanceRecommendation {
  if (vault.state !== 'ACTIVE') {
    return {eligible: false, reason: `Vault is ${vault.state}, not ACTIVE`};
  }
  const targets = (customTargets && customTargets.length > 0) ? customTargets : (vault.onChainTargets ?? vault.targets);
  if (!targets || targets.length === 0) {
    return {eligible: false, reason: 'No target weights configured'};
  }
  if (!ignoreCooldown && Number(vault.gasTankLamports) < KEEPER_FEE_LAMPORTS) {
    return {eligible: false, reason: `Gas tank has ${formatSol(vault.gasTankLamports)}; minimum ${formatSol(KEEPER_FEE_LAMPORTS)} required`};
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const cycleStart = vault.cycleStart ?? 0;
  const interval = vault.rebalanceIntervalSeconds ?? 43200;
  // If cycle was already started, check if within the 15-minute window or if 12h has elapsed
  if (!ignoreCooldown && cycleStart > 0 && nowSec > cycleStart + 900 && nowSec < cycleStart + interval) {
    const hoursLeft = Math.ceil((cycleStart + interval - nowSec) / 3600);
    return {eligible: false, reason: `Rebalance cycle cooldown active (~${hoursLeft}h remaining)`};
  }

  const totalValue = Number(vault.totalValueUsd);
  if (!totalValue || totalValue <= 0) {
    return {eligible: false, reason: 'Total vault value is 0 or unavailable'};
  }

  let mostOverweight = {asset: '', symbol: '', driftBps: 0, excessUsd: 0, decimals: 6, targetBps: 0};
  let mostUnderweight = {asset: '', symbol: '', driftBps: 0, deficitUsd: 0};
  const threshold = ignoreCooldown ? 0 : DRIFT_BAND_BPS;

  // Build a complete map of all candidate assets: targets + all non-zero holdings in vault
  const assetMap = new Map<string, {targetBps: number; symbol: string; decimals?: number; holding?: (typeof vault.holdings)[number]}>();

  for (const target of targets) {
    assetMap.set(target.asset, {
      targetBps: target.targetBps,
      symbol: target.symbol,
    });
  }

  for (const holding of vault.holdings) {
    if (BigInt(holding.amount) > BigInt(0)) {
      const existing = assetMap.get(holding.asset);
      if (existing) {
        existing.holding = holding;
        existing.decimals = holding.decimals;
      } else {
        assetMap.set(holding.asset, {
          targetBps: 0,
          symbol: holding.symbol,
          decimals: holding.decimals,
          holding,
        });
      }
    }
  }

  for (const [asset, item] of assetMap.entries()) {
    const holding = item.holding ?? vault.holdings.find((h) => h.asset === asset);
    const valueUsd = holding?.valueUsd ? Number(holding.valueUsd) : 0;
    const currentBps = Math.floor((valueUsd / totalValue) * 10000);
    const driftBps = currentBps - item.targetBps;

    if (driftBps > threshold && driftBps > mostOverweight.driftBps) {
      const excessUsd = (driftBps / 10000) * totalValue;
      mostOverweight = {
        asset,
        symbol: item.symbol,
        driftBps,
        excessUsd,
        decimals: holding?.decimals ?? item.decimals ?? 6,
        targetBps: item.targetBps,
      };
    } else if (driftBps < -threshold && driftBps < mostUnderweight.driftBps) {
      const deficitUsd = (Math.abs(driftBps) / 10000) * totalValue;
      mostUnderweight = {
        asset,
        symbol: item.symbol,
        driftBps,
        deficitUsd,
      };
    }
  }

  if (!mostOverweight.asset || !mostUnderweight.asset) {
    return {
      eligible: false,
      reason: ignoreCooldown
        ? 'All assets are already balanced at target weights'
        : 'All assets are within the ±1% target drift band',
    };
  }

  // Size trade to reduce drift without overshoot
  const tradeSizeUsd = Math.min(mostOverweight.excessUsd, mostUnderweight.deficitUsd);
  if (tradeSizeUsd <= 0) {
    return {eligible: false, reason: 'Calculated trade size is 0'};
  }
  const holding = vault.holdings.find((h) => h.asset === mostOverweight.asset);
  const priceUsd = holding?.priceUsd ? Number(holding.priceUsd) : 1;
  const tokenAmount = tradeSizeUsd / priceUsd;
  // If targetBps is 0 (completely liquidating this asset), sell 100% of holding.amount to avoid fractional dust
  const rawSellUnits =
    mostOverweight.targetBps === 0 && holding
      ? holding.amount
      : BigInt(Math.max(1, Math.floor(tokenAmount * 10 ** mostOverweight.decimals))).toString();

  return {
    eligible: true,
    overweightAsset: mostOverweight.asset,
    overweightSymbol: mostOverweight.symbol,
    underweightAsset: mostUnderweight.asset,
    underweightSymbol: mostUnderweight.symbol,
    suggestedSellAmount: rawSellUnits,
    maxDriftBps: Math.max(mostOverweight.driftBps, Math.abs(mostUnderweight.driftBps)),
  };
}

async function waitForTxConfirmation(
  conn: Connection,
  sig: string,
  lastValidBlockHeight: number,
  maxWaitMs: number = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await conn.getSignatureStatus(sig);
    if (status?.value?.err) {
      throw new ApiError(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`, 400);
    }
    if (
      status?.value?.confirmationStatus === 'confirmed' ||
      status?.value?.confirmationStatus === 'finalized'
    ) {
      return;
    }
    const currentBlockHeight = await conn.getBlockHeight('confirmed').catch(() => 0);
    if (currentBlockHeight > lastValidBlockHeight) {
      throw new ApiError('Transaction expired before confirmation', 408);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function sendRebalanceTx(
  conn: Connection,
  keeper: Keypair,
  instructions: TransactionInstruction[],
  altAddress?: string,
): Promise<string> {
  const bh = await conn.getLatestBlockhash('confirmed');
  let txToSimulate: VersionedTransaction | Transaction;
  const effectiveAltAddress = altAddress || deployment().lookupTable;

  if (effectiveAltAddress) {
    const altAccount = (await conn.getAddressLookupTable(new PublicKey(effectiveAltAddress))).value;
    if (altAccount) {
      const messageV0 = new TransactionMessage({
        payerKey: keeper.publicKey,
        recentBlockhash: bh.blockhash,
        instructions,
      }).compileToV0Message([altAccount]);
      const txV0 = new VersionedTransaction(messageV0);
      txV0.sign([keeper]);
      txToSimulate = txV0;
    } else {
      const tx = new Transaction().add(...instructions);
      tx.recentBlockhash = bh.blockhash;
      tx.feePayer = keeper.publicKey;
      tx.sign(keeper);
      txToSimulate = tx;
    }
  } else {
    const tx = new Transaction().add(...instructions);
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = keeper.publicKey;
    tx.sign(keeper);
    txToSimulate = tx;
  }

  // Pre-simulate locally to detect on-chain contract reverts with clear messages
  const sim = await conn.simulateTransaction(txToSimulate as any);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const revertMsg = logs.find((l) => l.includes('Error Message:'));
    if (revertMsg) {
      const cleanMsg = revertMsg.replace(/^.*Error Message:\s*/, '').trim();
      if (cleanMsg.includes('RebalanceTooSoon') || cleanMsg.includes('last 12 hours')) {
        throw new ApiError(
          'Rebalance cycle cooldown active: On-chain rules require 12 hours between autonomous keeper cycles. The vault manager can execute manual rebalancing directly via connected wallet.',
          429,
        );
      }
      throw new ApiError(`Rebalance transaction reverted: ${cleanMsg}`, 400);
    }
    throw new ApiError(`Simulation failed: ${JSON.stringify(sim.value.err)}`, 400);
  }

  try {
    let sig: string;
    if (txToSimulate instanceof VersionedTransaction) {
      sig = await conn.sendTransaction(txToSimulate, {skipPreflight: true});
    } else {
      sig = await conn.sendRawTransaction(txToSimulate.serialize(), {skipPreflight: true});
    }
    await waitForTxConfirmation(conn, sig, bh.lastValidBlockHeight);
    return sig;
  } catch (sendErr: any) {
    if (sendErr instanceof ApiError) throw sendErr;
    const logs = sendErr?.logs || sendErr?.transactionLogs;
    if (logs && Array.isArray(logs)) {
      const revertMsg = logs.find((l: string) => l.includes('Error Message:'));
      if (revertMsg) {
        const cleanMsg = revertMsg.replace(/^.*Error Message:\s*/, '').trim();
        if (cleanMsg.includes('RebalanceTooSoon') || cleanMsg.includes('last 12 hours')) {
          throw new ApiError(
            'Rebalance cycle cooldown active: On-chain rules require 12 hours between autonomous keeper cycles. The vault manager can execute manual rebalancing directly via connected wallet.',
            429,
          );
        }
        throw new ApiError(`Rebalance transaction reverted: ${cleanMsg}`, 400);
      }
    }
    throw sendErr;
  }
}

export interface CrankTradeResult {
  signature: string;
  sellAmount: string;
  buyMint: string;
  symbol?: string;
}

/**
 * Executes a keeper-cranked rebalance cycle, rebalancing all assets according to percentage.
 */
export async function executeRebalanceCrank(
  vaultAddress: string,
  keeper: Keypair,
  force: boolean = false,
  customTargets?: TargetWeight[],
): Promise<{trades: CrankTradeResult[]; message?: string}> {
  const conn = connection();
  const vaultPubkey = parseKey(vaultAddress, 'vault');
  const d = deployment();
  const altAddress = d.lookupTable;
  const executedTrades: CrankTradeResult[] = [];

  // Execute up to 6 rebalancing steps so all holdings can be liquidated in 1 click
  const maxSteps = customTargets ? 6 : 4;
  for (let step = 0; step < maxSteps; step++) {
    const vaultView = await readVault(vaultAddress);
    const rec = evaluateRebalance(vaultView, force || step > 0, customTargets);
    if (!rec.eligible || !rec.overweightAsset || !rec.underweightAsset || !rec.suggestedSellAmount) {
      break;
    }
    // If trade amount is negligible dust and not custom liquidating, stop to save gas fees
    if (!customTargets && BigInt(rec.suggestedSellAmount) < BigInt(10_000)) {
      break;
    }

    const built = await buildTrade({
      vault: vaultAddress,
      sell: rec.overweightAsset,
      buy: rec.underweightAsset,
      amount: rec.suggestedSellAmount,
      slippage: '1',
    });

    const sell = new PublicKey(rec.overweightAsset);
    const buy = new PublicKey(rec.underweightAsset);
    const program = folioProgram(conn);
    const v = await program.account.vault.fetch(vaultPubkey);
    const pricesJson = await signPricesForVault(vaultAddress, [rec.underweightAsset]);
    const priceArg = toPriceArg(pricesJson.update);
    const tokenPrograms = await tokenProgramsOf(conn, [...v.held, buy]);
    const sellProgram = tokenPrograms.get(sell.toBase58())!;
    const buyProgram = tokenPrograms.get(buy.toBase58())!;
    const heldMetas = heldAccounts(vaultPubkey, v.held, tokenPrograms);

    const routeMetas = built.trade.routeAccounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: false,
      isWritable: a.isWritable,
    }));

    const remaining = [...heldMetas, ...routeMetas];

    const rebalanceIx = await program.methods
      .rebalance(
        new BN(built.trade.maxSell),
        new BN(built.trade.minBuy),
        Buffer.from(built.trade.routeData, 'base64'),
        priceArg,
      )
      .accountsPartial({
        keeper: keeper.publicKey,
        registry: registryPda(),
        vault: vaultPubkey,
        router: new PublicKey(built.trade.router),
        sellMint: sell,
        buyMint: buy,
        vaultSell: ata(vaultPubkey, sell, sellProgram),
        vaultBuy: ata(vaultPubkey, buy, buyProgram),
        sellTokenProgram: sellProgram,
        buyTokenProgram: buyProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(remaining)
      .instruction();

    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({units: REBALANCE_COMPUTE_UNITS}),
      priceSignatureIx(pricesJson),
      rebalanceIx,
    ];

    const signature = await sendRebalanceTx(conn, keeper, instructions, altAddress);
    executedTrades.push({
      signature,
      sellAmount: built.trade.maxSell,
      buyMint: rec.underweightAsset,
      symbol: rec.underweightSymbol,
    });
  }

  if (executedTrades.length === 0) {
    return {
      trades: [],
      message: 'Vault does not require rebalancing (all assets are within target weights)',
    };
  }

  return {trades: executedTrades};
}
