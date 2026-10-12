'use client';

/**
 * Wallet access for components: the connected address, the cluster label, and one way to send a
 * transaction and wait for it. Wraps @solana/wallet-adapter-react so components never touch it.
 */
import {useConnection as useSolanaConnection, useWallet} from '@solana/wallet-adapter-react';
import {Transaction, type Signer, type TransactionInstruction} from '@solana/web3.js';
import {useCallback} from 'react';
import {CLUSTER, explorerUrl} from '@/lib/solana/config';

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
 * confirmed. Throws if the wallet refuses or the transaction fails on-chain.
 */
export function useSendTransaction() {
  const {connection} = useSolanaConnection();
  const {publicKey, sendTransaction} = useWallet();

  return useCallback(
    async (input: TransactionInstruction[] | Transaction, signers: Signer[] = []): Promise<string> => {
      if (!publicKey) throw new Error('Connect a wallet first.');
      const {blockhash, lastValidBlockHeight} = await connection.getLatestBlockhash('confirmed');
      let tx: Transaction;
      if (input instanceof Transaction) {
        tx = input; // already has its blockhash and any server signature
      } else {
        tx = new Transaction({feePayer: publicKey, blockhash, lastValidBlockHeight}).add(...input);
        if (signers.length) tx.partialSign(...signers);
      }
      const signature = await sendTransaction(tx, connection, {preflightCommitment: 'confirmed'});
      const result = await connection.confirmTransaction(
        {signature, blockhash: tx.recentBlockhash ?? blockhash, lastValidBlockHeight: tx.lastValidBlockHeight ?? lastValidBlockHeight},
        'confirmed',
      );
      if (result.value.err) throw new Error(`The transaction failed on-chain: ${JSON.stringify(result.value.err)}`);
      return signature;
    },
    [connection, publicKey, sendTransaction],
  );
}
