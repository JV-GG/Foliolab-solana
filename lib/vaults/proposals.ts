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

