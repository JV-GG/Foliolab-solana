'use client';

/**
 * Investor-side data and transactions. Reads valuations from /api/vaults and sends deposits and
 * redemptions from the connected wallet. The contract is the authority: share counts shown after
 * a transaction come from the confirmed receipt, not from these estimates.
 */
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useState} from 'react';
import {BaseError, ContractFunctionRevertedError, UserRejectedRequestError, parseUnits, type Address, type Hex} from 'viem';
import {useConfig, useConnection, type Config} from 'wagmi';
import {getTransactionReceipt, readContract, simulateContract, waitForTransactionReceipt, writeContract} from 'wagmi/actions';
import type {VaultView} from '@/lib/vaults/read';
import {erc20Abi, folioVaultAbi} from './abis';
import {HISTORY_KEY} from '@/lib/history/hooks';

export type {VaultView, Holding} from '@/lib/vaults/read';

const VAULTS_KEY = 'vaults';
const RECEIPT_TIMEOUT_MS = 75_000;

/**
 * Waits for a successful receipt without leaving the UI in a permanent pending state.
 * Some injected wallets stop forwarding subscription updates after the approval prompt;
 * a direct receipt lookup recovers transactions that were mined during that gap.
 */
export async function waitForSuccessfulReceipt(config: Config, hash: Hex) {
  let receipt;
  try {
    receipt = await waitForTransactionReceipt(config, {
      hash,
      pollingInterval: 1_000,
      timeout: RECEIPT_TIMEOUT_MS,
    });
  } catch (waitError) {
    try {
      receipt = await getTransactionReceipt(config, {hash});
    } catch {
      throw waitError;
    }
  }

  if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.');
  return receipt;
}

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

/** Turns a wallet or contract failure into a sentence an investor can act on. */
export function explainError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return 'You cancelled the request in your wallet.';
    if (error.message?.includes('nonce too low') || error.shortMessage?.includes('nonce too low')) {
      return 'Wallet transaction nonce is out of sync with Anvil. In MetaMask: Settings ➔ Advanced ➔ "Clear activity tab data", then retry.';
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      switch (revert.data?.errorName) {
        case 'StalePrices':
          return 'The signed prices expired before the deposit landed. Try again.';
        case 'InvalidPriceSignature':
          return 'The price signature was rejected. The server key may not match the registry.';
        case 'SlippageTooHigh':
          return 'Prices moved and you would get fewer shares than expected. Try again.';
        case 'WrongState':
          return 'This vault is not accepting deposits right now (it may be paused).';
        case 'MissingPrice':
        case 'ZeroPrice':
          return 'One of the vault’s holdings has no price right now, so deposits are paused.';
        case 'ZeroShares':
          return 'That amount is too small to mint any shares.';
        case 'ERC20InsufficientBalance':
          return 'You do not have enough for this.';
        default:
          if (revert.data?.errorName) return `The vault rejected this: ${revert.data.errorName}.`;
      }
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export type DepositStep = 'idle' | 'approving' | 'pricing' | 'depositing' | 'done';

interface SignedPrices {
  update: {assets: Address[]; prices: string[]; timestamp: string};
  signature: Hex;
}

/** Bounds the deposit at 0.5% fewer shares than the simulation, in case prices tick. */
const MIN_SHARES_BPS = BigInt(9_950);

export function useDeposit() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const [step, setStep] = useState<DepositStep>('idle');

  const deposit = useCallback(
    async (vault: Address, amountText: string): Promise<{shares: bigint; amount: bigint}> => {
      if (!address) throw new Error('Connect a wallet first.');
      const usdt = await readContract(config, {address: vault, abi: folioVaultAbi, functionName: 'settlementToken'});
      const decimals = await readContract(config, {address: usdt, abi: erc20Abi, functionName: 'decimals'});
      const amount = parseUnits(amountText, decimals);
      if (amount <= BigInt(0)) throw new Error('Enter an amount above zero.');

      try {
        const allowance = await readContract(config, {
          address: usdt,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, vault],
        });
        if (allowance < amount) {
          setStep('approving');
          const hash = await writeContract(config, {address: usdt, abi: erc20Abi, functionName: 'approve', args: [vault, amount]});
          await waitForSuccessfulReceipt(config, hash);
        }

        // Signed prices live 60 s, so fetch them only once the approval has landed.
        setStep('pricing');
        const res = await fetch(`/api/prices?vault=${vault}`, {cache: 'no-store'});
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Could not get signed prices');
        const signed = body as SignedPrices;
        const update = {
          assets: signed.update.assets,
          prices: signed.update.prices.map(BigInt),
          timestamp: BigInt(signed.update.timestamp),
        };

        setStep('depositing');
        const {result: expected} = await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'deposit',
          args: [amount, update, signed.signature, BigInt(0)],
          account: address,
        });
        const minShares = (expected * MIN_SHARES_BPS) / BigInt(10_000);
        const hash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'deposit',
          args: [amount, update, signed.signature, minShares],
        });
        await waitForSuccessfulReceipt(config, hash);

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
    [address, config, queryClient],
  );

  const reset = useCallback(() => setStep('idle'), []);
  return {deposit, step, reset};
}

export interface RedeemResult {
  assets: readonly Address[];
  amounts: readonly bigint[];
}

/**
 * Withdrawals always go through `redeemExcept`: with an empty `forfeit` list it is identical to
 * `redeem` (contract-tested). Listing a token leaves it behind for the remaining holders, the
 * escape hatch when its issuer has paused it, so one stuck token never blocks an exit.
 */
function redeemCall(vault: Address, shares: bigint, to: Address, forfeit: readonly Address[]) {
  return {address: vault, abi: folioVaultAbi, functionName: 'redeemExcept', args: [shares, to, forfeit]} as const;
}

export function useRedeem() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const {address} = useConnection();
  const [pending, setPending] = useState(false);

  /** What redeeming `shares` would pay out right now, in kind. */
  const preview = useCallback(
    async (vault: Address, shares: bigint, forfeit: readonly Address[] = []): Promise<RedeemResult> => {
      if (!address) throw new Error('Connect a wallet first.');
      const {result} = await simulateContract(config, {...redeemCall(vault, shares, address, forfeit), account: address});
      return {assets: result[0], amounts: result[1]};
    },
    [address, config],
  );

  const redeem = useCallback(
    async (vault: Address, shares: bigint, forfeit: readonly Address[] = []): Promise<RedeemResult> => {
      if (!address) throw new Error('Connect a wallet first.');
      setPending(true);
      try {
        const out = await preview(vault, shares, forfeit);
        const hash = await writeContract(config, redeemCall(vault, shares, address, forfeit));
        await waitForSuccessfulReceipt(config, hash);
        await Promise.all([
          queryClient.invalidateQueries({queryKey: [VAULTS_KEY]}),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return out;
      } finally {
        setPending(false);
      }
    },
    [address, config, preview, queryClient],
  );

  return {redeem, preview, pending};
}
