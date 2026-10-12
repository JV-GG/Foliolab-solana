<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Folio Lab — project context for every coding agent

## FIRST: ask which part the person is working on

This repo is split into **4 parts**, worked on in parallel by the team. Before writing or changing any
code, ask the person:

> Which part are you working on? **1** Solana program · **2** Backend API · **3** Investor frontend ·
> **4** Curator frontend and submission

Then stay inside that part's files (see "Who owns what"). Questions about the project in general can be
answered without asking. If a change needs another part's files or one of the shared interfaces below,
stop and tell the person to agree it with that part's owner first. Never silently change a shared interface.

Current build status and the task list: [`zhwx.md`](zhwx.md). Read it before starting work.

## What Folio Lab is

A pooled portfolio of tokenized US stocks on **Solana**. A curator creates a vault and manages it;
investors deposit USDC and get non-transferable vault shares; the curator invests the pooled USDC in
approved stock tokens through an allowlisted swap program. Everyone can see the curator's plan.

Guarantees: the manager can trade but never withdraw; any holder can always withdraw their percentage of
every holding (even when paused); deposits never dilute existing holders; a trade can lose at most 2%
against signed prices.

**Hackathon:** Solana track. Needs a public repo, a working deployment, a demo video and a
developer-experience report.

**Demo environment:** Solana **devnet**. Real tokenized stocks (xStocks) and Jupiter liquidity exist only
on mainnet, so devnet uses mock stock tokens (AAPLx, NVDAx, TSLAx; AAPLx and TSLAx are Token-2022 like
real xStocks), a mock USDC with a faucet, and `mock_router` in place of Jupiter.

## The 4 parts

### Part 1 — Solana program and deployment
- `anchor/programs/folio_vault`: registry, vaults, seed/activate/pause, deposit, redeem, `set_plan`,
  `rebalance` (CPI into an allowlisted router, vault PDA signs, balance + authority checks, 2% loss cap).
- `anchor/programs/mock_router`: devnet stand-in for Jupiter.
- Tests: `cd anchor && cargo test -p folio_vault` (LiteSVM). Deploy: `anchor deploy`; then
  `npm run setup:solana` and `npm run idl` (copies IDLs into `lib/solana/idl/`).

### Part 2 — Backend API (Next.js route handlers)
- `/api/prices`: ed25519-signed prices for a vault's holdings. `/api/trade`: the swap route for
  `rebalance`. `/api/vaults`, `/api/history`: display data. `/api/faucet`, `/api/vaults/<v>/activate`:
  devnet demo helpers.
- Price data comes from `lib/binance/` (Binance Web3 market data, server-side only) via
  `lib/pricing/source.ts`; `PRICE_SOURCE=static` uses fixed demo prices.

### Part 3 — Investor frontend
- Wallet: `@solana/wallet-adapter-react` (Phantom, Solflare, Backpack via Wallet Standard), wrapped in
  `lib/contracts/wallet.ts`. Hooks in `lib/contracts/hooks.ts` (vaults, deposit, redeem, balances).
- Vault list, vault page, portfolio, deposit (Ed25519 price instruction + `deposit` in one transaction),
  withdraw (`redeem`), "+ Test USDC" faucet.

### Part 4 — Curator frontend and submission
- Curator console: create + seed a vault (one transaction), post a plan, rebalance, activate.
- Vercel deployment, root `README.md`, demo video, developer-experience report.

## Who owns what

| Path | Part |
|---|---|
| `anchor/**` | 1 |
| `app/api/**`, `lib/binance/**`, `lib/pricing/**`, `lib/trade/**`, `lib/vaults/**`, `lib/history/server.ts`, `lib/chain/**` | 2 |
| `lib/contracts/**`, `app/page.tsx`, `app/explore/**`, `app/portfolio/**`, `app/vaults/**`, `components/*.tsx`, `lib/domain/**`, `lib/history/hooks.ts` | 3 |
| `app/curator/**`, `components/curator/**`, root `README.md`, Vercel config | 4 |
| `lib/solana/**`, `scripts/**`, `app/layout.tsx`, `app/providers.tsx`, `package.json`, `.env.example` | shared — coordinate before editing |

## Shared interfaces (change only by agreement, then update this section)

**Program** `folio_vault` (`9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH`), full account lists in
`anchor/README.md` and `zhwx.md` §5:
```
create_vault(name ≤32 B, manager)        seed(amount ≥ 10 USDC)          activate / pause / unpause (guardian)
deposit(amount, min_shares, prices)      redeem(shares, forfeit: Pubkey[])   set_plan(text 1–1000 B)
rebalance(max_sell, min_buy, route_data, prices)
```
- PDAs: registry `["registry"]`; vault `["vault", registry, index u64 LE]`; position
  `["position", vault, owner]`. Vault token accounts are the vault PDA's associated token accounts.
- remaining_accounts: `deposit` → `[mint, vault_ata]` per held mint; `redeem` →
  `[mint, vault_ata, recipient_ata]` per held mint; `rebalance` → `[mint, vault_ata]` per held mint, then
  the router instruction's accounts (vault marked not signer).
- Shares and USDC have 6 decimals. Max 10 held assets. USDC never leaves the held list.

**Signed prices (Part 2 → 1, 3, 4).** Message:
`"FOLIO_LAB_PRICES_V1" || registry || timestamp i64 LE || count u8 || (mint || price u64 LE)*`,
signed with ed25519 by `registry.price_signer`. `price` = USDC base units for one whole token. Max age
60 s. The Ed25519 program instruction must sit **directly before** `deposit` / `rebalance`. Build both
with `lib/solana/program.ts` (`priceMessage`, `priceSignatureIx`).

**API responses** (implemented; shapes in `zhwx.md` §5.4): `GET /api/prices?vault=&include=`,
`GET /api/trade?vault=&sell=&buy=&amount=`, `GET /api/vaults[?account=]`, `GET /api/vaults/<v>`,
`GET /api/history`, `POST /api/faucet`, `POST /api/vaults/<v>/activate`.

**Addresses.** `lib/solana/addresses.json`, per cluster (`devnet`, `localnet`), written by
`npm run setup:solana`. Never hard-code mints or the registry.

## Key facts and gotchas

- Stack: Next.js 16 + React 19 + Tailwind 4 (read the Next note at the top of this file); Anchor 1.2.1,
  Rust, Solana CLI 4.3, `@anchor-lang/core` 1.2.1, `@solana/web3.js` 1.x, `@solana/spl-token`.
- **Build programs with `anchor build --arch v0`.** Anchor 1.2 defaults to SBPF v3, which LiteSVM rejects.
  Homebrew's `solana` lacks `cargo-build-sbf`; get it from the Agave release (see `zhwx.md` §6).
- Anchor 1.x API: `Context<'info, T>` (one lifetime); `CpiContext::new(program_id, accounts)`.
- Local chain: `npm run validator`, then `solana -u localhost airdrop 100` and
  `CLUSTER=localnet npm run setup:solana`. End-to-end check: `npm run smoke:solana`.
- The public devnet RPC rate-limits (HTTP 429). Use a dedicated devnet RPC (e.g. Helius) for Vercel.
- Secrets (server-only env vars, never `NEXT_PUBLIC_`, never committed): `PRICE_SIGNER_SECRET_KEY`,
  `GUARDIAN_SECRET_KEY`, `FAUCET_SECRET_KEY`, `BINANCE_WEB3_API_KEY/SECRET`. Keys live outside the repo
  (`~/folio-*.json`, `~/.config/solana/id.json`). Never commit `.env*` files or keypairs.
- The program keypairs in `anchor/target/deploy/` (git-ignored) fix the program IDs; share them
  privately with whoever deploys.
- **The developer-experience report must be written by the team in their own words.** Agents may
  organise notes or list facts, but must not write the report.

## Docs

| Doc | What |
|---|---|
| `zhwx.md` | Build status, task list, interfaces, toolchain |
| `anchor/README.md` | Program accounts, signed-price format, remaining accounts |
| `README.md` | Project overview for judges |
| `docs/folio-lab-pooled-fund-prd.md` | Product requirements |
| `knowledge-base/` | Market research and decisions |
