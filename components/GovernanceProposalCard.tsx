'use client';

import {useState} from 'react';
import type {VaultView} from '@/lib/vaults/read';
import {useVote, useFinalizeProposal, useExecuteProposal, explainError} from '@/lib/contracts/hooks';
import {useConnection} from '@/lib/contracts/wallet';
import {sameAddress} from '@/components/curator/model';
import {useNotify} from '@/components/Toast';
import {formatSol, tokenAmount} from '@/lib/domain/format';

interface Props {
  vault: VaultView;
  connected: boolean;
}

export function GovernanceProposalCard({vault, connected}: Props) {
  const notify = useNotify();
  const {address} = useConnection();
  const isCurator = Boolean(address && sameAddress(vault.manager, address));
  const proposal = vault.openProposal;
  const {vote, pending: voting} = useVote();
  const {finalize, pending: finalizing} = useFinalizeProposal();
  const {execute, pending: executing} = useExecuteProposal();
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  if (!proposal || proposal.status === 'Executed' || proposal.status === 'Rejected') {
    return null;
  }

  const now = Date.now();
  const votingOpen = proposal.status === 'Voting' && now < proposal.votingEndsAt;
  const votingExpired = proposal.status === 'Voting' && now >= proposal.votingEndsAt;
  const inTimelock = proposal.status === 'Timelock';
  const timelockExpired = inTimelock && now >= proposal.timelockEndsAt;

  const userVotingPower = vault.position?.votingPower ?? vault.position?.shares ?? '0';
  const hasVotingPower = BigInt(userVotingPower) > BigInt(0);

  async function handleRefundAndClose() {
    if (!proposal) return;
    setError(null);
    setClosing(true);
    try {
      await fetch('/api/proposal/refund', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({vault: vault.address, curator: proposal.proposer, proposalId: proposal.id}),
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(proposal.id));
        localStorage.removeItem(`folio_has_proposal_${vault.address}`);
      }
      notify('0.05 SOL proposal bond refunded immediately to curator. Voting panel closed.');
      window.location.reload();
    } catch (err) {
      const msg = explainError(err);
      setError(msg);
      notify(msg);
    } finally {
      setClosing(false);
    }
  }

  async function handleVote(isYes: boolean) {
    if (!proposal || !connected) return;
    setError(null);
    try {
      await vote(vault.address, proposal.address, isYes);
      notify(`Vote ${isYes ? 'YES' : 'NO'} cast successfully.`);
    } catch (err) {
      const msg = explainError(err);
      setError(msg);
      notify(msg);
    }
  }

  async function handleFinalize() {
    if (!proposal || !connected) return;
    setError(null);
    try {
      await finalize(vault.address, proposal.address, proposal.proposer);
      notify('Proposal voting finalized.');
    } catch (err) {
      const msg = explainError(err);
      setError(msg);
      notify(msg);
    }
  }

  async function handleExecute() {
    if (!proposal || !connected) return;
    setError(null);
    try {
      await execute(vault.address, proposal.address);
      await fetch('/api/proposal/refund', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({vault: vault.address, curator: proposal.proposer}),
      }).catch(() => null);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(proposal.id));
      }
      notify('New strategy executed on-chain! 0.05 SOL bond refunded to curator.');
    } catch (err) {
      const msg = explainError(err);
      setError(msg);
      notify(msg);
    }
  }

  return (
    <div className="mt-12 rounded-xl border border-[#237b68]/30 bg-[#f4f7f2] p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8e0d5] pb-4">
        <div>
          <span className="eyebrow text-[#237b68]">AUTONOMOUS GOVERNANCE PROPOSAL #{proposal.id}</span>
          <h3 className="font-editorial mt-1 text-[22px] font-medium tracking-tight text-[#2b3a30]">
            Strategy Weight Amendment
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {proposal.bondLamports && (
            <span className="rounded-full border border-[#2b4c3f]/20 bg-[#2b4c3f]/5 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#2b4c3f]">
              Bond: {formatSol(proposal.bondLamports)} {proposal.bondRefunded ? '(Refunded)' : ''}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase ${
              proposal.status === 'Voting'
                ? 'bg-[#dfede8] text-[#237b68] border border-[#7aa99d]'
                : proposal.status === 'Timelock'
                ? 'bg-[#fff5d6] text-[#8c6b12] border border-[#e6c875]'
                : proposal.status === 'Passed'
                ? 'bg-[#e2e8e0] text-[#4d594f]'
                : 'bg-[#fae6e6] text-[#a14343]'
            }`}
          >
            {proposal.status}
          </span>
        </div>
      </div>

      <div className="mt-4 text-[13px] leading-relaxed text-[#4d594f]">
        <p className="font-medium text-[#2b3a30]">Proposed Plan Thesis:</p>
        <p className="mt-1 italic text-[#5f6c61]">“{proposal.planText}”</p>
      </div>

      {/* Target Weights Diff */}
      <div className="mt-5 rounded-lg border border-[#d8e0d5] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b776d]">Proposed Target Weights</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {proposal.targets.map((t) => {
            const currentTarget = vault.targets.find((ct) => ct.asset === t.asset)?.targetPercent ?? 0;
            const diff = t.targetPercent - currentTarget;
            return (
              <div key={t.asset} className="rounded-md bg-[#f7f9f5] p-2.5 text-[12px]">
                <div className="flex justify-between font-semibold text-[#2b3a30]">
                  <span>{t.symbol}</span>
                  <span className="font-mono">{t.targetPercent}%</span>
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[#788479]">
                  <span>Current: {currentTarget}%</span>
                  <span className={diff > 0 ? 'text-[#237b68] font-bold' : diff < 0 ? 'text-[#a14343] font-bold' : ''}>
                    {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : '0%'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quorum & Voting Stats */}
      <div className="mt-5 grid gap-4 border-t border-[#d8e0d5] pt-4 sm:grid-cols-2">
        <div>
          <div className="flex justify-between text-[11px] text-[#5f6c61]">
            <span>Quorum (20% required):</span>
            <span className="font-mono font-semibold">{proposal.quorumReached ? 'Reached ✓' : 'In Progress'}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dce1da]">
            <div
              className={`h-full rounded-full transition-all ${
                proposal.quorumReached ? 'bg-[#237b68]' : 'bg-[#e2a93b]'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  proposal.snapshotShares !== '0'
                    ? ((Number(proposal.yesShares) + Number(proposal.noShares)) / Number(proposal.snapshotShares)) * 500
                    : 0,
                )}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[11px] text-[#5f6c61]">
            <span>Voting Breakdown:</span>
            <span className="font-mono">
              <strong className="text-[#237b68]">{proposal.yesPercent}% Yes</strong> ·{' '}
              <strong className="text-[#a14343]">{proposal.noPercent}% No</strong>
            </span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#dce1da]">
            <span style={{width: `${proposal.yesPercent}%`}} className="bg-[#237b68]" />
            <span style={{width: `${proposal.noPercent}%`}} className="bg-[#a14343]" />
          </div>
        </div>
      </div>

      {/* Timelock Notice for Ragequit */}
      {inTimelock && (
        <div className="mt-5 rounded-lg border-l-4 border-[#e2a93b] bg-[#fffbf0] p-4 text-[12px] text-[#7a5e12]">
          <strong>48-Hour Timelock Active (Ragequit Window Open):</strong>
          <p className="mt-1">
            This proposal has passed. Dissenting investors have a guaranteed 48-hour window to redeem 100% of their
            portfolio pro-rata in kind before new weights activate on-chain.
          </p>
        </div>
      )}

      {/* User Voting Status & Actions */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#d8e0d5] pt-4">
        <div className="text-[12px] text-[#4d594f]">
          {proposal.userVote ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#237b68]">
              ✓ You voted {proposal.userVote.isYes ? 'YES' : 'NO'} with{' '}
              {tokenAmount(proposal.userVote.shares ?? '0', 6, 2)} snapshot shares.
            </span>
          ) : hasVotingPower ? (
            <span>
              Your snapshot voting power: <strong>{tokenAmount(userVotingPower, 6, 2)} shares</strong>
            </span>
          ) : (
            <span>No snapshot shares held for this proposal.</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {votingOpen && !proposal.userVote && (
            <>
              <button
                type="button"
                disabled={!connected || !hasVotingPower || voting}
                onClick={() => handleVote(true)}
                className="folio-button-primary px-5 py-2 text-[12px]"
              >
                Vote YES
              </button>
              <button
                type="button"
                disabled={!connected || !hasVotingPower || voting}
                onClick={() => handleVote(false)}
                className="folio-button-secondary px-5 py-2 text-[12px]"
              >
                Vote NO
              </button>
            </>
          )}

          {votingExpired && (
            <button
              type="button"
              disabled={!connected || finalizing}
              onClick={handleFinalize}
              className="folio-button-primary px-5 py-2 text-[12px]"
            >
              {finalizing ? 'Finalizing…' : 'Finalize Voting'}
            </button>
          )}

          {timelockExpired && (
            <button
              type="button"
              disabled={!connected || executing}
              onClick={handleExecute}
              className="folio-button-primary px-5 py-2 text-[12px]"
            >
              {executing ? 'Executing…' : 'Execute Strategy'}
            </button>
          )}

          {/* Instant Refund & Close Option (Curator only) */}
          {isCurator && !proposal.bondRefunded && (
            <button
              type="button"
              disabled={closing}
              onClick={handleRefundAndClose}
              className="rounded-lg border border-[#c2b280] bg-[#fffbf0] px-3.5 py-2 text-[11px] font-bold text-[#7a6b32] hover:bg-[#faedd0] transition"
              title="Conclude voting, refund the 0.05 SOL bond immediately to curator"
            >
              {closing ? 'Refunding…' : '⚡ Conclude & Refund 0.05 SOL'}
            </button>
          )}
          {proposal.bondRefunded && (
            <span className="rounded-lg border border-[#237b68]/30 bg-[#237b68]/10 px-3 py-1.5 text-[11px] font-semibold text-[#237b68]">
              ✓ Bond Refunded
            </span>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-[11px] text-[#a14343]">{error}</p>}
    </div>
  );
}
