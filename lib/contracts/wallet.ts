'use client';

/**
 * Wallet access for components: the connected address, the cluster label, and one way to send a
 * transaction and wait for it. Wraps @solana/wallet-adapter-react so components never touch it.
 */
import {useConnection as useSolanaConnection, useWallet} from '@solana/wallet-adapter-react';
import {Transaction, type Connection, type Signer, type TransactionInstruction} from '@solana/web3.js';
import {useCallback} from 'react';
import {CLUSTER, explorerUrl} from '@/lib/solana/config';

export const appChainLabel =
  CLUSTER === 'mainnet-beta' ? 'Solana' : CLUSTER === 'devnet' ? 'Solana devnet' : 'Local Solana validator';
export const isTestCluster = CLUSTER !== 'mainnet-beta';
export {explorerUrl};

/**
 * Polls the signature status instead of using a websocket subscription: the public devnet RPC
 * rate-limits websockets (HTTP 429), and a lost subscription would leave the UI waiting forever.
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
 * confirmed. Throws if the wallet refuses or the transaction fails on-chain.
 */
export function useSendTransaction() {
  const {connection} = useSolanaConnection();
  const {publicKey, signTransaction, sendTransaction} = useWallet();

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
      let signature: string;
      if (signTransaction) {
        // Sign in the wallet, send through our RPC. Phantom's own send edits the transaction (it adds
        // instructions), which voids a server's partial signature (the faucet), and it reports any
        // simulation failure only as "Unexpected error". Sending ourselves keeps the real program error.
        const signed = await signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), {preflightCommitment: 'confirmed'});
      } else {
        signature = await sendTransaction(tx, connection, {preflightCommitment: 'confirmed'});
      }
      await waitForConfirmation(connection, signature, tx.lastValidBlockHeight ?? lastValidBlockHeight);
      return signature;
    },
    [connection, publicKey, signTransaction, sendTransaction],
  );
}
