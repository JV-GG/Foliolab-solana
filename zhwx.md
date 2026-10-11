# Folio Lab → Solana: port status and handoff

Last updated: 11 Oct 2026. Read this whole file before changing code. If you are an AI agent, treat
it as your brief: the facts, interfaces and gotchas here are verified, and the "To do" tasks are
written so you can pick one and do it.

## 1. Context in one minute

- **Folio Lab** is a pooled portfolio of tokenized US stocks. A curator creates a vault and posts a
  plan, investors deposit a stablecoin and get non-transferable shares, and the curator trades the pool
  into approved stock tokens. Guarantees: the curator can trade but never withdraw; any holder can
  always withdraw their percentage of every holding (even when paused); deposits never dilute holders;
  each trade loses at most 2% against signed prices.
- It was first built for the **BNB Chain** hackathon (Solidity + Next.js) in the `bnb-hack` repo.
- This repo (`Foliolab-solana`) is the **Solana port** for a Solana-track hackathon. **Deadline: today
  (11 Oct 2026).**
- Decisions taken:
  - Run on **devnet** with **mock stock tokens** and a **mock swap program** (`mock_router`). The
    real stock tokens (e.g. xStocks) and Jupiter liquidity exist only on mainnet.
  - Keep **backend-signed prices**, now **ed25519**-signed instead of EIP-712 (no Pyth for now).
  - Next.js app stays at the repo root; the Solana programs live in `anchor/`.
  - Stablecoin is **USDC** (6 decimals), not USDT.

## 2. Done ✅

| What | Where |
|---|---|
| Next.js app copied from `bnb-hack` (no `.env`, no Solidity, no `prototype/`) | repo root |
| Anchor workspace (Anchor **1.2.1**) | `anchor/` |
| `folio_vault` program: all BNB contract features ported | `anchor/programs/folio_vault/src/` |
| `mock_router` program (Jupiter stand-in) | `anchor/programs/mock_router/src/lib.rs` |
| 11 LiteSVM tests, **all passing**: full flow, sell to dust, minimum seed, wrong signer, stale prices, missing price, pause blocks deposit and trade but not redeem, >2% loss refused, plan and manager required, unlisted asset or router refused, over-redeem refused | `anchor/programs/folio_vault/tests/test_vault.rs` |
| IDL generated | `anchor/target/idl/folio_vault.json`, `mock_router.json` |
| Program README (mapping, price message, remaining_accounts) | `anchor/README.md` |
| Root `README.md` rewritten for Solana (with honest status) | `README.md` |
| `.env.example` rewritten with Solana variables and how to fill each | `.env.example` |
| Toolchain installed on Jun Voon's Mac (see §6) | — |

Program IDs (from `anchor/target/deploy/*-keypair.json`, **not deployed yet**):
- `folio_vault`: `9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH`
- `mock_router`: `FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm`

> The keypair files in `anchor/target/deploy/` decide those IDs. `target/` is git-ignored, so **copy
> those two keypair files to whoever deploys**, or run `anchor keys sync` on a fresh machine and update
> every place the IDs appear.

## 3. Not done ❌

| Area | State |
|---|---|
| Devnet deployment | Not deployed. No wallet on the machine yet (`~/.config/solana/id.json` missing). |
| Devnet setup script (mock USDC/AAPL/NVDA mints, registry init, allowlist, router pool) | Not written |
| Backend (`app/api/**`, `lib/pricing`, `lib/trade`, `lib/vaults`, `lib/chain`, `lib/history`) | Still EVM (viem). Reads BSC. |
| Frontend wallet and hooks (`lib/contracts/**`, `app/providers.tsx`, components) | Still wagmi/viem. |
| Root `AGENTS.md` / `CLAUDE.md` | Still describe the BNB project. Update them, or agents will be misled. |
| Malicious-router test (router tries to drain or approve a delegate) | Not written. The checks exist in code. |
| Real Jupiter swap (mainnet) | Not attempted. |
| Vercel deploy, demo video, developer-experience report | Not started. **The DX report must be written by the team, not by AI.** |

## 4. To do, in priority order

Each task lists the files it touches. Tasks 2–4 can run in parallel once task 1 has produced
addresses.

### Task 1 — Deploy to devnet (blocks everything else)
1. Create a deploy wallet: `solana-keygen new -o ~/.config/solana/id.json`, then
   `solana config set --url devnet` and `solana airdrop 2` (repeat, or use https://faucet.solana.com).
   Deploying both programs needs roughly 3–4 SOL.
2. Copy the two program keypairs into `anchor/target/deploy/`, then
   `cd anchor && anchor build --arch v0 && anchor deploy --provider.cluster devnet`.
3. Write `anchor/scripts/setup-devnet.ts` (TypeScript, `@solana/web3.js` +
   `@coral-xyz/anchor` style client using the IDL, or `@solana/kit` + Codama). It must:
   - create mock mints: USDC (6 decimals, legacy SPL Token), AAPLx (8 decimals, **Token-2022**) and
     NVDAx (8 decimals, legacy) — mirror the test setup;
   - `initialize_registry(guardian, price_signer)`, where `price_signer` is the public key of
     `PRICE_SIGNER_SECRET_KEY`;
   - `set_asset` for each stock mint, `set_router(mock_router id)`;
   - fund the router pool: ATAs owned by PDA `["pool"]` of `mock_router`, for every mint, with
     a large balance;
   - optionally create one demo vault, seed it with 100 USDC, activate it, and post a plan;
   - print every address as JSON → save to `lib/contracts/addresses.devnet.json`.
4. Put the USDC mint into `.env.local` / Vercel as `NEXT_PUBLIC_USDC_MINT`.

### Task 2 — Backend (Part 2): replace viem with Solana
Files: `lib/chain/server.ts`, `lib/pricing/signer.ts`, `lib/trade/build.ts`, `lib/vaults/read.ts`,
`lib/history/*`, `app/api/**`. Keep `lib/binance/**` and `lib/pricing/rules.ts` (pure, chain-agnostic).

- `lib/chain/server.ts`: a Solana `Connection` / `createSolanaRpc` from `SOLANA_RPC_URL`.
- `lib/pricing/signer.ts`: read the vault account (Anchor IDL decode) → `held` mints; get prices
  (Binance as now); build the **exact message in §5.2**; sign with ed25519 (`tweetnacl` or
  `@noble/ed25519`) using `PRICE_SIGNER_SECRET_KEY` (a JSON array of 64 numbers). Response:
  `{ update: { mints: string[], prices: string[], timestamp: string }, message: base64,
  signature: base64, signer: base58, expiresAt }`. On devnet the mock mints have no Binance listing:
  keep a map `mock mint → real symbol` (AAPLx→AAPL, NVDAx→NVDA) and price them from the underlying.
- `lib/trade/build.ts` (`/api/trade`): on devnet, return the **mock_router `swap` instruction**
  (`amount_in`, `amount_out = amount_in × price_sell / price_buy × 0.997`, adjusted for decimals) and
  its account list (§5.3), with the vault as `user`, **not signer**. On mainnet (later): Jupiter
  `/swap-instructions` with `userPublicKey = vault PDA`.
- `lib/vaults/read.ts` (`/api/vaults`): list vaults with `getProgramAccounts` filtered by the `Vault`
  discriminator, or derive PDAs `0..registry.vault_count`. Holdings = balances of the vault's ATAs for
  each `held` mint.
- `lib/history`: rebuild from program logs/events (`Deposited`, `Redeemed`, `Rebalanced`,
  `PlanPosted`) via `getSignaturesForAddress(vault)`. Lowest priority; stub it if short on time.
- `app/api/vaults/[address]/activate`: dev-only guardian helper; port it or delete it.

### Task 3 — Investor frontend (Part 3)
Files: `app/providers.tsx`, `lib/contracts/**`, `components/WalletButton.tsx`, `AccountBar.tsx`,
`TradeDialog.tsx`, `VaultDetailsPage.tsx`, `InvestorExplore.tsx`, `PortfolioDashboard.tsx`,
`ActivityFeed.tsx`, `lib/history/hooks.ts`.

- Replace wagmi with the Solana wallet adapter (`@solana/wallet-adapter-react` + `-react-ui`,
  Phantom/Solflare/Backpack via Wallet Standard). Keep `@tanstack/react-query`.
- Delete `lib/contracts/abis.ts` and `wagmi.ts`; add the IDL (`anchor/target/idl/folio_vault.json`
  plus its TS types) and `addresses.devnet.json`.
- **Deposit**: fetch `/api/prices?vault=…`, then one transaction containing
  `Ed25519Program.createInstructionWithPublicKey({ publicKey, message, signature })` **immediately
  followed by** `deposit(amount, min_shares, prices)` with remaining accounts `[mint, vault_ata]` for
  each held mint. No "approve" step on Solana.
- **Redeem**: `createAssociatedTokenAccountIdempotent` for each held mint the user lacks, then
  `redeem(shares, [])` with remaining accounts `[mint, vault_ata, user_ata]` per held mint.
- Share price = vault value / `total_shares` (both in USDC base units; shares have 6 decimals).
- Remove every 0x-address `isAddress` check: addresses are base58 now.

### Task 4 — Curator console (Part 4)
Files: `app/curator/**`, `components/curator/**`.
- Create vault: `create_vault(name, manager)`; the vault PDA uses the **current**
  `registry.vault_count` — read it right before sending.
- Seed: `seed(amount)` ≥ 10 USDC. Activate is guardian-only (demo: the deployer wallet is guardian).
- Plan: `set_plan(text)`, 1–1000 bytes.
- Rebalance: `/api/trade` + `/api/prices` → `[ed25519 ix, rebalance(max_sell, min_buy, route_data,
  prices)]`. Add a `ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })` first.
- Then: Vercel deploy, README demo transactions, demo video.

### Task 5 — Cleanups
- Update `AGENTS.md` (and `CLAUDE.md`, which just includes it) for Solana: parts, file ownership,
  these interfaces.
- Add a malicious-router test (a router that also transfers another held token, or approves a
  delegate) — it must fail with `CollateralDecreased` / `AuthorityChanged`.
- `docs/` still describes the EVM contracts; add a note or update it.

## 5. Interfaces (the contract other parts build against)

### 5.1 Accounts and PDAs
| Account | Seeds (program `folio_vault`) | Key fields |
|---|---|---|
| `Registry` | `["registry"]` | `admin, guardian, price_signer, settlement_mint, assets[], routers[], vault_count` |
| `Vault` | `["vault", registry, index as u64 LE]` | `manager, settlement_mint, name, state, total_shares, plan, plan_version, held[]` |
| `Position` | `["position", vault, owner]` | `shares` |
| Vault token accounts | Associated token account of the vault PDA (`allowOwnerOffCurve = true`) under the mint's own token program | — |

`state`: `Draft, Seeded, Active, Paused, Closed`. `held[0]` is always USDC. Max 10 held. Shares use
6 decimals; 1,000 "dead" units (0.001 share) are locked at seed and belong to nobody.

### 5.2 Signed price message (backend ↔ program)
```
"FOLIO_LAB_PRICES_V1"          (19 ASCII bytes)
registry pubkey                (32)
timestamp                      (i64 little-endian, unix seconds)
count                          (u8)
repeat count times: mint (32) || price (u64 LE)
```
`price` = USDC base units for **one whole token** (e.g. $200.50 → `200500000`). Max age 60 s;
up to 30 s in the future is tolerated. Every held non-USDC mint needs a price; for `rebalance`, also
the buy mint. The Ed25519 instruction must be the instruction **directly before** `deposit` /
`rebalance` and contain one signature with all data inline (the web3.js helper does this).

### 5.3 Instructions
| Instruction | Args | Accounts (in order) | remaining_accounts |
|---|---|---|---|
| `initialize_registry` | `guardian, price_signer` | admin✍, registry, settlement_mint, system_program | — |
| `set_asset` / `set_router` | `mint|program, allowed` | admin✍, registry | — |
| `create_vault` | `name (≤32 B), manager` | payer✍, registry, vault, settlement_mint, vault_settlement (ATA), token_program, associated_token_program, system_program | — |
| `seed` | `amount` | investor✍, vault, position, settlement_mint, investor_settlement, vault_settlement, token_program, system_program | — |
| `activate` / `pause` / `unpause` | — | guardian✍, registry, vault | — |
| `deposit` | `amount, min_shares, prices` | investor✍, registry, vault, position, settlement_mint, investor_settlement, vault_settlement, token_program, system_program, instructions sysvar | `[mint, vault_ata]` × held |
| `redeem` | `shares, forfeit: Pubkey[]` | owner✍, vault, position, token_program, token_2022_program | `[mint, vault_ata, recipient_ata]` × held |
| `set_plan` | `text (1–1000 B)` | manager✍, vault | — |
| `rebalance` | `max_sell, min_buy, route_data: bytes, prices` | manager✍, registry, vault, sell_mint, buy_mint, vault_sell, vault_buy (created if needed), router, sell_token_program, buy_token_program, associated_token_program, system_program, instructions sysvar | `[mint, vault_ata]` × held, **then** the router instruction's accounts with the vault marked not signer |

mock_router `swap(amount_in, amount_out)` accounts: user (vault), user_src, user_dst, pool (PDA
`["pool"]`), pool_src, pool_dst, src_mint, dst_mint, src_token_program, dst_token_program.

Events: `VaultCreated, Seeded, StateChanged, Deposited, Redeemed, PlanPosted, Rebalanced`.
Errors: see `anchor/programs/folio_vault/src/errors.rs` (e.g. `TradeLossTooHigh`, `StalePrices`,
`InvalidPriceSignature`, `MissingPrice`, `WrongState`, `NoPlanPosted`).

### 5.4 API responses (proposed; same routes as BNB)
- `GET /api/prices?vault=<base58>[&include=<mint>,…]` →
  `{ update: { mints, prices, timestamp }, message, signature, signer, expiresAt }` (numbers as strings, bytes as base64)
- `GET /api/trade?vault=…&sell=<mint>&buy=<mint>&amount=…` →
  `{ maxSell, minBuy, routeData (base64), routeAccounts: [{ pubkey, isSigner, isWritable }], warning? }`
- `GET /api/vaults/<base58>` → `{ holdings: [{ mint, symbol, amount, priceUsd, valueUsd }], totalValueUsd, sharePriceUsd, plan, planVersion, state }`

## 6. Toolchain and gotchas (verified)

- Install: `brew install solana anchor rustup`. Homebrew's `solana` **does not include
  `cargo-build-sbf`**: download `solana-release-aarch64-apple-darwin.tar.bz2` (v4.3.0) from
  https://github.com/anza-xyz/agave/releases and put its `bin/` on PATH. `rustup` from brew is keg-only:
  `export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.local/share/agave/solana-release/bin:$PATH"`, then
  `rustup default 1.89.0`.
- **Always build with `anchor build --arch v0`.** Anchor 1.2.1 defaults to SBPF v3, which LiteSVM
  refuses (`InvalidAccountData`) and clusters may not support.
- Anchor 1.x API differs from older tutorials: `Context<'info, T>` takes one lifetime, and
  `CpiContext::new(program_id: Pubkey, accounts)` takes a program **ID**, not an AccountInfo. The
  instructions sysvar helpers come from the `solana-instructions-sysvar` crate.
- Tests: `cd anchor && cargo test -p folio_vault`. LiteSVM needs `features = ["precompiles"]` for the
  Ed25519 program (already set).
- Never commit `.env*`, wallet JSON files or the price-signer key.

## 7. How to use this file with your AI

Paste something like:

> Read `SOLANA_PORT_STATUS.md` and `anchor/README.md` in this repo. I'm doing **Task N**. Stay within
> that task's files, follow the interfaces in §5 exactly, and don't change the Anchor program. If my
> task needs a change to a shared interface, stop and tell me.
