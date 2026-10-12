/**
 * Vault read model for display: on-chain balances valued at live prices.
 *
 * Display only — the program never uses these numbers. A holding without a price is reported as
 * unavailable and makes the vault total unavailable too; it is never counted as $0 (PRD P07).
 */
import {PublicKey} from '@solana/web3.js';
import {ApiError, connection, parseKey, vaultReadError} from '@/lib/chain/server';
import {displayPrices} from '@/lib/pricing/source';
import {
  BN,
  folioProgram,
  positionPda,
  proposalPda,
  registryPda,
  tokenProgramsOf,
  ata,
  vaultPda,
  vaultStateName,
  voteRecordPda,
  REBALANCE_INTERVAL_SECONDS,
} from '@/lib/solana/program';
import {tokenByMint} from '@/lib/solana/config';
import {isProposalClosed} from '@/lib/vaults/proposals';

export const VAULT_STATES = ['DRAFT', 'SEEDED', 'ACTIVE', 'PAUSED', 'CLOSED'] as const;
/** Shares use the settlement token's decimals (USDC: 6). */
export const SHARE_DECIMALS = 6;

export interface Holding {
  /** Mint address. */
  asset: string;
  symbol: string;
  decimals: number;
  /** Raw base units. */
  amount: string;
  priceUsd: string | null;
  valueUsd: string | null;
}

export interface TargetWeight {
  asset: string;
  symbol: string;
  targetBps: number;
  targetPercent: number; // e.g. 50
}

export type ProposalStatusName = 'Voting' | 'Timelock' | 'Passed' | 'Rejected' | 'Executed';

export interface ProposalView {
  id: number;
  address: string;
  proposer: string;
  bondLamports: string;
  bondRefunded?: boolean;
  planText: string;
  targets: TargetWeight[];
  votingEndsAt: number; // unix ms
  timelockEndsAt: number; // unix ms
  snapshotShares: string;
  yesShares: string;
  noShares: string;
  status: ProposalStatusName;
  yesPercent: number;
  noPercent: number;
  quorumReached: boolean;
  hasPassed: boolean;
  userVote: {voted: boolean; isYes?: boolean; shares?: string} | null;
}

export interface VaultView {
  address: string;
  index: number;
  name: string;
  symbol: string;
  manager: string;
  state: (typeof VAULT_STATES)[number];
  /** Raw shares, SHARE_DECIMALS decimals. */
  totalSupply: string;
  shareDecimals: number;
  holdings: Holding[];
  totalValueUsd: string | null;
  sharePriceUsd: string | null;
  /** The curator's published plan, or null until one is posted on-chain. */
  plan: CuratorPlan | null;
  /** The requested account's stake, when an account was given. */
  position: {shares: string; valueUsd: string | null; votingPower?: string} | null;
  /** Unix ms when the prices were read. */
  pricedAt: number;
  /** V2 Governance and autonomous keeper fields */
  gasTankLamports: string;
  targets: TargetWeight[];
  openProposal: ProposalView | null;
  cycleStart: number;
  rebalanceIntervalSeconds: number;
}

/** Free text, never enforced by the program; every `set_strategy` bumps the version. */
export interface CuratorPlan {
  version: number;
  text: string;
}

type PriceBook = Map<string, string>;

/** Null while no plan has been posted (version 0). */
export function toPlan(text: string, version: bigint): CuratorPlan | null {
  if (version === BigInt(0)) return null;
  return {version: Number(version), text};
}


function units(raw: string, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

export async function readVault(vaultParam: string, account?: PublicKey, prices?: PriceBook): Promise<VaultView> {
  const address = parseKey(vaultParam, 'vault');
  const conn = connection();
  const program = folioProgram(conn);

  let v;
  try {
    v = await program.account.vault.fetch(address);
  } catch (error) {
    throw vaultReadError(error, address.toBase58());
  }
  const usdc = v.settlementMint.toBase58();
  const programs = await tokenProgramsOf(conn, v.held);
  const accounts = v.held.map((mint) => ata(address, mint, programs.get(mint.toBase58())!));
  const balances = await conn.getMultipleParsedAccounts(accounts);
  const book = prices ?? (await displayPrices(v.held.map((m) => m.toBase58()).filter((m) => m !== usdc)));

  const holdings: Holding[] = v.held.map((mint, i) => {
    const key = mint.toBase58();
    const info = tokenByMint(key);
    const parsed = balances.value[i]?.data;
    const tokenAmount =
      parsed && 'parsed' in parsed ? (parsed.parsed.info.tokenAmount as {amount: string; decimals: number}) : undefined;
    const decimals = tokenAmount?.decimals ?? info?.decimals ?? 0;
    const amount = tokenAmount?.amount ?? '0';
    const priceUsd = key === usdc ? '1' : (book.get(key) ?? null);
    return {
      asset: key,
      symbol: info?.symbol ?? `${key.slice(0, 4)}…${key.slice(-4)}`,
      decimals,
      amount,
      priceUsd,
      valueUsd: priceUsd === null ? null : String(units(amount, decimals) * Number(priceUsd)),
    };
  });

  // Zero balances need no price, matching the program's own valuation.
  const priced = holdings.filter((h) => h.amount !== '0');
  const complete = priced.every((h) => h.valueUsd !== null);
  const total = complete ? priced.reduce((sum, h) => sum + Number(h.valueUsd), 0) : null;
  const totalSupply = v.totalShares.toString();
  const supply = units(totalSupply, SHARE_DECIMALS);
  const sharePrice = total === null || supply === 0 ? null : total / supply;

  let position: VaultView['position'] = null;
  if (account) {
    const p = await program.account.position.fetchNullable(positionPda(address, account));
    const shares = p ? p.shares.toString() : '0';
    const votingPower = p ? (p.snapshotShares.gt(new BN(0)) ? p.snapshotShares.toString() : shares) : '0';
    position = {
      shares,
      valueUsd: sharePrice === null ? null : String(units(shares, SHARE_DECIMALS) * sharePrice),
      votingPower,
    };
  }

  // V2 Strategy targets
  const targets: TargetWeight[] = (v.targets ?? []).map((t) => {
    const asset = t.mint.toBase58();
    const info = tokenByMint(asset);
    return {
      asset,
      symbol: info?.symbol ?? `${asset.slice(0, 4)}…${asset.slice(-4)}`,
      targetBps: t.bps,
      targetPercent: t.bps / 100,
    };
  });

  // V2 Open Proposal
  let openProposal: ProposalView | null = null;
  if (v.openProposal && v.openProposal.gt(new BN(0))) {
    try {
      const proposalId = v.openProposal.sub(new BN(1));
      const proposalAddress = proposalPda(address, proposalId);
      const prop = await program.account.proposal.fetchNullable(proposalAddress);
      if (prop) {
        const propTargets: TargetWeight[] = prop.targets.map((t) => {
          const asset = t.mint.toBase58();
          const info = tokenByMint(asset);
          return {
            asset,
            symbol: info?.symbol ?? `${asset.slice(0, 4)}…${asset.slice(-4)}`,
            targetBps: t.bps,
            targetPercent: t.bps / 100,
          };
        });

        const statusKey = Object.keys(prop.status)[0] ?? 'voting';
        let status: ProposalStatusName = 'Voting';
        if (statusKey === 'queued') status = 'Timelock';
        else if (statusKey === 'rejected') status = 'Rejected';
        else if (statusKey === 'executed') status = 'Executed';

        if (status === 'Executed' || status === 'Rejected') {
          openProposal = null;
        } else {
          const bondRefunded = isProposalClosed(address.toBase58(), prop.id.toNumber());
          const totalVotes = prop.yesVotes.add(prop.noVotes);
          const yesPercent = totalVotes.gt(new BN(0))
            ? (prop.yesVotes.toNumber() / totalVotes.toNumber()) * 100
            : 0;
          const noPercent = totalVotes.gt(new BN(0))
            ? (prop.noVotes.toNumber() / totalVotes.toNumber()) * 100
            : 0;
          const quorumReached = prop.totalShares.gt(new BN(0)) &&
            totalVotes.mul(new BN(10000)).div(prop.totalShares).toNumber() >= 2000;
          const hasPassed = quorumReached && prop.yesVotes.gt(prop.noVotes);

          let userVote: ProposalView['userVote'] = null;
          if (account) {
            const vr = await program.account.voteRecord.fetchNullable(voteRecordPda(proposalAddress, account));
            if (vr) {
              userVote = {
                voted: true,
                isYes: vr.approve,
                shares: vr.weight.toString(),
              };
            }
          }

          openProposal = {
            id: prop.id.toNumber(),
            address: proposalAddress.toBase58(),
            proposer: prop.proposer.toBase58(),
            bondLamports: prop.bond.toString(),
            bondRefunded,
            planText: prop.plan,
            targets: propTargets,
            votingEndsAt: prop.votingEndsAt.toNumber() * 1000,
            timelockEndsAt: prop.timelockEndsAt.toNumber() * 1000,
            snapshotShares: prop.totalShares.toString(),
            yesShares: prop.yesVotes.toString(),
            noShares: prop.noVotes.toString(),
            status,
            yesPercent: Math.round(yesPercent * 10) / 10,
            noPercent: Math.round(noPercent * 10) / 10,
            quorumReached,
            hasPassed,
            userVote,
          };
        }
      }
    } catch {
      openProposal = null;
    }
  }


  const state = vaultStateName(v.state as Record<string, unknown>).toUpperCase() as VaultView['state'];
  return {
    address: address.toBase58(),
    index: v.index.toNumber(),
    name: v.name,
    symbol: 'FOLIO',
    manager: v.manager.toBase58(),
    state,
    totalSupply,
    shareDecimals: SHARE_DECIMALS,
    holdings,
    totalValueUsd: total === null ? null : String(total),
    sharePriceUsd: sharePrice === null ? null : String(sharePrice),
    plan: toPlan(v.plan, BigInt(v.planVersion.toString())),
    position,
    pricedAt: Date.now(),
    gasTankLamports: v.gasTank ? v.gasTank.toString() : '0',
    targets,
    openProposal,
    cycleStart: v.cycleStart ? v.cycleStart.toNumber() : 0,
    rebalanceIntervalSeconds: REBALANCE_INTERVAL_SECONDS,
  };
}


/** Every vault in the registry, newest first. */
export async function listVaults(account?: PublicKey): Promise<VaultView[]> {
  const program = folioProgram(connection());
  let count: number;
  try {
    count = (await program.account.registry.fetch(registryPda())).vaultCount.toNumber();
  } catch (error) {
    throw vaultReadError(error, 'registry');
  }
  if (count === 0) return [];
  const addresses = Array.from({length: count}, (_, i) => vaultPda(i));
  const vaults = await program.account.vault.fetchMultiple(addresses);
  const mints = [...new Set(vaults.flatMap((v) => (v ? v.held.map((m) => m.toBase58()) : [])))];
  const book = await displayPrices(mints.filter((m) => tokenByMint(m)?.underlying));
  const views = await Promise.all(
    addresses.filter((_, i) => vaults[i]).map((a) => readVault(a.toBase58(), account, book)),
  );
  return views.reverse();
}

export {ApiError};
