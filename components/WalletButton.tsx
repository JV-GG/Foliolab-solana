'use client';

import {useState, useEffect, useCallback, useRef, useSyncExternalStore} from 'react';
import {useWallet} from '@solana/wallet-adapter-react';
import {useConnection as useSolanaConnection} from '@solana/wallet-adapter-react';
import {useWalletModal} from '@solana/wallet-adapter-react-ui';
import {shortAddress, formatSol} from '@/lib/domain/format';
import {explorerUrl, CLUSTER} from '@/lib/solana/config';

const base = 'shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold whitespace-nowrap transition active:scale-[.975]';
const subscribeNothing = () => () => {};

export function WalletButton() {
  const {publicKey, connected, connecting, disconnect, wallet} = useWallet();
  const {connection} = useSolanaConnection();
  const {setVisible} = useWalletModal();
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch live SOL balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) return;
    try {
      setBalanceLoading(true);
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      setSolBalance(lamports / 1e9);
    } catch (err) {
      console.warn('Failed to fetch SOL balance:', err);
    } finally {
      setBalanceLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    } else {
      setSolBalance(null);
      setIsOpen(false);
    }
  }, [connected, publicKey, fetchBalance]);

  // Refetch when opening popup
  useEffect(() => {
    if (isOpen && connected && publicKey) {
      fetchBalance();
    }
  }, [isOpen, connected, publicKey, fetchBalance]);

  // Click outside and Esc key listener
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  async function handleCopy() {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function handleDisconnect() {
    setIsOpen(false);
    disconnect();
  }

  if (!mounted) return <span className={`${base} border-[#c2c9c0] text-[#6b746c]`}>Wallet</span>;

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        disabled={connecting}
        onClick={() => setVisible(true)}
        className={`${base} border-[#2b3a30] bg-[#2b3a30] text-[#f7f8f3] hover:bg-[#3d4a41] disabled:opacity-50`}
      >
        {connecting ? 'Connecting...' : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect wallet</span></>}
      </button>
    );
  }

  const pubkeyStr = publicKey.toBase58();

  return (
    <div className="relative inline-block" ref={modalRef}>
      {/* Wallet Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`${base} flex items-center gap-2 border-[#aeb8ad] bg-[#f7f8f3]/90 text-[#2b3a30] hover:border-[#2b3a30] shadow-xs`}
      >
        <span className="inline-block h-2 w-2 rounded-full bg-[#237b68]" />
        <span className="font-mono text-[11px] font-semibold">{shortAddress(pubkeyStr)}</span>
        <span className="text-[9px] text-[#717b72]">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Pop-up Modal / Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[310px] max-w-[calc(100vw-24px)] rounded-2xl border border-[#cdd3ca] bg-[#fafbf8] p-4.5 text-[#2b3a30] shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e2e6df] pb-3">
            <div className="flex items-center gap-2">
              {wallet?.adapter?.icon && (
                <img src={wallet.adapter.icon} alt="" className="h-4.5 w-4.5 rounded-full" />
              )}
              <span className="text-[12px] font-bold text-[#253328]">
                {wallet?.adapter?.name ?? 'Solana Wallet'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-full text-xs text-[#717b72] hover:bg-[#e8ece5] hover:text-[#253328]"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {/* Account Details Card */}
          <div className="mt-3.5 space-y-3">
            {/* Address & Quick Actions */}
            <div className="rounded-xl border border-[#dde2dc] bg-white p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">
                Public Key
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] font-bold text-[#237b68]" title={pubkeyStr}>
                  {shortAddress(pubkeyStr)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-md border border-[#cdd3ca] bg-[#f7f8f4] px-2 py-0.5 text-[10px] font-semibold text-[#455248] hover:bg-[#e9ece4]"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href={explorerUrl('address', pubkeyStr)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[#cdd3ca] bg-[#f7f8f4] px-2 py-0.5 text-[10px] font-semibold text-[#455248] hover:bg-[#e9ece4] no-underline"
                    title="View on Solana Explorer"
                  >
                    Explorer ↗
                  </a>
                </div>
              </div>
            </div>

            {/* Balance in SOL */}
            <div className="rounded-xl border border-[#dde2dc] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">
                  SOL Balance
                </span>
                <button
                  type="button"
                  onClick={fetchBalance}
                  disabled={balanceLoading}
                  className="text-[10px] text-[#237b68] hover:underline"
                  title="Refresh balance"
                >
                  {balanceLoading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-[18px] font-bold text-[#253328]">
                  {balanceLoading
                    ? '…'
                    : solBalance !== null
                      ? `${solBalance.toFixed(4)}`
                      : '0.0000'}
                </span>
                <span className="font-mono text-[12px] font-semibold text-[#717b72]">SOL</span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[#849087]">
                {solBalance !== null
                  ? formatSol(Math.round(solBalance * 1e9))
                  : '0 SOL'}
              </div>
            </div>

            {/* Network / Cluster Tag */}
            <div className="flex items-center justify-between rounded-lg bg-[#f0f4ee] px-3 py-2 text-[11px]">
              <span className="text-[#657267]">Network</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#237b68]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#237b68]" />
                Solana {CLUSTER}
              </span>
            </div>

            {/* Disconnect Button */}
            <button
              type="button"
              onClick={handleDisconnect}
              className="mt-1 w-full rounded-xl border border-[#dc2626]/20 bg-[#fef2f2] py-2 text-[12px] font-bold text-[#b91c1c] hover:bg-[#fee2e2] transition active:scale-[0.98]"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
