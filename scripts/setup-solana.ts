/**
 * Sets up Folio Lab on a cluster after `anchor deploy`: mock tokens, registry, allowlists, the
 * mock router's pool and one demo vault. Safe to re-run: it skips whatever already exists.
 *
 *   CLUSTER=localnet npm run setup:solana       # against solana-test-validator
 *   CLUSTER=devnet   npm run setup:solana
 *
 * Keys (outside the repo):
 *   ADMIN_KEYPAIR          default ~/.config/solana/id.json   pays, admin of the registry, demo vault manager
 *   GUARDIAN_KEYPAIR       default ~/folio-guardian.json      activates/pauses vaults (created if missing);
 *                                                             the demo server holds it to activate seeded vaults
 *   PRICE_SIGNER_KEYPAIR   default ~/folio-price-signer.json  its pubkey becomes registry.price_signer
 *   FAUCET_KEYPAIR         default ~/folio-faucet.json        mint authority of the mock tokens (created if missing)
 *
 * Writes the addresses to lib/solana/addresses.json under the cluster's name.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nacl from 'tweetnacl';
import {
  ComputeBudgetProgram,
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import {
  BN,
  ata,
  folioProgram,
  heldAccounts,
  poolPda,
  positionPda,
  priceMessage,
  registryPda,
  routerProgram,
  tokenProgramsOf,
  vaultPda,
  FOLIO_PROGRAM_ID,
  ROUTER_PROGRAM_ID,
} from '../lib/solana/program';
import type {Deployment, TokenInfo} from '../lib/solana/config';

const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const CLUSTER = process.env.CLUSTER ?? (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet');
const RPC =
  process.env.SOLANA_RPC_URL ?? (CLUSTER === 'localnet' ? 'http://127.0.0.1:8899' : 'https://api.devnet.solana.com');
const ADDRESSES = path.join(__dirname, '..', 'lib', 'solana', 'addresses.json');
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

/** Mock stocks and the demo price used only by this script's first trade. The app prices live. */
const STOCKS = [
  {symbol: 'AAPLx', name: 'Apple (mock xStock)', underlying: 'AAPL', token2022: true, demoPrice: 255},
  {symbol: 'NVDAx', name: 'NVIDIA (mock xStock)', underlying: 'NVDA', token2022: false, demoPrice: 185},
  {symbol: 'TSLAx', name: 'Tesla (mock xStock)', underlying: 'TSLA', token2022: true, demoPrice: 430},
  {symbol: 'MSFTx', name: 'Microsoft (mock xStock)', underlying: 'MSFT', token2022: true, demoPrice: 420},
  {symbol: 'AMZNx', name: 'Amazon (mock xStock)', underlying: 'AMZN', token2022: false, demoPrice: 190},
  {symbol: 'GOOGLx', name: 'Alphabet (mock xStock)', underlying: 'GOOGL', token2022: true, demoPrice: 175},
  {symbol: 'METAx', name: 'Meta (mock xStock)', underlying: 'META', token2022: false, demoPrice: 510},
  {symbol: 'SPYx', name: 'S&P 500 (mock xStock)', underlying: 'SPY', token2022: true, demoPrice: 580},
  {symbol: 'COINx', name: 'Coinbase (mock xStock)', underlying: 'COIN', token2022: false, demoPrice: 220},
];
const USDC_UNIT = BigInt(1_000_000);
const STOCK_UNIT = BigInt(100_000_000);

function home(p: string) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function loadKeypair(file: string, envVar?: string, createIfMissing = false): Keypair {
  if (envVar && process.env[envVar]) {
    try {
      const arr = JSON.parse(process.env[envVar]!.trim());
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch {}
  }
  const f = home(file);
  if (!fs.existsSync(f)) {
    if (!createIfMissing) throw new Error(`Keypair not found: ${f}`);
    const kp = Keypair.generate();
    fs.writeFileSync(f, JSON.stringify(Array.from(kp.secretKey)), {mode: 0o600});
    console.log(`created ${f}`);
    return kp;
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, 'utf8'))));
}

const connection = new Connection(RPC, 'confirmed');
const admin = loadKeypair(process.env.ADMIN_KEYPAIR ?? '~/.config/solana/id.json');
const priceSigner = loadKeypair(process.env.PRICE_SIGNER_KEYPAIR ?? '~/folio-price-signer.json', 'PRICE_SIGNER_SECRET_KEY');
const faucet = loadKeypair(process.env.FAUCET_KEYPAIR ?? '~/folio-faucet.json', 'FAUCET_SECRET_KEY', true);
const guardian = loadKeypair(process.env.GUARDIAN_KEYPAIR ?? '~/folio-guardian.json', 'GUARDIAN_SECRET_KEY', true);
const folio = folioProgram(connection);
const router = routerProgram(connection);

async function send(ixs: TransactionInstruction[], extraSigners: Keypair[] = []) {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, [admin, ...extraSigners], {commitment: 'confirmed'});
}

async function exists(address: PublicKey) {
  return (await connection.getAccountInfo(address)) !== null;
}

function readAddresses(): Record<string, Deployment> {
  return JSON.parse(fs.readFileSync(ADDRESSES, 'utf8'));
}

function save(d: Deployment) {
  const all = readAddresses();
  all[CLUSTER] = d;
  fs.writeFileSync(ADDRESSES, JSON.stringify(all, null, 2) + '\n');
}

async function ensureMint(existing: TokenInfo | undefined, decimals: number, token2022: boolean): Promise<PublicKey> {
  if (existing && (await exists(new PublicKey(existing.mint)))) return new PublicKey(existing.mint);
  const program = token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  return createMint(connection, admin, faucet.publicKey, null, decimals, Keypair.generate(), {commitment: 'confirmed'}, program);
}

async function fund(owner: PublicKey, mint: PublicKey, program: PublicKey, amount: bigint) {
  const account = await getOrCreateAssociatedTokenAccount(
    connection, admin, mint, owner, true, 'confirmed', {commitment: 'confirmed'}, program,
  );
  if (account.amount < amount) {
    await mintTo(connection, admin, mint, account.address, faucet, amount - account.amount, [], {commitment: 'confirmed'}, program);
  }
  return account.address;
}

function signPrices(registry: PublicKey, list: {mint: PublicKey; price: bigint}[]) {
  const update = {
    mints: list.map((p) => p.mint),
    prices: list.map((p) => new BN(p.price.toString())),
    timestamp: new BN(Math.floor(Date.now() / 1000) - 3),
  };
  const message = priceMessage(registry, update);
  const signature = nacl.sign.detached(message, priceSigner.secretKey);
  const ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: priceSigner.publicKey.toBytes(),
    message,
    signature,
  });
  return {update, ix};
}

async function main() {
  console.log(`cluster ${CLUSTER} (${RPC})`);
  console.log(`admin ${admin.publicKey.toBase58()}  balance ${(await connection.getBalance(admin.publicKey)) / 1e9} SOL`);
  for (const id of [FOLIO_PROGRAM_ID, ROUTER_PROGRAM_ID]) {
    if (!(await exists(id))) throw new Error(`Program ${id.toBase58()} is not deployed on ${CLUSTER}: run anchor deploy first`);
  }

  const previous = readAddresses()[CLUSTER];
  const find = (symbol: string) => previous?.tokens.find((t) => t.symbol === symbol);

  // 1. Mock tokens
  const usdc = await ensureMint(find('USDC'), 6, false);
  const tokens: TokenInfo[] = [{symbol: 'USDC', name: 'USD Coin (devnet mock)', mint: usdc.toBase58(), decimals: 6}];
  for (const s of STOCKS) {
    const mint = await ensureMint(find(s.symbol), 8, s.token2022);
    tokens.push({symbol: s.symbol, name: s.name, mint: mint.toBase58(), decimals: 8, underlying: s.underlying});
  }
  const registry = registryPda();
  const deploymentInfo: Deployment = {
    registry: registry.toBase58(),
    usdc: usdc.toBase58(),
    faucet: faucet.publicKey.toBase58(),
    tokens,
    vaults: previous?.vaults ?? [],
  };
  save(deploymentInfo);
  console.log('tokens', tokens.map((t) => `${t.symbol}=${t.mint}`).join(' '));

  // 2. Registry and allowlists
  if (!(await exists(registry))) {
    await send([
      await folio.methods
        .initializeRegistry(guardian.publicKey, priceSigner.publicKey)
        .accountsPartial({admin: admin.publicKey, registry, settlementMint: usdc, systemProgram: SystemProgram.programId})
        .instruction(),
    ]);
    console.log(`registry ${registry.toBase58()} created`);
  }
  const reg = await folio.account.registry.fetch(registry);
  const allow: TransactionInstruction[] = [];
  for (const t of tokens.slice(1)) {
    if (!reg.assets.some((a) => a.toBase58() === t.mint)) {
      allow.push(
        await folio.methods
          .setAsset(new PublicKey(t.mint), true)
          .accountsPartial({admin: admin.publicKey, registry})
          .instruction(),
      );
    }
  }
  if (!reg.routers.some((r) => r.equals(ROUTER_PROGRAM_ID))) {
    allow.push(
      await folio.methods.setRouter(ROUTER_PROGRAM_ID, true).accountsPartial({admin: admin.publicKey, registry}).instruction(),
    );
  }
  if (!reg.priceSigner.equals(priceSigner.publicKey)) {
    allow.push(
      await folio.methods.setPriceSigner(priceSigner.publicKey).accountsPartial({admin: admin.publicKey, registry}).instruction(),
    );
  }
  if (!reg.guardian.equals(guardian.publicKey)) {
    allow.push(
      await folio.methods.setGuardian(guardian.publicKey).accountsPartial({admin: admin.publicKey, registry}).instruction(),
    );
  }
  if (!reg.keeper?.equals(admin.publicKey)) {
    allow.push(
      await folio.methods.setKeeper(admin.publicKey).accountsPartial({admin: admin.publicKey, registry}).instruction(),
    );
  }
  if (allow.length) {
    await send(allow);
    console.log(`allowlist updated (${allow.length} changes)`);
  }

  // The guardian pays its own fees when the server activates a vault.
  if ((await connection.getBalance(guardian.publicKey)) < 10_000_000) {
    await send([SystemProgram.transfer({fromPubkey: admin.publicKey, toPubkey: guardian.publicKey, lamports: 20_000_000})]);
    console.log(`guardian ${guardian.publicKey.toBase58()} funded with 0.02 SOL`);
  }

  // 3. Router pool: plenty of every token
  const pool = poolPda();
  const programs = await tokenProgramsOf(connection, tokens.map((t) => new PublicKey(t.mint)));
  for (const t of tokens) {
    const mint = new PublicKey(t.mint);
    await fund(pool, mint, programs.get(t.mint)!, t.symbol === 'USDC' ? BigInt(10_000_000) * USDC_UNIT : BigInt(100_000) * STOCK_UNIT);
  }
  console.log(`router pool ${pool.toBase58()} funded`);

  // 4. Demo vault: create, seed 100 USDC, activate, plan, buy some AAPLx
  if (deploymentInfo.vaults.length === 0) {
    const index = (await folio.account.registry.fetch(registry)).vaultCount;
    const vault = vaultPda(index, registry);
    await fund(admin.publicKey, usdc, TOKEN_PROGRAM_ID, BigInt(1_000) * USDC_UNIT);
    await send([
      await folio.methods
        .createVault('Big Tech Core', admin.publicKey)
        .accountsPartial({
          payer: admin.publicKey,
          registry,
          vault,
          settlementMint: usdc,
          vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      await folio.methods
        .seed(new BN((BigInt(100) * USDC_UNIT).toString()))
        .accountsPartial({
          investor: admin.publicKey,
          vault,
          position: positionPda(vault, admin.publicKey),
          settlementMint: usdc,
          investorSettlement: ata(admin.publicKey, usdc, TOKEN_PROGRAM_ID),
          vaultSettlement: ata(vault, usdc, TOKEN_PROGRAM_ID),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      await folio.methods
        .fundGas(new BN(100_000_000))
        .accountsPartial({
          funder: admin.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      await folio.methods
        .setStrategy(
          'Core US big tech: 30% USDC, 40% AAPLx, 30% NVDAx index weights with autonomous rebalancing.',
          [
            {mint: usdc, bps: 3000},
            {mint: new PublicKey(tokens.find((t) => t.symbol === 'AAPLx')!.mint), bps: 4000},
            {mint: new PublicKey(tokens.find((t) => t.symbol === 'NVDAx')!.mint), bps: 3000},
          ],
        )
        .accountsPartial({manager: admin.publicKey, registry, vault})
        .instruction(),
      await folio.methods.activate().accountsPartial({guardian: guardian.publicKey, registry, vault}).instruction(),
    ], [guardian]);
    deploymentInfo.vaults.push(vault.toBase58());
    save(deploymentInfo);
    console.log(`demo vault ${vault.toBase58()} created, seeded, active`);

    const aapl = tokens.find((t) => t.symbol === 'AAPLx')!;
    const aaplMint = new PublicKey(aapl.mint);
    const aaplProgram = programs.get(aapl.mint)!;
    const price = BigInt(STOCKS[0].demoPrice) * USDC_UNIT;
    const amountIn = BigInt(40) * USDC_UNIT;
    const amountOut = (amountIn * STOCK_UNIT * BigInt(997)) / (price * BigInt(1000));
    await rebalance(vault, usdc, TOKEN_PROGRAM_ID, aaplMint, aaplProgram, amountIn, amountOut, [{mint: aaplMint, price}]);
    console.log(`demo vault bought ${Number(amountOut) / 1e8} AAPLx for 40 USDC`);
  }

  console.log(`\nwrote ${path.relative(process.cwd(), ADDRESSES)} [${CLUSTER}]`);
  console.log(`NEXT_PUBLIC_USDC_MINT=${usdc.toBase58()}`);
}

async function rebalance(
  vault: PublicKey,
  sell: PublicKey,
  sellProgram: PublicKey,
  buy: PublicKey,
  buyProgram: PublicKey,
  amountIn: bigint,
  amountOut: bigint,
  prices: {mint: PublicKey; price: bigint}[],
) {
  const registry = registryPda();
  const pool = poolPda();
  const v = await folio.account.vault.fetch(vault);
  const programs = await tokenProgramsOf(connection, v.held);
  const route = await router.methods
    .swap(new BN(amountIn.toString()), new BN(amountOut.toString()))
    .accountsPartial({
      user: vault,
      userSrc: ata(vault, sell, sellProgram),
      userDst: ata(vault, buy, buyProgram),
      pool,
      poolSrc: ata(pool, sell, sellProgram),
      poolDst: ata(pool, buy, buyProgram),
      srcMint: sell,
      dstMint: buy,
      srcTokenProgram: sellProgram,
      dstTokenProgram: buyProgram,
    })
    .instruction();
  // The vault cannot sign the transaction; the program signs for it inside the CPI.
  const routeAccounts = route.keys.map((k) => (k.pubkey.equals(vault) ? {...k, isSigner: false} : k));
  const signed = signPrices(registry, prices);
  const ix = await folio.methods
    .rebalance(new BN(amountIn.toString()), new BN(amountOut.toString()), route.data, signed.update)
    .accountsPartial({
      keeper: admin.publicKey,
      registry,
      vault,
      sellMint: sell,
      buyMint: buy,
      vaultSell: ata(vault, sell, sellProgram),
      vaultBuy: ata(vault, buy, buyProgram),
      router: ROUTER_PROGRAM_ID,
      sellTokenProgram: sellProgram,
      buyTokenProgram: buyProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      instructions: SYSVAR_INSTRUCTIONS,
    })
    .remainingAccounts([...heldAccounts(vault, v.held, programs), ...routeAccounts])
    .instruction();
  await send([ComputeBudgetProgram.setComputeUnitLimit({units: 400_000}), signed.ix, ix]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
