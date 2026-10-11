'use client';

import {useSyncExternalStore} from 'react';
import {useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain} from 'wagmi';
import {shortAddress} from '@/lib/domain/format';
import {appChain, appChainLabel} from '@/lib/contracts/wagmi';

const base = 'shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold whitespace-nowrap transition active:scale-[.975]';
const subscribeNothing = () => () => {};

export function WalletButton() {
  const {address, isConnected, chainId: walletChainId} = useConnection();
  const chainId = useChainId();
  const connectors = useConnectors();
  const {connect, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain} = useSwitchChain();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  if (!mounted) return <span className={`${base} border-[#c2c9c0] text-[#6b746c]`}>Wallet</span>;

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button type="button" disabled={!injected || isPending} onClick={() => injected && connect({connector: injected})} className={`${base} border-[#2b3a30] bg-[#2b3a30] text-[#f7f8f3] hover:bg-[#3d4a41] disabled:opacity-50`}>
        {isPending ? 'Connecting...' : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
      </button>
    );
  }

  if ((walletChainId ?? chainId) !== appChain.id) {
    return <button type="button" onClick={() => switchChain({chainId: appChain.id})} className={`${base} max-w-[148px] overflow-hidden text-ellipsis border-[#b58e16] bg-[#f4e8b7] text-[#6d5507] sm:max-w-none`}>Switch to {appChainLabel}</button>;
  }

  return (
    <button type="button" title="Disconnect wallet" onClick={() => disconnect()} className={`${base} border-[#aeb8ad] bg-[#f7f8f3]/70 text-[#2b3a30] hover:border-[#2b3a30]`}>
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#237b68]" />{shortAddress(address!)}
    </button>
  );
}
