# Folio Lab

**Pooled portfolios of tokenized US stocks on Solana.**

A curator opens a vault and publishes, on-chain, a plan for what they intend to buy. Investors deposit USDC and receive vault shares. The curator invests the pooled USDC in tokenized stocks through an allowlisted swap program (Jupiter on mainnet; a mock router on devnet).

Built for the Solana track: an Anchor program in Rust, a Next.js app, and devnet mock tokens that stand in for xStocks.

| | |
|---|---|
| Live app | [foliolab-solana.vercel.app](https://foliolab-solana.vercel.app) (devnet; connect Phantom in devnet mode) |
| Cluster | Solana devnet (mock stock tokens and mock router) |
| Program | `folio_vault` — [`9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH`](https://explorer.solana.com/address/9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH?cluster=devnet) (devnet) |
| Stack | Rust + Anchor 1.2.1 · LiteSVM tests · Next.js 16 + React 19 |

## What the program guarantees

- **The curator can trade but can never withdraw.** A trade swaps one allowlisted token for another through an allowlisted swap program. The vault signs for the swap, then checks every held balance and that no vault token account gained a delegate, a close authority or a new owner.
- **Each trade can lose at most 2%.** Both sides are valued at signed prices; the trade reverts if the value bought is below 98% of the value sold.
- **Withdrawals never close.** Any holder can redeem their share of every holding at any time, even while the vault is paused. A frozen token can be forfeited so it never blocks exit.
- **Deposits never dilute existing holders.** New shares are priced from the vault's full holdings using backend-signed prices (ed25519, at most 60 s old), rounded in favour of existing holders.
- **The plan is public.** `set_plan` stores the curator's plan as free text with a version number. A plan must exist before the first trade, and every `Rebalanced` event records the plan version.
- **Shares cannot be transferred.** They live in a per-investor `Position` account, not a token.

## Devnet deployment

| What | Address |
|---|---|
| `folio_vault` program | [`9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH`](https://explorer.solana.com/address/9PY9RRXQuMtHXDyvWNL5ohFrsSux5SLrJhhdtuBgLUJH?cluster=devnet) |
| `mock_router` program | [`FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm`](https://explorer.solana.com/address/FeE32TVg1Yk4DVe4jS3SELK13dQsbbDUWyY4dYKmQhjm?cluster=devnet) |
| Registry | [`4on5rPymYh1W7sLe6LA3WYwXBR2wgBG5KiqSrMucQHC1`](https://explorer.solana.com/address/4on5rPymYh1W7sLe6LA3WYwXBR2wgBG5KiqSrMucQHC1?cluster=devnet) |
| Demo vault "Big Tech Core" | [`2cRhpsvAaLDE4e18rjrLczM1zBkwFMgZUU9mdNqWk4X9`](https://explorer.solana.com/address/2cRhpsvAaLDE4e18rjrLczM1zBkwFMgZUU9mdNqWk4X9?cluster=devnet) |
| Mock USDC | [`DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv`](https://explorer.solana.com/address/DKg3JGudRDDWymeLhWVEjhfagNGi93SGYdRb7A8TuHdv?cluster=devnet) |
| AAPLx (Token-2022) | [`AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ`](https://explorer.solana.com/address/AtVJpQjnBuhQwHFhdadj7TuNnbK2u4Aonu2wcZgGSBVJ?cluster=devnet) |
| NVDAx (SPL Token) | [`E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g`](https://explorer.solana.com/address/E87tWL7sLcD5GrpcJkewquzri9Na2sJsrV5JcLt8Ce6g?cluster=devnet) |
| TSLAx (Token-2022) | [`5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5`](https://explorer.solana.com/address/5qEVYEWHpL7sxuBH3EMHnNzjHfnUSMujuCbgfMNbxTH5?cluster=devnet) |

### Demo transactions (devnet, 12 Oct 2026)

One investor's full round trip, run by `npm run smoke:solana`:

| Step | Transaction |
|---|---|
| Get 1,000 test USDC from the faucet | [`3zk2Each…`](https://explorer.solana.com/tx/3zk2Each77syJfwixr38szeKgpoxoooZAFYA6nfrhEfn5FBaBiQJBhTemgMcJjqiNpKt6bTrpthaxv5LPC8S6frX?cluster=devnet) |
| Deposit 50 USDC with signed prices (Ed25519 instruction + `deposit`) | [`fXqbNuAv…`](https://explorer.solana.com/tx/fXqbNuAvg5wQfHBSN2sTCKPJwFubjRefkZAN9T7akYmeE6yKgr9iPsVeKDN7C33nWDdTAEsYm4fzXPZSaGyHh6d?cluster=devnet) |
| Curator rebalances 10 USDC into NVDAx through the router (CPI, 2% loss check) | [`RDCdDxy6…`](https://explorer.solana.com/tx/RDCdDxy6UCSfxrfWGriJSZY6zv4Rn44BfC75n58Y98p3ChpRAMaQYDzMkEN9aQ2Sjyf6UiNiTHf5uqW6nUv6h8S?cluster=devnet) |
| Investor withdraws everything in kind (USDC + AAPLx + NVDAx) | [`63vAVvpG…`](https://explorer.solana.com/tx/63vAVvpG8m8hBH2iGPHgLvTvmvEF2n5w7GaBPEDNHX1MexgKe5rVWyUNT7VFAJHWsaUok2s6Cu8imMbSji6U3B2B?cluster=devnet) |

## How it works

```mermaid
flowchart LR
    Investor -- "deposit USDC / redeem shares" --> Vault[Vault PDA]
    Curator -- "set_plan, rebalance" --> Vault
    Vault -- "CPI swap, vault signs" --> Router[Jupiter / mock_router]
    API["Next.js API (price signer)"] -- "ed25519-signed prices" --> Investor
    API -- "signed prices, swap route" --> Curator
    Vault -- "allowlists, price signer" --> Registry[Registry PDA]
```

1. **Create.** Anyone calls `create_vault` and names a manager (the curator).
2. **Seed and activate.** The first deposit (`seed`, at least 10 USDC) sets 1 share = 1 USDC; the guardian then activates the vault.
3. **Plan.** The curator posts the plan (`set_plan`). Investors see it on the vault page.
4. **Deposit.** The app fetches signed prices from `/api/prices` and sends an Ed25519 verify instruction followed by `deposit` in one transaction.
5. **Rebalance.** The curator console gets a swap route from `/api/trade` and prices from `/api/prices`, then sends `rebalance`.
6. **Redeem.** Holders burn shares and receive their percentage of each held token directly.

Why prices are signed off-chain: these stock tokens have no reliable on-chain price yet. The backend reads market prices, refuses to sign a token that is not trading or whose price is more than 2% from the underlying stock, and signs the update; the program checks the signature through the Ed25519 program.

## Repository

| Path | What |
|---|---|
| `anchor/` | Anchor workspace: `folio_vault` and `mock_router` programs, LiteSVM tests. See [`anchor/README.md`](anchor/README.md). |
| `app/api/` | Route handlers: `/api/prices`, `/api/trade`, `/api/vaults`, `/api/history` |
| `lib/binance/` | Binance Web3 API client (price source) |
| `lib/solana/` | IDLs, PDAs, signed-price helpers, cluster config and deployed addresses |
| `lib/contracts/` | Wallet adapter wrapper and React hooks (deposit, withdraw, balances) |
| `scripts/` | `setup-solana.ts` (tokens, registry, demo vault) and `smoke-solana.ts` (end-to-end check) |
| `app/page.tsx`, `components/` | Investor app: vault list, vault page, deposit, withdraw |
| `app/curator/`, `components/curator/` | Curator console: create, seed, plan, rebalance |
| `docs/` | Product requirements |

## Run it locally

Requirements: Node 24, Rust (via `rustup`), Solana CLI and Anchor 1.2.1 (`brew install solana anchor`), and `cargo-build-sbf` from the [Agave release](https://github.com/anza-xyz/agave/releases).

```bash
npm install
cp .env.example .env.local     # see the comments in it for every value
```

### Programs

```bash
cd anchor
anchor build --arch v0
cargo test -p folio_vault      # 12 tests: full flow + refusal cases, incl. a dishonest route; no validator
```

### Local validator (no devnet SOL needed)

```bash
npm run validator                              # terminal 1: programs preloaded
solana -u localhost airdrop 100                # terminal 2
CLUSTER=localnet npm run setup:solana          # mock tokens, registry, demo vault → lib/solana/addresses.json
npm run dev                                    # with NEXT_PUBLIC_SOLANA_CLUSTER=localnet in .env.local
APP_URL=http://localhost:3000 CLUSTER=localnet npm run smoke:solana   # faucet → deposit → rebalance → redeem
```

### Devnet

```bash
cd anchor && anchor deploy --provider.cluster devnet && cd ..
CLUSTER=devnet npm run setup:solana
```

## Status

| Part | State |
|---|---|
| Solana program + tests | Done (12 LiteSVM tests passing, including a dishonest-route attack) |
| Setup script, backend API, frontend (wallet adapter) | Done; end-to-end smoke test passes on a local validator |
| Devnet deployment | Done; demo transactions above |
| Vercel | Deployed from `main` |

## Limits and known issues

- **Devnet only for now.** Real tokenized stocks (e.g. xStocks) and Jupiter liquidity exist only on mainnet; the demo uses mock tokens and a mock router that swaps at the rate it is given. The vault's 2% check still applies.
- **Hackathon governance.** The deployer is registry admin and guardian, with no timelock. Production needs a multisig.
- **Deposits trust the backend's price signer.** A compromised signer could misprice deposits, but can never move funds out of a vault.

## Developer-experience report

_Written by the team. Link to be added._
