/**
 * Server-side registry of closed / refunded proposals.
 * Prevents unlimited refunds for the same proposal and ensures the proposal
 * card is immediately closed across all clients.
 */

const closedProposals = new Set<string>();

export function markProposalClosed(vault: string, proposalId?: number | string | null): void {
  if (proposalId !== undefined && proposalId !== null) {
    closedProposals.add(`${vault.toLowerCase()}:${proposalId}`);
  }
  closedProposals.add(`${vault.toLowerCase()}:latest`);
}

export function isProposalClosed(vault: string, proposalId?: number | string | null): boolean {
  if (proposalId !== undefined && proposalId !== null) {
    if (closedProposals.has(`${vault.toLowerCase()}:${proposalId}`)) {
      return true;
    }
  }
  return closedProposals.has(`${vault.toLowerCase()}:latest`);
}
