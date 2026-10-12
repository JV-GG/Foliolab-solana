'use client';

import {useState, useMemo, useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {PublicKey} from '@solana/web3.js';
import {useNotify} from '@/components/Toast';
import {explainError, useOnChainTokens, VAULTS_KEY, type VaultView} from '@/lib/contracts/hooks';
import {deployment, explorerUrl} from '@/lib/solana/config';
import {formatSol, tokenAmount} from '@/lib/domain/format';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';
import {useCuratorActions} from './useCuratorActions';
import {assetColor, assetMix, SHARE_SCALE, sharePartsPerMillion} from './capitalMapModel';
import {useTokenSymbols} from './useTokenSymbols';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
  onSeed?: () => void;
  onActivate?: () => void;
}

function dollars(value: string | null) {
  if (value === null) return 'Valuation unavailable';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount < 100 ? 2 : 0,
  }).format(amount);
}

function formatShare(parts: bigint | null) {
  return parts === null ? 'Unavailable' : `${(Number(parts) / 10_000).toFixed(4)}%`;
}

export function CuratorStepDrawers({vault, managerAllowed, onSeed, onActivate}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const {action, setStrategy, proposeStrategy, fundGas, forceRebalance} = useCuratorActions();

  const [isProposalClosedLocally, setIsProposalClosedLocally] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem(`folio_closed_proposal_${vault.address}`));
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsProposalClosedLocally(Boolean(localStorage.getItem(`folio_closed_proposal_${vault.address}`)));
    }
  }, [vault.address]);

  const activeProposal = vault.openProposal && !isProposalClosedLocally ? vault.openProposal : null;


  // Smart initial open state: open the step requiring attention
  const defaultOpenDrawer = useMemo(() => {
    if (vault.state === 'DRAFT') return 'step2';
    if (vault.state === 'SEEDED') return 'step5';
    if (!vault.plan) return 'step3';
    return 'step3';
  }, [vault.state, vault.plan]);

  const [openDrawers, setOpenDrawers] = useState<Record<string, boolean>>({
    [defaultOpenDrawer]: true,
  });

  const toggleDrawer = (id: string) => {
    setOpenDrawers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Fetch tokens from on-chain registry allowlist
  const {data: onChainTokens = []} = useOnChainTokens();
  const tokens = useMemo(() => {
    if (onChainTokens.length > 0) return onChainTokens;
    try {
      return deployment().tokens;
    } catch {
      return [];
    }
  }, [onChainTokens]);

  // Target weights initialization: honor on-chain targets or curator-selected assets
  const initialWeights = useMemo(() => {
    const map: Record<string, number> = {};
    if (vault.targets && vault.targets.length > 0) {
      for (const t of vault.targets) {
        map[t.asset] = t.targetPercent;
      }
      return map;
    }

    if (tokens.length === 0) return map;

    // Check if curator pre-selected specific assets when creating vault
    let selectedMints: string[] | null = null;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`folio_vault_selected_assets_${vault.address}`);
        if (stored) selectedMints = JSON.parse(stored);
      } catch {
        // ignore
      }
    }

    const usdc = tokens.find((t) => t.symbol === 'USDC');
    const rwaTokens = tokens.filter((t) => t.symbol !== 'USDC');
    const activeRwas = selectedMints
      ? rwaTokens.filter((t) => selectedMints!.includes(t.mint))
      : rwaTokens;

    if (activeRwas.length === 0) {
      if (usdc) map[usdc.mint] = 100;
      return map;
    }

    // Allocate 20% to cash USDC and split remaining 80% among active stock RWAs
    const baseUsdcPct = 20;
    if (usdc) map[usdc.mint] = baseUsdcPct;

    const remaining = 100 - (usdc ? baseUsdcPct : 0);
    const perRwa = Math.floor(remaining / activeRwas.length);
    let distributed = 0;

    activeRwas.forEach((rwa, idx) => {
      const isLast = idx === activeRwas.length - 1;
      const weight = isLast ? remaining - distributed : perRwa;
      map[rwa.mint] = weight;
      distributed += weight;
    });

    return map;
  }, [vault.targets, vault.address, tokens]);

  const [text, setText] = useState(vault.plan?.text ?? '');
  const [weights, setWeights] = useState<Record<string, number>>(initialWeights);
  const [votingDays, setVotingDays] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [rebalancePending, setRebalancePending] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);

  const bytes = utf8ByteLength(text);
  const validLength = bytes >= 1 && bytes <= MAX_PLAN_BYTES;
  const isDraftOrSeeded = vault.state === 'DRAFT' || vault.state === 'SEEDED';
  const isActive = vault.state === 'ACTIVE';

  const totalPercent = useMemo(() => {
    return Object.values(weights).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [weights]);

  const validWeights = Math.abs(totalPercent - 100) < 0.01;
  const publishing = action === 'publishing';

  const targetsPayload = useMemo(() => {
    return Object.entries(weights)
      .filter(([, pct]) => Number(pct) > 0)
      .map(([mint, pct]) => ({
        mint: new PublicKey(mint),
        targetBps: Math.round(Number(pct) * 100),
      }));
  }, [weights]);

  async function handleForceRebalance() {
    if (!managerAllowed || !isActive || rebalancePending) return;
    setRebalanceError(null);
    setRebalancePending(true);
    try {
      const res = await forceRebalance(vault);
      const count = res.trades?.length ?? 1;
      if (vault.openProposal) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(vault.openProposal.id));
          localStorage.removeItem(`folio_has_proposal_${vault.address}`);
        }
        setIsProposalClosedLocally(true);
      }
      notify(`1-Click Rebalance executed! ${count} trade${count > 1 ? 's' : ''} confirmed on-chain.`);
      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
    } catch (caught) {
      const message = explainError(caught);
      setRebalanceError(message);
      notify(message);
    } finally {
      setRebalancePending(false);
    }
  }

  async function handleRefundProposal() {
    if (!vault.openProposal || !managerAllowed) return;
    try {
      await fetch('/api/proposal/refund', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({vault: vault.address, curator: vault.manager, proposalId: vault.openProposal.id}),
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(vault.openProposal.id));
        localStorage.removeItem(`folio_has_proposal_${vault.address}`);
      }
      setIsProposalClosedLocally(true);
      notify('Proposal concluded. 0.05 SOL bond refunded immediately to curator wallet.');
      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      router.refresh();
    } catch (caught) {
      const message = explainError(caught);
      notify(message);
    }
  }

  async function handleSaveStrategy() {
    if (!managerAllowed || !validLength || !validWeights || publishing) return;
    setError(null);
    try {
      await setStrategy(vault.address, text, targetsPayload);
      notify(`Strategy & target weights confirmed on-chain.`);
    } catch (caught) {
      const message = explainError(caught);
      setError(message);
      notify(message);
    }
  }

  async function handleProposeAmendment() {
    if (!managerAllowed || !validLength || !validWeights || publishing) return;
    setError(null);
    try {
      await proposeStrategy(vault.address, text, targetsPayload, votingDays, 50_000_000);
      notify(`Strategy amendment proposal posted on-chain (0.05 SOL bond attached).`);
      setShowProposeModal(false);
    } catch (caught) {
      const message = explainError(caught);
      setError(message);
      notify(message);
    }
  }

  async function handleTopUpGas(lamports: number) {
    if (!managerAllowed || publishing) return;
    setError(null);
    try {
      await fundGas(vault.address, lamports);
      notify(`Gas tank funded with ${lamports / 1e9} SOL.`);
    } catch (caught) {
      const message = explainError(caught);
      setError(message);
      notify(message);
    }
  }

  // Holdings & overview data
  const holdings = vault.holdings.filter((h) => BigInt(h.amount) > BigInt(0));
  const mix = assetMix(vault.holdings);
  const tokenSymbol = useTokenSymbols(holdings);
  const totalMixValue = mix.status === 'ready' ? mix.assets.reduce((sum, a) => sum + a.value, 0) : null;
  const walletShare = vault.position ? sharePartsPerMillion(vault.position.shares, vault.totalSupply) : null;
  const gasSol = (Number(vault.gasTankLamports || '0') / 1e9).toFixed(3);
  const isBusy = action === 'seeding' || action === 'activating' || action === 'publishing';

  // Step Status Helpers
  const step1Done = true;
  const step2Done = vault.state !== 'DRAFT';
  const step3Done = Boolean(vault.targets && vault.targets.length > 0 && vault.plan);
  const step4Done = Number(vault.gasTankLamports || '0') >= 20_000;
  const step5Done = vault.state === 'ACTIVE';

  return (
    <div className="space-y-3">
      {/* Visual Step Progress Strip */}
      <div className="rounded-xl border border-[#cdd3ca] bg-[#f2f4ee] p-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#455248]">
          <span className="eyebrow text-[#455248]">Setup & Lifecycle</span>
          <span className="font-mono text-[10px] text-[#6b746c]">
            {step5Done ? '5 / 5 Complete' : step2Done ? 'Setup in Progress' : 'Initial Setup'}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-5 gap-1.5">
          <div className="h-1.5 rounded-full bg-[#237b68]" title="Step 1: Created" />
          <div className={`h-1.5 rounded-full ${step2Done ? 'bg-[#237b68]' : 'bg-[#e2a82b]'}`} title="Step 2: Seed" />
          <div className={`h-1.5 rounded-full ${step3Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 3: Strategy" />
          <div className={`h-1.5 rounded-full ${step4Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 4: Gas Tank" />
          <div className={`h-1.5 rounded-full ${step5Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 5: Active" />
        </div>
      </div>

      {/* DRAWER 1: Vault Overview & Position */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step1')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#237b68] text-[10px] font-bold text-white">
              ✓
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Step 1</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Vault Identity & Assets
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-[#237b68]">
              {dollars(vault.totalValueUsd)}
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step1 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step1 && (
          <div className="border-t border-[#e2e6df] p-4 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#717b72]">Pool Name</span>
              <strong className="font-semibold text-[#253328]">{vault.name} ({vault.symbol})</strong>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#717b72]">Solana Explorer</span>
              <a
                href={explorerUrl('address', vault.address)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] font-semibold text-[#237b68] underline"
              >
                {vault.address.slice(0, 6)}…{vault.address.slice(-4)} ↗
              </a>
            </div>

            {/* Holdings snapshot */}
            <div className="mt-3.5 border-t border-[#e8ece5] pt-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#717b72]">
                <span>Vault Holdings</span>
                <span>{holdings.length} Assets</span>
              </div>
              {holdings.length === 0 ? (
                <p className="mt-2 text-[11px] text-[#717b72]">No assets deposited yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {holdings.map((h) => {
                    const color = assetColor(h.asset);
                    return (
                      <div key={h.asset} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{backgroundColor: color}} />
                          <span className="font-medium text-[#253328]">{tokenSymbol(h.asset, h.symbol)}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-[#717b72]">{tokenAmount(h.amount, h.decimals, 2)}</span>
                          <span className="font-semibold text-[#253328]">{dollars(h.valueUsd)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Manager position */}
            {vault.position && BigInt(vault.position.shares) > BigInt(0) && (
              <div className="mt-3 border-t border-[#e8ece5] pt-2 text-[10px] text-[#717b72]">
                Manager holds {tokenAmount(vault.position.shares, 6, 2)} shares ({formatShare(walletShare)} of pool)
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER 2: Initial Capital Seed */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step2')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                step2Done ? 'bg-[#237b68]' : 'bg-[#e2a82b]'
              }`}
            >
              {step2Done ? '✓' : '2'}
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Step 2</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Initial Capital Seed
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                step2Done ? 'bg-[#dfede8] text-[#237b68]' : 'bg-[#faebd0] text-[#a67c1e]'
              }`}
            >
              {step2Done ? 'Seeded' : 'Required'}
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step2 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step2 && (
          <div className="border-t border-[#e2e6df] p-4 text-xs">
            {vault.state === 'DRAFT' ? (
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-[#556156]">
                  A newly created vault requires an initial seed deposit of at least <strong>10 USDC</strong> to establish the base pool share accounting before trading is enabled.
                </p>
                {managerAllowed && (
                  <button
                    type="button"
                    onClick={onSeed}
                    disabled={isBusy}
                    className="folio-button-primary flex w-full items-center justify-center gap-2 py-2"
                  >
                    {action === 'seeding' ? 'Seeding vault…' : 'Deposit 10 USDC Seed Capital →'}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-[#237b68]">
                <span>✓</span>
                <span>Initial seed capital verified on-chain. Initial share NAV established.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER 3: Strategy & Allocation Weights */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step3')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                step3Done ? 'bg-[#237b68]' : 'bg-[#6b746c]'
              }`}
            >
              {step3Done ? '✓' : '3'}
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Step 3</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Strategy & Target Weights
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold text-[#6b746c]">
              {vault.plan ? `v${vault.plan.version}` : 'Draft'}
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step3 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step3 && (
          <div className="space-y-4 border-t border-[#e2e6df] p-4 text-xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b746c]">
                Target Asset Weights
              </label>
              <span
                className={`font-mono text-[11px] font-bold ${
                  validWeights ? 'text-[#237b68]' : 'text-[#6b746c]'
                }`}
              >
                Total: {totalPercent}% / 100% {validWeights ? '✓' : `(${100 - totalPercent}% free)`}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#717b72]">
              <span>Adjust weights within remaining 0–100% headroom.</span>
              <button
                type="button"
                disabled={!managerAllowed || publishing}
                onClick={() => {
                  if (tokens.length === 0) return;
                  const perToken = Math.floor(100 / tokens.length);
                  const rem = 100 - (perToken * tokens.length);
                  const next: Record<string, number> = {};
                  tokens.forEach((t, i) => {
                    next[t.mint] = perToken + (i === 0 ? rem : 0);
                  });
                  setWeights(next);
                }}
                className="font-medium text-[#237b68] hover:underline"
              >
                Equally balance all ({tokens.length})
              </button>
            </div>

            {/* Target Weight Sliders */}
            <div className="space-y-2.5">
              {tokens.map((token) => {
                const currentPct = weights[token.mint] ?? 0;
                const otherSum = tokens.reduce((sum, t) => {
                  if (t.mint === token.mint) return sum;
                  return sum + (Number(weights[t.mint]) || 0);
                }, 0);
                const maxAllowed = Math.max(0, 100 - otherSum);

                return (
                  <div key={token.mint} className="rounded-lg border border-[#e2e6df] bg-white p-2.5 shadow-sm">
                    <div className="flex items-center justify-between text-[11px]">
                      <div>
                        <strong className="text-[#253328]">{token.symbol}</strong>
                        <span className="ml-1 text-[10px] text-[#717b72]">({token.name})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={currentPct}
                          disabled={!managerAllowed || publishing}
                          onChange={(e) => {
                            const raw = Number(e.target.value) || 0;
                            const clamped = Math.min(maxAllowed, Math.max(0, raw));
                            setWeights((prev) => ({...prev, [token.mint]: clamped}));
                          }}
                          className="h-6 w-14 rounded border border-[#cdd3ca] px-1 text-right font-mono text-[11px] font-bold"
                        />
                        <span className="font-mono text-[10px] font-semibold text-[#717b72]">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.min(currentPct, maxAllowed)}
                      disabled={!managerAllowed || publishing}
                      onChange={(e) => {
                        const raw = Number(e.target.value) || 0;
                        const clamped = Math.min(maxAllowed, Math.max(0, raw));
                        setWeights((prev) => ({...prev, [token.mint]: clamped}));
                      }}
                      className="mt-2 h-1 w-full accent-[#237b68]"
                    />
                    <div className="mt-1 flex items-center justify-between text-[9px] text-[#849087]">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Investment thesis memo */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b746c]">
                  Investment Thesis & Memo
                </label>
                <span className={`font-mono text-[10px] ${validLength ? 'text-[#717b72]' : 'text-[#a14343]'}`}>
                  {bytes} / {MAX_PLAN_BYTES} B
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!managerAllowed || publishing}
                placeholder="Describe your index strategy, rebalancing rules, and asset selection..."
                className="mt-1.5 h-20 w-full rounded-lg border border-[#cdd3ca] bg-white p-2 text-[11px] leading-relaxed text-[#253328]"
              />
            </div>

            {error && (
              <div className="border-l-2 border-[#a14343] pl-2 text-[11px] text-[#a14343]">
                {error}
              </div>
            )}

            {/* Action buttons */}
            {managerAllowed && (
              <div className="flex gap-2">
                {isDraftOrSeeded ? (
                  <button
                    type="button"
                    onClick={() => void handleSaveStrategy()}
                    disabled={!validLength || !validWeights || publishing}
                    className="folio-button-primary flex-1 py-2 text-[11px]"
                  >
                    {publishing ? 'Publishing on-chain…' : 'Publish Strategy & Targets →'}
                  </button>
                ) : (
                  <div className="w-full space-y-2">
                    {activeProposal ? (
                      <div className="rounded-lg border border-[#c2b280] bg-[#fffbf0] p-2.5 text-[11px] text-[#7a6b32]">
                        <div className="flex items-center justify-between font-bold">
                          <span>Governance Proposal #{activeProposal.id}</span>
                          <span className="font-mono text-[10px] uppercase">{activeProposal.status}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-[#6b746c]">
                          Bond attached: {formatSol(activeProposal.bondLamports)}. You can force rebalancing now or conclude this proposal to immediately refund the bond to your wallet and close the voting panel.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleForceRebalance()}
                            disabled={rebalancePending}
                            className="folio-button-primary flex-1 py-2 text-[11px]"
                          >
                            {rebalancePending ? 'Executing Rebalance…' : '⚡ Force Rebalance Now'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRefundProposal()}
                            disabled={rebalancePending}
                            className="rounded-lg border border-[#c2b280] bg-[#fffbf0] px-3 py-2 text-[11px] font-bold text-[#7a6b32] hover:bg-[#faedd0] transition"
                            title="Conclude voting and refund 0.05 SOL bond immediately"
                          >
                            Conclude & Refund
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowProposeModal(true)}
                          disabled={!validLength || !validWeights || publishing}
                          className="folio-button-primary w-full py-2 text-[11px]"
                        >
                          Propose Strategy Amendment to Investors →
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleForceRebalance()}
                          disabled={rebalancePending}
                          className="folio-button-secondary w-full py-2 text-[11px]"
                        >
                          {rebalancePending ? 'Executing Rebalance…' : '⚡ Force Rebalance Vault Assets Now'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER 4: Autonomous Keeper & Gas Tank */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step4')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                step4Done ? 'bg-[#237b68]' : 'bg-[#e2a82b]'
              }`}
            >
              {step4Done ? '✓' : '4'}
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Step 4</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Automation & Gas Tank
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-[#237b68]">
              {gasSol} SOL
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step4 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step4 && (
          <div className="space-y-4 border-t border-[#e2e6df] p-4 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-[#e2e6df] bg-white p-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#6b746c]">Keeper Gas Tank</span>
                <div className="font-mono text-[13px] font-bold text-[#253328]">
                  {formatSol(vault.gasTankLamports || '0')}
                </div>
              </div>
              {managerAllowed && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => void handleTopUpGas(50_000_000)}
                    className="folio-button-quiet min-h-0 px-2 py-1 text-[10px]"
                  >
                    +0.05 SOL
                  </button>
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => void handleTopUpGas(100_000_000)}
                    className="folio-button-quiet min-h-0 px-2 py-1 text-[10px]"
                  >
                    +0.1 SOL
                  </button>
                </div>
              )}
            </div>

            {/* 1-Click Multi-Trade Rebalance */}
            {isActive && (
              <div className="rounded-xl border border-[#237b68]/30 bg-[#f4f7f2] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="eyebrow text-[#237b68]">1-SIGN REBALANCE</span>
                  <span className="font-mono text-[10px] font-bold text-[#237b68]">0.00002 SOL fee</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#556156]">
                  Autonomous keeper runs every 12h. Force an immediate rebalance across all target assets now with a single wallet signature.
                </p>

                {rebalanceError && (
                  <div className="mt-2 border-l-2 border-[#a14343] pl-2 text-[10px] text-[#a14343]">
                    {rebalanceError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleForceRebalance()}
                  disabled={!managerAllowed || rebalancePending || publishing}
                  className="folio-button-primary mt-3 flex w-full items-center justify-center gap-2 py-2"
                >
                  {rebalancePending ? 'Executing on-chain rebalance…' : '⚡ 1-Click Multi-Trade Rebalance'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER 5: Guardian Activation */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step5')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                step5Done ? 'bg-[#237b68]' : 'bg-[#6b746c]'
              }`}
            >
              {step5Done ? '✓' : '5'}
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Step 5</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Guardian Activation
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                step5Done ? 'bg-[#dfede8] text-[#237b68]' : 'bg-[#faebd0] text-[#a67c1e]'
              }`}
            >
              {vault.state}
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step5 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step5 && (
          <div className="border-t border-[#e2e6df] p-4 text-xs">
            {vault.state === 'SEEDED' ? (
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-[#556156]">
                  Initial deposit confirmed! Click below to confirm guardian activation and unlock live investor deposits and trading.
                </p>
                {managerAllowed && (
                  <button
                    type="button"
                    onClick={onActivate}
                    disabled={isBusy}
                    className="folio-button-primary flex w-full items-center justify-center gap-2 py-2"
                  >
                    {action === 'activating' ? 'Activating vault…' : 'Activate Vault (Guardian) →'}
                  </button>
                )}
              </div>
            ) : vault.state === 'ACTIVE' ? (
              <div className="flex items-center gap-2 text-[11px] text-[#237b68]">
                <span>✓</span>
                <span>Vault is fully activated on Solana devnet. Open to investor capital and automated trading.</span>
              </div>
            ) : (
              <p className="text-[11px] text-[#717b72]">
                Complete Step 2 (Deposit Seed Capital) before activating the vault.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Strategy Amendment Modal */}
      {showProposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#cdd3ca] bg-[#f7f8f3] p-5 shadow-xl">
            <h3 className="font-editorial text-[20px] font-medium text-[#253328]">
              Propose Strategy Amendment
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-[#6b746c]">
              Proposing a strategy change locks a 0.05 SOL bond and opens a governance vote for vault share holders. If passed, the strategy is adopted.
            </p>

            <div className="mt-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b746c]">
                Voting Period (Days)
              </label>
              <input
                type="number"
                min="1"
                max="14"
                value={votingDays}
                onChange={(e) => setVotingDays(Number(e.target.value) || 3)}
                className="mt-1 h-8 w-full rounded border border-[#cdd3ca] bg-white px-2 font-mono text-[12px] font-bold"
              />
            </div>

            {vault.openProposal && isProposalClosedLocally && (
              <div className="mt-3 rounded border border-[#c2b280] bg-[#fffbf0] p-2.5 text-[10px] text-[#7a6b32]">
                Proposal #{vault.openProposal.id} on this vault has been concluded & refunded. Note: on Solana devnet, the program allows 1 proposal per vault at a time until the voting duration expires. If you want to propose another vote immediately, test with a newly created vault.
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowProposeModal(false)}
                className="folio-button-quiet flex-1 py-2 text-[11px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleProposeAmendment()}
                disabled={publishing}
                className="folio-button-primary flex-1 py-2 text-[11px]"
              >
                {publishing ? 'Submitting proposal…' : 'Submit On-Chain Proposal (0.05 SOL)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
