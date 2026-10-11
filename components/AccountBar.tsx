'use client';

import {formatUnits, parseUnits} from 'viem';
import {useConfig, useConnection, useReadContract} from 'wagmi';
import {writeContract} from 'wagmi/actions';
import {money} from '@/lib/domain/format';
import {erc20Abi} from '@/lib/contracts/abis';
import {deploymentFor} from '@/lib/contracts/addresses';
import {waitForSuccessfulReceipt, type VaultView} from '@/lib/contracts/hooks';
import {appChain, appChainLabel} from '@/lib/contracts/wagmi';
import {useNotify} from './Toast';

/** Open-mint function on the local mock USDT. Exists only on the dev chain. */
const mintAbi = [
  {
    type: 'function',
    name: 'mint',
    inputs: [{type: 'address'}, {type: 'uint256'}],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const isLocal = appChain.id === 31337;

export function AccountBar({vaults}: {vaults: VaultView[]}) {
  const {address} = useConnection();
  const config = useConfig();
  const notify = useNotify();
  const usdt = deploymentFor(appChain.id)?.usdt;

  const balance = useReadContract({
    address: usdt,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address && usdt), refetchInterval: 10_000},
  });

  const cash = balance.data === undefined ? null : Number(formatUnits(balance.data, 18));
  const positions = vaults.filter((vault) => vault.position && vault.position.shares !== '0');
  const invested = positions.every((vault) => vault.position?.valueUsd !== null)
    ? positions.reduce((sum, vault) => sum + Number(vault.position!.valueUsd), 0)
    : null;
  const total = cash !== null && invested !== null ? cash + invested : null;

  async function faucet() {
    if (!address || !usdt) return;
    try {
      const hash = await writeContract(config, {address: usdt, abi: mintAbi, functionName: 'mint', args: [address, parseUnits('1000', 18)]});
      await waitForSuccessfulReceipt(config, hash);
      await balance.refetch();
      notify('1,000 test USDT added to your wallet.');
    } catch {
      notify('Could not mint test USDT.');
    }
  }

  const show = (value: number | null) => (!address ? '—' : value === null ? 'Unavailable' : money(value));
  const cells = [
    {label: 'Wallet total', value: show(total)},
    {label: 'USDT available', value: show(cash)},
    {label: 'Invested', value: show(invested)},
    {label: 'Positions', value: address ? String(positions.length) : '—'},
  ];

  return (
    <section aria-label="Your account" className="grid min-w-0 max-w-full grid-cols-2 overflow-hidden border-y border-[#aeb8ad] sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 border-b border-r border-[#cdd3ca] px-3 py-5 last:border-r-0 sm:border-b-0 sm:px-5">
          <span className="block text-[9px] font-bold tracking-[0.11em] text-[#7a837b]">{cell.label.toUpperCase()}</span>
          <strong className="mt-2 block truncate text-[clamp(18px,2vw,26px)] font-semibold tracking-[-0.035em] text-[#2b3a30]">{cell.value}</strong>
        </div>
      ))}

      <div className="col-span-2 flex items-center justify-between gap-3 px-3 py-5 sm:col-span-4 sm:px-5 lg:col-span-1 lg:min-w-[220px] lg:border-l lg:border-[#cdd3ca]">
        <div>
          <span className="block text-[9px] font-bold tracking-[0.11em] text-[#7a837b]">NETWORK</span>
          <strong className="mt-2 block text-[12px] text-[#3d4a41]">{appChainLabel}</strong>
        </div>
        {isLocal && (
          <button type="button" disabled={!address} onClick={faucet} className="folio-button-secondary min-h-0 shrink-0 px-2.5 py-2 text-[9px]">
            + Test USDT
          </button>
        )}
      </div>
    </section>
  );
}
