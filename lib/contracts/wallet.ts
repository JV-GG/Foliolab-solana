'use client';

/**
 * Wallet access for components: the connected address, the cluster label, and one way to send a
 * transaction and wait for it. Wraps @solana/wallet-adapter-react so components never touch it.
 */
import {useConnection as useSolanaConnection, useWallet} from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type Signer,
  type TransactionInstruction,
} from '@solana/web3.js';
import {useCallback} from 'react';
import {CLUSTER, deployment, explorerUrl} from '@/lib/solana/config';

export const appChainLabel =
  CLUSTER === 'mainnet-beta' ? 'Solana' : CLUSTER === 'devnet' ? 'Solana devnet' : 'Local Solana validator';
export const isTestCluster = CLUSTER !== 'mainnet-beta';
export {explorerUrl};

async function extractTxError(
  err: any,
  tx: Transaction | VersionedTransaction | null | undefined,
  connection: Connection,
): Promise<never> {
  const logs = err?.logs || err?.error?.logs;
  if (logs && Array.isArray(logs)) {
    const anchorErr = logs.find((l: string) => l.includes('Error Message:'));
    if (anchorErr) {
      throw new Error(anchorErr.replace(/^.*Error Message:\s*/, ''));
    }
    const codeErr = logs.find((l: string) => l.includes('Error Code:'));
    if (codeErr) {
      throw new Error(codeErr.replace(/^.*Error Code:\s*/, ''));
    }
  }
  if (tx) {
    try {
      const sim = await connection.simulateTransaction(tx as any);
      const simLogs = sim?.value?.logs || [];
      const anchorErr = simLogs.find((l: string) => l.includes('Error Message:'));
      if (anchorErr) {
        throw new Error(anchorErr.replace(/^.*Error Message:\s*/, ''));
      }
      const codeErr = simLogs.find((l: string) => l.includes('Error Code:'));
      if (codeErr) {
        throw new Error(codeErr.replace(/^.*Error Code:\s*/, ''));
      }
    } catch (simErr: any) {
      const simLogs = simErr?.logs || simErr?.error?.logs || [];
      const anchorErr = simLogs.find((l: string) => l.includes('Error Message:'));
      if (anchorErr) {
        throw new Error(anchorErr.replace(/^.*Error Message:\s*/, ''));
      }
      if (simErr.message && !simErr.message.includes('Unexpected error')) {
        throw simErr;
      }
    }
  }
  throw err;
}

/**
 * Polls signature status instead of relying purely on websockets: the public devnet RPC
 * rate-limits websockets (HTTP 429), and a dropped subscription leaves the UI waiting.
 */
async function waitForConfirmation(connection: Connection, signature: string, lastValidBlockHeight: number) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const {value} = await connection.getSignatureStatuses([signature]).catch(() => ({value: [null]}));
    const status = value[0];
    if (status?.err) throw new Error(`The transaction failed on-chain: ${JSON.stringify(status.err)}`);
    if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) return;
    if (attempt % 10 === 9) {
      const height = await connection.getBlockHeight('confirmed').catch(() => 0);
      if (height > lastValidBlockHeight) throw new Error('The transaction expired before it landed. Try again.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`Still waiting for confirmation. Check it on Solana Explorer: ${signature}`);
}

/** The connected wallet, in the shape the components already use. */
export function useConnection(): {address: string | undefined; isConnected: boolean} {
  const {publicKey, connected} = useWallet();
  return {address: publicKey?.toBase58(), isConnected: connected && Boolean(publicKey)};
}

/**
 * Sends `instructions` (or a prepared transaction) from the connected wallet and waits until it is
 * confirmed. Automatically compiles using the Address Lookup Table (v0) when available to prevent
 * transaction MTU limits (1232 bytes). Throws if the wallet refuses or the transaction fails on-chain.
 */
export function useSendTransaction() {
  const {connection} = useSolanaConnection();
  const {publicKey, sendTransaction} = useWallet();

  return useCallback(
    async (
      input: TransactionInstruction[] | Transaction | VersionedTransaction,
      signers: Signer[] = [],
    ): Promise<string> => {
      if (!publicKey) throw new Error('Connect a wallet first.');
      const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash('confirmed');

      let tx: Transaction | VersionedTransaction;
      if (input instanceof VersionedTransaction) {
        tx = input;
        if (signers.length) tx.sign(signers);
      } else if (input instanceof Transaction) {
        tx = input;
        if (signers.length) tx.partialSign(...signers);
      } else {
        const legacyTx = new Transaction({feePayer: publicKey, blockhash, lastValidBlockHeight}).add(...input);
        if (signers.length) legacyTx.partialSign(...signers);

        let isTooLarge = false;
        try {
          legacyTx.serialize({requireAllSignatures: false, verifySignatures: false});
        } catch (err: any) {
          if (/too large/i.test(String(err?.message))) isTooLarge = true;
        }

        if (isTooLarge) {
          const d = deployment();
          let altAccount = null;
          if (d.lookupTable) {
            altAccount = (await connection.getAddressLookupTable(new PublicKey(d.lookupTable))).value;
          }
          if (altAccount) {
            const messageV0 = new TransactionMessage({
              payerKey: publicKey,
              recentBlockhash: blockhash,
              instructions: input,
            }).compileToV0Message([altAccount]);
            const vTx = new VersionedTransaction(messageV0);
            if (signers.length) vTx.sign(signers);
            tx = vTx;
          } else {
            tx = legacyTx;
          }
        } else {
          tx = legacyTx;
        }
      }

      // Simulate first on our RPC: surfaces exact program error instead of generic wallet failure
      const sim = await connection.simulateTransaction(tx as any);
      if (sim.value.err) {
        const simLogs = sim.value.logs ?? [];
        const anchorErr = simLogs.find((l) => l.includes('Error Message:'));
        if (anchorErr) {
          throw new Error(anchorErr.replace(/^.*Error Message:\s*/, ''));
        }
        const codeErr = simLogs.find((l) => l.includes('Error Code:'));
        if (codeErr) {
          throw new Error(codeErr.replace(/^.*Error Code:\s*/, ''));
        }
        const failure = new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`) as Error & {logs?: string[]};
        failure.logs = simLogs;
        throw failure;
      }

      let signature: string;
      try {
        signature = await sendTransaction(tx, connection, {preflightCommitment: 'confirmed'});
      } catch (err: any) {
        await extractTxError(err, tx, connection);
      }
      const validUntil = (tx instanceof Transaction ? tx.lastValidBlockHeight : null) ?? lastValidBlockHeight;
      await waitForConfirmation(connection, signature!, validUntil);
      return signature!;
    },
    [connection, publicKey, sendTransaction],
  );
}

/**
 * Signs and sends multiple transactions with ONE wallet approval modal using signAllTransactions.
 * Falls back to sendTransaction if signAllTransactions is not supported.
 */
export function useSendMultipleTransactions() {
  const {connection} = useSolanaConnection();
  const {publicKey, signAllTransactions, sendTransaction} = useWallet();

  return useCallback(
    async (instructionSets: TransactionInstruction[][]): Promise<string[]> => {
      if (!publicKey) throw new Error('Connect a wallet first.');
      if (instructionSets.length === 0) return [];

      const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash('confirmed');
      const d = deployment();
      let altAccount = null;
      if (d.lookupTable) {
        try {
          altAccount = (await connection.getAddressLookupTable(new PublicKey(d.lookupTable))).value;
        } catch (err) {
          console.warn('ALT lookup failed:', err);
        }
      }

      // Compile each instruction set to VersionedTransaction (or legacy Transaction)
      const txList: (VersionedTransaction | Transaction)[] = [];
      for (const ixs of instructionSets) {
        if (altAccount) {
          const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: ixs,
          }).compileToV0Message([altAccount]);
          txList.push(new VersionedTransaction(messageV0));
        } else {
          txList.push(new Transaction({feePayer: publicKey, blockhash, lastValidBlockHeight}).add(...ixs));
        }
      }

      const signatures: string[] = [];

      // ONE SIGN ONLY: Use signAllTransactions so user approves all in a single modal!
      if (signAllTransactions && txList.length > 1) {
        const signedList = await signAllTransactions(txList);
        for (const signedTx of signedList) {
          let sig: string;
          try {
            if (signedTx instanceof VersionedTransaction) {
              sig = await connection.sendTransaction(signedTx, {preflightCommitment: 'confirmed'});
            } else {
              sig = await connection.sendRawTransaction(signedTx.serialize(), {preflightCommitment: 'confirmed'});
            }
          } catch (err: any) {
            await extractTxError(err, signedTx, connection);
          }
          await waitForConfirmation(connection, sig!, lastValidBlockHeight);
          signatures.push(sig!);
        }
      } else {
        // Single transaction or fallback
        for (const tx of txList) {
          let sig: string;
          try {
            sig = await sendTransaction(tx, connection, {preflightCommitment: 'confirmed'});
          } catch (err: any) {
            await extractTxError(err, tx, connection);
          }
          const validUntil = (tx instanceof Transaction ? tx.lastValidBlockHeight : null) ?? lastValidBlockHeight;
          await waitForConfirmation(connection, sig!, validUntil);
          signatures.push(sig!);
        }
      }

      return signatures;
    },
    [connection, publicKey, sendTransaction, signAllTransactions],
  );
}
