<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Folio Lab — project context for every coding agent

## FIRST: ask which part the person is working on

This repo is split into **4 parts**, worked on in parallel by about 5 people. Before writing or changing any
code, ask the person:

> Which part are you working on? **1** Smart contracts · **2** Backend API · **3** Investor frontend ·
> **4** Curator frontend and submission

Then stay inside that part's files (see "Who owns what"). Questions about the project in general can be
answered without asking. If a change needs another part's files or one of the shared interfaces below,
stop and tell the person to agree it with that part's owner first. Never silently change a shared interface.

## What Folio Lab is

A pooled portfolio of tokenized US stocks on **BNB Smart Chain (BSC) mainnet**. A curator creates a vault
and manages it; investors deposit USDT and get non-transferable vault shares; the curator invests the
pooled USDT in approved stock tokens (Ondo's AAPLon, NVDAon, …) through the Binance Web3 trading router.
Everyone can see what each curator plans to invest in (target weights).

Guarantees: the manager can trade but never withdraw; any holder can always withdraw their percentage of
every holding (even when paused); deposits never dilute existing holders.

**Hackathon:** BNB Chain Tokenized Stocks. **Deadline: 11 October 2026, 12:00 UTC.** Needs a public repo,
a working deployment or reproducible instructions, and a developer-experience report. Scoring:
implementation 30%, originality 25%, developer experience 25%, UX 20%. Details:
`knowledge-base/06-bnb-hackathon.md`.

## The 4 parts

### Part 1 — Smart contracts and deployment
- `rebalance()`: the curator swaps through the Binance router; balance checks stop anything else leaving
  the vault (spec §6), and signed prices cap each trade's loss at 2%.
- `setPlan()`: the curator's investment plan as free text, stored on-chain and versioned. Required
  before the first trade, never enforced.
- Deploy script: registry, factory, price signer, guardian, stock allowlist. Deploy to BSC mainnet.
- Publish ABIs and addresses to `lib/contracts/` for Parts 3 and 4.

### Part 2 — Backend API (Next.js API routes in this app)
- `/api/prices`: reads Binance RWA prices, checks the US market is open, returns a signed `PriceUpdate`.
- `/api/trade`: gets a Binance quote and swap calldata, returns a `TradeRequest` for rebalancing.
- `/api/vaults`: vault holdings valued at market prices, for display.
- Owns the Binance client in `lib/binance/`.

### Part 3 — Investor frontend
- Wallet connect on BSC (wagmi + viem) and the shared `lib/contracts/` module (ABIs, addresses, hooks).
- Vault list; vault page with holdings, share price and the curator's plan text.
- Deposit (approve USDT → fetch `/api/prices` → `deposit`) and withdraw (`redeem`).
- Replaces the mock data in `lib/domain/` and `lib/state/`.

### Part 4 — Curator frontend and submission
- Curator console: create and seed a vault, post a plan (`setPlan`), rebalance (fetch `/api/trade` and
  `/api/prices` → `rebalance`).
- Deploy the app to Vercel.
- Root `README.md` for judges, demo video, developer-experience report.

## Who owns what

| Path | Part |
|---|---|
| `contracts/**`, `docs/folio-lab-contract-architecture.md`, `docs/sc-checklist.md` | 1 |
| `app/api/**`, `lib/binance/**`, `api/` (endpoint explorer) | 2 |
| `lib/contracts/**` (ABIs/addresses written by Part 1, hooks by Part 3), wallet setup, `app/page.tsx`, `app/vaults/**`, existing `components/*.tsx`, `lib/domain/**`, `lib/state/**` | 3 |
| `app/curator/**`, `components/curator/**`, root `README.md`, Vercel/deploy config | 4 |
| `app/layout.tsx`, `package.json`, `.env.example` | shared — coordinate before editing |

`app/api-visual/` and `components/viz/` are a Binance API data explorer, not product UI.

## Shared interfaces (change only by agreement, then update this section)

**Contracts (Part 1 → 2, 3, 4).** Existing, built and tested:
```solidity
// VaultFactory
function createVault(string name, string symbol, address manager) returns (address vault);
// FolioVault
function seed(uint256 amount) returns (uint256 shares);                       // anyone, DRAFT, min 10 USDT
function deposit(uint256 amount, PriceUpdate prices, bytes signature, uint256 minShares)
    returns (uint256 shares);                                                 // anyone, ACTIVE
function redeem(uint256 shares, address to) returns (address[] assets, uint256[] amounts);   // any state
function redeemExcept(uint256 shares, address to, address[] forfeit) returns (address[], uint256[]);
function holdings() view returns (address[] assets, uint256[] amounts);
function state() view returns (VaultState);   // DRAFT, SEEDED, ACTIVE, PAUSED, CLOSED
```
Manager functions (built, tested; replaced the planned `setTargetWeights` on 10 Oct):
```solidity
struct TradeRequest { address router; address sellToken; address buyToken;
                      uint256 maxSellAmount; uint256 minBuyAmount; bytes callData; }
function setPlan(string plan);              // manager only, 1–1000 bytes, any state; free text, never enforced
function plan() view returns (string);   function planVersion() view returns (uint64);   // 0 = no plan
function rebalance(TradeRequest t, PriceUpdate prices, bytes signature) returns (uint256 sold, uint256 bought);
    // manager only, ACTIVE, needs planVersion > 0. Prices: same signed list as deposit, must cover the
    // non-USDT side(s) of the trade. Reverts TradeLossTooHigh if value bought < 98% of value sold.
event PlanPosted(uint64 indexed version, string plan);
event Rebalanced(address indexed sellToken, address indexed buyToken, uint256 sold, uint256 bought, uint64 planVersion);
```
Max 10 held tokens per vault (USDT included). A stock sold down to dust (≤ 1/1,000,000 of a token) leaves the held list; USDT never does.

**Signed prices (Part 2 → 3).** EIP-712, domain name `Folio Lab`, version `1`, chainId 56,
verifyingContract = `AssetRegistry`. Type `PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp)`.
`prices[i]` = USDT base units for **one whole** `assets[i]` token. Max age 60 s. Include every stock the
vault holds.

**API responses (Part 2 → 3, 4).** Proposed:
- `GET /api/prices?vault=0x…` → `{ update: { assets, prices, timestamp }, signature }` (numbers as strings)
- `GET /api/trade?vault=0x…&sell=0x…&buy=0x…&amount=…` → a `TradeRequest` object. Verified 10 Oct: the
  Binance swap `tx.to` equals the quote's `approveTarget` (so `router` = `tx.to`); Ondo quotes need
  `userWalletAddress` = **the vault address**; `/swap` needs `quoteId` and `slippagePercent`.
- `GET /api/vaults/0x…` → `{ holdings: [{ asset, symbol, amount, priceUsd, valueUsd }], totalValueUsd,
  sharePriceUsd }`

**Shared dev chain.** Build against `anvil --fork-url $BSC_RPC_URL` (a local copy of BSC mainnet with the
real tokens and router) until the mainnet deploy, so nobody waits on real funds.

## Key facts and gotchas

- Stack: Next.js 16 + React 19 + Tailwind 4 (read the Next note at the top of this file); Foundry,
  Solidity 0.8.30, OpenZeppelin 5.7, EVM `cancun`. The PM prefers Vite + TanStack Start later; **stay on
  Next.js until after the deadline.**
- Contracts: `cd contracts && forge test` (144 passing); the whole flow as a story:
  `forge test --match-contract SimulationTest -vv`. Full contract context: `contracts/README.md`.
- Deposits trust backend-signed prices (no reliable on-chain price exists for these tokens on BSC). The
  price-signer key is a secret: only in env vars, never committed, never sent to the browser.
- Binance Web3 API: errors come back as HTTP 200 with `success:false`; some Malaysian ISPs block its DNS
  (set `BINANCE_WEB3_DNS=1.1.1.1`). See `api/README.md`.
- Liquidity is the real limit. Fork survey (10 Oct), Binance route vs signed price at 200 / 1,000 USDT:
  AAPLon, NVDAon, AVGOon, TSMon fill within 1% (the allowlist); GOOGLon only at 200; MSFTon returns ~$0;
  AMZNon, AMDon, QQQon, SPYon lose 6–96%; METAon and TSLAon cannot quote. `/api/trade` warns when a quote
  already loses more than the vault's 2% cap.
- Never commit `.env` files or private keys. Never deploy with a raw private key; use
  `cast wallet import` keystores.
- **The developer-experience report must be written by the team in their own words** — the organisers
  reject AI-written reports. Agents may organise notes or list facts, but must not write the report.

## Docs

| Doc | What |
|---|---|
| `contracts/README.md` | Contract handoff: how it works, decisions, backend interface |
| `docs/folio-lab-contract-architecture.md` | Full contract spec |
| `docs/folio-lab-pooled-fund-prd.md` | Product requirements |
| `knowledge-base/` | Market research and hackathon rules |
