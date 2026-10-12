'use client';

import {useState, useMemo} from 'react';
import {PublicKey} from '@solana/web3.js';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {deployment} from '@/lib/solana/config';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';
import {useCuratorActions} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

export function PlanCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const {action, setStrategy, proposeStrategy, fundGas} = useCuratorActions();

  const tokens = useMemo(() => {
    try {
      return deployment().tokens;
    } catch {
      return [];
    }
  }, []);

  // Initialize target weights from vault.targets or defaults
  const initialWeights = useMemo(() => {
    const map: Record<string, number> = {};
    if (vault.targets && vault.targets.length > 0) {
      for (const t of vault.targets) {
        map[t.asset] = t.targetPercent;
      }
    } else {
      // Default: 40% USDC, 30% AAPLx, 30% NVDAx (or equal split)
      const usdc = tokens.find((t) => t.symbol === 'USDC');
      const aapl = tokens.find((t) => t.symbol === 'AAPLx');
      const nvda = tokens.find((t) => t.symbol === 'NVDAx');
      if (usdc && aapl && nvda) {
        map[usdc.mint] = 40;
        map[aapl.mint] = 30;
        map[nvda.mint] = 30;
      }
    }
    return map;
  }, [vault.targets, tokens]);

  const [text, setText] = useState(vault.plan?.text ?? '');
  const [weights, setWeights] = useState<Record<string, number>>(initialWeights);
  const [votingDays, setVotingDays] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);

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
          <div className="font-mono text-sm font-semibold text-[#2b3a30]">{gasSol} SOL</div>
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

      {/* Target Asset Allocation Weights */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#59645c]">
            Target Asset Weights
          </label>
          <span
            className={`font-mono text-[11px] font-semibold ${
              validWeights ? 'text-[#237b68]' : 'text-[#a14343]'
            }`}
          >
            Total: {totalPercent}% / 100%
          </span>
        </div>

        <div className="grid gap-2">
          {tokens.map((token) => {
            const currentVal = weights[token.mint] ?? 0;
            const disabled = !managerAllowed || publishing || (isActive && !showProposeModal);
            return (
              <div
                key={token.mint}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#dde2dc] bg-white p-2.5"
              >
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
                      const val = Number(e.target.value) || 0;
                      setWeights((prev) => ({...prev, [token.mint]: val}));
                    }}
                    className="w-16 rounded border border-[#cdd3ca] px-2 py-1 text-right font-mono text-xs font-medium text-[#2b3a30] focus:border-[#237b68] focus:outline-none disabled:bg-[#f2f4f1]"
                  />
                  <span className="text-xs text-[#717b72]">%</span>
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
      {vault.openProposal && (
        <div className="rounded-xl border border-[#c2b280] bg-[#fdfbf4] p-3 text-xs leading-relaxed text-[#7a6b32]">
          <strong className="block font-semibold">Active Governance Proposal Open</strong>
          <p className="mt-1">
            Proposal #{vault.openProposal.id} is currently in <strong>{vault.openProposal.status}</strong> status.
            Investors are reviewing and voting on new target weights. Additional proposals cannot be submitted until this cycle concludes.
          </p>
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
