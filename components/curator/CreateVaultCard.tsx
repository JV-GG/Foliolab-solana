'use client';

import {useState, useEffect, useMemo, useRef, type FormEvent} from 'react';
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

  // Filter on-chain allowlisted RWA and Crypto tokens (excluding USDC settlement currency)
  const availableTokens = useMemo(() => allTokens.filter((t) => t.symbol !== 'USDC'), [allTokens]);
  const [selectedMints, setSelectedMints] = useState<string[]>([]);
  // Sliding dropdown popup state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'rwa' | 'crypto' | 'selected'>('all');
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const rwaCount = useMemo(
    () => availableTokens.filter((t) => t.category !== 'crypto').length,
    [availableTokens]
  );
  const cryptoCount = useMemo(
    () => availableTokens.filter((t) => t.category === 'crypto').length,
    [availableTokens]
  );

  // Filtered tokens based on search input and category tab
  const filteredTokens = useMemo(() => {
    let list = availableTokens;
    if (filterTab === 'rwa') {
      list = list.filter((t) => t.category !== 'crypto');
    } else if (filterTab === 'crypto') {
      list = list.filter((t) => t.category === 'crypto');
    } else if (filterTab === 'selected') {
      list = list.filter((t) => selectedMints.includes(t.mint));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        (t.underlying && t.underlying.toLowerCase().includes(q))
    );
  }, [availableTokens, filterTab, search, selectedMints]);

  function toggleToken(mint: string) {
    setSelectedMints((prev) =>
      prev.includes(mint) ? prev.filter((m) => m !== mint) : [...prev, mint]
    );
  }

  function handleAddAll() {
    setSelectedMints(availableTokens.map((t) => t.mint));
    notify(`Added all ${availableTokens.length} assets to fund plan.`);
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
    if (selectedMints.length === 0) return notify('Please pick at least one asset from the list for your fund plan.');

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
      notify('Vault created and seeded with chosen assets. It is waiting for Guardian activation.');
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

        {/* Asset Selection: Search Bar with Pop-up Sliding Dropdown */}
        <div ref={dropdownRef} className="relative grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
              Fund Plan Asset Universe (RWA & Crypto)
            </span>
            <span className="font-mono text-[10px] font-semibold text-[#237b68]">
              {selectedMints.length} of {availableTokens.length} picked
            </span>
          </div>

          {/* Search input container with pop-up sliding dropdown positioned ABOVE */}
          <div className="relative">
            {/* Pop-up Sliding Dropdown Panel (Positioned ABOVE the search bar) */}
            {dropdownOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 space-y-3 rounded-2xl border border-[#cdd3ca] bg-white p-3.5 shadow-2xl transition-all duration-150 animate-in fade-in slide-in-from-bottom-2">
                {/* Filter Tabs & Close Button */}
                <div className="flex items-center justify-between gap-2 border-b border-[#edf1eb] pb-2.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setFilterTab('all')}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        filterTab === 'all'
                          ? 'bg-[#237b68] text-white shadow-2xs'
                          : 'bg-[#f0f4ee] text-[#59645c] hover:bg-[#e4ece2]'
                      }`}
                    >
                      All ({availableTokens.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab('rwa')}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        filterTab === 'rwa'
                          ? 'bg-[#237b68] text-white shadow-2xs'
                          : 'bg-[#f0f4ee] text-[#59645c] hover:bg-[#e4ece2]'
                      }`}
                    >
                      RWA Stocks ({rwaCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab('crypto')}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        filterTab === 'crypto'
                          ? 'bg-[#237b68] text-white shadow-2xs'
                          : 'bg-[#f0f4ee] text-[#59645c] hover:bg-[#e4ece2]'
                      }`}
                    >
                      Crypto ({cryptoCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab('selected')}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        filterTab === 'selected'
                          ? 'bg-[#237b68] text-white shadow-2xs'
                          : 'bg-[#f0f4ee] text-[#59645c] hover:bg-[#e4ece2]'
                      }`}
                    >
                      Picked ({selectedMints.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDropdownOpen(false)}
                    className="rounded-md p-1 font-mono text-[11px] font-bold text-[#717b72] hover:bg-[#f0f4ee] hover:text-[#2b3a30]"
                    title="Close popup"
                  >
                    ✕
                  </button>
                </div>

                {/* 3-Column Grid inside the popup: fixed to 2 rows height with scroll */}
                <div className="max-h-[90px] overflow-y-auto rounded-xl border border-[#e5ebe3] bg-[#fcfdfa] p-1.5">
                  {filteredTokens.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-[#717b72]">
                      {filterTab === 'selected'
                        ? 'No assets selected yet. Switch to "All" to pick assets.'
                        : 'No matching asset found.'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {filteredTokens.map((token) => {
                        const isSelected = selectedMints.includes(token.mint);
                        const isCrypto = token.category === 'crypto';
                        return (
                          <button
                            key={token.mint}
                            type="button"
                            onClick={() => toggleToken(token.mint)}
                            disabled={busy}
                            title={token.name}
                            className={`flex h-9 items-center justify-between rounded-lg px-2.5 text-left font-mono text-[12px] font-semibold transition-all border ${
                              isSelected
                                ? 'border-[#237b68] bg-[#edf6f2] text-[#185347] shadow-2xs ring-1 ring-[#237b68]/40'
                                : 'border-[#e2e7df] bg-white text-[#2b3a30] hover:border-[#237b68]/40 hover:bg-[#fbfcfb]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  isCrypto ? 'bg-[#9945FF]' : 'bg-[#237b68]'
                                }`}
                              />
                              <span className="truncate">{token.symbol}</span>
                            </div>
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

                {/* Popup Action Footer */}
                <div className="flex items-center justify-between pt-1 text-[10px]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAddAll}
                      disabled={busy || selectedMints.length === availableTokens.length}
                      className="text-[#237b68] underline hover:text-[#185347] disabled:opacity-40"
                    >
                      + Select all ({availableTokens.length})
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
                    className="rounded-lg bg-[#237b68] px-3.5 py-1.5 font-mono text-[10px] font-semibold text-white shadow-2xs hover:bg-[#1b6152]"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* The Search Input Field */}
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!dropdownOpen) setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Search & pick assets (e.g. AAPLx, SOL, NVDAx, BTC)..."
              disabled={busy}
              className="w-full rounded-[14px] border border-[#aeb8ad] bg-[#fcfdf9]/70 py-3 pl-9 pr-9 font-mono text-[13px] text-[#2b3a30] shadow-2xs outline-none focus:border-[#237b68] disabled:opacity-55"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#717b72]">
              🔍
            </span>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              disabled={busy}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-xs text-[#717b72] hover:text-[#2b3a30]"
              title={dropdownOpen ? 'Close popup' : 'Open popup'}
            >
              <span className={`inline-block transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
          </div>

          {/* Selected Asset Chips displayed directly in the column below search bar */}
          <div className="mt-1 space-y-1.5">
            {selectedMints.length === 0 ? (
              <p className="text-[11px] text-[#717b72]">
                No assets selected yet. Click the search bar above to browse and pick RWA stocks & crypto.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedMints.map((mint) => {
                  const token = availableTokens.find((t) => t.mint === mint);
                  if (!token) return null;
                  const isCrypto = token.category === 'crypto';
                  return (
                    <span
                      key={token.mint}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#237b68]/30 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-[#253328] shadow-2xs"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isCrypto ? 'bg-[#9945FF]' : 'bg-[#237b68]'
                        }`}
                      />
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
