'use client';

import {useQueryClient} from '@tanstack/react-query';
import {useConnection as useSolanaConnection} from '@solana/wallet-adapter-react';
import {ComputeBudgetProgram, PublicKey, SystemProgram} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {useCallback, useState} from 'react';
import {VAULTS_KEY} from '@/lib/contracts/hooks';
import {useConnection, useSendTransaction} from '@/lib/contracts/wallet';
import {HISTORY_KEY} from '@/lib/history/hooks';
import {
  BN,
  ata,
  folioProgram,
  heldAccounts,
  positionPda,
  priceSignatureIx,
  registryPda,
  toPriceArg,
  tokenProgramsOf,
  usdToUnits,
  vaultPda,
} from '@/lib/solana/program';
import type {SignedPrices, TradeQuote} from './model';
import type {VaultView} from '@/lib/vaults/read';

export type CuratorAction =
  | 'idle'
  | 'creating'
  | 'approving'
  | 'seeding'
  | 'activating'
  | 'publishing'
  | 'simulating'
  | 'rebalancing';

export type RebalanceStage = 'idle' | 'simulating' | 'wallet' | 'confirming' | 'confirmed';

export interface RebalanceResult {
  /** Transaction signature. */
  hash: string;
  simulatedSold: bigint;
  simulatedBought: bigint;
}

const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
const MIN_SEED = BigInt(10_000_000); // 10 USDC

export function useCuratorActions() {
  const {connection} = useSolanaConnection();
  const {address} = useConnection();
  const send = useSendTransaction();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<CuratorAction>('idle');

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({queryKey: [VAULTS_KEY]}),
        queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
      ]),
    [queryClient],
  );

  const requireWallet = useCallback((): PublicKey => {
    if (!address) throw new Error('Connect the curator wallet first.');
    return new PublicKey(address);
  }, [address]);

  const seedIx = useCallback(
    async (vault: PublicKey, investor: PublicKey, usdc: PublicKey, amount: bigint) =>
      folioProgram(connection)
        .methods.seed(new BN(amount.toString()))
        .accountsPartial({
          investor,
          vault,
          position: positionPda(vault, investor),
          settlementMint: usdc,
          investorSettlement: ata(investor, usdc, TOKEN_PROGRAM_ID),
          vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    [connection],
  );

  /** Creates the vault and seeds it in one transaction, so a vault is never left empty. */
  const createAndSeed = useCallback(
    async (name: string, _symbol: string, amountText: string): Promise<string> => {
      const curator = requireWallet();
      const amount = usdToUnits(amountText, 6);
      if (amount < MIN_SEED) throw new Error('The first deposit must be at least 10 USDC.');
      if (new TextEncoder().encode(name).length > 32) throw new Error('Vault names can be at most 32 bytes.');

      setAction('creating');
      try {
        const program = folioProgram(connection);
        const registry = registryPda();
        const r = await program.account.registry.fetch(registry);
        const vault = vaultPda(r.vaultCount, registry);
        const usdc = r.settlementMint;
        const create = await program.methods
          .createVault(name, curator)
          .accountsPartial({
            payer: curator,
            registry,
            vault,
            settlementMint: usdc,
            vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        setAction('seeding');
        await send([create, await seedIx(vault, curator, usdc, amount)]);
        await refresh();
        return vault.toBase58();
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, seedIx, send],
  );

  const seedExistingVault = useCallback(
    async (vaultAddress: string, amountText: string = '10'): Promise<void> => {
      const curator = requireWallet();
      const vault = new PublicKey(vaultAddress);
      setAction('seeding');
      try {
        const v = await folioProgram(connection).account.vault.fetch(vault);
        await send([await seedIx(vault, curator, v.settlementMint, usdToUnits(amountText, 6))]);
        await refresh();
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, seedIx, send],
  );

  const publishPlan = useCallback(
    async (vaultAddress: string, text: string): Promise<string> => {
      const manager = requireWallet();
      setAction('publishing');
      try {
        const program = folioProgram(connection);
        const vault = new PublicKey(vaultAddress);
        const v = await program.account.vault.fetch(vault);
        // In V2, setStrategy sets plan and keeps targets if already set
        const targets = v.targets ?? [];
        const ix = await program
          .methods.setStrategy(text, targets)
          .accountsPartial({manager, registry: registryPda(), vault})
          .instruction();
        const signature = await send([ix]);
        await refresh();
        return signature;
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );

  const setStrategy = useCallback(
    async (
      vaultAddress: string,
      text: string,
      targets: {mint: PublicKey; targetBps: number}[],
    ): Promise<string> => {
      const manager = requireWallet();
      setAction('publishing');
      try {
        const program = folioProgram(connection);
        const vault = new PublicKey(vaultAddress);
        const ix = await program
          .methods.setStrategy(text, targets.map((t) => ({mint: t.mint, bps: t.targetBps})))
          .accountsPartial({manager, registry: registryPda(), vault})
          .instruction();
        const signature = await send([ix]);
        await refresh();
        return signature;
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );

  const proposeStrategy = useCallback(
    async (
      vaultAddress: string,
      text: string,
      targets: {mint: PublicKey; targetBps: number}[],
      votingDays: number = 3,
      bondLamports: number | bigint = 50_000_000,
    ): Promise<string> => {
      const proposer = requireWallet();
      setAction('publishing');
      try {
        const program = folioProgram(connection);
        const vault = new PublicKey(vaultAddress);
        const v = await program.account.vault.fetch(vault);
        const proposal = PublicKey.findProgramAddressSync(
          [Buffer.from('proposal'), vault.toBuffer(), Buffer.from(new BN(v.proposalCount).toArray('le', 8))],
          program.programId,
        )[0];

        const ix = await program
          .methods.propose(
            targets.map((t) => ({mint: t.mint, bps: t.targetBps})),
            text,
            votingDays,
            new BN(bondLamports.toString()),
          )
          .accountsPartial({
            manager: proposer,
            vault,
            proposal,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        const signature = await send([ix]);
        await refresh();
        return signature;
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );


  const executeRebalance = useCallback(
    async (
      vaultAddress: string,
      quote: TradeQuote,
      signedPrices: SignedPrices,
      onStage?: (stage: RebalanceStage) => void,
    ): Promise<RebalanceResult> => {
      const keeper = requireWallet();
      const vault = new PublicKey(vaultAddress);
      const sell = new PublicKey(quote.trade.sellMint);
      const buy = new PublicKey(quote.trade.buyMint);

      setAction('simulating');
      onStage?.('simulating');
      try {
        const program = folioProgram(connection);
        const v = await program.account.vault.fetch(vault);
        const programs = await tokenProgramsOf(connection, [...v.held, buy]);
        const [sellProgram, buyProgram] = [programs.get(sell.toBase58())!, programs.get(buy.toBase58())!];
        const ix = await program.methods
          .rebalance(
            new BN(quote.trade.maxSell),
            new BN(quote.trade.minBuy),
            Buffer.from(quote.trade.routeData, 'base64'),
            toPriceArg(signedPrices.update),
          )
          .accountsPartial({
            keeper,
            registry: registryPda(),
            vault,
            sellMint: sell,
            buyMint: buy,
            vaultSell: ata(vault, sell, sellProgram),
            vaultBuy: ata(vault, buy, buyProgram),
            router: new PublicKey(quote.trade.router),
            sellTokenProgram: sellProgram,

            buyTokenProgram: buyProgram,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            instructions: SYSVAR_INSTRUCTIONS,
          })
          .remainingAccounts([
            ...heldAccounts(vault, v.held, programs),
            ...quote.trade.routeAccounts.map((a) => ({...a, pubkey: new PublicKey(a.pubkey)})),
          ])
          .instruction();

        setAction('rebalancing');
        onStage?.('wallet');
        // The Ed25519 instruction must come directly before `rebalance`.
        const signature = await send([
          ComputeBudgetProgram.setComputeUnitLimit({units: quote.computeUnits}),
          priceSignatureIx(signedPrices),
          ix,
        ]);
        onStage?.('confirmed');
        await refresh();
        return {
          hash: signature,
          simulatedSold: BigInt(quote.trade.maxSell),
          simulatedBought: BigInt(quote.quote.expectedBuyAmount),
        };
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );

  /**
   * Activation is the guardian's job. When the connected wallet is the guardian it signs directly;
   * otherwise the devnet demo server activates with its guardian key.
   */
  const activateVault = useCallback(
    async (vaultAddress: string): Promise<void> => {
      const wallet = requireWallet();
      setAction('activating');
      try {
        const program = folioProgram(connection);
        const registry = registryPda();
        const r = await program.account.registry.fetch(registry);
        if (r.guardian.equals(wallet)) {
          const ix = await program.methods
            .activate()
            .accountsPartial({guardian: wallet, registry, vault: new PublicKey(vaultAddress)})
            .instruction();
          await send([ix]);
        } else {
          const res = await fetch(`/api/vaults/${vaultAddress}/activate`, {method: 'POST'});
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error || 'Activation failed');
          }
        }
        await refresh();
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );

  const fundGas = useCallback(
    async (vaultAddress: string, lamports: number | bigint): Promise<string> => {
      const funder = requireWallet();
      setAction('publishing');
      try {
        const program = folioProgram(connection);
        const vault = new PublicKey(vaultAddress);
        const ix = await program.methods
          .fundGas(new BN(lamports.toString()))
          .accountsPartial({
            funder,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        const signature = await send([ix]);
        await refresh();
        return signature;
      } finally {
        setAction('idle');
      }
    },
    [connection, refresh, requireWallet, send],
  );

  const forceRebalance = useCallback(
    async (
      vault: VaultView,
      onStage?: (stage: RebalanceStage) => void,
    ): Promise<RebalanceResult> => {
      setAction('simulating');
      onStage?.('simulating');
      try {
        const crankRes = await fetch(`/api/crank?vault=${vault.address}&force=true`);
        const crankData = await crankRes.json();
        const rec = crankData.recommendation;
        if (!rec || !rec.overweightAsset || !rec.underweightAsset || !rec.suggestedSellAmount) {
          throw new Error(rec?.reason || 'Portfolio is already balanced within target weights.');
        }

        const quoteRes = await fetch(
          `/api/trade?vault=${vault.address}&sell=${rec.overweightAsset}&buy=${rec.underweightAsset}&amount=${rec.suggestedSellAmount}&slippage=1`,
        );
        if (!quoteRes.ok) {
          const body = await quoteRes.json().catch(() => null);
          throw new Error(body?.error || 'Failed to fetch swap route');
        }
        const quoteData = await quoteRes.json();

        const pricesRes = await fetch(
          `/api/prices?vault=${vault.address}&include=${rec.underweightAsset}`,
        );
        if (!pricesRes.ok) {
          const body = await pricesRes.json().catch(() => null);
          throw new Error(body?.error || 'Failed to fetch signed prices');
        }
        const pricesData = await pricesRes.json();

        return await executeRebalance(vault.address, quoteData, pricesData, onStage);
      } finally {
        setAction('idle');
      }
    },
    [executeRebalance],
  );

  return {
    action,
    createAndSeed,
    seedExistingVault,
    activateVault,
    publishPlan,
    setStrategy,
    proposeStrategy,
    fundGas,
    executeRebalance,
    forceRebalance,
  };
}

