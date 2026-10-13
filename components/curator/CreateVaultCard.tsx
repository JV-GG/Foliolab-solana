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
  // Sliding dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'selected'>('all');
  const [search, setSearch] = useState('');

  // Filtered RWA tokens based on search input and filter tab
  const filteredTokens = useMemo(() => {
    let list = rwaTokens;
    if (filterTab === 'selected') {
      list = list.filter((t) => selectedMints.includes(t.mint));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        (t.underlying && t.underlying.toLowerCase().includes(q))
    );
  }, [rwaTokens, filterTab, search, selectedMints]);

  function toggleToken(mint: string) {
    setSelectedMints((prev) =>
      prev.includes(mint) ? prev.filter((m) => m !== mint) : [...prev, mint]
    );
  }

  function handleAddAll() {
    setSelectedMints(rwaTokens.map((t) => t.mint));
    notify(`Added all ${rwaTokens.length} stock tokens to fund plan.`);
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
    if (selectedMints.length === 0) return notify('Please pick at least one RWA stock token from the list for your fund plan.');

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

        {/* Collapsible Sliding Dropdown for Asset Selection */}
        <div className="rounded-2xl border border-[#cdd3ca] bg-[#f8faf6] overflow-hidden transition-all duration-200">
          {/* Dropdown Header / Trigger */}
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            disabled={busy}
            className="flex w-full items-center justify-between p-4 text-left hover:bg-[#f2f5f0] transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
                  Fund Plan Asset Universe
                </span>
                <span className="rounded-full bg-[#dfede8] px-2 py-0.5 font-mono text-[10px] font-bold text-[#237b68]">
                  {selectedMints.length} of {rwaTokens.length} picked
                </span>
              </div>
              <h4 className="mt-1 font-editorial text-[14px] font-semibold text-[#253328]">
                {selectedMints.length === 0
                  ? 'Select RWA Stock Tokens…'
                  : `${selectedMints.length} Stock Token${selectedMints.length > 1 ? 's' : ''} in Fund Basket`}
              </h4>

              {/* Compact badges when dropdown is collapsed */}
              {!dropdownOpen && selectedMints.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedMints.slice(0, 6).map((mint) => {
                    const token = rwaTokens.find((t) => t.mint === mint);
                    return (
                      <span
                        key={mint}
                        className="rounded-md border border-[#d8ded6] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#2b3a30]"
                      >
                        {token?.symbol ?? 'Asset'}
                      </span>
                    );
                  })}
                  {selectedMints.length > 6 && (
                    <span className="self-center font-mono text-[10px] text-[#717b72]">
                      +{selectedMints.length - 6} more
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="ml-3 flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-[#237b68]">
                {dropdownOpen ? 'Collapse ▲' : 'Open Dropdown ▼'}
              </span>
            </div>
          </button>

          {/* Sliding Dropdown Content Panel */}
          {dropdownOpen && (
            <div className="border-t border-[#cdd3ca] bg-[#fdfdfc] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-[#6b746c]">
                  Pick from allowlisted on-chain stock tokens. Fits thousands of assets with live filter.
                </p>
                {/* Tabs: All vs Selected */}
                <div className="flex items-center rounded-lg border border-[#d8ded6] bg-[#f4f7f2] p-0.5 text-[10px] font-semibold shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`rounded px-2 py-1 transition-all ${
                      filterTab === 'all' ? 'bg-white text-[#237b68] shadow-2xs' : 'text-[#717b72]'
                    }`}
                  >
                    All ({rwaTokens.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('selected')}
                    className={`rounded px-2 py-1 transition-all ${
                      filterTab === 'selected' ? 'bg-white text-[#237b68] shadow-2xs' : 'text-[#717b72]'
                    }`}
                  >
                    Picked ({selectedMints.length})
                  </button>
                </div>
              </div>

              {/* Sticky Search bar */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search stock ID (e.g. AAPL, NVDA, TSLA)..."
                  disabled={busy}
                  className="w-full rounded-[12px] border border-[#aeb8ad] bg-white px-3 py-2 pl-8 font-mono text-[11px] text-[#2b3a30] shadow-2xs outline-none focus:border-[#237b68] disabled:opacity-50"
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#717b72]">
                  🔍
                </span>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#717b72] hover:text-[#2b3a30]"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 3-Column Grid limited in size */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-[#d8ded6] bg-white p-2">
                {filteredTokens.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-[#717b72]">
                    {filterTab === 'selected'
                      ? 'No assets selected yet. Switch to "All" to pick stocks.'
                      : 'No matching stock token found.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {filteredTokens.map((token) => {
                      const isSelected = selectedMints.includes(token.mint);
                      return (
                        <button
                          key={token.mint}
                          type="button"
                          onClick={() => toggleToken(token.mint)}
                          disabled={busy}
                          title={token.symbol}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[12px] font-semibold transition-all border ${
                            isSelected
                              ? 'border-[#237b68] bg-[#edf6f2] text-[#185347] shadow-2xs'
                              : 'border-[#e5e9e3] bg-white text-[#2b3a30] hover:border-[#237b68]/50 hover:bg-[#fbfcfb]'
                          }`}
                        >
                          <span className="truncate">{token.symbol}</span>
                          <span
                            className={`ml-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
                              isSelected
                                ? 'bg-[#237b68] text-white'
                                : 'border border-[#cdd3ca] text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick action links */}
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAddAll}
                    disabled={busy || selectedMints.length === rwaTokens.length}
                    className="text-[#237b68] underline hover:text-[#185347] disabled:opacity-40"
                  >
                    + Select all ({rwaTokens.length})
                  </button>
                  {selectedMints.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      disabled={busy}
                      className="text-[#a14343] hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDropdownOpen(false)}
                  className="rounded-lg bg-[#237b68] px-3 py-1 font-mono text-[10px] font-semibold text-white hover:bg-[#1b6152]"
                >
                  Done (Apply)
                </button>
              </div>

              {/* Picked Tokens summary chips inside drawer */}
              {selectedMints.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-[#e2e6df] pt-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#717b72]">
                    Active Selection ({selectedMints.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMints.map((mint) => {
                      const token = rwaTokens.find((t) => t.mint === mint);
                      if (!token) return null;
                      return (
                        <span
                          key={token.mint}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#237b68]/30 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#253328] shadow-2xs"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#237b68]" />
                          {token.symbol}
                          <button
                            type="button"
                            onClick={() => toggleToken(token.mint)}
                            disabled={busy}
                            className="ml-1 text-[#a14343] hover:text-[#7d2f2f]"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
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
