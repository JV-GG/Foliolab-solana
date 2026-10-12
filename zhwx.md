# Folio Lab → Solana: port status and handoff

Last updated: 12 Oct 2026. Read this whole file before changing code. If you are an AI agent, treat
it as your brief: the facts, interfaces and gotchas here are verified, and the "To do" tasks are
written so you can pick one and do it.

## 1. Context in one minute

- **Folio Lab** is a pooled portfolio of tokenized US stocks. A curator creates a vault and posts a
  plan, investors deposit a stablecoin and get non-transferable shares, and the curator trades the pool
  into approved stock tokens. Guarantees: the curator can trade but never withdraw; any holder can
  always withdraw their percentage of every holding (even when paused); deposits never dilute holders;
  each trade loses at most 2% against signed prices.
- This repo (`Foliolab-solana`) is the **Solana port** for a Solana-track hackathon. The deadline was
  given as 11 Oct 2026; confirm the exact submission time with the team.
- Decisions taken:
  - Run on **devnet** with **mock stock tokens** and a **mock swap program** (`mock_router`). The
    real stock tokens (e.g. xStocks) and Jupiter liquidity exist only on mainnet.
  - **Backend-signed prices** (ed25519), checked on-chain. Pyth's price API now needs an API key, so it
    is a later swap in `lib/pricing/source.ts`.
  - Next.js app stays at the repo root; the Solana programs live in `anchor/`.
  - Stablecoin is **USDC** (6 decimals).

## Status at a glance (12 Oct 2026)

- ✅ **Built:** Solana program, setup script, backend API, investor UI, curator UI.
- ✅ **Live on devnet:** programs deployed, mock tokens + registry + demo vault set up. The end-to-end
  test (faucet → deposit → rebalance → withdraw) **passes on devnet**.
- ✅ **No BNB left:** BNB explorer pages, EVM docs and BNB hackathon notes removed; `AGENTS.md`/`CLAUDE.md`
  describe the Solana project. (Binance market data is still the off-chain price source.)
- ✅ **Live on Vercel:** https://foliolab-solana.vercel.app serves the Solana app (pages, vaults, history work).
- ✅ **Live site fully working (12 Oct):** Vercel env set to devnet with all 3 secret keys; the end-to-end
  test (`APP_URL=https://foliolab-solana.vercel.app CLUSTER=devnet npm run smoke:solana`) passes against it.
- ✅ **Demo transactions** (faucet, deposit, rebalance, withdraw) are on devnet and linked in `README.md`.
- ✅ **Attack test:** a route that sells a different holding than declared is refused (`CollateralDecreased`).
- ❌ No browser-wallet click-through yet, no demo video, no DX report.

### Devnet addresses
| What | Address |
|---|---|
| `folio_vault` program | `9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH` |
| `mock_router` program | `FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm` |
| Registry | `4on5rPymYh1W7sLe6LA3WYwXBR2wgBG5KiqSrMucQHC1` |
| Mock USDC | `DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv` |
| AAPLx | `AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ` |
| NVDAx | `E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g` |
| TSLAx | `5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5` |
| Demo vault "Big Tech Core" | `2cRhpsvAaLDE4e18rjrLczM1zBkwFMgZUU9mdNqWk4X9` |

### Vercel environment variables (Production)
`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, `NEXT_PUBLIC_SOLANA_RPC_URL` and `SOLANA_RPC_URL` (a dedicated devnet
RPC such as Helius; the public one returns HTTP 429 under load), `PRICE_SIGNER_SECRET_KEY`,
`GUARDIAN_SECRET_KEY`, `FAUCET_SECRET_KEY` (contents of `~/folio-price-signer.json`, `~/folio-guardian.json`,
`~/folio-faucet.json` on Jun Voon's Mac), `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET`, and
`PRICE_SOURCE=binance` (or `static` for fixed demo prices).

## 2. Done ✅

| What | Where |
|---|---|
| Anchor workspace (Anchor **1.2.1**): `folio_vault` (registry, vaults, deposit, redeem, plan, rebalance) + `mock_router` (Jupiter stand-in) | `anchor/` |
| 12 LiteSVM program tests, **all passing** (incl. a dishonest-route attack) | `anchor/programs/folio_vault/tests/test_vault.rs` |
| Shared TS client: IDLs, PDAs, token accounts, price message, Ed25519 instruction | `lib/solana/program.ts`, `lib/solana/idl/` |
| Cluster config + address book (written by the setup script) | `lib/solana/config.ts`, `lib/solana/addresses.json` |
| **Setup script**: mock USDC/AAPLx/NVDAx/TSLAx mints, registry, allowlist, guardian, router pool, demo vault (seeded, active, plan, one AAPLx buy). Idempotent. | `scripts/setup-solana.ts` (`npm run setup:solana`) |
| **Backend on Solana**: `/api/prices` (ed25519), `/api/trade` (mock router route), `/api/vaults`, `/api/vaults/<v>`, `/api/history` (Anchor events), `/api/vaults/<v>/activate` (demo guardian), **new** `/api/faucet` (1,000 test USDC) | `app/api/**`, `lib/{chain,pricing,trade,vaults,history}` |
| **Frontend on Solana**: wallet adapter (Phantom/Solflare/Backpack via Wallet Standard), deposit, withdraw, faucet button, curator create+seed (one tx), plan, rebalance, activate, Solana Explorer links, USDC wording | `app/providers.tsx`, `lib/contracts/{wallet,hooks}.ts`, `components/**` |
| **End-to-end smoke test** through the API: faucet → deposit → rebalance → redeem. **Passes on localnet.** | `scripts/smoke-solana.ts` (`npm run smoke:solana`) |
| 29 unit tests pass (`npm test`); `next build` passes | — |
| Local dev chain: `npm run validator` (programs preloaded) | `package.json` |

Program IDs: `folio_vault` `9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH`, `mock_router`
`FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm`. The program keypairs in `anchor/target/deploy/` (git-ignored)
decide these; whoever deploys needs those two files.

Keys on Jun Voon's Mac (outside the repo, never commit): deploy wallet `~/.config/solana/id.json`
(`63aD1FYX2TWAF4HR3wyrRhJsnvK7vJ9FwGhLFg2St7YR`), `~/folio-price-signer.json`, `~/folio-guardian.json`,
`~/folio-faucet.json`.

## 3. Not done ❌

| Area | State |
|---|---|
| Merge `jv` into `main` | Not done. |
| Click-through test in a real browser wallet | Not done (the API + program flow is proven by the smoke test; the React screens compile and render). |
| Live Binance prices | Untested on Solana: local runs used `PRICE_SOURCE=static`. Mock tokens are priced from the underlying ticker (AAPLx → AAPL) via the Binance RWA listing; if the market is closed, signing is refused unless `PRICE_REQUIRE_OPEN_MARKET=false` or `PRICE_SOURCE=static`. |
| Real Jupiter swap (mainnet) | Not attempted. `/api/trade` returns 501 on mainnet. |
| Demo video, developer-experience report | Not started. **The DX report must be written by the team, not by AI.** |

## 4. To do, in priority order

### Task 1 — Redeploy to devnet (done 12 Oct; only if the program changes)
```sh
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.local/share/agave/solana-release/bin:$PATH"
cd anchor && anchor build --arch v0 && anchor deploy --provider.cluster devnet && cd ..
npm run idl                                 # only if the program changed
CLUSTER=devnet npm run setup:solana         # writes lib/solana/addresses.json [devnet]
```
Then commit `lib/solana/addresses.json`.

### Task 2 — Run it locally and click through (anyone)
On a fresh machine you need your own keys first (the setup script makes the guardian and faucet keys if
missing, but not these two), and the `.so` files from `anchor build`:
```sh
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json     # skip if you already have one
solana-keygen new --no-bip39-passphrase -o ~/folio-price-signer.json
(cd anchor && anchor build --arch v0)
```
Your local addresses will differ from the ones in `lib/solana/addresses.json` [localnet]; the script
overwrites that entry, so don't commit your localnet changes.
```sh
npm install
npm run validator                            # terminal 1 (needs the .so files from anchor build)
solana -u localhost airdrop 100              # terminal 2
CLUSTER=localnet npm run setup:solana
# .env.local: NEXT_PUBLIC_SOLANA_CLUSTER=localnet, *_RPC_URL=http://127.0.0.1:8899, PRICE_SOURCE=static,
#             PRICE_SIGNER_SECRET_KEY / GUARDIAN_SECRET_KEY / FAUCET_SECRET_KEY from the ~/folio-*.json files
npm run dev
APP_URL=http://localhost:3000 CLUSTER=localnet npm run smoke:solana   # optional API check
```
In Phantom: Settings → Developer settings → enable testnet mode and add a custom RPC
`http://127.0.0.1:8899` (or use devnet once deployed). Get SOL with `solana -u localhost airdrop 5 <address>`, then
**+ Test USDC** on the investor page, deposit, withdraw; on `/curator` create a vault, post a plan, rebalance.
Fix any UI bug you hit.

### Task 3 — Vercel (Part 4) — done 12 Oct (env set, live end-to-end test passes)
Set env vars from `.env.example` with `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, a devnet RPC (Helius free tier
recommended), the three secret keys, Binance keys, `PRICE_SOURCE=binance` (or `static` if the US market is
closed during judging and Binance refuses to sign). Then redeploy and run `APP_URL=https://foliolab-solana.vercel.app CLUSTER=devnet npm run smoke:solana`.

### Task 4 — Submission
Demo video; developer-experience report (team-written).

### Task 5 — Nice to have
Delegate/close-authority attack test (needs a test-only router); Jupiter route for mainnet in `lib/trade/build.ts`; Pyth prices instead of the signer.

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

### 5.4 API responses (implemented)
- `GET /api/prices?vault=<base58>[&include=<mint>,…]` →
  `{ update: { mints, prices, timestamp }, message, signature, signer, expiresAt, quotes }` (numbers as strings, bytes base64)
- `GET /api/trade?vault=…&sell=<mint>&buy=<mint>&amount=<base units>[&slippage=1]` →
  `{ trade: { router, sellMint, buyMint, maxSell, minBuy, routeData, routeAccounts[] }, quote: { expectedBuyAmount, slippagePercent, route, lossPercent }, computeUnits, warnings[] }`
- `GET /api/vaults[?account=…]` → `{ vaults: VaultView[] }`; `GET /api/vaults/<base58>[?account=…]` → `VaultView`
  (`holdings[{ asset, symbol, decimals, amount, priceUsd, valueUsd }]`, `totalValueUsd`, `sharePriceUsd`, `plan`, `position`, `state`, `shareDecimals: 6`)
- `GET /api/history[?vault][&account][&limit]` → `{ items: ActivityItem[], latestBlock }` (amounts human-readable)
- `POST /api/faucet {account}` → `{ transaction }` (base64, faucet-signed; wallet signs and sends)
- `POST /api/vaults/<base58>/activate` → `{ ok, signature }` (devnet/localnet only)

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
