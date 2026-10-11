'use client';

import {useState} from 'react';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {MAX_PLAN_BYTES, utf8ByteLength} from './model';
import {useCuratorActions} from './useCuratorActions';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

export function PlanCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const {action, publishPlan} = useCuratorActions();
  const [text, setText] = useState(vault.plan?.text ?? '');
  const [error, setError] = useState<string | null>(null);
  const bytes = utf8ByteLength(text);
  const validLength = bytes >= 1 && bytes <= MAX_PLAN_BYTES;
  const changed = text !== (vault.plan?.text ?? '');
  const publishing = action === 'publishing';

  async function submit() {
    if (!managerAllowed || !validLength || !changed || publishing) return;
    setError(null);
    try {
      await publishPlan(vault.address, text);
      notify(`Plan v${(vault.plan?.version ?? 0) + 1} confirmed on-chain.`);
    } catch (caught) {
      const message = explainError(caught);
      setError(message);
      notify(message);
    }
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">
            CURATOR INVESTMENT THESIS
          </span>
          <h2 className="font-editorial mt-1 text-[25px] font-medium tracking-[-0.035em] text-[#2b3a30]">Portfolio objective</h2>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
            vault.plan
              ? 'border-[#7aa99d] bg-[#dfede8] text-[#237b68]'
              : 'border-[#b9c1b8] text-[#6b746c]'
          }`}
        >
          {vault.plan ? `v${vault.plan.version}` : 'DRAFT'}
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-[1.7] text-[#6b746c]">
        Public, non-custodial and advisory. BNB smart contracts require an on-chain thesis version before the first rebalance.
      </p>

      <label className="mt-5 grid gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#59645c]">
        Thesis Content
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          placeholder="Describe your asset allocation criteria, tech equity targets, cash buffer, and rebalance triggers."
          disabled={!managerAllowed || publishing}
          aria-describedby="plan-byte-count plan-publishing-status"
          className="folio-field min-h-[150px] resize-y text-[12px] font-normal normal-case leading-[1.7] tracking-normal placeholder:text-[#969e97]"
        />
      </label>

      <div
        id="plan-byte-count"
        className={`mt-2 flex items-center justify-between gap-3 font-mono text-[11px] ${
          bytes > MAX_PLAN_BYTES ? 'text-[#a14343]' : 'text-[#778078]'
        }`}
      >
        <span>
          {bytes === 0
            ? 'Enter at least 1 UTF-8 byte.'
            : validLength
              ? changed
                ? 'Draft modified (not yet on-chain).'
                : 'Matches published on-chain plan.'
              : 'Plan exceeds 1,000-byte contract limit.'}
        </span>
        <strong className="tabular-nums">
          {bytes} / {MAX_PLAN_BYTES} bytes
        </strong>
      </div>

      {!managerAllowed && (
        <div id="plan-publishing-status" className="mt-4 border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.6] text-[#8f3e3e]">
          <strong className="block font-bold">Manager wallet required</strong>
          <p className="mt-1">Connect this vault&apos;s manager wallet to publish the plan on-chain.</p>
        </div>
      )}

      {managerAllowed && error && (
        <div id="plan-publishing-status" role="alert" className="mt-4 border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.6] text-[#8f3e3e]">
          <strong className="block font-bold">Publication failed</strong>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!managerAllowed || !validLength || !changed || publishing}
        className="folio-button-primary mt-5 w-full"
      >
        {publishing ? 'Confirming plan on-chain...' : changed ? 'Publish plan on-chain' : 'Plan already published'}
      </button>
    </section>
  );
}
