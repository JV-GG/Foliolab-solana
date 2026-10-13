import fs from 'fs';
import path from 'path';

const PERSIST_FILE = path.join(process.cwd(), '.closed-proposals.json');

function readPersistedSet(): Set<string> {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        return new Set(data.map((x) => String(x).toLowerCase()));
      }
    }
  } catch (err) {
    // ignore read error
  }
  return new Set<string>();
}

function writePersistedSet(set: Set<string>): void {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify([...set], null, 2), 'utf-8');
  } catch (err) {
    // ignore write error
  }
}

// Use globalThis to persist across Next.js HMR module reloads in development
const globalForProposals = globalThis as unknown as {
  folioClosedProposals?: Set<string>;
};

const closedProposals = globalForProposals.folioClosedProposals ?? readPersistedSet();
if (process.env.NODE_ENV !== 'production') {
  globalForProposals.folioClosedProposals = closedProposals;
}

export function markProposalClosed(vault: string, proposalId?: number | string | null): void {
  const v = vault.toLowerCase();
  const disk = readPersistedSet();
  if (proposalId !== undefined && proposalId !== null) {
    closedProposals.add(`${v}:${proposalId}`);
    disk.add(`${v}:${proposalId}`);
  }
  closedProposals.add(`${v}:latest`);
  closedProposals.add(`${v}:0`);
  closedProposals.add(`${v}:all`);
  disk.add(`${v}:latest`);
  disk.add(`${v}:0`);
  disk.add(`${v}:all`);
  writePersistedSet(disk);
}

export function isProposalClosed(vault: string, proposalId?: number | string | null): boolean {
  const v = vault.toLowerCase();
  const disk = readPersistedSet();
  for (const item of disk) {
    closedProposals.add(item);
  }
  if (proposalId !== undefined && proposalId !== null) {
    if (closedProposals.has(`${v}:${proposalId}`) || disk.has(`${v}:${proposalId}`)) {
      return true;
    }
  }
  return (
    closedProposals.has(`${v}:latest`) ||
    closedProposals.has(`${v}:all`) ||
    disk.has(`${v}:latest`) ||
    disk.has(`${v}:all`)
  );
}

export interface StrategyOverride {
  targets: Array<{
    asset: string;
    symbol: string;
    targetBps: number;
    targetPercent: number;
  }>;
  plan?: string;
  timestamp: number;
}

const STRATEGY_FILE = path.join(process.cwd(), '.vault-strategies.json');

function readPersistedStrategies(): Record<string, StrategyOverride> {
  try {
    if (fs.existsSync(STRATEGY_FILE)) {
      return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writePersistedStrategies(data: Record<string, StrategyOverride>): void {
  try {
    fs.writeFileSync(STRATEGY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export function adoptProposalStrategy(
  vault: string,
  targets: Array<{asset: string; symbol: string; targetBps: number; targetPercent: number}>,
  plan?: string,
): void {
  const v = vault.toLowerCase();
  const disk = readPersistedStrategies();
  disk[v] = {
    targets,
    plan,
    timestamp: Date.now(),
  };
  writePersistedStrategies(disk);
}

export function getAdoptedStrategy(vault: string): StrategyOverride | null {
  const v = vault.toLowerCase();
  const disk = readPersistedStrategies();
  return disk[v] ?? null;
}

const CLOSED_VAULTS_FILE = path.join(process.cwd(), '.closed-vaults.json');

function readPersistedClosedVaults(): Record<string, {closedAt: number; reclaimedSol?: string}> {
  try {
    if (fs.existsSync(CLOSED_VAULTS_FILE)) {
      return JSON.parse(fs.readFileSync(CLOSED_VAULTS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writePersistedClosedVaults(data: Record<string, {closedAt: number; reclaimedSol?: string}>): void {
  try {
    fs.writeFileSync(CLOSED_VAULTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export function markVaultClosed(vault: string, reclaimedSol: string = '0.01 SOL'): void {
  const v = vault.toLowerCase();
  const disk = readPersistedClosedVaults();
  disk[v] = {
    closedAt: Date.now(),
    reclaimedSol,
  };
  writePersistedClosedVaults(disk);
}

export function isVaultClosed(vault: string): boolean {
  const v = vault.toLowerCase();
  const disk = readPersistedClosedVaults();
  return Boolean(disk[v]);
}

