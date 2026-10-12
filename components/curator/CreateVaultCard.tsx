'use client';

import {useState, useEffect, useMemo, type FormEvent} from 'react';
import {useNotify} from '@/components/Toast';
import {explainError, useOnChainTokens} from '@/lib/contracts/hooks';
import type {CuratorAction} from './useCuratorActions';

interface Props {
  connected: boolean;
  deploymentReady: boolean;
  action: CuratorAction;
  onCreate: (name: string, symbol: string, seed: string) => Promise<string>;
  onCreated: (vault: string) => void;
}

const ACTION_LABEL: Partial<Record<CuratorAction, string>> = {
  creating: 'Creating vault…',
  approving: 'Preparing…',
  seeding: 'Sending first deposit…',
};

export function CreateVaultCard({connected, deploymentReady, action, onCreate, onCreated}: Props) {
  const notify = useNotify();
  const {data: allTokens = []} = useOnChainTokens();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [seed, setSeed] = useState('10');

  // Filter on-chain allowlisted RWA tokens (excluding USDC settlement currency)
  const rwaTokens = useMemo(() => allTokens.filter((t) => t.symbol !== 'USDC'), [allTokens]);
  const [selectedMints, setSelectedMints] = useState<string[]>([]);

  // Default selection: all on-chain RWA tokens
  useEffect(() => {
    if (rwaTokens.length > 0 && selectedMints.length === 0) {
      setSelectedMints(rwaTokens.map((t) => t.mint));
    }
  }, [rwaTokens, selectedMints.length]);

  function toggleMint(mint: string) {
    setSelectedMints((prev) =>
      prev.includes(mint) ? prev.filter((m) => m !== mint) : [...prev, mint],
    );
  }

  const busy = action === 'creating' || action === 'approving' || action === 'seeding';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanName.length < 2) return notify('Give the vault a name of at least two characters.');
    if (!/^[A-Z0-9]{2,8}$/.test(cleanSymbol)) return notify('Use a 2–8 character symbol made from letters and numbers.');
    if (!/^\d+(\.\d+)?$/.test(seed) || Number(seed) < 10) return notify('The first deposit must be at least 10 USDC.');
    if (selectedMints.length === 0) return notify('Select at least one RWA stock token for your vault portfolio.');

    try {
      const vault = await onCreate(cleanName, cleanSymbol, seed);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`folio_vault_selected_assets_${vault}`, JSON.stringify(selectedMints));
      }
      setName('');
      setSymbol('');
      setSeed('10');
      onCreated(vault);
      notify('Vault created and seeded with chosen RWA tokens. It is waiting for Guardian activation.');
    } catch (error) {
      notify(explainError(error));
    }
  }

  const inputClass = 'folio-field text-[13px]';

  return (
    <section>
      <p className="text-[13px] leading-[1.7] text-[#6b746c]">
        Your connected wallet becomes the curator. Vault creation and the seed deposit go in a single transaction you sign once.
      </p>
      {connected && !deploymentReady && (
        <div className="mt-4 border-l-2 border-[#b18b15] pl-3 text-[12px] leading-[1.6] text-[#6f5c0d]">
          Vault creation is paused: Folio Lab is not set up on this cluster yet.
        </div>
      )}

      <form onSubmit={submit} className="mt-5 grid gap-4.5">
        <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
          Fund Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Magnificent Tech Equities"
            maxLength={48}
            disabled={busy}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
          Share Token Symbol
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="MTEQ"
            maxLength={8}
            disabled={busy}
            className={`${inputClass} uppercase`}
          />
        </label>
        <label className="grid gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
          First Seed Deposit (USDC)
          <div className="flex items-center rounded-[14px] border border-[#aeb8ad] bg-[#fcfdf9]/70 pr-4 focus-within:border-[#2b3a30]">
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              inputMode="decimal"
              disabled={busy}
              className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-[13px] text-[#2b3a30] outline-none disabled:opacity-55"
            />
            <span className="text-[11px] font-bold text-[#6b746c]">USDC</span>
          </div>
          <span className="text-[11px] font-normal normal-case tracking-normal text-[#6b746c]">
            Minimum 10 USDC seed. You receive the initial 100% share of the vault.
          </span>
        </label>
        {/* On-chain RWA Asset Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
              Portfolio RWA Tokens (On-Chain)
            </span>
            <span className="font-mono text-[10px] font-semibold text-[#237b68]">
              {selectedMints.length} of {rwaTokens.length} selected
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#6b746c]">
            Select which allowlisted stock tokens will form the investment universe for this vault.
          </p>

          <div className="grid gap-2">
            {rwaTokens.map((token) => {
              const isSelected = selectedMints.includes(token.mint);
              return (
                <div
                  key={token.mint}
                  onClick={() => !busy && toggleMint(token.mint)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition select-none ${
                    isSelected
                      ? 'border-[#237b68] bg-[#f0f7f4] shadow-xs'
                      : 'border-[#dde2dc] bg-white opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={busy}
                      onChange={() => toggleMint(token.mint)}
                      className="h-4 w-4 rounded accent-[#237b68]"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="font-mono text-xs text-[#2b3a30]">{token.symbol}</strong>
                        {token.underlying && (
                          <span className="rounded bg-[#e8ece7] px-1 py-0.2 font-mono text-[9px] text-[#59645c]">
                            {token.underlying}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#717b72]">{token.name}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-[#6b746c]">
                    {isSelected ? '✓ Included' : 'Excluded'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={!connected || !deploymentReady || busy || selectedMints.length === 0}
          className="folio-button-primary mt-2 w-full"
        >
          {!connected ? 'Connect Manager Wallet' : !deploymentReady ? 'Deployment Addresses Pending' : ACTION_LABEL[action] ?? 'Create & Seed Vault'}
        </button>
      </form>
    </section>
  );
}
