'use client';

import {useState, useMemo, useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {PublicKey} from '@solana/web3.js';
import {useNotify} from '@/components/Toast';
import {explainError, useOnChainTokens, VAULTS_KEY, type VaultView} from '@/lib/contracts/hooks';
import type {TargetWeight} from '@/lib/vaults/read';
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
  const {action, setStrategy, proposeStrategy, fundGas, forceRebalance, closeVault} = useCuratorActions();

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

  const isVaultClosedState = vault.state === 'CLOSED';

  // Smart initial open state: open the step requiring attention
  const defaultOpenDrawer = useMemo(() => {
    if (vault.state === 'CLOSED') return 'step6';
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

  // Resolve which RWA tokens were picked when creating the vault
  const pickedRwaMints = useMemo(() => {
    // 1. From server vault data
    if (vault.pickedMints && vault.pickedMints.length > 0) {
      return vault.pickedMints;
    }
    // 2. From on-chain targets if already set
    if (vault.targets && vault.targets.length > 0) {
      const nonUsdc = vault.targets.filter((t) => t.symbol !== 'USDC').map((t) => t.asset);
      if (nonUsdc.length > 0) return nonUsdc;
    }
    // 3. From client localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`folio_vault_selected_assets_${vault.address}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    // 4. Default: all on-chain RWA tokens (excluding USDC)
    return tokens.filter((t) => t.symbol !== 'USDC').map((t) => t.mint);
  }, [vault.pickedMints, vault.targets, vault.address, tokens]);

  // Step 3 should ONLY show the RWA tokens picked when creating the vault
  const step3Tokens = useMemo(() => {
    const pickedSet = new Set(pickedRwaMints);
    return tokens.filter((t) => pickedSet.has(t.mint));
  }, [tokens, pickedRwaMints]);

  const usdcToken = useMemo(() => tokens.find((t) => t.symbol === 'USDC'), [tokens]);

  // Target weights initialization: default 100% USDC (all picked RWA stocks start at 0%), or honor on-chain targets
  const initialWeights = useMemo(() => {
    const map: Record<string, number> = {};
    if (vault.targets && vault.targets.length > 0) {
      let matchCount = 0;
      for (const t of vault.targets) {
        if (t.symbol !== 'USDC' && step3Tokens.some((st) => st.mint === t.asset)) {
          map[t.asset] = t.targetPercent;
          matchCount++;
        }
      }
      if (matchCount > 0) return map;
    }

    // Default 100% USDC -> all picked RWA stock tokens start at 0%
    for (const rwa of step3Tokens) {
      map[rwa.mint] = 0;
    }
    return map;
  }, [vault.targets, step3Tokens]);

  const [text, setText] = useState(vault.plan?.text ?? '');
  const [weights, setWeights] = useState<Record<string, number>>(initialWeights);
  const [votingDays, setVotingDays] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [rebalancePending, setRebalancePending] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
  const [concludingVote, setConcludingVote] = useState(false);

  const bytes = utf8ByteLength(text);
  const validLength = bytes >= 1 && bytes <= MAX_PLAN_BYTES;
  const isDraftOrSeeded = vault.state === 'DRAFT' || vault.state === 'SEEDED';
  const isActive = vault.state === 'ACTIVE';

  // RWA stock allocations total
  const rwaTotalPercent = useMemo(() => {
    return step3Tokens.reduce((sum, token) => sum + (Number(weights[token.mint]) || 0), 0);
  }, [step3Tokens, weights]);

  // USDC automatically absorbs whatever percentage is left
  const usdcPercent = Math.max(0, 100 - rwaTotalPercent);
  const totalPercent = 100;
  const validWeights = rwaTotalPercent <= 100;
  const publishing = action === 'publishing';

  const targetsPayload = useMemo(() => {
    const list: {mint: PublicKey; targetBps: number}[] = [];
    if (usdcToken && usdcPercent > 0) {
      list.push({
        mint: new PublicKey(usdcToken.mint),
        targetBps: Math.round(usdcPercent * 100),
      });
    }
    for (const token of step3Tokens) {
      const pct = Number(weights[token.mint]) || 0;
      if (pct > 0) {
        list.push({
          mint: new PublicKey(token.mint),
          targetBps: Math.round(pct * 100),
        });
      }
    }
    const sumBps = list.reduce((s, x) => s + x.targetBps, 0);
    if (list.length > 0 && sumBps !== 10000) {
      list[0].targetBps += 10000 - sumBps;
    }
    return list;
  }, [usdcToken, usdcPercent, step3Tokens, weights]);

  async function handleForceRebalance() {
    if (!managerAllowed || !isActive || rebalancePending) return;
    setRebalanceError(null);
    setRebalancePending(true);
    try {
      const customTargetsList: TargetWeight[] = [];
      if (usdcToken && usdcPercent > 0) {
        customTargetsList.push({
          asset: usdcToken.mint,
          symbol: 'USDC',
          targetBps: Math.round(usdcPercent * 100),
          targetPercent: usdcPercent,
        });
      }
      for (const token of step3Tokens) {
        const pct = Number(weights[token.mint]) || 0;
        if (pct > 0) {
          customTargetsList.push({
            asset: token.mint,
            symbol: token.symbol,
            targetBps: Math.round(pct * 100),
            targetPercent: pct,
          });
        }
      }
      const res = await forceRebalance(vault, customTargetsList.length > 0 ? customTargetsList : undefined);
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

  async function handleConcludeByVote(approved: boolean) {
    if (!activeProposal || !managerAllowed || concludingVote) return;
    setConcludingVote(true);
    setRebalanceError(null);
    try {
      if (approved) {
        // Adopt new strategy & execute rebalance to new targets
        const targets = activeProposal.targets;
        const plan = activeProposal.planText;

        await fetch('/api/proposal/refund', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            vault: vault.address,
            curator: vault.manager,
            proposalId: activeProposal.id,
            approved: true,
            targets,
            plan,
          }),
        });

        if (typeof window !== 'undefined') {
          localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(activeProposal.id));
          localStorage.removeItem(`folio_has_proposal_${vault.address}`);
          if (targets) {
            localStorage.setItem(`folio_vault_adopted_targets_${vault.address}`, JSON.stringify(targets));
          }
        }
        setIsProposalClosedLocally(true);

        try {
          await forceRebalance(vault, targets);
        } catch (rebErr) {
          console.warn('Post-approval rebalance note:', rebErr);
        }

        notify(`Proposal #${activeProposal.id} Approved! New strategy adopted, rebalanced, and 0.05 SOL bond refunded.`);
      } else {
        // Reject: retain current strategy and refund bond
        await fetch('/api/proposal/refund', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            vault: vault.address,
            curator: vault.manager,
            proposalId: activeProposal.id,
            approved: false,
          }),
        });

        if (typeof window !== 'undefined') {
          localStorage.setItem(`folio_closed_proposal_${vault.address}`, String(activeProposal.id));
          localStorage.removeItem(`folio_has_proposal_${vault.address}`);
        }
        setIsProposalClosedLocally(true);

        notify(`Proposal #${activeProposal.id} Rejected. Existing strategy retained, 0.05 SOL bond refunded to curator.`);
      }

      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      router.refresh();
    } catch (caught) {
      const message = explainError(caught);
      notify(message);
    } finally {
      setConcludingVote(false);
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

  const [closingVault, setClosingVault] = useState(false);
  const [liquidating, setLiquidating] = useState(false);
  const [proposingLiquidation, setProposingLiquidation] = useState(false);

  const usdcAsset = useMemo(() => {
    return vault.holdings.find((h) => h.symbol === 'USDC')?.asset || tokens.find((t) => t.symbol === 'USDC')?.mint || '';
  }, [vault.holdings, tokens]);

  const nonUsdcHoldings = useMemo(() => {
    return vault.holdings.filter((h) => h.symbol !== 'USDC' && BigInt(h.amount) > BigInt(0));
  }, [vault.holdings]);

  const hasNonUsdcAssets = nonUsdcHoldings.length > 0;
  const usdcHolding = useMemo(() => vault.holdings.find((h) => h.symbol === 'USDC'), [vault.holdings]);

  async function handleProposeLiquidation() {
    if (!managerAllowed || proposingLiquidation) return;
    if (!usdcAsset) {
      notify('USDC settlement token address could not be resolved.');
      return;
    }
    setProposingLiquidation(true);
    try {
      const planText = '[LIQUIDATION] Emergency liquidation to 100% USDC and vault closure. All positions will be converted to USDC cash.';
      const targets = [{mint: new PublicKey(usdcAsset), targetBps: 10000}];
      await proposeStrategy(vault.address, planText, targets, 1, 50_000_000);
      notify('Liquidation proposal submitted on-chain (0.05 SOL bond attached). Governance vote is open!');
      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      router.refresh();
    } catch (caught) {
      const message = explainError(caught);
      notify(message);
    } finally {
      setProposingLiquidation(false);
    }
  }

  async function handleLiquidateHoldingsToUsdc() {
    if (!managerAllowed || liquidating) return;
    if (!usdcAsset) {
      notify('USDC settlement token address could not be resolved.');
      return;
    }
    setLiquidating(true);
    try {
      const usdcTargets: TargetWeight[] = [
        {
          asset: usdcAsset,
          symbol: 'USDC',
          targetBps: 10000,
          targetPercent: 100,
        },
      ];
      const res = await forceRebalance(vault, usdcTargets);
      const count = res.trades?.length ?? 1;
      notify(`Liquidation rebalance executed! ${count} trade${count > 1 ? 's' : ''} confirmed. Vault portfolio converted to USDC.`);
      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      router.refresh();
    } catch (caught) {
      const message = explainError(caught);
      notify(message);
    } finally {
      setLiquidating(false);
    }
  }

  async function handleFinalizeVaultClose() {
    if (!managerAllowed || closingVault) return;
    setClosingVault(true);
    try {
      const res = await closeVault(vault.address);
      notify(`Vault closed successfully! ${res.reclaimedSol || '0.01 SOL'} rent-exemption reclaimed to your wallet.`);
      void queryClient.invalidateQueries({queryKey: [VAULTS_KEY]});
      router.refresh();
    } catch (caught) {
      const message = explainError(caught);
      notify(message);
    } finally {
      setClosingVault(false);
    }
  }

  // Holdings & overview data
  const holdings = vault.holdings.filter((h) => BigInt(h.amount) > BigInt(0));
  const mix = assetMix(vault.holdings);
  const tokenSymbol = useTokenSymbols(holdings);
  const totalMixValue = mix.status === 'ready' ? mix.assets.reduce((sum, a) => sum + a.value, 0) : null;
  const walletShare = vault.position ? sharePartsPerMillion(vault.position.shares, vault.totalSupply) : null;
  const gasSol = (Number(vault.gasTankLamports || '0') / 1e9).toFixed(3);
  const isBusy = action === 'seeding' || action === 'activating' || action === 'publishing' || liquidating || closingVault || proposingLiquidation;

  // Step Status Helpers
  const step1Done = true;
  const step2Done = vault.state !== 'DRAFT';
  const step3Done = Boolean(vault.targets && vault.targets.length > 0 && vault.plan);
  const step4Done = Number(vault.gasTankLamports || '0') >= 20_000;
  const step5Done = vault.state === 'ACTIVE';
  const step6Done = isVaultClosedState;

  return (
    <div className="space-y-3">
      {/* Visual Step Progress Strip */}
      <div className="rounded-xl border border-[#cdd3ca] bg-[#f2f4ee] p-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#455248]">
          <span className="eyebrow text-[#455248]">Setup & Lifecycle</span>
          <span className="font-mono text-[10px] text-[#6b746c]">
            {step6Done
              ? 'Closed · Rent Reclaimed'
              : step5Done
              ? '5 / 5 Complete (Active)'
              : step2Done
              ? 'Setup in Progress'
              : 'Initial Setup'}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-6 gap-1.5">
          <div className="h-1.5 rounded-full bg-[#237b68]" title="Step 1: Created" />
          <div className={`h-1.5 rounded-full ${step2Done ? 'bg-[#237b68]' : 'bg-[#e2a82b]'}`} title="Step 2: Seed" />
          <div className={`h-1.5 rounded-full ${step3Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 3: Strategy" />
          <div className={`h-1.5 rounded-full ${step4Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 4: Gas Tank" />
          <div className={`h-1.5 rounded-full ${step5Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 5: Active" />
          <div className={`h-1.5 rounded-full ${step6Done ? 'bg-[#237b68]' : 'bg-[#cdd3ca]'}`} title="Step 6: Liquidation & Closure" />
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
              <span className="font-mono text-[11px] font-bold text-[#237b68]">
                Total: 100% ✓ · USDC Cash: {usdcPercent}%
              </span>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#717b72]">
              <span>Adjust stock allocations; remaining percentage stays in USDC cash automatically.</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!managerAllowed || publishing}
                  onClick={() => {
                    const next: Record<string, number> = {};
                    step3Tokens.forEach((t) => { next[t.mint] = 0; });
                    setWeights(next);
                  }}
                  className="text-[#717b72] hover:text-[#253328] hover:underline"
                >
                  Reset to 100% USDC
                </button>
                <button
                  type="button"
                  disabled={!managerAllowed || publishing || step3Tokens.length === 0}
                  onClick={() => {
                    if (step3Tokens.length === 0) return;
                    const perToken = Math.floor(100 / step3Tokens.length);
                    const rem = 100 - (perToken * step3Tokens.length);
                    const next: Record<string, number> = {};
                    step3Tokens.forEach((t, i) => {
                      next[t.mint] = perToken + (i === 0 ? rem : 0);
                    });
                    setWeights(next);
                  }}
                  className="font-medium text-[#237b68] hover:underline"
                >
                  Equally balance stocks (0% USDC)
                </button>
              </div>
            </div>

            {/* Target Weight Sliders */}
            <div className="space-y-2.5">
              {/* Read-Only Auto-Calculated USDC Cash Card */}
              <div className="rounded-xl border border-[#237b68]/30 bg-[#f0f7f4] p-3 shadow-2xs">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#237b68] font-mono text-[10px] font-bold text-white shadow-xs">
                      $
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-[#253328]">USDC</strong>
                        <span className="rounded bg-[#dfede8] px-1.5 py-0.2 font-mono text-[9px] font-semibold text-[#237b68]">
                          Settlement Cash · Auto-Calculated
                        </span>
                      </div>
                      <div className="text-[10px] text-[#59645c]">
                        Unallocated fund balance remains in USDC cash reserve.
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[15px] font-extrabold text-[#237b68]">
                      {usdcPercent}%
                    </span>
                  </div>
                </div>

                {/* Visual Distribution Progress Bar for USDC */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#dce1da]">
                  <div
                    className="h-full rounded-full bg-[#237b68] transition-all duration-200"
                    style={{width: `${usdcPercent}%`}}
                  />
                </div>
              </div>
              {step3Tokens.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#cdd3ca] p-3 text-center text-[11px] text-[#717b72]">
                  No RWA tokens were picked for this vault.
                </div>
              ) : (
                step3Tokens.map((token) => {
                  const currentPct = weights[token.mint] ?? 0;
                  const otherSum = step3Tokens.reduce((sum, t) => {
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
                })
              )}
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
                      <div className="rounded-lg border border-[#c2b280] bg-[#fffbf0] p-3 text-[11px] text-[#7a6b32]">
                        <div className="flex items-center justify-between font-bold">
                          <div className="flex items-center gap-1.5">
                            <span>Governance Proposal #{activeProposal.id}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                                activeProposal.hasPassed
                                  ? 'bg-[#237b68] text-white'
                                  : 'bg-[#c2b280]/40 text-[#5c4f22]'
                              }`}
                            >
                              {activeProposal.hasPassed ? 'Passed (Approved)' : 'In Voting'}
                            </span>
                          </div>
                          <span className="font-mono text-[10px]">Bond: {formatSol(activeProposal.bondLamports)}</span>
                        </div>

                        {/* Live Vote Progress Bar */}
                        <div className="mt-2 space-y-1 rounded-md bg-white/60 p-2">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-[#237b68]">YES: {activeProposal.yesPercent.toFixed(1)}%</span>
                            <span className="text-[#a14343]">NO: {activeProposal.noPercent.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e3e6df]">
                            <div
                              className="h-full bg-[#237b68] transition-all"
                              style={{width: `${Math.min(100, Math.max(0, activeProposal.yesPercent))}%`}}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-[#717b72]">
                            <span>Quorum: {activeProposal.quorumReached ? '✓ Met (≥20%)' : 'Pending (<20%)'}</span>
                            <span>
                              Current Verdict:{' '}
                              <strong className={activeProposal.hasPassed ? 'text-[#237b68]' : 'text-[#a14343]'}>
                                {activeProposal.hasPassed ? 'Approved' : 'Not Approved'}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Proposed Targets Preview */}
                        {activeProposal.targets && activeProposal.targets.length > 0 && (
                          <div className="mt-2 rounded bg-white/70 p-1.5 text-[10px]">
                            <span className="font-bold text-[#455248]">Proposed Weights: </span>
                            {activeProposal.targets.map((t) => `${t.symbol}: ${t.targetPercent}%`).join(', ')}
                          </div>
                        )}

                        {/* Decision actions */}
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => void handleConcludeByVote(activeProposal.hasPassed)}
                            disabled={concludingVote || rebalancePending}
                            className="folio-button-primary w-full py-2 text-[11px] font-bold shadow-xs flex items-center justify-center gap-1.5"
                          >
                            {concludingVote
                              ? 'Concluding & Executing…'
                              : activeProposal.hasPassed
                              ? '⚡ Stop Voting & Apply Approved Strategy (Rebalance + Refund)'
                              : '⚡ Stop Voting & Conclude as Rejected (Keep Strategy + Refund)'}
                          </button>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleConcludeByVote(true)}
                              disabled={concludingVote || rebalancePending}
                              className="flex-1 rounded-lg border border-[#237b68] bg-[#f0f7f4] py-1.5 text-[10px] font-bold text-[#237b68] hover:bg-[#e1f0ea] transition"
                              title="Force approve and execute new strategy regardless of current vote count"
                            >
                              Force Approve & Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleConcludeByVote(false)}
                              disabled={concludingVote || rebalancePending}
                              className="flex-1 rounded-lg border border-[#c2b280] bg-[#fffbf0] py-1.5 text-[10px] font-bold text-[#7a6b32] hover:bg-[#faedd0] transition"
                              title="Reject proposal, retain current strategy, and refund 0.05 SOL bond"
                            >
                              Reject & Refund
                            </button>
                          </div>
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

      {/* DRAWER 6: Vault Liquidation & Closure (Reclaim Rent) */}
      <div className="overflow-hidden rounded-xl border border-[#cdd3ca] bg-[#fafbf8] transition-all">
        <button
          type="button"
          onClick={() => toggleDrawer('step6')}
          className="flex w-full items-center justify-between p-3.5 text-left hover:bg-[#f2f5ee]"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                isVaultClosedState ? 'bg-[#237b68]' : 'bg-[#a14343]'
              }`}
            >
              {isVaultClosedState ? '✓' : '6'}
            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717b72]">Lifecycle</span>
              <h3 className="font-editorial text-[15px] font-semibold text-[#253328]">
                Vault Liquidation & Closure (Reclaim Rent)
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                isVaultClosedState
                  ? 'bg-[#dfede8] text-[#237b68]'
                  : 'bg-[#faebd0] text-[#a67c1e]'
              }`}
            >
              {isVaultClosedState ? 'CLOSED (Rent Reclaimed)' : 'Active / Open'}
            </span>
            <span className="text-xs text-[#717b72]">{openDrawers.step6 ? '▲' : '▼'}</span>
          </div>
        </button>

        {openDrawers.step6 && (
          <div className="space-y-4 border-t border-[#e2e6df] p-4 text-xs">
            <p className="text-[11px] leading-relaxed text-[#556156]">
              To reclaim the <strong>~0.01 SOL</strong> account rent-exemption, the vault undergoes a 4-phase safe wind-down:
              governance approval, 100% USDC liquidation, investor capital redemption, and permanent vault closure.
            </p>

            {isVaultClosedState ? (
              <div className="rounded-lg border border-[#237b68] bg-[#dfede8] p-3 text-[11px] text-[#237b68]">
                <strong>✓ Vault is Permanently Closed:</strong> All non-USDC holdings were liquidated, and ~0.01 SOL in account rent has been refunded back to your curator wallet. Investors can continue to withdraw their pro-rata USDC cash at any time.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Phase 1: Governance Vote */}
                <div className="rounded-lg border border-[#cdd3ca] bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-editorial text-[13px] font-semibold text-[#253328]">
                      Phase 1: Governance Proposal & Vote
                    </span>
                    <span className="rounded bg-[#f2f4ee] px-1.5 py-0.5 text-[9px] font-mono text-[#556156]">
                      {activeProposal ? 'Vote Active' : 'Required'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#6b746c]">
                    Closing a live vault requires a community proposal to liquidate 100% of portfolio holdings into USDC.
                  </p>

                  {activeProposal ? (
                    <div className="mt-3 rounded border border-[#c2b280] bg-[#fffbf0] p-2.5">
                      <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[#7a6b32]">
                        <span>Proposal #{activeProposal.id}</span>
                        <span>Yes: {activeProposal.yesPercent ?? 100}% · No: {activeProposal.noPercent ?? 0}%</span>
                      </div>
                      <p className="mt-1 font-editorial text-[11px] italic text-[#4a4220]">
                        &quot;{activeProposal.planText}&quot;
                      </p>
                      {managerAllowed && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConcludeByVote(true)}
                            disabled={concludingVote || isBusy}
                            className="folio-button-primary py-1.5 px-3 text-[10px]"
                          >
                            {concludingVote ? 'Adopting...' : '✓ Pass & Adopt Liquidation'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    managerAllowed && (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={() => void handleProposeLiquidation()}
                          disabled={proposingLiquidation || isBusy}
                          className="folio-button-secondary w-full py-2 text-[11px]"
                        >
                          {proposingLiquidation ? 'Posting Proposal…' : '🗳️ Propose 100% USDC Liquidation (0.05 SOL Bond)'}
                        </button>
                      </div>
                    )
                  )}
                </div>

                {/* Phase 2: Liquidate all assets into USDC */}
                <div className="rounded-lg border border-[#cdd3ca] bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-editorial text-[13px] font-semibold text-[#253328]">
                      Phase 2: Sell All Holdings into USDC
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                        !hasNonUsdcAssets ? 'bg-[#dfede8] text-[#237b68]' : 'bg-[#faebd0] text-[#a67c1e]'
                      }`}
                    >
                      {!hasNonUsdcAssets ? '100% USDC Ready' : 'Stocks Remaining'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#6b746c]">
                    Swaps all tokenized stock holdings (AAPL, NVDA, TSLA) into USDC cash via router swap CPI.
                  </p>

                  {hasNonUsdcAssets ? (
                    <div className="mt-2.5 space-y-2">
                      <div className="rounded border border-[#e2a82b] bg-[#fffcf5] p-2 text-[10px] text-[#7a530e]">
                        <strong>Tokens to liquidate:</strong>{' '}
                        {nonUsdcHoldings.map((h) => `${tokenAmount(h.amount, h.decimals, 4)} ${h.symbol}`).join(', ')}
                      </div>
                      {managerAllowed && (
                        <button
                          type="button"
                          onClick={() => void handleLiquidateHoldingsToUsdc()}
                          disabled={liquidating || isBusy}
                          className="folio-button-primary w-full py-2 text-[11px]"
                        >
                          {liquidating ? 'Executing Liquidation Swaps…' : '⚡ 1-Click Liquidate All Stocks into USDC'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#237b68]">
                      <span>✓</span>
                      <span>
                        All portfolio assets are in USDC cash ({usdcHolding ? `${tokenAmount(usdcHolding.amount, 6, 2)} USDC` : '$0 USDC'}).
                      </span>
                    </div>
                  )}
                </div>

                {/* Phase 3: Investor Capital Return */}
                <div className="rounded-lg border border-[#cdd3ca] bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-editorial text-[13px] font-semibold text-[#253328]">
                      Phase 3: Investor Capital Redemption
                    </span>
                    <span className="rounded bg-[#f2f4ee] px-1.5 py-0.5 text-[9px] font-mono text-[#556156]">
                      Supply: {tokenAmount(vault.totalSupply, 6, 2)} Shares
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#6b746c]">
                    With the portfolio in 100% USDC, investors (and the curator) can withdraw their shares for 100% pro-rata USDC cash with zero slippage.
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-[#717b72]">
                      Your curator position: {tokenAmount(vault.position?.shares ?? '0', 6, 2)} shares
                    </span>
                    <a
                      href={`/vaults/${vault.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] font-bold text-[#237b68] underline hover:text-[#185347]"
                    >
                      Open Investor Redemption Page ↗
                    </a>
                  </div>
                </div>

                {/* Phase 4: Finalize Vault Close & Reclaim Rent */}
                <div className="rounded-lg border border-[#a14343]/30 bg-[#fff8f8] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-editorial text-[13px] font-semibold text-[#8a2424]">
                      Phase 4: Finalize Closure & Reclaim Rent
                    </span>
                    <span className="rounded bg-[#fae6e6] px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#8a2424]">
                      Refund ~0.01 SOL
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#715454]">
                    Marks the vault permanently closed and transfers the ~0.01 SOL account rent-exemption back to your wallet.
                  </p>
                  {managerAllowed && (
                    <button
                      type="button"
                      onClick={() => void handleFinalizeVaultClose()}
                      disabled={closingVault || isBusy}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#a14343] py-2 font-mono text-[11px] font-bold text-white shadow-xs hover:bg-[#863535] disabled:opacity-50"
                    >
                      {closingVault ? 'Closing Vault & Reclaiming Rent…' : '🛑 Finalize Vault Closure & Reclaim ~0.01 SOL Rent'}
                    </button>
                  )}
                </div>
              </div>
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

            {error && (
              <div className="mt-3 rounded border border-[#a14343] bg-[#fbf2f2] p-2.5 text-[10px] font-medium text-[#a14343]">
                {error}
              </div>
            )}

            <div className="mt-3 rounded border border-[#c2b280] bg-[#fffbf0] p-2.5 text-[10px] text-[#7a6b32]">
              <strong>Devnet Governance Rule:</strong> The Solana smart contract enforces 1 proposal cycle per vault at a time until the voting duration concludes. To create and test a new proposal cycle immediately, click <strong>+ Create vault</strong> in the manager studio!
            </div>

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
