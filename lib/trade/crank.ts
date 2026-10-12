import {Keypair, PublicKey, sendAndConfirmTransaction, Transaction, ComputeBudgetProgram} from '@solana/web3.js';
import {ApiError, connection, parseKey} from '@/lib/chain/server';
import {readVault, type VaultView} from '@/lib/vaults/read';
import {buildTrade, REBALANCE_COMPUTE_UNITS} from '@/lib/trade/build';
import {formatSol} from '@/lib/domain/format';
import {signPricesForVault} from '@/lib/pricing/signer';
import {
  BN,
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
export function evaluateRebalance(vault: VaultView, ignoreCooldown: boolean = false): RebalanceRecommendation {
  if (vault.state !== 'ACTIVE') {
    return {eligible: false, reason: `Vault is ${vault.state}, not ACTIVE`};
  }
  if (!vault.targets || vault.targets.length === 0) {
    return {eligible: false, reason: 'No target weights configured'};
  }
  if (Number(vault.gasTankLamports) < KEEPER_FEE_LAMPORTS) {
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

  let mostOverweight = {asset: '', symbol: '', driftBps: 0, excessUsd: 0, decimals: 6};
  let mostUnderweight = {asset: '', symbol: '', driftBps: 0, deficitUsd: 0};

  for (const target of vault.targets) {
    const holding = vault.holdings.find((h) => h.asset === target.asset);
    const valueUsd = holding?.valueUsd ? Number(holding.valueUsd) : 0;
    const currentBps = Math.floor((valueUsd / totalValue) * 10000);
    const driftBps = currentBps - target.targetBps;

    if (driftBps > DRIFT_BAND_BPS && driftBps > mostOverweight.driftBps) {
      const excessUsd = ((driftBps - DRIFT_BAND_BPS) / 10000) * totalValue;
      mostOverweight = {
        asset: target.asset,
        symbol: target.symbol,
        driftBps,
        excessUsd,
        decimals: holding?.decimals ?? 6,
      };
    } else if (driftBps < -DRIFT_BAND_BPS && driftBps < mostUnderweight.driftBps) {
      const deficitUsd = ((Math.abs(driftBps) - DRIFT_BAND_BPS) / 10000) * totalValue;
      mostUnderweight = {
        asset: target.asset,
        symbol: target.symbol,
        driftBps,
        deficitUsd,
      };
    }
  }

  if (!mostOverweight.asset || !mostUnderweight.asset) {
    return {eligible: false, reason: 'All assets are within the ±1% target drift band'};
  }

  // Size trade to reduce drift without overshoot
  const tradeSizeUsd = Math.min(mostOverweight.excessUsd, mostUnderweight.deficitUsd);
  const holding = vault.holdings.find((h) => h.asset === mostOverweight.asset);
  const priceUsd = holding?.priceUsd ? Number(holding.priceUsd) : 1;
  const tokenAmount = tradeSizeUsd / priceUsd;
  const rawSellUnits = BigInt(Math.floor(tokenAmount * 10 ** mostOverweight.decimals)).toString();

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

/**
 * Executes a keeper-cranked rebalance transaction.
 */
export async function executeRebalanceCrank(vaultAddress: string, keeper: Keypair): Promise<{signature: string; sellAmount: string; buyMint: string}> {
  const conn = connection();
  const vaultPubkey = parseKey(vaultAddress, 'vault');
  const vaultView = await readVault(vaultAddress);
  const rec = evaluateRebalance(vaultView);

  if (!rec.eligible || !rec.overweightAsset || !rec.underweightAsset || !rec.suggestedSellAmount) {
    throw new ApiError(rec.reason ?? 'Vault does not require rebalancing at this time', 400);
  }

  const built = await buildTrade({
    vault: vaultAddress,
    sell: rec.overweightAsset,
    buy: rec.underweightAsset,
    amount: rec.suggestedSellAmount,
    slippage: '1',
  });

  const program = folioProgram(conn);
  const v = await program.account.vault.fetch(vaultPubkey);
  const registry = registryPda();
  const pricesJson = await signPricesForVault(vaultAddress, [rec.underweightAsset]);
  const priceArg = toPriceArg(pricesJson.update);
  const tokenPrograms = await tokenProgramsOf(conn, v.held);
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
      vault: vaultPubkey,
      router: new PublicKey(built.trade.router),
      sellMint: new PublicKey(rec.overweightAsset),
      buyMint: new PublicKey(rec.underweightAsset),
    })
    .remainingAccounts(remaining)
    .instruction();

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({units: REBALANCE_COMPUTE_UNITS}));
  tx.add(priceSignatureIx(pricesJson));
  tx.add(rebalanceIx);

  const signature = await sendAndConfirmTransaction(conn, tx, [keeper], {commitment: 'confirmed'});

  return {
    signature,
    sellAmount: built.trade.maxSell,
    buyMint: rec.underweightAsset,
  };
}
