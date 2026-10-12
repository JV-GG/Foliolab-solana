'use client';

/**
 * Investor-side data and transactions. Reads valuations from /api/vaults and sends deposits and
 * redemptions from the connected wallet. The program is the authority: these estimates are only
 * used to bound slippage and to show what a withdrawal pays out.
 */
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useConnection as useSolanaConnection} from '@solana/wallet-adapter-react';
import {Connection, PublicKey, SystemProgram} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {useCallback, useState} from 'react';
import type {VaultView} from '@/lib/vaults/read';
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
  type SignedPricesJson,
} from '@/lib/solana/program';
import folioIdl from '@/lib/solana/idl/folio_vault.json';
import {useConnection, useSendTransaction} from './wallet';

export type {VaultView, Holding} from '@/lib/vaults/read';

export const VAULTS_KEY = 'vaults';
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

/** All vaults, with the connected wallet's position in each. Refreshes every 15 s. */
export function useVaults() {
  const {address} = useConnection();
  return useQuery({
    queryKey: [VAULTS_KEY, address ?? null],
    queryFn: async (): Promise<VaultView[]> => {
      const res = await fetch(`/api/vaults${address ? `?account=${address}` : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not load vaults');
      return body.vaults;
    },
    refetchInterval: 15_000,
  });
}

const PROGRAM_ERRORS = new Map<number, string>(folioIdl.errors.map((e) => [e.code, e.name]));

/** The program's error name inside a wallet/RPC failure, if there is one. */
export function programErrorName(error: unknown): string | null {
  const text = [String((error as {message?: string})?.message ?? ''), ...(((error as {logs?: string[]})?.logs) ?? [])].join('\n');
  const named = /Error Code: (\w+)/.exec(text);
  if (named) return named[1];
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (hex) return PROGRAM_ERRORS.get(parseInt(hex[1], 16)) ?? null;
  return null;
}

/** Turns a wallet or program failure into a sentence an investor can act on. */
export function explainError(error: unknown): string {
  const message = String((error as {message?: string})?.message ?? '');
  if (/rejected|declined|cancel/i.test(message)) {
    return 'You cancelled the request in your wallet.';
  }
  switch (programErrorName(error)) {
    case 'StalePrices':
      return 'The signed prices expired before the transaction landed. Try again.';
    case 'InvalidPriceSignature':
      return 'The price signature was rejected. The server key may not match the registry.';
    case 'SlippageTooHigh':
      return 'Prices moved and you would get fewer shares than expected. Try again.';
    case 'WrongState':
      return 'This vault is not accepting this right now (it may be paused or not yet active).';
    case 'MissingPrice':
    case 'ZeroPrice':
      return 'One of the vault’s holdings has no price right now, so deposits are paused.';
    case 'ZeroShares':
      return 'That amount is too small to mint any shares.';
    case 'InsufficientShares':
      return 'You do not hold that many shares.';
    case 'TradeLossTooHigh':
      return 'This trade would lose more than 2% against market prices, so the vault refused it.';
    case 'NoPlanPosted':
      return 'Post a plan before the first trade.';
    case null:
      break;
    default:
      return `The vault rejected this: ${programErrorName(error)}.`;
  }
  if (/insufficient (funds|lamports)|0x1\b/i.test(message)) return 'You do not have enough for this (USDC, or SOL for fees).';
  if (/Attempt to debit an account but found no record of a prior credit/i.test(message)) {
    return 'Your wallet has no SOL on this network to pay fees. Get some from faucet.solana.com.';
  }
  return message || 'Something went wrong.';
}

export type DepositStep = 'idle' | 'approving' | 'pricing' | 'depositing' | 'done';

/** Bounds the deposit at 0.5% fewer shares than the estimate, in case balances change first. */
const MIN_SHARES_BPS = BigInt(9_950);

/** Fresh on-chain view of a vault: held mints, their token programs, balances and share supply. */
async function vaultSnapshot(connection: Connection, vault: PublicKey) {
  const program = folioProgram(connection);
  const v = await program.account.vault.fetch(vault);
  const programs = await tokenProgramsOf(connection, v.held);
  const balances = await Promise.all(
    v.held.map(async (mint) => {
      const r = await connection.getTokenAccountBalance(ata(vault, mint, programs.get(mint.toBase58())!)).catch(() => null);
      return {amount: BigInt(r?.value.amount ?? '0'), decimals: r?.value.decimals ?? 0};
    }),
  );
  return {program, v, programs, balances};
}

export function useDeposit() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [step, setStep] = useState<DepositStep>('idle');

  const deposit = useCallback(
    async (vaultAddress: string, amountText: string): Promise<{shares: bigint; amount: bigint}> => {
      if (!address) throw new Error('Connect a wallet first.');
      const amount = usdToUnits(amountText, 6);
      if (amount <= BigInt(0)) throw new Error('Enter an amount above zero.');
      const investor = new PublicKey(address);
      const vault = new PublicKey(vaultAddress);

      try {
        // Signed prices live 60 s, so fetch them right before sending.
        setStep('pricing');
        const res = await fetch(`/api/prices?vault=${vault.toBase58()}`, {cache: 'no-store'});
        const signed = (await res.json()) as SignedPricesJson & {error?: string};
        if (!res.ok) throw new Error(signed.error ?? 'Could not get signed prices');

        // Estimate shares exactly as the program will: holdings at the signed prices, rounded up.
        const {program, v, programs, balances} = await vaultSnapshot(connection, vault);
        const usdc = v.settlementMint;
        let value = BigInt(0);
        v.held.forEach((mint, i) => {
          const {amount: bal, decimals} = balances[i];
          if (bal === BigInt(0)) return;
          if (mint.equals(usdc)) {
            value += bal;
            return;
          }
          const p = signed.update.mints.indexOf(mint.toBase58());
          if (p < 0) throw new Error('One of the vault’s holdings has no price right now, so deposits are paused.');
          const unit = BigInt(10) ** BigInt(decimals);
          value += (bal * BigInt(signed.update.prices[p]) + unit - BigInt(1)) / unit;
        });
        if (value === BigInt(0)) throw new Error('This vault holds nothing yet.');
        const expected = (amount * BigInt(v.totalShares.toString())) / value;
        const minShares = (expected * MIN_SHARES_BPS) / BigInt(10_000);

        setStep('depositing');
        const ix = await program.methods
          .deposit(new BN(amount.toString()), new BN(minShares.toString()), toPriceArg(signed.update))
          .accountsPartial({
            investor,
            registry: registryPda(),
            vault,
            position: positionPda(vault, investor),
            settlementMint: usdc,
            investorSettlement: ata(investor, usdc, TOKEN_PROGRAM_ID),
            vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            instructions: SYSVAR_INSTRUCTIONS,
          })
          .remainingAccounts(heldAccounts(vault, v.held, programs))
          .instruction();
        // The Ed25519 instruction must come directly before `deposit`.
        await send([priceSignatureIx(signed), ix]);

        setStep('done');
        await Promise.all([
          queryClient.invalidateQueries({queryKey: [VAULTS_KEY]}),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return {shares: expected, amount};
      } catch (error) {
        setStep('idle');
        throw error;
      }
    },
    [address, connection, queryClient, send],
  );

  const reset = useCallback(() => setStep('idle'), []);
  return {deposit, step, reset};
}

export interface RedeemResult {
  assets: readonly string[];
  amounts: readonly bigint[];
}

/**
 * `forfeit` lists mints to leave behind for the remaining holders: the escape hatch when a token's
 * issuer has frozen it, so one stuck token never blocks an exit.
 */
export function useRedeem() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  /** What redeeming `shares` would pay out right now, in kind (same rounding as the program). */
  const preview = useCallback(
    async (vaultAddress: string, shares: bigint, forfeit: readonly string[] = []): Promise<RedeemResult> => {
      const {v, balances} = await vaultSnapshot(connection, new PublicKey(vaultAddress));
      const supply = BigInt(v.totalShares.toString());
      return {
        assets: v.held.map((m) => m.toBase58()),
        amounts: v.held.map((m, i) => (forfeit.includes(m.toBase58()) || supply === BigInt(0) ? BigInt(0) : (balances[i].amount * shares) / supply)),
      };
    },
    [connection],
  );

  const redeem = useCallback(
    async (vaultAddress: string, shares: bigint, forfeit: readonly string[] = []): Promise<RedeemResult> => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const owner = new PublicKey(address);
        const vault = new PublicKey(vaultAddress);
        const out = await preview(vaultAddress, shares, forfeit);
        const {program, v, programs} = await vaultSnapshot(connection, vault);
        // Make sure the wallet has an account for every token it is about to receive.
        const createAccounts = v.held
          .filter((mint, i) => out.amounts[i] > BigInt(0))
          .map((mint) => {
            const p = programs.get(mint.toBase58())!;
            return createAssociatedTokenAccountIdempotentInstruction(owner, ata(owner, mint, p), owner, mint, p);
          });
        const ix = await program.methods
          .redeem(new BN(shares.toString()), forfeit.map((m) => new PublicKey(m)))
          .accountsPartial({
            owner,
            vault,
            position: positionPda(vault, owner),
            tokenProgram: TOKEN_PROGRAM_ID,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts(heldAccounts(vault, v.held, programs, owner))
          .instruction();
        await send([...createAccounts, ix]);
        await Promise.all([
          queryClient.invalidateQueries({queryKey: [VAULTS_KEY]}),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return out;
      } finally {
        setPending(false);
      }
    },
    [address, connection, preview, queryClient, send],
  );

  return {redeem, preview, pending};
}

/** The connected wallet's balance of `mint` in base units, refreshed every 10 s. */
export function useTokenBalance(mint: string | undefined) {
  const {connection} = useSolanaConnection();
  const {address} = useConnection();
  return useQuery({
    queryKey: ['token-balance', mint ?? null, address ?? null],
    enabled: Boolean(mint && address),
    queryFn: async (): Promise<bigint> => {
      const owner = new PublicKey(address!);
      const program = (await connection.getAccountInfo(new PublicKey(mint!)))?.owner ?? TOKEN_PROGRAM_ID;
      const r = await connection.getTokenAccountBalance(ata(owner, new PublicKey(mint!), program)).catch(() => null);
      return BigInt(r?.value.amount ?? '0');
    },
    refetchInterval: 10_000,
  });
}

/** Vote on an active proposal with frozen snapshot voting power */
export function useVote() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  const vote = useCallback(
    async (vaultAddress: string, proposalAddress: string, isYes: boolean) => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const voter = new PublicKey(address);
        const vault = new PublicKey(vaultAddress);
        const proposal = new PublicKey(proposalAddress);
        const program = folioProgram(connection);

        const ix = await program.methods
          .vote(isYes)
          .accountsPartial({
            voter,
            vault,
            proposal,
            position: positionPda(vault, voter),
            voteRecord: PublicKey.findProgramAddressSync(
              [Buffer.from('vote'), proposal.toBuffer(), voter.toBuffer()],
              program.programId,
            )[0],
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        await send([ix]);
        await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      } finally {
        setPending(false);
      }
    },
    [address, connection, queryClient, send],
  );

  return {vote, pending};
}

/** Finalize voting once voting period ends: refunds bond if rejected, unlocks timelock if passed */
export function useFinalizeProposal() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  const finalize = useCallback(
    async (vaultAddress: string, proposalAddress: string, proposerAddress: string) => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const caller = new PublicKey(address);
        const vault = new PublicKey(vaultAddress);
        const proposal = new PublicKey(proposalAddress);
        const proposer = new PublicKey(proposerAddress);
        const program = folioProgram(connection);

        const ix = await program.methods
          .finalize()
          .accountsPartial({
            vault,
            proposal,
            proposer,
          })
          .instruction();

        await send([ix]);
        await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      } finally {
        setPending(false);
      }
    },
    [address, connection, queryClient, send],
  );

  return {finalize, pending};
}

/** Execute proposal after 48h timelock ends: applies new target weights and moves bond to gas tank */
export function useExecuteProposal() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  const execute = useCallback(
    async (vaultAddress: string, proposalAddress: string) => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const vault = new PublicKey(vaultAddress);
        const proposal = new PublicKey(proposalAddress);
        const program = folioProgram(connection);

        const ix = await program.methods
          .execute()
          .accountsPartial({
            vault,
            proposal,
          })
          .instruction();


        await send([ix]);
        await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      } finally {
        setPending(false);
      }
    },
    [address, connection, queryClient, send],
  );

  return {execute, pending};
}

/** Top up vault gas tank with SOL to reimburse future autonomous keeper rebalances */
export function useFundGas() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  const fundGas = useCallback(
    async (vaultAddress: string, lamports: number | bigint | BN) => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const funder = new PublicKey(address);
        const vault = new PublicKey(vaultAddress);
        const program = folioProgram(connection);

        const ix = await program.methods
          .fundGas(new BN(lamports.toString()))
          .accountsPartial({
            funder,
            vault,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        await send([ix]);
        await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      } finally {
        setPending(false);
      }
    },
    [address, connection, queryClient, send],
  );

  return {fundGas, pending};
}

