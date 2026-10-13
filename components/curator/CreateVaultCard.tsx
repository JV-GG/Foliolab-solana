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
  const [dropboxMint, setDropboxMint] = useState<string>('');

  // Tokens available in the dropdown (not yet added to fund plan)
  const availableOptions = useMemo(() => {
    return rwaTokens.filter((t) => !selectedMints.includes(t.mint));
  }, [rwaTokens, selectedMints]);

  // Keep dropdown defaulted to the first available option
  useEffect(() => {
    if (availableOptions.length > 0 && (!dropboxMint || !availableOptions.some((o) => o.mint === dropboxMint))) {
      setDropboxMint(availableOptions[0].mint);
    } else if (availableOptions.length === 0) {
      setDropboxMint('');
    }
  }, [availableOptions, dropboxMint]);

  function handleAddTokenFromDropbox() {
    if (!dropboxMint) return;
    if (!selectedMints.includes(dropboxMint)) {
      setSelectedMints((prev) => [...prev, dropboxMint]);
      const token = rwaTokens.find((t) => t.mint === dropboxMint);
      notify(`Added ${token?.symbol ?? 'token'} to fund plan.`);
    }
  }

  function handleRemoveToken(mint: string) {
    setSelectedMints((prev) => prev.filter((m) => m !== mint));
  }

  function handleAddAll() {
    setSelectedMints(rwaTokens.map((t) => t.mint));
    notify('Added all available RWA stock tokens to fund plan.');
  }

  function handleClearAll() {
    setSelectedMints([]);
  }

  const busy = action === 'creating' || action === 'approving' || action === 'seeding';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanSymbol = symbol.trim().toUpperCase();
    if (cleanName.length < 2) return notify('Give the vault a name of at least two characters.');
    if (!/^[A-Z0-9]{2,8}$/.test(cleanSymbol)) return notify('Use a 2–8 character symbol made from letters and numbers.');
    if (!/^\d+(\.\d+)?$/.test(seed) || Number(seed) < 10) return notify('The first deposit must be at least 10 USDC.');
    if (selectedMints.length === 0) return notify('Please pick at least one RWA stock token from the dropdown for your fund plan.');

    try {
      const vault = await onCreate(cleanName, cleanSymbol, seed);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`folio_vault_selected_assets_${vault}`, JSON.stringify(selectedMints));
      }
      // Also persist to server endpoint
      try {
        await fetch(`/api/vaults/${vault}/tokens`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({tokens: selectedMints}),
        });
      } catch (err) {
        console.warn('Failed to persist picked tokens to server:', err);
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

        {/* On-chain RWA Asset Selection via Dropbox */}
        <div className="space-y-3 rounded-2xl border border-[#cdd3ca] bg-[#f8faf6] p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
                Fund Plan Asset Universe
              </span>
              <h4 className="font-editorial text-[14px] font-semibold text-[#253328]">
                Pick RWA Tokens (Stock Basket)
              </h4>
            </div>
            <span className="font-mono text-[10px] font-semibold text-[#237b68]">
              {selectedMints.length} of {rwaTokens.length} picked
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-[#6b746c]">
            Use the dropdown to pick which tokenized stocks are allowed in this fund plan.
          </p>

          {/* Dropbox / Select input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                value={dropboxMint}
                onChange={(e) => setDropboxMint(e.target.value)}
                disabled={busy || availableOptions.length === 0}
                className="w-full appearance-none rounded-[14px] border border-[#aeb8ad] bg-white px-3.5 py-2.5 pr-8 font-mono text-[12px] font-semibold text-[#2b3a30] shadow-xs outline-none focus:border-[#237b68] disabled:opacity-50"
              >
                {availableOptions.length === 0 ? (
                  <option value="">All available RWA tokens already added</option>
                ) : (
                  <>
                    <option value="" disabled>-- Select an RWA stock token --</option>
                    {availableOptions.map((token) => (
                      <option key={token.mint} value={token.mint}>
                        {token.symbol} · {token.name} ({token.underlying || 'Stock'})
                      </option>
                    ))}
                  </>
                )}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#717b72]">
                ▼
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddTokenFromDropbox}
              disabled={busy || !dropboxMint || availableOptions.length === 0}
              className="folio-button-primary shrink-0 py-2.5 px-3.5 text-[11px] disabled:opacity-50"
            >
              + Add to Plan
            </button>
          </div>

          {/* Quick action buttons */}
          {rwaTokens.length > 1 && (
            <div className="flex items-center justify-between text-[10px]">
              <button
                type="button"
                onClick={handleAddAll}
                disabled={busy || selectedMints.length === rwaTokens.length}
                className="text-[#237b68] underline hover:text-[#185347] disabled:opacity-40"
              >
                + Add all available tokens
              </button>
              {selectedMints.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={busy}
                  className="text-[#a14343] hover:underline"
                >
                  Clear selection
                </button>
              )}
            </div>
          )}

          {/* Picked Tokens in Fund Plan */}
          <div className="mt-2 space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#717b72]">
              Picked Tokens in Fund Plan ({selectedMints.length})
            </span>

            {selectedMints.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#b8c0b7] p-3 text-center text-[11px] text-[#717b72]">
                No RWA tokens picked yet. Select a token from the dropdown above and click &quot;+ Add to Plan&quot;.
              </div>
            ) : (
              <div className="grid gap-1.5">
                {selectedMints.map((mint) => {
                  const token = rwaTokens.find((t) => t.mint === mint);
                  if (!token) return null;
                  return (
                    <div
                      key={token.mint}
                      className="flex items-center justify-between rounded-xl border border-[#237b68]/30 bg-white p-2.5 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dfede8] font-mono text-[10px] font-bold text-[#237b68]">
                          ✓
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <strong className="font-mono text-xs text-[#2b3a30]">{token.symbol}</strong>
                            {token.underlying && (
                              <span className="rounded bg-[#e8ece7] px-1 py-0.2 font-mono text-[9px] text-[#59645c]">
                                {token.underlying}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#717b72]">{token.name}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveToken(token.mint)}
                        disabled={busy}
                        className="rounded-lg border border-[#e2e6df] px-2 py-1 font-mono text-[10px] text-[#a14343] hover:border-[#a14343] hover:bg-[#fbf2f2]"
                        title="Remove from fund plan"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
