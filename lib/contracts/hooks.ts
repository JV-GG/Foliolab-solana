'use client';

/**
 * Investor-side data and transactions. Reads valuations from /api/vaults and sends deposits and
 * redemptions from the connected wallet. The program is the authority: these estimates are only
 * used to bound slippage and to show what a withdrawal pays out.
 */
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useConnection as useSolanaConnection, useWallet} from '@solana/wallet-adapter-react';
import {Connection, PublicKey, SystemProgram, Transaction} from '@solana/web3.js';
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
  voteRecordPda,
  type SignedPricesJson,
} from '@/lib/solana/program';
import folioIdl from '@/lib/solana/idl/folio_vault.json';
import {deployment, type TokenInfo} from '@/lib/solana/config';
import {useConnection, useSendTransaction} from './wallet';

export type {VaultView, Holding} from '@/lib/vaults/read';

export const VAULTS_KEY = 'vaults';
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');
export const POPULAR_CRYPTO_TOKENS: TokenInfo[] = [
  {
    symbol: 'SOL',
    name: 'Solana',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    underlying: 'SOL',
    category: 'crypto',
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    mint: 'cbbtcf3aa214zXHbiAZQwf4122FmVbraDgTagqLdBKh',
    decimals: 8,
    underlying: 'BTC',
    category: 'crypto',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    decimals: 8,
    underlying: 'ETH',
    category: 'crypto',
  },
];

/** Fetches allowlisted RWA tokens directly from the Solana registry on-chain, plus supported crypto. */
export function useOnChainTokens() {
  const {connection} = useSolanaConnection();
  return useQuery({
    queryKey: ['onchain-tokens'],
    queryFn: async (): Promise<TokenInfo[]> => {
      try {
        const program = folioProgram(connection);
        const reg = await program.account.registry.fetch(registryPda());
        const localTokens = deployment().tokens;
        const results: TokenInfo[] = [];

        // Settlement mint (USDC)
        const usdcInfo = localTokens.find((t) => t.mint === reg.settlementMint.toBase58()) ?? {
          symbol: 'USDC',
          name: 'USD Coin (settlement)',
          mint: reg.settlementMint.toBase58(),
          decimals: 6,
        };
        results.push(usdcInfo);

        // All allowlisted RWA tokens from chain registry
        for (const assetPk of reg.assets) {
          const mintStr = assetPk.toBase58();
          const info = localTokens.find((t) => t.mint === mintStr) ?? {
            symbol: `${mintStr.slice(0, 4)}…x`,
            name: `Tokenized Asset (${mintStr.slice(0, 6)}…)`,
            mint: mintStr,
            decimals: 8,
          };
          const categorized: TokenInfo = {
            ...info,
            category: (info.category as 'rwa' | 'crypto') ?? 'rwa',
          };
          if (!results.some((r) => r.mint === categorized.mint)) {
            results.push(categorized);
          }
        }

        // Add supported crypto assets
        for (const crypto of POPULAR_CRYPTO_TOKENS) {
          if (!results.some((r) => r.mint === crypto.mint)) {
            results.push(crypto);
          }
        }

        return results;
      } catch (err) {
        console.warn('Failed to fetch on-chain tokens from registry, fallback to config:', err);
        return [...deployment().tokens, ...POPULAR_CRYPTO_TOKENS];
      }
    },
    staleTime: 60_000,
  });
}
/** All vaults, with the connected wallet's position in each. Auto-refreshes every 5 s. */
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
    refetchInterval: 5_000,
  });
}

const PROGRAM_ERRORS = new Map<number, string>(folioIdl.errors.map((e) => [e.code, e.name]));

/** The program's error name inside a wallet/RPC failure, if there is one. */
export function programErrorName(error: unknown): string | null {
  const e = error as {message?: string; logs?: string[]; transactionLogs?: string[]};
  // web3.js puts a failed send's program logs in `transactionLogs`; Anchor errors in `logs`.
  const text = [String(e?.message ?? ''), ...(e?.logs ?? []), ...(e?.transactionLogs ?? [])].join('\n');
  const named = /Error Code: (\w+)/.exec(text);
  if (named) return named[1];
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text);
  if (hex) return PROGRAM_ERRORS.get(parseInt(hex[1], 16)) ?? null;
  // A transaction that failed on-chain (sent without preflight): {"InstructionError":[2,{"Custom":6026}]}
  const custom = /"Custom":\s*(\d+)/.exec(text);
  if (custom) return PROGRAM_ERRORS.get(Number(custom[1])) ?? null;
  return null;
}

/** Turns a wallet or program failure into a sentence an investor can act on. */
export function explainError(error: unknown): string {
  const message = String((error as {message?: string})?.message ?? '');
  if (/blockhash not found|block height exceeded|expired before it landed/i.test(message)) {
    return 'The network took too long to see this transaction. Nothing was sent; please try again.';
  }
  if (/\b429\b|rate limit/i.test(message)) {
    return 'The Solana devnet RPC is busy (rate limited). Wait a few seconds and try again.';
  }
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
    case 'ProposalAlreadyOpen':
      return 'This vault already has an on-chain proposal cycle active until voting concludes (on-chain rule: 1 proposal per vault at a time).';
    case 'BuyNotUnderweight':
      return 'The asset bought is already at or above its target weight on-chain.';
    case 'SellNotOverweight':
      return 'The asset sold is not above its target weight on-chain.';
    case 'TargetOvershoot':
      return 'This trade would overshoot the target weight on-chain.';
    case 'RebalanceTooSoon':
      return 'A rebalance cycle already ran in the last 12 hours.';
    case 'GasTankEmpty':
      return 'The vault’s gas tank cannot pay the keeper.';
    case 'StrategyLocked':
      return 'The strategy can only change through a passed proposal once the vault is active.';
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

/**
 * Fresh on-chain view of a vault in two RPC calls (the public devnet RPC rate-limits hard): the vault
 * account, then every held mint and the vault's token account for it in one batch.
 */
async function vaultSnapshot(connection: Connection, vault: PublicKey) {
  const program = folioProgram(connection);
  const info = await connection.getAccountInfo(vault);
  if (!info) throw new Error('This vault was not found on-chain.');
  const v = program.coder.accounts.decode<Awaited<ReturnType<typeof program.account.vault.fetch>>>('vault', info.data);
  const mintInfos = await connection.getMultipleAccountsInfo(v.held);
  const programs = new Map<string, PublicKey>();
  v.held.forEach((mint, i) => {
    const owner = mintInfos[i]?.owner;
    if (!owner) throw new Error(`Token ${mint.toBase58()} not found`);
    programs.set(mint.toBase58(), owner);
  });
  const accounts = await connection.getMultipleAccountsInfo(
    v.held.map((mint) => ata(vault, mint, programs.get(mint.toBase58())!)),
  );
  const balances = v.held.map((_, i) => {
    const data = accounts[i]?.data;
    // The base token-account layout is the same in both token programs: amount is a u64 at byte 64.
    const amount = data && data.length >= 72 ? new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true) : BigInt(0);
    const mintData = mintInfos[i]!.data;
    return {amount, decimals: mintData[44]}; // Mint layout: decimals at byte 44
  });
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

  /**
   * What redeeming `shares` would pay out right now, in kind (same rounding as the program). Read
   * through our API, so opening the dialog costs the browser no RPC calls.
   */
  const preview = useCallback(
    async (vaultAddress: string, shares: bigint, forfeit: readonly string[] = []): Promise<RedeemResult> => {
      const res = await fetch(`/api/vaults/${vaultAddress}`, {cache: 'no-store'});
      const view = (await res.json()) as VaultView & {error?: string};
      if (!res.ok) throw new Error(view.error ?? 'Could not read the vault');
      const supply = BigInt(view.totalSupply);
      return {
        assets: view.holdings.map((h) => h.asset),
        amounts: view.holdings.map((h) =>
          forfeit.includes(h.asset) || supply === BigInt(0) ? BigInt(0) : (BigInt(h.amount) * shares) / supply,
        ),
      };
    },
    [],
  );

  const redeem = useCallback(
    async (vaultAddress: string, shares: bigint, forfeit: readonly string[] = []): Promise<RedeemResult> => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const owner = new PublicKey(address);
        const vault = new PublicKey(vaultAddress);
        const {program, v, programs, balances} = await vaultSnapshot(connection, vault);
        const supply = BigInt(v.totalShares.toString());
        const out: RedeemResult = {
          assets: v.held.map((m) => m.toBase58()),
          amounts: v.held.map((m, i) => (forfeit.includes(m.toBase58()) ? BigInt(0) : (balances[i].amount * shares) / supply)),
        };
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
    [address, connection, queryClient, send],
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
      // One RPC call. Mock USDC is a legacy SPL token; a missing account means a zero balance.
      const owner = new PublicKey(address!);
      const r = await connection.getTokenAccountBalance(ata(owner, new PublicKey(mint!), TOKEN_PROGRAM_ID)).catch(() => null);
      return BigInt(r?.value.amount ?? '0');
    },
    refetchInterval: 5_000,
  });
}

/** Vote on an active proposal with frozen snapshot voting power — completely gasless for the investor */
export function useVote() {
  const {connection} = useSolanaConnection();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const {signTransaction} = useWallet();
  const send = useSendTransaction();
  const [pending, setPending] = useState(false);

  const vote = useCallback(
    async (vaultAddress: string, proposalAddress: string, isYes: boolean) => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        // 1. Try gasless sponsored vote via /api/vote (investor pays 0 gas fee and 0 rent)
        if (signTransaction) {
          try {
            const prepRes = await fetch('/api/vote', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                action: 'prepare',
                vault: vaultAddress,
                proposal: proposalAddress,
                voter: address,
                isYes,
              }),
            });

            if (prepRes.ok) {
              const data = await prepRes.json();
              if (data.ok && data.transaction) {
                const tx = Transaction.from(Buffer.from(data.transaction, 'base64'));

                // Investor signs with wallet: network fee is 0 SOL (paid by server sponsor)
                const signed = await signTransaction(tx);
                const signedBase64 = Buffer.from(signed.serialize()).toString('base64');

                const submitRes = await fetch('/api/vote', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({
                    action: 'submit',
                    signedTx: signedBase64,
                  }),
                });

                if (submitRes.ok) {
                  await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
                  return;
                }
              }
            }
          } catch (sponsorErr) {
            console.warn('Gasless vote sponsor failed, falling back to direct transaction:', sponsorErr);
          }
        }

        // Direct fallback if sponsor unavailable
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
            voteRecord: voteRecordPda(proposal, voter),
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        await send([ix]);
        await queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      } finally {
        setPending(false);
      }
    },
    [address, connection, queryClient, send, signTransaction],
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

