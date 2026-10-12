'use client';

import {useState, useMemo} from 'react';
import {PublicKey} from '@solana/web3.js';
import {useNotify} from '@/components/Toast';
import {explainError, useOnChainTokens, type VaultView} from '@/lib/contracts/hooks';
import {deployment} from '@/lib/solana/config';
import {formatSol} from '@/lib/domain/format';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';
import {useCuratorActions} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

export function PlanCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const {action, setStrategy, proposeStrategy, fundGas, forceRebalance} = useCuratorActions();

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

  const isClosedLocally =
    typeof window !== 'undefined' &&
    Boolean(localStorage.getItem(`folio_closed_proposal_${vault.address}`));
  const activeProposal = vault.openProposal && !isClosedLocally ? vault.openProposal : null;

  // Initialize target weights from vault.targets or stored curator choices
  const initialWeights = useMemo(() => {
    const map: Record<string, number> = {};
    if (vault.targets && vault.targets.length > 0) {
      for (const t of vault.targets) {
        map[t.asset] = t.targetPercent;
      }
      return map;
    }

    if (tokens.length === 0) return map;

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

  async function handleForceRebalance() {
    if (!managerAllowed || !isActive || rebalancePending) return;
    setRebalanceError(null);
    setRebalancePending(true);
    try {
      const res = await forceRebalance(vault);
      const count = res.trades?.length ?? 1;
      notify(`Full portfolio rebalance complete! ${count} trades executed to match target weights.`);
    } catch (caught) {
      const message = explainError(caught);
      setRebalanceError(message);
      notify(message);
    } finally {
      setRebalancePending(false);
    }
  }

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

  const gasSol = (Number(vault.gasTankLamports || '0') / 1e9).toFixed(3);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#cdd3ca] pb-4">
        <div>
          <span className="eyebrow">AUTONOMOUS GOVERNED INDEX</span>
          <h2 className="font-editorial mt-1 text-[25px] font-medium tracking-[-0.035em] text-[#2b3a30]">
            Strategy & Allocation
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              vault.plan
                ? 'border-[#7aa99d] bg-[#dfede8] text-[#237b68]'
                : 'border-[#b9c1b8] text-[#6b746c]'
            }`}
          >
            {vault.plan ? `v${vault.plan.version}` : 'DRAFT'}
          </span>
          <span className="shrink-0 rounded-full border border-[#2b4c3f]/20 bg-[#2b4c3f]/5 px-2.5 py-1 text-[10px] font-semibold text-[#2b4c3f]">
            {vault.state}
          </span>
        </div>
      </div>

      {/* Gas Tank Overview */}
      <div className="flex items-center justify-between rounded-xl border border-[#cdd3ca] bg-[#f4f6f3] p-3 text-xs">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-[#6b746c]">Keeper Gas Tank</span>
          <div className="font-mono text-sm font-semibold text-[#2b3a30]">{formatSol(vault.gasTankLamports || '0')}</div>
        </div>
        {managerAllowed && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={publishing}
              onClick={() => void handleTopUpGas(50_000_000)}
              className="folio-button-quiet min-h-0 px-2 py-1 text-[11px]"
            >
              +0.05 SOL
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void handleTopUpGas(100_000_000)}
              className="folio-button-quiet min-h-0 px-2 py-1 text-[11px]"
            >
              +0.1 SOL
            </button>
          </div>
        )}
      </div>

      {/* Autonomous Keeper Rebalance & Demo Trigger */}
      {isActive && (
        <div className="rounded-xl border border-[#237b68]/30 bg-[#f4f7f2] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="eyebrow text-[#237b68]">AUTONOMOUS KEEPER CRANK</span>
              <h3 className="font-editorial text-[17px] font-medium text-[#2b3a30]">
                Index Target Rebalance
              </h3>
            </div>
            <span className="shrink-0 rounded-full border border-[#237b68]/20 bg-[#dfede8] px-2.5 py-1 font-mono text-[10px] font-bold text-[#237b68]">
              Fee: 0.00002 SOL
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-[1.6] text-[#556156]">
            Keepers automatically rebalance the portfolio every 12 hours when holdings drift &gt; 1% from targets. For live testing or demo presentations, you can force an on-chain rebalancing cycle immediately (costs 0.00002 SOL from vault gas tank).
          </p>

          {rebalanceError && (
            <div className="mt-2 border-l-2 border-[#a14343] pl-2 text-[11px] text-[#8f3e3e]">
              {rebalanceError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleForceRebalance()}
            disabled={!managerAllowed || rebalancePending || publishing}
            className="folio-button-primary mt-3 flex w-full items-center justify-center gap-2"
          >
            {rebalancePending ? 'Executing on-chain rebalance…' : '⚡ Force Keeper Rebalance Now'}
          </button>
        </div>
      )}

      {/* Target Asset Allocation Weights */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#59645c]">
            Target Asset Weights
          </label>
          <span
            className={`font-mono text-[11px] font-semibold ${
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
            disabled={!managerAllowed || publishing || (isActive && !showProposeModal)}
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

        <div className="grid gap-2">
          {tokens.map((token) => {
            const currentVal = weights[token.mint] ?? 0;
            const otherSum = tokens.reduce((sum, t) => {
              if (t.mint === token.mint) return sum;
              return sum + (Number(weights[t.mint]) || 0);
            }, 0);
            const maxAllowed = Math.max(0, 100 - otherSum);
            const disabled = !managerAllowed || publishing || (isActive && !showProposeModal);

            return (
              <div
                key={token.mint}
                className="rounded-lg border border-[#dde2dc] bg-white p-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#2b3a30]">
                      {token.symbol}
                    </span>
                    <span className="text-[11px] text-[#717b72]">{token.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      disabled={disabled}
                      value={currentVal}
                      onChange={(e) => {
                        const raw = Number(e.target.value) || 0;
                        const clamped = Math.min(maxAllowed, Math.max(0, raw));
                        setWeights((prev) => ({...prev, [token.mint]: clamped}));
                      }}
                      className="w-16 rounded border border-[#cdd3ca] px-2 py-1 text-right font-mono text-xs font-medium text-[#2b3a30] focus:border-[#237b68] focus:outline-none disabled:bg-[#f2f4f1]"
                    />
                    <span className="text-xs text-[#717b72]">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.min(currentVal, maxAllowed)}
                  disabled={disabled}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 0;
                    const clamped = Math.min(maxAllowed, Math.max(0, raw));
                    setWeights((prev) => ({...prev, [token.mint]: clamped}));
                  }}
                  className="mt-2 h-1 w-full accent-[#237b68]"
                />
                <div className="mt-0.5 flex items-center justify-between text-[9px] text-[#849087]">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategy Thesis */}
      <div>
        <label className="grid gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#59645c]">
          Investment Thesis & Criteria
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Describe your index methodology, target rationale, and keeper rebalance triggers."
            disabled={!managerAllowed || publishing || (isActive && !showProposeModal)}
            className="folio-field min-h-[110px] resize-y text-[12px] font-normal normal-case leading-[1.6] tracking-normal placeholder:text-[#969e97]"
          />
        </label>

        <div
          className={`mt-1 flex items-center justify-between font-mono text-[11px] ${
            bytes > MAX_PLAN_BYTES ? 'text-[#a14343]' : 'text-[#778078]'
          }`}
        >
          <span>
            {bytes === 0
              ? 'Enter at least 1 UTF-8 byte.'
              : validLength
                ? `${bytes} / ${MAX_PLAN_BYTES} bytes`
                : 'Exceeds 1,000-byte contract limit.'}
          </span>
        </div>
      </div>

      {/* Warnings & Errors */}
      {managerAllowed && error && (
        <div role="alert" className="border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.6] text-[#8f3e3e]">
          <strong className="block font-bold">Action failed</strong>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      {/* Active Proposal Status Notice */}
      {activeProposal && (
        <div className="rounded-xl border border-[#c2b280] bg-[#fdfbf4] p-3 text-xs leading-relaxed text-[#7a6b32]">
          <div className="flex items-center justify-between font-semibold">
            <span>Active Governance Proposal #{activeProposal.id}</span>
            <span className="font-mono text-[10px] uppercase">{activeProposal.status}</span>
          </div>
          <p className="mt-1 text-[11px] text-[#6b746c]">
            Bond attached: {formatSol(activeProposal.bondLamports)}. Performing rebalance will immediately refund this bond to your wallet and close the voting panel.
          </p>
          <button
            type="button"
            onClick={() => void handleForceRebalance()}
            disabled={rebalancePending}
            className="folio-button-primary mt-2 w-full py-2 text-[11px]"
          >
            {rebalancePending ? 'Rebalancing & Refunding Bond…' : '⚡ Rebalance & Refund 0.05 SOL Bond'}
          </button>
        </div>
      )}

      {/* Actions */}
      {isDraftOrSeeded && (
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-[#6b746c]">
            The Solana program requires an approved strategy and 100% target weights before guardian activation.
          </p>
          <button
            type="button"
            onClick={() => void handleSaveStrategy()}
            disabled={!managerAllowed || !validLength || !validWeights || publishing}
            className="folio-button-primary w-full"
          >
            {publishing ? 'Saving strategy on-chain...' : 'Save Strategy & Target Weights'}
          </button>
        </div>
      )}

      {isActive && !vault.openProposal && (
        <div className="space-y-3">
          {!showProposeModal ? (
            <div>
              <p className="text-[11px] leading-relaxed text-[#6b746c]">
                Vault strategy is locked on-chain. Curators may propose an index amendment requiring community vote and 48h timelock ragequit protection.
              </p>
              <button
                type="button"
                onClick={() => setShowProposeModal(true)}
                disabled={!managerAllowed || publishing}
                className="folio-button-primary mt-3 w-full"
              >
                Propose Strategy Amendment
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-[#2b4c3f]/30 bg-[#f7faf8] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2b3a30]">Proposal Parameters</span>
                <button
                  type="button"
                  onClick={() => setShowProposeModal(false)}
                  className="text-xs text-[#717b72] underline"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#59645c]">
                  Voting Period: {votingDays} days
                </label>
                <input
                  type="range"
                  min="1"
                  max="14"
                  value={votingDays}
                  onChange={(e) => setVotingDays(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </div>

              <div className="rounded-lg border border-[#cdd3ca] bg-white p-2.5 text-[11px] leading-relaxed text-[#6b746c]">
                Posting requires a <strong>0.05 SOL</strong> bond. It is 100% refunded to you if the proposal is rejected, or deposited into the vault gas tank if executed.
              </div>

              <button
                type="button"
                onClick={() => void handleProposeAmendment()}
                disabled={!managerAllowed || !validLength || !validWeights || publishing}
                className="folio-button-primary w-full"
              >
                {publishing ? 'Submitting proposal on-chain...' : 'Submit Proposal (0.05 SOL Bond)'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
