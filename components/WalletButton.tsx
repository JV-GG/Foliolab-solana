'use client';

import {useSyncExternalStore} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import {useWalletModal} from '@solana/wallet-adapter-react-ui';
import {shortAddress} from '@/lib/domain/format';

const base = 'shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold whitespace-nowrap transition active:scale-[.975]';
const subscribeNothing = () => () => {};

export function WalletButton() {
  const {publicKey, connected, connecting, disconnect} = useWallet();
  const {setVisible} = useWalletModal();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  if (!mounted) return <span className={`${base} border-[#c2c9c0] text-[#6b746c]`}>Wallet</span>;

  if (!connected || !publicKey) {
    return (
      <button type="button" disabled={connecting} onClick={() => setVisible(true)} className={`${base} border-[#2b3a30] bg-[#2b3a30] text-[#f7f8f3] hover:bg-[#3d4a41] disabled:opacity-50`}>
        {connecting ? 'Connecting...' : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
      </button>
    );
  }

  return (
    <button type="button" title="Disconnect wallet" onClick={() => disconnect()} className={`${base} border-[#aeb8ad] bg-[#f7f8f3]/70 text-[#2b3a30] hover:border-[#2b3a30]`}>
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#237b68]" />{shortAddress(publicKey.toBase58())}
    </button>
  );
}
