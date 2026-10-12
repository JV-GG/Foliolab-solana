# Folio Lab — Solana programs

Anchor 1.2.1 programs for Folio Lab.

| Program | What |
|---|---|
| `folio_vault` | Registry, vault creation, seed / activate / pause, deposit, redeem, `set_plan`, `rebalance` |
| `mock_router` | Stand-in for Jupiter on localnet/devnet: swaps at the rate the caller passes, from its own pool |

## Build and test

```sh
# needs: solana + anchor (brew install solana anchor), rustup on PATH,
#        cargo-build-sbf from the Agave release (brew's solana does not ship it)
anchor build --arch v0          # v0: Anchor 1.2 defaults to SBPF v3, which LiteSVM and clusters may reject
cargo test -p folio_vault       # LiteSVM, no validator needed
```

## Accounts

| Account | What |
|---|---|
| `Registry` PDA, seeds `["registry"]` | admin, guardian, price signer, USDC mint, allowlisted stocks and swap programs |
| `Vault` PDA, seeds `["vault", registry, index u64 LE]` | manager, state, total shares, plan, held mints; created by `create_vault` |
| `Position` PDA, seeds `["position", vault, owner]` | one investor's shares (USDC decimals); not a token, so not transferable |
| Prices | ed25519 signature in an Ed25519 program instruction **directly before** ours (see below) |
| `rebalance` | CPI into an allowlisted program with the vault PDA as signer, then balance + authority checks |

Rules: 10 USDC minimum seed, 0.001 dead share, 60 s price age, 2% max trade loss,
max 10 held assets, plan 1–1000 bytes and required before the first trade, redeem works in any state.

## Signed prices

The backend signs this message with the ed25519 key stored in `registry.price_signer`:

```
"FOLIO_LAB_PRICES_V1" || registry (32) || timestamp (i64 LE) || count (u8) || { mint (32) || price (u64 LE) }*
```

`price` = USDC base units for one whole token. The client puts
`Ed25519Program.createInstructionWithPublicKey({ publicKey, message, signature })` immediately
before `deposit` / `rebalance` in the same transaction. Every held non-USDC mint needs a price.

## remaining_accounts

- `deposit`: `[mint, vault_ata]` for each mint in `vault.held`, in order.
- `redeem`: `[mint, vault_ata, recipient_ata]` for each held mint (create recipient ATAs idempotently first).
- `rebalance`: `[mint, vault_ata]` for each held mint, then the router instruction's accounts in its
  order, with the vault marked **not** signer (the program signs for it).

On mainnet the router is Jupiter: call its `/swap-instructions` API with `userPublicKey` = the
vault PDA and pass that instruction's data as `route_data` and its accounts as the route accounts.
