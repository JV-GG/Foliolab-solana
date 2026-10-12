'use client';

/**
 * Wallet access for components: the connected address, the cluster label, and one way to send a
 * transaction and wait for it. Wraps @solana/wallet-adapter-react so components never touch it.
 */
import {useConnection as useSolanaConnection, useWallet} from '@solana/wallet-adapter-react';
import {
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
        let compiledV0 = false;
        try {
          const d = deployment();
          if (d.lookupTable) {
            const altRes = await connection.getAddressLookupTable(new PublicKey(d.lookupTable));
            if (altRes.value) {
              const messageV0 = new TransactionMessage({
                payerKey: publicKey,
                recentBlockhash: blockhash,
                instructions: input,
              }).compileToV0Message([altRes.value]);
              const txV0 = new VersionedTransaction(messageV0);
              if (signers.length) txV0.sign(signers);
              tx = txV0;
              compiledV0 = true;
            }
          }
        } catch (err) {
          console.warn('V0 compilation skipped, using legacy transaction:', err);
        }

        if (!compiledV0) {
          const legacyTx = new Transaction({feePayer: publicKey, blockhash, lastValidBlockHeight}).add(...input);
          if (signers.length) legacyTx.partialSign(...signers);
          tx = legacyTx;
        }
      }

      const signature = await sendTransaction(tx!, connection, {preflightCommitment: 'confirmed'});
      const result = await connection.confirmTransaction(
        {signature, blockhash, lastValidBlockHeight},
        'confirmed',
      );
      if (result.value.err) throw new Error(`The transaction failed on-chain: ${JSON.stringify(result.value.err)}`);
      return signature;
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
          if (signedTx instanceof VersionedTransaction) {
            sig = await connection.sendTransaction(signedTx, {preflightCommitment: 'confirmed'});
          } else {
            sig = await connection.sendRawTransaction(signedTx.serialize(), {preflightCommitment: 'confirmed'});
          }
          await connection.confirmTransaction({signature: sig, blockhash, lastValidBlockHeight}, 'confirmed');
          signatures.push(sig);
        }
      } else {
        // Single transaction or fallback
        for (const tx of txList) {
          const sig = await sendTransaction(tx, connection, {preflightCommitment: 'confirmed'});
          await connection.confirmTransaction({signature: sig, blockhash, lastValidBlockHeight}, 'confirmed');
          signatures.push(sig);
        }
      }

      return signatures;
    },
    [connection, publicKey, sendTransaction, signAllTransactions],
  );
}
