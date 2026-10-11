# Folio Lab — smart contract architecture (SC-01)

Draft for review, 20 September 2026. Owner: Aik Wei. Implements the contract half
of [the pooled fund PRD](folio-lab-pooled-fund-prd.md). SC-02 (registry, factory, seedable vault) is built; SC-03 onward is not. Deposit pricing changed on 7 October 2026 — see §1.

Written for two readers: Aik Wei, to review and change; Vincent, to integrate
against once the interface in §7 is frozen.

---

## 1. The idea that shapes everything

> **Changed 7 October 2026 (decision #9).** The first draft never priced the
> portfolio: deposits bought a pro-rata slice of every holding. The founder chose
> instant shares with idle cash instead, which needs a price. Deposits are now
> priced from a **backend-signed price per stock**; redemption is still
> proportional and needs no price. The original reasoning is kept in git history.

A pooled fund has to know what it is worth when someone joins, so it can mint
shares at the fair price:

```
share price = vault value ÷ total shares
sharesOut   = deposit × total shares ÷ vault value
```

**Deposit.** The investor's USDT goes straight into the vault and sits there as
idle cash until the manager invests it. Shares are minted immediately at the fair
price. The vault value is computed by the contract from **its own balances**
multiplied by **prices signed by the backend** (§5). The backend never tells the
contract how much the vault holds — only what each stock costs.

**Redemption.** Burn shares, receive that exact percentage of every token held,
including idle USDT. No price is involved.

### Why a deposit does not move the share price

Vault worth $1,200 with 1,000 shares → $1.20 per share. Eve deposits $120 and
receives `120 × 1,000 ÷ 1,200 = 100` shares. The vault is now worth $1,320 with
1,100 shares → still $1.20. Rounding is always down, so any dust stays with the
existing holders.

### What this costs

The contract now trusts a price it cannot check. A wrong or leaked signed price
lets someone mint cheap shares and redeem real assets. The guardrails are in §2
and §8.0. The PRD warns against trusting a backend-computed value; this is a
recorded, deliberate exception, bounded as far as the contract can bound it.

---

## 2. Trust model — what is trusted, and what is not

| Concern | Trusted party | Why it is bounded |
|---|---|---|
| Portfolio valuation (deposits only) | **price signer, bounded** | EIP-712 signature from `registry.priceSigner()`; prices at most 60 s old; the contract multiplies by its own balances; guardian can pause deposits instantly |
| Exit | **nobody** | in-kind, pro-rata, cannot be blocked or queued |
| Which assets are permitted | governance (multisig) | allowlist is immutable per trade; changes are timelocked |
| Which venues are permitted | governance | router allowlist |
| Trade quality (price, slippage) | **manager, bounded** | per-trade `maxSell` / `minBuy`, asserted post-trade |
| Trade timing | manager | can delay, cannot steal; investors can always exit in-kind |

The manager is the only actor with discretion, and that discretion is bounded to
*"swap an allowlisted asset for another allowlisted asset, on an allowlisted
venue, within limits the contract checks after the fact."* A malicious manager
can trade badly. A malicious manager **cannot** move assets to an address of
their choosing, and cannot stop anyone exiting.

This is a deliberately smaller claim than "the manager is honest", and it is the
claim the code actually enforces.

---

## 3. Contracts

```
VaultFactory ──deploys──> FolioVault (one per curator)
     │                         │
     │                         ├── holds: allowlisted ERC-20s + settlement token
     │                         ├── is:    ERC-20 share token
     │                         └── uses:  TradeGuard (balance-delta assertions)
     │
     └──reads──> AssetRegistry (governance-owned allowlists, shared)
```

| Contract | Responsibility |
|---|---|
| `AssetRegistry` | Governance-owned allowlists: permitted assets, permitted routers, settlement token, guardian address, price signer. Verifies signed prices (EIP-712 domain). One instance, shared by every vault. Timelocked changes (§10). |
| `VaultFactory` | Deploys vaults, records them, emits `VaultCreated`. Holds no funds. |
| `FolioVault` | The vault. Custody, share accounting, priced deposits, redemption, manager execution. Is itself the ERC-20 share token. |
| `TradeGuard` | Library, not a deployed contract. Snapshot/assert logic around manager trades. Kept separate so it can be tested in isolation. |

**Not ERC-4626.** ERC-4626 assumes a single underlying asset and a
`totalAssets()` the contract can compute. This vault holds a basket and
deliberately refuses to value it, so `totalAssets()` cannot be implemented
honestly. Publishing a fake one is worse than not claiming the standard. The
share token is plain ERC-20; the deposit/redeem surface is our own.

---

## 4. Lifecycle

```
DRAFT ──seed()──> SEEDED ──activate()──> ACTIVE ──┬──> PAUSED ──> ACTIVE
                                                   └──> CLOSED
```

| State | Deposit | Manager trade | Redeem |
|---|---|---|---|
| `DRAFT` | seed only | no | no (nobody has shares) |
| `SEEDED` | no | initial allocation only | yes (seed investor recovery) |
| `ACTIVE` | yes | yes | yes |
| `PAUSED` | no | no | **yes** |
| `CLOSED` | no | no | yes |

**Redemption stays open in `PAUSED`.** A pause that traps investors is a
custody risk wearing a safety label. Pause stops new money and new trades; it
never stops exit. This is the single most important line in the state table.

---

## 5. Share accounting

Shares are 18-decimal. All 488 instruments on BSC are 18-decimal (verified from
live API data), but the code must not assume that — decimals are read per asset
and normalised.

### Seed

The first deposit has no existing holdings to be proportional to, so it is the
one place an initial price is chosen by convention rather than derived:

- Seed investor deposits `S` of the settlement token. Anyone may seed a `DRAFT`
  vault; the seeder need not be the manager (§10 #4).
- `S` is measured as the vault's actual balance increase, not the argument.
- Mint `INITIAL_SHARES = S × 1e18 / 1 settlement unit` — a share starts at 1.00
  settlement unit, purely as a readable convention.
- **`DEAD_SHARES = 1e15` are minted to `0xdEaD`**, taken out of the seeder's
  `INITIAL_SHARES`, and can never be redeemed. This is the inflation-attack
  mitigation: it makes `totalSupply` non-zero and non-trivial, so later rounding
  cannot be gamed by donating to an almost-empty vault. (`0xdEaD`, not
  `address(0)`: OpenZeppelin v5 reverts on a mint to the zero address.)
- `MIN_SEED = 10` settlement units, enforced on the measured amount.
- The price is fixed by convention, so `seed()` takes no `minShares`.
- Then the manager buys the initial basket while the vault is `SEEDED` (SC-04),
  and the guardian calls `activate()`.

### Deposit

```
check signature: EIP-712 PriceUpdate signed by registry.priceSigner()
check freshness: block.timestamp - timestamp <= 60 s, timestamp not in the future
valueBefore = USDT balance                                    USDT is always 1:1
            + Σ balance_i × price_i ÷ 10^decimals_i          every other held asset
pull USDT, measure received (balance delta)
sharesOut   = received × totalSupply ÷ valueBefore            rounded DOWN
require(sharesOut > 0 && sharesOut >= minSharesOut)
```

- `price_i` is the value in settlement-token units of **one whole** asset token.
- Every held non-USDT asset must have a price, and no price may be zero —
  otherwise the deposit reverts. A missing price must never mean "worth $0".
- The signed list is shared across vaults and may contain extra assets; the vault
  uses only what it holds. A signed USDT price is ignored.
- `minSharesOut` is the investor's own bound against a price that moved.

### Redeem

Any holder, in any state except `DRAFT`, at any time. No price.

```
amountOut_i = balance_i × shares / totalSupply     rounded DOWN, every asset i
burn(shares)
```

Rounding down on every leg leaves dust in the vault, which accrues to remaining
holders. That is the correct direction and must be stated in the docs rather
than silently absorbed.

### Rebases and corporate actions

`tokenToShareRatio` is not constant — live data shows values like
`1.001339209456458611` drifting over time. If a token's balance changes without
a trade, in-kind accounting handles it automatically: every holder's slice
scales together, and no code path needs to know it happened. This is a real
advantage of proportional accounting over priced accounting, where a rebase
would silently corrupt NAV.

---

## 6. Manager execution — the security core

The Binance Trading API hands back **unsigned calldata aimed at a router**. A
vault that forwards arbitrary calldata to an arbitrary target is a vault that
can be drained in one transaction. The whole design of this section is about
never trusting that calldata.

```solidity
function rebalance(TradeRequest calldata t) external onlyManager whenActive {
    require(registry.isRouter(t.router),        "router not allowed");
    require(registry.isAsset(t.buyToken),       "buy token not allowed");
    require(isHeld(t.sellToken),                "sell token not held");

    uint256[] memory before = snapshotAll();          // every held asset

    IERC20(t.sellToken).forceApprove(t.router, t.maxSellAmount);
    t.router.functionCall(t.callData);                // the opaque part
    IERC20(t.sellToken).forceApprove(t.router, 0);    // never leave an allowance

    assertDeltas(before, t);
}
```

`assertDeltas` enforces, after the call, whatever the calldata actually did:

1. `sellToken` decreased by **at most** `maxSellAmount`
2. `buyToken` increased by **at least** `minBuyAmount`
3. **no other held asset decreased at all**
4. the resulting asset set is still entirely within the allowlist

Rule 3 is what makes the opaque calldata safe. It does not matter what the
router was asked to do; if the transaction leaves the vault holding less of
anything it was not explicitly authorised to sell, it reverts. Allowance is
reset to zero in the same transaction so no standing approval survives.

Target weights are stored and versioned, but **they are advisory**. The contract
does not enforce drift back to target — market movement causes passive breaches
and a contract that reverts on those would be unusable. Weights are emitted for
the UI and for accountability; only the per-trade bounds are enforced. This is
the PRD's distinction between "prohibited trades" and "drift requiring
rebalancing", made concrete.

---

## 7. Interface (freeze this before Vincent starts BE-03/BE-04)

```solidity
// ---- lifecycle
function seed(uint256 amount) external returns (uint256 shares);   // anyone, DRAFT only
function activate() external;                       // guardian
function pause() external;  function unpause() external;   // guardian
function replaceManager(address newManager) external;   // governance, timelocked

// ---- investor
function deposit(uint256 amount, PriceUpdate calldata prices, bytes calldata signature, uint256 minShares)
    external returns (uint256 shares);                // ACTIVE only
function redeem(uint256 shares, address to)
    external returns (address[] memory assets, uint256[] memory amounts);

// ---- manager
function rebalance(TradeRequest calldata t) external;
function setTargetWeights(address[] calldata assets, uint16[] calldata bps) external;

// ---- views (Vincent's read path)
function heldAssets() external view returns (address[] memory);
function holdings() external view returns (address[] memory, uint256[] memory);
function shareOf(address account) external view returns (uint256);
function state() external view returns (VaultState);
function targetWeightsVersion() external view returns (uint64);
```

### Events — the indexer contract

```solidity
event VaultCreated(address indexed vault, address indexed manager, address settlement);
event Seeded(address indexed investor, uint256 amount, uint256 shares);
event Deposited(address indexed investor, uint256 amount, uint256 shares, uint256 vaultValue, uint64 priceTimestamp);
event PriceSignerSet(address indexed from, address indexed to);   // AssetRegistry
event Redeemed(address indexed investor, uint256 shares, address[] assets, uint256[] amounts);
event Rebalanced(address indexed sellToken, address indexed buyToken, uint256 sold, uint256 bought, uint64 weightsVersion);
event TargetWeightsSet(uint64 indexed version, address[] assets, uint16[] bps);
event StateChanged(VaultState from, VaultState to);
event ManagerReplaced(address indexed from, address indexed to);
```

Every event carries enough to reconstruct state without an archive node.
`Redeemed` and `Rebalanced` carry actual amounts, not requested ones, so the
indexer records what happened rather than what was asked for — the PRD's
"target vs executed" separation, enforced at the event layer.

### Errors

Custom errors throughout: `NotManager`, `NotGovernance`, `NotGuardian`, `WrongState`,
`TransfersDisabled`,
`AssetNotAllowed`, `RouterNotAllowed`, `SellExceeded`, `BuyTooLow`,
`CollateralDecreased`, `SlippageTooHigh`, `BelowMinimumSeed`, `NothingToRedeem`,
`InvalidPriceSignature`, `StalePrices`, `LengthMismatch`, `MissingPrice`, `ZeroPrice`,
`ZeroShares`, `EmptyVault`, `DeadSharesLocked`.

---

## 8. Risks, in order

### 8.0 The signed price is the largest trust assumption

Researched 1 October 2026: no reliable on-chain price exists for Ondo stock tokens
on BSC (Chainlink `...on` feeds are Ethereum-only; plain AAPL/NVDA/TSLA/MSFT feeds
freeze at the US close; Pyth equities are paid; DEX pools hold ~$17k). So the
backend signs prices from the Binance RWA price API.

If a signed price is too low, a depositor gets too many shares and can redeem
them for real assets at once — value taken from existing holders. Bounds:

- prices older than **60 seconds** are rejected, so the backend must sign per deposit;
- the backend must refuse to sign while US markets are closed (`marketStatus`
  from the RWA underlying-market endpoint), when the token and reference price
  diverge, or when any held asset lacks a price;
- the guardian can **pause deposits instantly**; redemption keeps working;
- the signer key is a dedicated hot key with no other power; governance rotates it.

Not bounded by the contract: a fresh, correctly signed, but wrong price.

### 8.1 Liquidity, not signing, is the binding constraint

**Corrected 25 September 2026 after testing against mainnet.** An earlier draft
of this document named RFQ signing as risk #1 and claimed a pooled vault might
not be able to trade tokenized equities at all. **That was wrong.** The claim
came from the Trading API docs, which state that equity tokens use RFQ with an
EIP-712 signature. Measured behaviour disagrees.

Quoting every tradable plain equity against USDT:

| | |
|---|---|
| tradable plain equities | 295 |
| `executionMode = SWAP` | **284** |
| `executionMode = RFQ` | **0** |
| quote failed — insufficient liquidity | 11 |

Building a swap for one of them (`AMDon`, Ondo) returns a **plain unsigned
transaction** — `to`, `value`, `data` — with an empty `rfq` field and no
`typedDataToSign`. It targets the same router and the same `0xad43f73d` selector
as an ordinary crypto swap. **No signature is required, so ERC-1271 is not
needed and a contract can trade these directly.**

This holds across trade sizes, which is the case that mattered — routing often
changes with size:

| size (USDT) | AAPLon | NVDAon | TSLAon | MSFTon | AMDon |
|---|---|---|---|---|---|
| 100 | SWAP | SWAP | SWAP | SWAP | SWAP |
| 1,000 | SWAP | SWAP | SWAP | SWAP | SWAP |
| 10,000 | SWAP | SWAP | **no liquidity** | SWAP | SWAP |
| 100,000 | SWAP | SWAP | **no liquidity** | SWAP | SWAP |

The real constraint is **depth, not permission**. TSLAon cannot fill 10,000
USDT. Eleven instruments cannot quote at all. A vault that publishes a target
weight it cannot actually buy will fail at execution time, so the allowlist
should be built from instruments that quote at the vault's expected trade size,
re-checked periodically rather than fixed at deploy.

Residual caution: the docs still describe an RFQ path, so it presumably exists
for some instrument, venue or size not covered here. `executionMode` must be
read from every quote rather than assumed, and the backend should treat an
unexpected `RFQ` as a hard stop rather than trying to handle it.

### 8.2 Only 58 instruments are actually usable

Of 488 tokenized instruments on BSC, 73 were tradable at the time of writing
and 58 of those are plain equities (`assetType 1`); the rest are leveraged
products like *"GraniteShares 2X Long INTC ETF"*. The tradable count moves with
US market hours — it was 395 on a weekday and 73 on a Sunday. The allowlist
should be `assetType == 1` only, and the UI must not imply a 488-instrument
universe.

### 8.3 Liquidity on exit

In-kind redemption hands the investor stock tokens, not cash. If those tokens
have thin on-chain liquidity, the investor holds something they cannot easily
sell. In-kind redemption removes the vault's obligation to find liquidity; it
does not create liquidity. This must be said plainly in the UI, not buried.

### 8.4 Reentrancy and hostile tokens

Arbitrary ERC-20s are transferred in redemption loops. `nonReentrant` on every
state-changing external function, strict checks-effects-interactions, and
`SafeERC20` throughout. Balance deltas are measured from actual balances rather
than from return values, which also handles fee-on-transfer tokens correctly.

### 8.5 Manager griefing

A manager can leave deposits idle forever. Mitigation: idle USDT is redeemable
like everything else, and governance can replace the manager. A manager can
trade badly within bounds. Mitigation: governance can replace the manager, and
investors can always exit.

---

## 9. What this deliberately does not do

No fees (zero management, zero performance). No leverage, no borrowing, no
bridges. No share transfers between investors initially — `transfer` reverts
until an access model is defined, because a transferable share is a security
that can reach someone who never passed eligibility. No upgradeability: vaults
are immutable once deployed; a new version is a new vault. No target-weight
enforcement (§6). No redemption queue — in-kind makes it unnecessary.

---

## 10. Decisions

### Decided (30 September 2026)

| # | Decision | Answer |
|---|---|---|
| 2 | Settlement token | **USDT**. Fixed in `AssetRegistry` at deploy; every vault copies it as an immutable. |
| 3 | `MIN_SEED` | **10 settlement units** (10 USDT). |
| 4 | Is the seed investor automatically the manager? | **No.** Anyone can seed a `DRAFT` vault. The manager is named at `createVault`. |
| 5 | Governance model | **One global admin, two speeds** — see below. |
| 6 | Deposit deadline / cancellation | **Gone.** Deposits mint shares immediately; there is no waiting area to cancel from. (7 Oct) |
| 9 | How deposits are priced | **Backend-signed price per stock** (EIP-712), verified by `AssetRegistry`. (7 Oct) |
| 10 | Max signed-price age | **60 seconds.** (7 Oct) |
| 11 | Delay before a new depositor may redeem | **None.** (7 Oct) |

**Roles.** One team controls both admin addresses; they differ only in speed.

| Role | Is | Can | Speed |
|---|---|---|---|
| `governance` | OZ `TimelockController`, Safe as proposer | edit allowlists, set guardian, replace manager | 24h delay |
| `guardian` | the Safe directly | `activate`, `pause`, `unpause` | instant |
| `manager` | curator wallet, set per vault | trade (SC-04) | — |
| `priceSigner` | backend hot key | sign stock prices for deposits; nothing else | — |
| anyone | any wallet | `createVault`, `seed` | — |

Rule changes wait so investors can exit before they land; emergency brakes do
not wait, and a pause never blocks exit anyway. No timelock code is written —
OZ's `TimelockController` is deployed by the deploy script (SC-07), and
`AssetRegistry` is `Ownable2Step` with that timelock as owner. Vault creation
is permissionless because a vault accepts only its one seed deposit until the
guardian activates it; deposits need `ACTIVE`.

### Still open

| # | Decision | Needed before | Owner |
|---|---|---|---|
| 1 | Minimum quotable size per instrument — sets the allowlist | SC-04 | Aik Wei + Vincent |
| 7 | Max assets per vault (bounds the redemption loop's gas) | SC-04 (first point a second asset can enter) | Aik Wei |
| 8 | Are share transfers ever enabled, and under what check? | post-demo | founder + advisers |

---

## 11. Build order

| Task | Contents | Depends on |
|---|---|---|
| SC-01 | This document (execution path verified against mainnet) | — |
| SC-02 | `AssetRegistry`, `VaultFactory`, `FolioVault` skeleton, seed, lifecycle | decisions 2–5 |
| SC-03 | Price signer, signed-price verification, priced `deposit`, guardian `pause`/`unpause` | SC-02 |
| SC-04 | `TradeGuard`, `rebalance`, target-weight versioning | SC-02 |
| SC-05 | In-kind `redeem` | SC-02 |
| SC-06 | Manager replacement, close, recovery (pause moved into SC-03) | SC-02–05 |
| SC-07 | Invariant and adversarial tests, deploy scripts, ABI + address manifest | all |

### The invariants SC-07 must prove

These are properties, not examples, and belong in Foundry invariant tests:

1. **Share price never falls on deposit.** At the signed prices, value per share
   after a deposit is greater than or equal to before.
2. **Redemption is exactly proportional.** Redeeming `p%` of supply removes
   `p%` (rounded down) of every asset and nothing else.
3. **Conservation.** No sequence of manager actions reduces any held balance
   except through an authorised, asserted trade.
4. **Exit is always available.** From `ACTIVE`, `PAUSED` or `CLOSED`, any holder
   can redeem in one transaction.
5. **Dead shares are never redeemable**, and `totalSupply` never returns to zero.
