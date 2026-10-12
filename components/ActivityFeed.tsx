'use client';

import {useMemo, useState} from 'react';
import {useConnection} from '@/lib/contracts/wallet';
import {explorerUrl} from '@/lib/contracts/wallet';
import {shortAddress} from '@/lib/domain/format';
import {useHistory} from '@/lib/history/hooks';
import type {ActivityItem, ActivityType} from '@/lib/history/types';
import type {VaultView} from '@/lib/contracts/hooks';
import {FolioSelect} from '@/components/FolioSelect';

type FilterCategory = 'all' | 'mine' | 'withdraw' | 'deposit' | 'trades' | 'plans';

interface Props {
  vaults: VaultView[];
  onSelectVault?: (address: string) => void;
}

const filters: Array<{id: FilterCategory; label: string}> = [
  {id: 'all', label: 'All activity'},
  {id: 'mine', label: 'My activity'},
  {id: 'deposit', label: 'Deposits'},
  {id: 'withdraw', label: 'Withdrawals'},
  {id: 'trades', label: 'Curator trades'},
  {id: 'plans', label: 'Plans & seeds'},
];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatRealTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms));
}

function formatDecimal(val: string, maxDecimals = 4): string {
  const num = Number.parseFloat(val);
  if (Number.isNaN(num)) return val;
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  return num.toLocaleString('en-US', {maximumFractionDigits: maxDecimals});
}

export function ActivityFeed({vaults, onSelectVault}: Props) {
  const {address: userAddress, isConnected} = useConnection();
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedVault, setSelectedVault] = useState<string>('all');
  const [copiedTx, setCopiedTx] = useState<string | null>(null);
  const vaultAddress = selectedVault !== 'all' ? (selectedVault as string) : undefined;

  const {data: items = [], isLoading, error, refetch, isFetching} = useHistory({vault: vaultAddress});

  const filteredItems = useMemo(() => {
    const userLower = userAddress?.toLowerCase();
    switch (category) {
      case 'mine':
        if (!userLower) return [];
        return items.filter((item) => 'investor' in item && item.investor.toLowerCase() === userLower);
      case 'withdraw':
        return items.filter((item) => item.type === 'redeem');
      case 'deposit':
        return items.filter((item) => item.type === 'deposit');
      case 'trades':
        return items.filter((item) => item.type === 'rebalance');
      case 'plans':
        return items.filter((item) => item.type === 'plan' || item.type === 'seed');
      default:
        return items;
    }
  }, [items, category, userAddress]);

  const filterCounts = useMemo<Record<FilterCategory, number>>(() => {
    const userLower = userAddress?.toLowerCase();
    return {
      all: items.length,
      mine: userLower ? items.filter((item) => 'investor' in item && item.investor.toLowerCase() === userLower).length : 0,
      deposit: items.filter((item) => item.type === 'deposit').length,
      withdraw: items.filter((item) => item.type === 'redeem').length,
      trades: items.filter((item) => item.type === 'rebalance').length,
      plans: items.filter((item) => item.type === 'plan' || item.type === 'seed').length,
    };
  }, [items, userAddress]);

  async function handleCopy(txHash: string) {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopiedTx(txHash);
      window.setTimeout(() => setCopiedTx(null), 2_000);
    } catch {
      setCopiedTx(null);
    }
  }

  return (
    <section className="overflow-visible rounded-[26px] border border-[#b8c1b7] bg-[#f4f6f0]/75 shadow-[0_18px_50px_rgba(43,58,48,0.08)]">
      <header className="grid gap-6 border-b border-[#cdd3ca] px-5 py-6 sm:px-7 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border border-[#2b3a30] bg-[#2b3a30] font-mono text-[17px] font-[800] text-[#73e2ca] shadow-[4px_4px_0_#d8b126]">A</div>
          <div>
            <span className="eyebrow">Confirmed on-chain events</span>
            <h2 className="font-editorial mt-1 text-[40px] font-medium leading-none tracking-[-0.045em]">Activity</h2>
            <p className="mt-2 text-[11px] leading-5 text-[#6b746c]">A verified timeline of deposits, withdrawals and curator decisions.</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <FolioSelect
            value={selectedVault}
            onChange={setSelectedVault}
            ariaLabel="Filter by vault"
            options={[
              {value: 'all', label: 'All vaults'},
              ...vaults.map((vault) => ({value: vault.address, label: `${vault.name} (${vault.symbol})`})),
            ]}
            className="py-2 text-[12px] font-semibold"
            containerClassName="min-w-0 flex-1 sm:w-[260px]"
          />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh on-chain activity"
            className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-[14px] border border-[#91a097] bg-[#fcfdf9] px-4 text-[10px] font-[800] tracking-[0.08em] text-[#405047] shadow-[0_2px_8px_rgba(43,58,48,0.06)] transition hover:border-[#2b3a30] hover:shadow-[0_7px_20px_rgba(43,58,48,0.12)] disabled:cursor-wait"
          >
            <span className={`h-2 w-2 rounded-full ${isFetching ? 'animate-pulse bg-[#d8b126]' : 'bg-[#237b68]'}`} />
            {isFetching ? 'SYNCING' : 'LIVE · REFRESH'}
          </button>
        </div>
      </header>

      <div className="grid border-b border-[#cdd3ca] bg-[#e8ece5] sm:grid-cols-3">
        <ActivityStat label="Confirmed events" value={String(items.length).padStart(2, '0')} />
        <ActivityStat label="Currently showing" value={String(filteredItems.length).padStart(2, '0')} />
        <ActivityStat label="Data policy" value="ON-CHAIN ONLY" last />
      </div>

      <div className="border-b border-[#cdd3ca] px-4 py-3 sm:px-6">
        <div className="flex max-w-full flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              data-active={category === filter.id}
              className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[10px] font-[800] transition ${category === filter.id ? 'border-[#2b3a30] bg-[#2b3a30] text-white shadow-[0_4px_12px_rgba(43,58,48,0.16)]' : 'border-[#bdc6bc] bg-[#f8f9f5] text-[#647067] hover:border-[#657168] hover:text-[#2b3a30]'}`}
            >
              {filter.label}
              <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 font-mono text-[8px] ${category === filter.id ? 'bg-[#73e2ca] text-[#20342d]' : 'bg-[#e2e6df] text-[#667168]'}`}>{filterCounts[filter.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 sm:p-5">
        {category === 'mine' && !isConnected ? (
          <EmptyState title="Wallet not connected" detail="Connect your wallet to filter deposits and withdrawals made by that address." />
        ) : isLoading ? (
          <div className="grid min-h-[210px] place-items-center rounded-[18px] border border-[#cdd3ca] bg-[#f8f9f5] text-center">
            <div>
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#b9c1b8] border-t-[#2b3a30]" />
              <p className="mt-3 text-[11px] text-[#6b746c]">Reading confirmed events...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[18px] border border-[#c99292] bg-[#f8eeee] px-5 py-6 text-[#8f3e3e]">
            <p className="text-[12px] font-[800]">Activity could not be loaded</p>
            <p className="mt-1 break-words text-[10px] leading-5 text-[#a25a5a]">{error.message}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No confirmed transactions" detail={emptyDetail(category)} />
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item) => (
              <ActivityRow
                key={item.id}
                item={item}
                onSelectVault={onSelectVault}
                onCopy={handleCopy}
                copied={copiedTx === item.txHash}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityStat({label, value, last = false}: {label: string; value: string; last?: boolean}) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-[#cdd3ca] px-5 py-3 sm:border-b-0 sm:px-6 ${last ? '' : 'sm:border-r'}`}>
      <span className="text-[8px] font-[800] uppercase tracking-[0.14em] text-[#758078]">{label}</span>
      <strong className="font-mono text-[11px] tracking-[0.06em] text-[#2b3a30]">{value}</strong>
    </div>
  );
}

function EmptyState({title, detail}: {title: string; detail: string}) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-[18px] border border-dashed border-[#aeb8ad] bg-[#f8f9f5] px-6 text-center">
      <div className="max-w-[430px]">
        <div className="font-editorial mx-auto text-[46px] text-[#879189]">0</div>
        <p className="font-editorial mt-3 text-[25px] font-medium text-[#2b3a30]">{title}</p>
        <p className="mt-2 text-[11px] leading-5 text-[#6b746c]">{detail}</p>
      </div>
    </div>
  );
}

function emptyDetail(category: FilterCategory): string {
  switch (category) {
    case 'mine':
      return 'This wallet has no deposits or withdrawals in the selected vault yet.';
    case 'withdraw':
      return 'No in-kind redemptions have been confirmed yet.';
    case 'deposit':
      return 'No deposits have been confirmed yet.';
    case 'trades':
      return 'No curator rebalances have been confirmed yet.';
    case 'plans':
      return 'No plan or seed events have been confirmed yet.';
    default:
      return 'No matching on-chain events were found.';
  }
}

function ActivityRow({
  item,
  onSelectVault,
  onCopy,
  copied,
}: {
  item: ActivityItem;
  onSelectVault?: (address: string) => void;
  onCopy: (tx: string) => void;
  copied: boolean;
}) {

  return (
    <article className="group relative overflow-hidden rounded-[18px] border border-[#c4cbc2] bg-[#fcfdf9] p-4 shadow-[0_4px_16px_rgba(43,58,48,0.045)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#8d9990] hover:shadow-[0_12px_28px_rgba(43,58,48,0.11)] sm:p-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-[#d8b126] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex min-w-0 items-start gap-4">
        <ActivityBadge type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectVault?.(item.vault)}
                  className="font-editorial text-left text-[20px] font-medium leading-none tracking-[-0.025em] text-[#2b3a30] hover:underline"
                >
                  {item.vaultName}
                </button>
                <span className="rounded-full border border-[#b9c1b8] bg-[#f1f3ee] px-2 py-1 text-[8px] font-[800] tracking-[0.08em] text-[#6b746c]">{item.vaultSymbol}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#788179]">
                <span>{formatRealTime(item.timestamp)}</span>
                <span className="font-[800] text-[#237b68]">{timeAgo(item.timestamp)}</span>
                <span className="font-mono">SLOT {item.blockNumber}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start">
              <a
                href={explorerUrl('tx', item.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Solana Explorer"
                className="inline-flex min-h-8 items-center rounded-full border border-[#b9c1b8] bg-[#f7f8f3] px-3 text-[9px] font-[800] text-[#59645c] transition hover:border-[#2b3a30] hover:text-[#2b3a30]"
              >
                EXPLORER ↗
              </a>
              <button
                type="button"
                onClick={() => onCopy(item.txHash)}
                title="Copy transaction hash"
                className="inline-flex min-h-8 items-center rounded-full border border-[#b9c1b8] bg-[#f7f8f3] px-3 text-[9px] font-[800] text-[#59645c] transition hover:border-[#2b3a30] hover:text-[#2b3a30]"
              >
                {copied ? 'COPIED ✓' : 'COPY TX'}
              </button>
            </div>
          </div>

          <div className="mt-4 border-t border-[#e0e4dd] pt-3 text-[12px] leading-6 text-[#59645c]">{renderActivityContent(item)}</div>
          <div className="mt-3 flex items-center gap-2 font-mono text-[8px] text-[#879088]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#237b68]" />
            <span>CONFIRMED</span>
            <span>·</span>
            <span>{shortAddress(item.txHash)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActivityBadge({type}: {type: ActivityType}) {
  const styles: Record<ActivityType, {label: string; className: string}> = {
    deposit: {label: 'IN', className: 'border-[#78a69b] bg-[#dfece7] text-[#237b68]'},
    redeem: {label: 'OUT', className: 'border-[#c99b7e] bg-[#f3e5da] text-[#8d593b]'},
    rebalance: {label: 'SWAP', className: 'border-[#9b8ebd] bg-[#ebe7f4] text-[#5f4c8b]'},
    plan: {label: 'PLAN', className: 'border-[#85a5b7] bg-[#e3edf1] text-[#456c80]'},
    seed: {label: 'SEED', className: 'border-[#a8ac77] bg-[#edefdc] text-[#68702e]'},
  };
  const style = styles[type];
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border font-mono text-[8px] font-[900] shadow-[0_3px_10px_rgba(43,58,48,0.08)] ${style.className}`}>{style.label}</span>;
}

function renderActivityContent(item: ActivityItem) {
  const strong = 'font-bold text-[#2b3a30]';
  switch (item.type) {
    case 'deposit':
      return (
        <span>
          Deposited <strong className={strong}>{formatDecimal(item.usdcAmount)} USDC</strong> into the vault and minted{' '}
          <strong className={strong}>{formatDecimal(item.sharesMinted)} shares</strong>
          <span className="ml-1 text-[#7b847c]">by {shortAddress(item.investor)}</span>
        </span>
      );
    case 'redeem':
      return (
        <span>
          Redeemed <strong className={strong}>{formatDecimal(item.sharesBurned)} shares</strong> for{' '}
          {item.payouts.map((payout, index) => (
            <span key={payout.asset}>
              {index > 0 && <span className="mx-1 text-[#7b847c]">+</span>}
              <strong className={strong}>{formatDecimal(payout.amount)} {payout.symbol}</strong>
            </span>
          ))}
          <span className="ml-1 text-[#7b847c]">by {shortAddress(item.investor)}</span>
        </span>
      );
    case 'rebalance':
      return (
        <span>
          Curator swapped <strong className={strong}>{formatDecimal(item.sellAmount)} {item.sellSymbol}</strong> for{' '}
          <strong className={strong}>{formatDecimal(item.buyAmount)} {item.buySymbol}</strong>{' '}
          <span className="rounded-full border border-[#9b8ebd] bg-[#ebe7f4] px-1.5 py-0.5 text-[8px] font-bold text-[#5f4c8b]">PLAN V{item.planVersion}</span>
        </span>
      );
    case 'plan':
      return (
        <span>
          Curator published <strong className={strong}>plan v{item.version}</strong>:{' '}
          <span className="italic text-[#667168]">&ldquo;{item.planText}&rdquo;</span>
        </span>
      );
    case 'seed':
      return (
        <span>
          Seeded with <strong className={strong}>{formatDecimal(item.usdcAmount)} USDC</strong> and minted{' '}
          <strong className={strong}>{formatDecimal(item.sharesMinted)} initial shares</strong>
        </span>
      );
  }
}
