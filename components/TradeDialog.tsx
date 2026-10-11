'use client';

import {useEffect, useRef, useState} from 'react';
import {formatUnits, type Address} from 'viem';
import {money, tokenAmount} from '@/lib/domain/format';
import {explainError, useDeposit, useRedeem, type DepositStep, type RedeemResult, type VaultView} from '@/lib/contracts/hooks';
import type {TradeType} from './DetailPanel';
import {useNotify} from './Toast';

interface Props {
  type: TradeType | null;
  vault: VaultView;
  onClose: () => void;
}

const STEP_LABEL: Record<DepositStep, string> = {
  idle: 'Confirm investment',
  approving: 'Approve USDT in your wallet…',
  pricing: 'Getting signed prices…',
  depositing: 'Confirm the deposit in your wallet…',
  done: 'Done',
};

const PERCENTS = [25, 50, 100];

export function TradeDialog({type, vault, onClose}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const notify = useNotify();
  const {deposit, step, reset} = useDeposit();
  const {redeem, preview, pending} = useRedeem();
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState(100);
  const [previewState, setPreview] = useState<{key: string; result?: RedeemResult; error?: string} | null>(null);
  const [forfeit, setForfeit] = useState<Address[]>([]);
  const [showForfeit, setShowForfeit] = useState(false);
  const [error, setError] = useState('');

  const myShares = BigInt(vault.position?.shares ?? '0');
  const redeemShares = (myShares * BigInt(percent)) / BigInt(100);
  const busy = step !== 'idle' && step !== 'done';
  const sharePrice = vault.sharePriceUsd === null ? null : Number(vault.sharePriceUsd);
  const parsed = Number(amount);
  const estShares = sharePrice && parsed > 0 ? parsed / sharePrice : null;
  // A preview belongs to one (vault, shares, forfeit) request; a stale one is never shown.
  const previewKey =
    type === 'withdraw' && redeemShares > BigInt(0) ? `${vault.address}:${redeemShares}:${forfeit.join(',')}` : null;
  const current = previewState && previewState.key === previewKey ? previewState : null;
  const payout = current?.result ?? null;
  const previewError = current?.error ?? null;
  const leavable = vault.holdings.filter((h) => h.amount !== '0');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (type && !dialog.open) {
      setAmount('');
      setPercent(100);
      setForfeit([]);
      setShowForfeit(false);
      setError('');
      reset();
      dialog.showModal();
    } else if (!type && dialog.open) {
      dialog.close();
    }
  }, [type, reset]);

  // Withdrawal preview: simulate the redemption so the investor sees exactly what arrives.
  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    preview(vault.address, redeemShares, forfeit)
      .then((result) => live && setPreview({key: previewKey, result}))
      .catch((e) => live && setPreview({key: previewKey, error: explainError(e)}));
    return () => {
      live = false;
    };
  }, [previewKey, vault.address, redeemShares, forfeit, preview]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (type === 'invest') {
        const {shares} = await deposit(vault.address, amount);
        notify(`Invested ${money(parsed)} · ${tokenAmount(shares, 18, 4)} shares received.`);
      } else {
        await redeem(vault.address, redeemShares, forfeit);
        notify(`Withdrew ${tokenAmount(redeemShares, 18, 4)} shares. Tokens sent to your wallet.`);
      }
      onClose();
    } catch (err) {
      setError(explainError(err));
    }
  }

  const symbolOf = (asset: string) => vault.holdings.find((h) => h.asset === asset);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="folio-sheet m-auto max-h-[92vh] w-[500px] max-w-[calc(100vw-20px)] overflow-auto p-6 sm:p-8"
    >
      <form onSubmit={submit}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-3">
              {type === 'invest' ? 'INVEST USDT' : 'WITHDRAW YOUR SHARE'}
            </p>
            <h2 className="font-editorial text-[31px] font-medium tracking-[-0.04em] text-[#2b3a30]">{vault.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || pending}
            aria-label="Close"
            className="rounded-full border-0 bg-transparent px-2 text-[28px] leading-none text-[#7b847c] hover:bg-[#2b3a30]/5 hover:text-[#2b3a30]"
          >
            ×
          </button>
        </div>

        {type === 'invest' ? (
          <>
            <label htmlFor="amount" className="mt-[17px] block text-[12px] font-semibold text-[#3d4a41]">
              Amount in USDT
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step="any"
              required
              disabled={busy}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="folio-field mt-2 p-4 text-[32px] font-medium tracking-[-0.04em]"
            />
            <div className="my-6 border-y border-[#cdd3ca] py-4">
              <Row label="Share price" value={sharePrice === null ? 'Unavailable' : money(sharePrice)} />
              <Row label="Estimated shares" value={estShares === null ? '—' : estShares.toFixed(4)} />
              <Row label="Fee" value="$0.00" />
            </div>
            <p className="text-[12px] leading-[1.7] text-[#6b746c]">
              Shares are priced from live stock prices signed by the Folio server and checked by the vault.
              Your USDT stays in the vault until the curator invests it. You will sign up to two
              transactions: a USDT approval and the deposit.
            </p>
          </>
        ) : (
          <>
            <span className="mt-[17px] block text-[12px] font-semibold text-[#3d4a41]">How much of your position</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PERCENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={pending}
                  aria-pressed={percent === p}
                  onClick={() => setPercent(p)}
                  className={`rounded-full border p-3 text-[14px] font-semibold transition ${
                    percent === p ? 'border-[#2b3a30] bg-[#2b3a30] text-[#f7f8f3]' : 'border-[#b9c1b8] bg-transparent text-[#59645c]'
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="my-6 border-y border-[#cdd3ca] py-4">
              <Row label="Shares to burn" value={tokenAmount(redeemShares, 18, 6)} />
              <p className="mb-1 mt-4 text-[12px] font-semibold text-[#3d4a41]">You receive in kind</p>
              {payout ? (
                payout.assets.map((asset, i) => {
                  const h = symbolOf(asset);
                  if (payout.amounts[i] === BigInt(0)) return null;
                  const units = h ? Number(formatUnits(payout.amounts[i], h.decimals)) : null;
                  const usd = units !== null && h?.priceUsd ? money(units * Number(h.priceUsd)) : '';
                  return (
                    <Row
                      key={asset}
                      label={`${tokenAmount(payout.amounts[i], h?.decimals ?? 18, 4)} ${h?.symbol ?? asset}`}
                      value={usd}
                    />
                  );
                })
              ) : previewError ? (
                <p className="text-[12px] text-[#a14343]">
                  {previewError} One of the vault&apos;s tokens may be paused by its issuer. Leave it behind below
                  to withdraw everything else.
                </p>
              ) : (
                <p className="text-[12px] text-[#6b746c]">Calculating…</p>
              )}
            </div>
            {showForfeit || previewError ? (
              <fieldset className="mb-4 rounded-2xl border border-[#b9c1b8] p-[14px]">
                <legend className="px-1 text-[12px] font-semibold text-[#3d4a41]">Leave tokens behind</legend>
                <p className="mb-2 text-[11px] leading-[1.5] text-[#6b746c]">
                  Your share of a ticked token stays in the vault for the other holders. Use this only if a token
                  cannot be transferred.
                </p>
                {leavable.map((h) => (
                  <label key={h.asset} className="my-1 flex items-center gap-2 text-[12px] text-[#3d4a41]">
                    <input
                      type="checkbox"
                      disabled={pending}
                      checked={forfeit.includes(h.asset)}
                      onChange={(e) =>
                        setForfeit((list) => (e.target.checked ? [...list, h.asset] : list.filter((a) => a !== h.asset)))
                      }
                    />
                    {h.symbol}
                  </label>
                ))}
              </fieldset>
            ) : (
              <button
                type="button"
                onClick={() => setShowForfeit(true)}
                className="mb-3 border-0 bg-transparent p-0 text-[12px] font-semibold text-[#237b68] hover:underline"
              >
                A token won&apos;t transfer? Leave it behind
              </button>
            )}
            <p className="border-l-2 border-[#237b68] pl-4 text-[11px] leading-[1.7] text-[#59645c]">
              You get your exact share of every holding, in kind. That means stock tokens as well as
              USDT. Selling those tokens is up to you. Withdrawals work even when the vault is paused.
            </p>
          </>
        )}

        <p role="alert" className="mt-3 min-h-[18px] text-[12px] text-[#a14343]">
          {error}
        </p>

        <button
          type="submit"
          disabled={busy || pending || (type === 'withdraw' && (redeemShares === BigInt(0) || !payout))}
          className="folio-button-primary mt-3 w-full"
        >
          {type === 'invest' ? STEP_LABEL[step] : pending ? 'Confirm in your wallet…' : 'Confirm withdrawal'}
        </button>
      </form>
    </dialog>
  );
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <div className="my-[7px] flex items-center justify-between gap-[10px] text-[12px]">
      <span className="text-[#6b746c]">{label}</span>
      <strong className="text-[#2b3a30]">{value}</strong>
    </div>
  );
}

