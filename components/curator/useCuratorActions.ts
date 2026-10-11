'use client';

import {useQueryClient} from '@tanstack/react-query';
import {useCallback, useState} from 'react';
import {
  getAddress,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import {useChainId, useConfig, useConnection} from 'wagmi';
import {readContract, simulateContract, writeContract} from 'wagmi/actions';
import {erc20Abi, folioVaultAbi, vaultFactoryAbi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import {waitForSuccessfulReceipt} from '@/lib/contracts/hooks';
import {HISTORY_KEY} from '@/lib/history/hooks';
import type {SignedPrices, TradeQuote} from './model';

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
  hash: Hex;
  simulatedSold: bigint;
  simulatedBought: bigint;
}

export function useCuratorActions() {
  const config = useConfig();
  const chainId = useChainId();
  const {address} = useConnection();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<CuratorAction>('idle');

  const refreshVaults = useCallback(
    () => queryClient.invalidateQueries({queryKey: ['vaults']}),
    [queryClient],
  );

  const requireWallet = useCallback((): Address => {
    if (!address) throw new Error('Connect the curator wallet first.');
    return address;
  }, [address]);

  const createAndSeed = useCallback(
    async (name: string, symbol: string, amountText: string): Promise<Address> => {
      const account = requireWallet();
      const deployment = deploymentFor(chainId);
      if (!deployment) throw new Error(`No Folio Lab deployment is configured for chain ${chainId}.`);

      setAction('creating');
      try {
        await simulateContract(config, {
          address: deployment.factory,
          abi: vaultFactoryAbi,
          functionName: 'createVault',
          args: [name, symbol, account],
          account,
        });
        const createHash = await writeContract(config, {
          address: deployment.factory,
          abi: vaultFactoryAbi,
          functionName: 'createVault',
          args: [name, symbol, account],
        });
        const createReceipt = await waitForSuccessfulReceipt(config, createHash);
        const created = parseEventLogs({
          abi: vaultFactoryAbi,
          eventName: 'VaultCreated',
          logs: createReceipt.logs,
        }).find((event) => getAddress(event.args.manager) === getAddress(account));
        if (!created) throw new Error('Vault was created, but its address was not found in the receipt.');
        const vault = getAddress(created.args.vault);
        // Creation is already final even if approval or seeding later fails, so expose the DRAFT
        // vault immediately and let the curator recover instead of hiding it until the next poll.
        await refreshVaults();

        const decimals = await readContract(config, {
          address: deployment.usdt,
          abi: erc20Abi,
          functionName: 'decimals',
        });
        const amount = parseUnits(amountText, decimals);
        const minimum = await readContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'minSeed',
        });
        if (amount < minimum) throw new Error('The first deposit must be at least 10 USDT.');

        const allowance = await readContract(config, {
          address: deployment.usdt,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, vault],
        });
        if (allowance < amount) {
          setAction('approving');
          const approveHash = await writeContract(config, {
            address: deployment.usdt,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vault, amount],
          });
          await waitForSuccessfulReceipt(config, approveHash);
        }

        setAction('seeding');
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
          account,
        });
        const seedHash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
        });
        await waitForSuccessfulReceipt(config, seedHash);
        await Promise.all([
          refreshVaults(),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return vault;
      } finally {
        setAction('idle');
      }
    },
    [chainId, config, queryClient, refreshVaults, requireWallet],
  );

  const publishPlan = useCallback(
    async (vault: Address, text: string): Promise<Hex> => {
      const account = requireWallet();
      setAction('publishing');
      try {
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'setPlan',
          args: [text],
          account,
        });
        const hash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'setPlan',
          args: [text],
          account,
        });
        await waitForSuccessfulReceipt(config, hash);
        await Promise.all([
          refreshVaults(),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return hash;
      } finally {
        setAction('idle');
      }
    },
    [config, queryClient, refreshVaults, requireWallet],
  );

  const executeRebalance = useCallback(
    async (
      vault: Address,
      quote: TradeQuote,
      signedPrices: SignedPrices,
      onStage?: (stage: RebalanceStage) => void,
    ): Promise<RebalanceResult> => {
      const account = requireWallet();
      const trade = {
        router: getAddress(quote.trade.router),
        sellToken: getAddress(quote.trade.sellToken),
        buyToken: getAddress(quote.trade.buyToken),
        maxSellAmount: BigInt(quote.trade.maxSellAmount),
        minBuyAmount: BigInt(quote.trade.minBuyAmount),
        callData: quote.trade.callData,
      };
      const prices = {
        assets: signedPrices.update.assets.map((asset) => getAddress(asset)),
        prices: signedPrices.update.prices.map((price) => BigInt(price)),
        timestamp: BigInt(signedPrices.update.timestamp),
      };
      const gas = BigInt(quote.gasLimit);
      if (gas <= BigInt(0)) throw new Error('The quote service returned an invalid gas limit.');

      setAction('simulating');
      onStage?.('simulating');
      try {
        const simulation = await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'rebalance',
          args: [trade, prices, signedPrices.signature],
          account,
          gas,
        });

        setAction('rebalancing');
        onStage?.('wallet');
        const hash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'rebalance',
          args: [trade, prices, signedPrices.signature],
          account,
          gas,
        });
        onStage?.('confirming');
        await waitForSuccessfulReceipt(config, hash);
        onStage?.('confirmed');
        await Promise.all([
          refreshVaults(),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
        return {
          hash,
          simulatedSold: simulation.result[0],
          simulatedBought: simulation.result[1],
        };
      } finally {
        setAction('idle');
      }
    },
    [config, queryClient, refreshVaults, requireWallet],
  );

  const seedExistingVault = useCallback(
    async (vault: Address, amountText: string = '10'): Promise<void> => {
      const account = requireWallet();
      const deployment = deploymentFor(chainId);
      if (!deployment) throw new Error(`No deployment configured for chain ${chainId}`);

      const decimals = await readContract(config, {
        address: deployment.usdt,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      const amount = parseUnits(amountText, decimals);

      const allowance = await readContract(config, {
        address: deployment.usdt,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account, vault],
      });
      if (allowance < amount) {
        setAction('approving');
        try {
          const approveHash = await writeContract(config, {
            address: deployment.usdt,
            abi: erc20Abi,
            functionName: 'approve',
            args: [vault, amount],
          });
          await waitForSuccessfulReceipt(config, approveHash);
        } finally {
          setAction('idle');
        }
      }

      setAction('seeding');
      try {
        await simulateContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
          account,
        });
        const seedHash = await writeContract(config, {
          address: vault,
          abi: folioVaultAbi,
          functionName: 'seed',
          args: [amount],
        });
        await waitForSuccessfulReceipt(config, seedHash);
        await Promise.all([
          refreshVaults(),
          queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
        ]);
      } finally {
        setAction('idle');
      }
    },
    [chainId, config, queryClient, refreshVaults, requireWallet],
  );

  const activateVault = useCallback(
    async (vault: Address): Promise<void> => {
      const account = requireWallet();
      setAction('activating');
      try {
        let activated = false;
        try {
          await simulateContract(config, {
            address: vault,
            abi: folioVaultAbi,
            functionName: 'activate',
            account,
          });
          const hash = await writeContract(config, {
            address: vault,
            abi: folioVaultAbi,
            functionName: 'activate',
          });
          await waitForSuccessfulReceipt(config, hash);
          activated = true;
        } catch (directError) {
          // If caller is not guardian (or on local dev), try dev guardian activation
          const res = await fetch(`/api/vaults/${vault}/activate`, {method: 'POST'});
          if (res.ok) {
            activated = true;
          } else {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.error || (directError instanceof Error ? directError.message : 'Activation failed'));
          }
        }

        if (activated) {
          await Promise.all([
            refreshVaults(),
            queryClient.invalidateQueries({queryKey: [HISTORY_KEY]}),
          ]);
        }
      } finally {
        setAction('idle');
      }
    },
    [config, queryClient, refreshVaults, requireWallet],
  );

  return {action, createAndSeed, seedExistingVault, activateVault, publishPlan, executeRebalance};
}
