'use client';

import {useMemo, useState} from 'react';
import type {Address} from 'viem';
import {useConnection} from 'wagmi';
import {appChain} from '@/lib/contracts/wagmi';
import {shortAddress} from '@/lib/domain/format';
import {useHistory} from '@/lib/history/hooks';
import type {ActivityItem, ActivityType} from '@/lib/history/types';
import type {VaultView} from '@/lib/contracts/hooks';

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
  const vaultAddress = selectedVault !== 'all' ? (selectedVault as Address) : undefined;

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
    <section className="border-t border-[#aeb8ad]">
      <header className="flex flex-col gap-5 border-b border-[#cdd3ca] py-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">Confirmed on-chain events</span>
          <h2 className="font-editorial mt-2 text-[34px] font-medium tracking-[-0.04em]">Activity</h2>
          <p className="mt-2 text-[11px] text-[#6b746c]">Quote previews never appear here.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <select
            value={selectedVault}
            onChange={(event) => setSelectedVault(event.target.value)}
            aria-label="Filter by vault"
            className="folio-field min-w-0 flex-1 py-2 text-[11px] font-semibold sm:max-w-[240px]"
          >
            <option value="all">All vaults</option>
            {vaults.map((vault) => (
              <option key={vault.address} value={vault.address}>
                {vault.name} ({vault.symbol})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh on-chain activity"
            className="folio-button-secondary min-h-0 shrink-0 px-3 py-2 text-[10px]"
          >
            <span className={`h-2 w-2 rounded-full ${isFetching ? 'animate-pulse bg-[#d8b126]' : 'bg-[#237b68]'}`} />
            LIVE
          </button>
        </div>
      </header>

      <div className="border-b border-[#cdd3ca] py-3">
        <div className="folio-segmented flex max-w-full overflow-x-auto">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              data-active={category === filter.id}
              className="folio-segment shrink-0"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {category === 'mine' && !isConnected ? (
          <EmptyState title="Wallet not connected" detail="Connect your wallet to filter deposits and withdrawals made by that address." />
        ) : isLoading ? (
          <div className="grid min-h-[210px] place-items-center border-b border-[#cdd3ca] text-center">
            <div>
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#b9c1b8] border-t-[#2b3a30]" />
              <p className="mt-3 text-[11px] text-[#6b746c]">Reading confirmed events...</p>
            </div>
          </div>
        ) : error ? (
          <div className="border-b border-[#b98282] py-6 text-[#8f3e3e]">
            <p className="text-[12px] font-[800]">Activity could not be loaded</p>
            <p className="mt-1 break-words text-[10px] leading-5 text-[#a25a5a]">{error.message}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState title="No confirmed transactions" detail={emptyDetail(category)} />
        ) : (
          <div className="divide-y divide-[#cdd3ca]">
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

function EmptyState({title, detail}: {title: string; detail: string}) {
  return (
    <div className="grid min-h-[260px] place-items-center border-b border-dashed border-[#aeb8ad] px-6 text-center">
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
  const isBsc = appChain.id === 56;

  return (
    <article className="flex flex-col gap-3 py-5 transition hover:bg-[#f7f8f3]/45 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-2">
      <div className="flex min-w-0 items-start gap-3">
        <ActivityBadge type={item.type} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onSelectVault?.(item.vault)}
              className="text-left text-[12px] font-bold text-[#2b3a30] hover:underline"
            >
              {item.vaultName}
            </button>
            <span className="rounded-full border border-[#b9c1b8] px-1.5 py-0.5 text-[8px] text-[#6b746c]">{item.vaultSymbol}</span>
            <span className="text-[9px] text-[#788179]">{formatRealTime(item.timestamp)}</span>
            <span className="text-[9px] text-[#8a938b]">{timeAgo(item.timestamp)}</span>
          </div>
          <div className="mt-1.5 text-[11px] leading-5 text-[#59645c]">{renderActivityContent(item)}</div>
          <span className="mt-1.5 inline-block text-[8px] text-[#879088]">BLOCK {item.blockNumber}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        {isBsc ? (
          <a
            href={`https://bscscan.com/tx/${item.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View on BscScan"
            className="text-[9px] text-[#59645c] hover:underline"
          >
            {shortAddress(item.txHash)} EXTERNAL
          </a>
        ) : (
          <span title="Local test-chain transaction" className="text-[9px] text-[#788179]">
            {shortAddress(item.txHash)} LOCAL
          </span>
        )}
        <button
          type="button"
          onClick={() => onCopy(item.txHash)}
          title="Copy transaction hash"
          className="rounded-full border border-[#b9c1b8] px-2 py-1 text-[9px] font-bold text-[#59645c] hover:border-[#2b3a30]"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
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
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border font-mono text-[7px] font-[900] ${style.className}`}>{style.label}</span>;
}

function renderActivityContent(item: ActivityItem) {
  const strong = 'font-bold text-[#2b3a30]';
  switch (item.type) {
    case 'deposit':
      return (
        <span>
          Deposited <strong className={strong}>{formatDecimal(item.usdtAmount)} USDT</strong> into the vault and minted{' '}
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
          Seeded with <strong className={strong}>{formatDecimal(item.usdtAmount)} USDT</strong> and minted{' '}
          <strong className={strong}>{formatDecimal(item.sharesMinted)} initial shares</strong>
        </span>
      );
  }
}
