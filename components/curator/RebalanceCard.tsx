'use client';

import {useEffect, useMemo, useState} from 'react';
import {formatUnits, parseUnits, type Address} from 'viem';
import {useNotify} from '@/components/Toast';
import {explainError, type VaultView} from '@/lib/contracts/hooks';
import {tokenAmount} from '@/lib/domain/format';
import {CuratorModal} from './CuratorModal';
import {curatorAssets, type SignedPrices, type TradeQuote} from './model';
import {type RebalanceStage, useCuratorActions} from './useCuratorActions';
import {useTokenSymbols} from './useTokenSymbols';

interface Props {
  vault: VaultView;
  managerAllowed: boolean;
}

const QUOTE_LIFETIME_MS = 60_000;

export function RebalanceCard({vault, managerAllowed}: Props) {
  const notify = useNotify();
  const {action, executeRebalance} = useCuratorActions();
  const assets = useMemo(() => curatorAssets(vault), [vault]);
  const sellable = vault.holdings.filter((holding) => holding.amount !== '0');
  const tokenSymbol = useTokenSymbols(assets);
  const [sell, setSell] = useState<Address | ''>(sellable[0]?.asset ?? '');
  const [buy, setBuy] = useState<Address | ''>(assets.find((asset) => asset.address !== sell)?.address ?? '');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [signedPrices, setSignedPrices] = useState<SignedPrices | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [pricesExpired, setPricesExpired] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [signingPrices, setSigningPrices] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executionStage, setExecutionStage] = useState<RebalanceStage>('idle');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const active = vault.state === 'ACTIVE';
  const planReady = Boolean(vault.plan && vault.plan.version > 0);
  const canQuote = managerAllowed && active && planReady;
  const sellHolding = sellable.find((holding) => holding.asset === sell);
  const buyAsset = assets.find((asset) => asset.address === buy);
  const sellSymbol = sellHolding ? tokenSymbol(sellHolding.asset, sellHolding.symbol) : '';
  const buySymbol = buyAsset ? tokenSymbol(buyAsset.address, buyAsset.symbol) : '';
  const executing = action === 'simulating' || action === 'rebalancing';

  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuoteExpired(true), QUOTE_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [quote]);

  useEffect(() => {
    if (!signedPrices) return;
    const remaining = Math.max(0, signedPrices.expiresAt * 1000 - Date.now());
    const timer = setTimeout(() => setPricesExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [signedPrices]);

  function clearPreparedTrade() {
    setQuote(null);
    setSignedPrices(null);
    setQuoteExpired(false);
    setPricesExpired(false);
    setQuoteError(null);
    setPriceError(null);
    setConfirmOpen(false);
    setExecutionStage('idle');
    setExecutionError(null);
    setTransactionHash(null);
  }

  function changeSell(value: Address) {
    setSell(value);
    if (buy === value) setBuy(assets.find((asset) => asset.address !== value)?.address ?? '');
    clearPreparedTrade();
  }

  async function prepareTrade(keepModalOpen = false) {
    if (!sellHolding || !buyAsset) return notify('Choose different sell and buy tokens.');
    let rawAmount: bigint;
    try {
      rawAmount = parseUnits(amount, sellHolding.decimals);
    } catch {
      return notify('Enter a valid sell amount.');
    }
    if (rawAmount <= BigInt(0)) return notify('Enter an amount above zero.');
    if (rawAmount > BigInt(sellHolding.amount)) {
      return notify(`The vault does not hold that much ${sellSymbol}.`);
    }

    setQuoting(true);
    setSigningPrices(true);
    setQuoteError(null);
    setPriceError(null);
    if (!keepModalOpen) {
      setQuote(null);
      setSignedPrices(null);
      setConfirmOpen(false);
    }
    setQuoteExpired(false);
    setPricesExpired(false);
    setExecutionStage('idle');
    setExecutionError(null);

    const tradeParams = new URLSearchParams({
      vault: vault.address,
      sell: sellHolding.asset,
      buy: buyAsset.address,
      amount: rawAmount.toString(),
      slippage,
    });
    const include = Array.from(new Set([sellHolding.asset, buyAsset.address])).join(',');
    const priceParams = new URLSearchParams({vault: vault.address, include});
    const [tradeFailure, priceFailure] = await Promise.all([
      fetchJson<TradeQuote>(`/api/trade?${tradeParams}`)
        .then((result) => {
          setQuote(result);
          return null;
        })
        .catch((caught) => {
          const message = explainError(caught);
          setQuoteError(message);
          return `Quote: ${message}`;
        })
        .finally(() => setQuoting(false)),
      fetchJson<SignedPrices>(`/api/prices?${priceParams}`)
        .then((result) => {
          setSignedPrices(result);
          return null;
        })
        .catch((caught) => {
          const message = explainError(caught);
          setPriceError(message);
          return `Signed prices: ${message}`;
        })
        .finally(() => setSigningPrices(false)),
    ]);
    const failures = [tradeFailure, priceFailure].filter((failure): failure is string => Boolean(failure));
    if (failures.length > 0) {
      notify(failures.join(' '));
    } else {
      setConfirmOpen(true);
    }
  }

  async function confirmRebalance() {
    if (!managerAllowed || !active || !planReady || !quote || !signedPrices || executing) return;
    if (quoteExpired || pricesExpired || signedPrices.expiresAt * 1000 <= Date.now()) {
      setPricesExpired(signedPrices.expiresAt * 1000 <= Date.now());
      return notify('The quote package expired. Prepare a fresh quote before signing.');
    }
    setExecutionError(null);
    setTransactionHash(null);
    try {
      const result = await executeRebalance(vault.address, quote, signedPrices, setExecutionStage);
      setTransactionHash(result.hash);
      notify(`Rebalance confirmed: ${sellSymbol} -> ${buySymbol}.`);
    } catch (caught) {
      const message = explainError(caught);
      setExecutionStage('idle');
      setExecutionError(message);
      notify(message);
    }
  }

  const warnings = quote?.warnings ?? [];
  const priceIncludes = Array.from(new Set([sell, buy].filter((asset): asset is Address => Boolean(asset))));
  const expected = quote && buyAsset ? formatUnits(BigInt(quote.quote.expectedBuyAmount), buyAsset.decimals) : null;
  const minimum = quote && buyAsset ? formatUnits(BigInt(quote.trade.minBuyAmount), buyAsset.decimals) : null;
  const quoteStatus = !canQuote ? 'Blocked' : quoting ? 'Loading' : quoteError ? 'Error' : quoteExpired ? 'Expired' : quote ? 'Ready' : 'Not started';
  const priceStatus = !canQuote ? 'Blocked' : signingPrices ? 'Loading' : priceError ? 'Error' : pricesExpired ? 'Expired' : signedPrices ? 'Ready' : 'Not started';
  const prepared = Boolean(quote && signedPrices);
  const isPackageExpired = !executing && executionStage !== 'confirmed' && (quoteExpired || pricesExpired);

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Rebalance</p>
          <h2 className="font-editorial text-[25px] font-medium tracking-[-0.035em]">Build a live route</h2>
        </div>
        <StatusPill ok={active && planReady} label={active && planReady ? 'READY' : 'BLOCKED'} />
      </div>
      <p className="mt-3 text-[11px] leading-[1.65] text-[#6b746c]">Fetch a live route and signed prices, then review everything before wallet confirmation.</p>

      {(!active || !planReady || !managerAllowed) && (
        <div className="mt-4 border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.6] text-[#8f3e3e]">
          <strong className="block">Requirements not met</strong>
          {!managerAllowed && <span className="block">Connect this vault&apos;s manager wallet.</span>}
          {!active && <span className="block">Vault is {vault.state}; rebalancing requires ACTIVE.</span>}
          {!planReady && <span className="block">Publish an on-chain plan before trading.</span>}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sell">
            <select
              value={sell}
              onChange={(event) => changeSell(event.target.value as Address)}
              disabled={!canQuote || quoting || executing}
              className={inputClass}
            >
              {sellable.map((holding) => (
                <option key={holding.asset} value={holding.asset}>
                  {tokenSymbol(holding.asset, holding.symbol)} · {tokenAmount(holding.amount, holding.decimals, 3)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buy">
            <select
              value={buy}
              onChange={(event) => {
                setBuy(event.target.value as Address);
                clearPreparedTrade();
              }}
              disabled={!canQuote || quoting || executing}
              className={inputClass}
            >
              {assets.filter((asset) => asset.address !== sell).map((asset) => (
                <option key={asset.address} value={asset.address}>{tokenSymbol(asset.address, asset.symbol)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Amount to sell">
          <input
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              clearPreparedTrade();
            }}
            inputMode="decimal"
            placeholder="5"
            disabled={!canQuote || quoting || executing}
            className={inputClass}
          />
        </Field>
        <Field label="Max slippage">
          <div className="flex rounded-[14px] border border-[#aeb8ad] bg-[#fcfdf9]/70 pr-3 focus-within:border-[#2b3a30]">
            <input
              value={slippage}
              onChange={(event) => {
                setSlippage(event.target.value);
                clearPreparedTrade();
              }}
              inputMode="decimal"
              disabled={!canQuote || quoting || executing}
              className="min-w-0 flex-1 bg-transparent px-3 py-[10px] text-[12px] text-[#2b3a30] outline-none disabled:opacity-50"
            />
            <span className="self-center text-[10px] text-[#6b746c]">%</span>
          </div>
        </Field>
      </div>

      <button
        type="button"
        onClick={prepared && !quoteExpired && !pricesExpired ? () => setConfirmOpen(true) : () => void prepareTrade()}
        disabled={!canQuote || quoting || signingPrices || executing || !sellHolding || !buyAsset}
        className="folio-button-primary mt-5 w-full"
      >
        {quoting || signingPrices ? 'Fetching quote and signed prices…' : prepared && !quoteExpired && !pricesExpired ? 'Review prepared quote' : 'Prepare rebalance'}
      </button>

      {(quoteError || priceError) && (
        <div role="alert" className="mt-4 border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.6] text-[#8f3e3e]">
          <strong className="block">Preparation failed</strong>
          {quoteError && <span className="block">Quote: {quoteError}</span>}
          {priceError && <span className="block">Signed prices: {priceError}</span>}
        </div>
      )}

      {(quoteExpired || pricesExpired) && (
        <div role="alert" className="mt-4 border-l-2 border-[#b18b15] pl-3 text-[11px] leading-[1.6] text-[#6f5c0d]">
          The {quoteExpired && pricesExpired ? 'quote and signed prices have' : quoteExpired ? 'quote has' : 'signed prices have'} expired. Prepare a fresh package before confirmation.
        </div>
      )}

      <details className="mt-5 border-y border-[#cdd3ca]">
        <summary className="cursor-pointer list-none py-3 text-[11px] font-bold text-[#3d4a41] marker:hidden">
          <span className="flex items-center justify-between gap-3">
            Transaction stages
            <span className="text-[9px] text-[#778078]">{prepared ? 'PACKAGE READY' : 'VIEW DETAILS'} ▾</span>
          </span>
        </summary>
        <div className="border-t border-[#cdd3ca] py-3" aria-live="polite">
          <ol className="grid gap-2 text-[10px]">
            <Stage label="1. Binance quote" status={quoteStatus} />
            <Stage label={`2. Signed prices · include=${priceIncludes.join(',') || 'trade assets'}`} status={priceStatus} />
            <Stage label={quote ? `3. Simulation · ${Number(quote.gasLimit).toLocaleString('en-US')} gas` : '3. Contract simulation'} status={executionStage === 'simulating' ? 'Running' : executionStage === 'wallet' || executionStage === 'confirming' || executionStage === 'confirmed' ? 'Ready' : executionError ? 'Error' : 'Not started'} />
            <Stage label="4. Manager wallet confirmation" status={executionStage === 'wallet' ? 'Waiting' : executionStage === 'confirming' || executionStage === 'confirmed' ? 'Ready' : executionError ? 'Error' : 'Not started'} />
            <Stage label="5. On-chain result" status={executionStage === 'confirming' ? 'Confirming' : executionStage === 'confirmed' ? 'Confirmed' : executionError ? 'Error' : 'Not started'} />
          </ol>
          {executionError && <p role="alert" className="mt-3 border-l-2 border-[#a14343] pl-3 text-[10px] leading-[1.55] text-[#8f3e3e]">{executionError}</p>}
          {transactionHash && <p className="mt-3 break-all border-l-2 border-[#237b68] pl-3 text-[10px] text-[#237b68]">Confirmed: {transactionHash}</p>}
        </div>
      </details>

      <CuratorModal open={confirmOpen} title="Review rebalance quote" onClose={() => !executing && setConfirmOpen(false)}>
        {quote && signedPrices ? (
          <div>
            <div className="border-y border-[#cdd3ca] py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Proposed route</p>
                  <p className="mt-1 text-[15px] font-bold">{sellSymbol} → {buySymbol}</p>
                </div>
                <StatusPill ok={!quoteExpired && !pricesExpired} label={quoteExpired || pricesExpired ? 'EXPIRED' : 'FRESH'} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <QuoteValue label="Expected output" value={`${expected ?? 'Unavailable'} ${buySymbol}`} />
                <QuoteValue label="Minimum received" value={`${minimum ?? 'Unavailable'} ${buySymbol}`} />
                <QuoteValue label="Route loss" value={quote.quote.lossPercent === null ? 'Not available' : `${quote.quote.lossPercent.toFixed(2)}%`} />
                <QuoteValue label="Backend gas limit" value={Number(quote.gasLimit).toLocaleString('en-US')} />
                <QuoteValue label="Slippage" value={`${quote.quote.slippagePercent}%`} />
                <QuoteValue label="Price expiry" value={new Date(signedPrices.expiresAt * 1000).toLocaleTimeString()} />
              </div>
              <div className="mt-4 border-t border-[#cdd3ca] pt-3">
                <p className="eyebrow">Route</p>
                <p className="mt-1 break-words text-[11px] text-[#59645c]">{quote.quote.route.join(' → ') || 'No route description returned'}</p>
              </div>
            </div>

            {warnings.length > 0 ? (
              <div className="mt-3 border-l-2 border-[#b18b15] pl-3 text-[11px] leading-[1.6] text-[#6f5c0d]">
                <strong className="block">Backend warnings</strong>
                <ul className="mt-1 list-disc pl-5">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : (
              <div className="mt-3 border-l-2 border-[#237b68] pl-3 text-[11px] text-[#237b68]">The backend returned no warnings for this route.</div>
            )}

            {isPackageExpired && (
              <div className="mt-3 flex items-center justify-between gap-2 border-l-2 border-[#b18b15] pl-3 text-[11px] text-[#6f5c0d]">
                <span>This quote package expired. Fetch a fresh live route:</span>
                <button
                  type="button"
                  onClick={() => void prepareTrade(true)}
                  disabled={quoting || signingPrices}
                  className="folio-button-primary shrink-0 px-3 py-1 text-[11px]"
                >
                  {quoting || signingPrices ? 'Refreshing…' : 'Refresh Quote ↻'}
                </button>
              </div>
            )}

            {executionError && <p role="alert" className="mt-3 border-l-2 border-[#a14343] pl-3 text-[11px] leading-[1.55] text-[#8f3e3e]">{executionError}</p>}
            {transactionHash && <p className="mt-3 break-all border-l-2 border-[#237b68] pl-3 text-[10px] text-[#237b68]">Confirmed transaction: {transactionHash}</p>}

            <button
              type="button"
              onClick={() => void confirmRebalance()}
              disabled={!managerAllowed || isPackageExpired || executing || executionStage === 'confirmed'}
              className="folio-button-primary mt-4 w-full"
            >
              {executionStage === 'simulating' ? 'Simulating contract call...' : executionStage === 'wallet' ? 'Confirm in manager wallet...' : executionStage === 'confirming' ? 'Waiting for on-chain confirmation...' : executionStage === 'confirmed' ? 'Rebalance confirmed' : isPackageExpired ? 'Package expired — click refresh above' : 'Confirm rebalance in wallet'}
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-[#6b746c]">The quote package is no longer available. Close this dialog and prepare it again.</p>
        )}
      </CuratorModal>
    </section>
  );
}

const inputClass = 'folio-field text-[12px] font-medium';

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return <label className="grid gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#59645c]">{label}{children}</label>;
}

function QuoteValue({label, value}: {label: string; value: string}) {
  return (
    <div>
      <span className="block text-[9px] uppercase tracking-[0.08em] text-[#7b847c]">{label}</span>
      <strong className="mt-1 block break-words text-[13px] font-bold text-[#2b3a30] tabular-nums">{value}</strong>
    </div>
  );
}

function StatusPill({ok, label}: {ok: boolean; label: string}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
        ok ? 'border-[#7aa99d] bg-[#dfede8] text-[#237b68]' : 'border-[#c98e8e] bg-[#f2e3e3] text-[#a14343]'
      }`}
    >
      {label}
    </span>
  );
}

function Stage({label, status}: {label: string; status: string}) {
  const positive = status === 'Ready' || status === 'Confirmed';
  const warning = status === 'Expired' || status === 'Error' || status.includes('Blocked');
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[#cdd3ca] py-2">
      <span className="min-w-0 break-all text-[#59645c]">{label}</span>
      <strong className={positive ? 'text-[#237b68]' : warning ? 'text-[#a14343]' : 'text-[#7b847c]'}>{status}</strong>
    </li>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {cache: 'no-store'});
  const body = await response.json() as {error?: string; message?: string; success?: boolean} & T;
  if (!response.ok || body.success === false) {
    throw new Error(body.error ?? body.message ?? `Request failed with HTTP ${response.status}.`);
  }
  return body;
}
