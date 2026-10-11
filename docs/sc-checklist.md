# Aik Wei — smart contract checklist

Working tracker for the 7 SC tasks. Tick items as they land.
Design: [contract architecture](folio-lab-contract-architecture.md) · Spec: [PRD](folio-lab-pooled-fund-prd.md)

---

## What the whole thing is, in plain words

People pool money into one shared pot. A manager invests that pot in tokenized
US stocks on BNB Chain. Everyone who put money in owns a slice of the pot.

Four things happen:

1. **Seed** — the first investor puts money in and gets shares
2. **Allocate** — the manager buys the starting basket of stocks
3. **Join** — later investors put money in and get shares at today's value
4. **Rebalance** — the manager swaps holdings; everyone's slice moves together

One rule runs through all of it: **what the manager *intends* and what actually
*got bought* are different things.** Store them separately, never overwrite
history.

## Who does what

| | You (Aik Wei) | Vincent |
|---|---|---|
| Owns | the contracts — money, shares, permissions | the backend — APIs, Binance calls, indexing |
| Rule | your contract is the authority on who owns what | his backend can never mint shares or bypass your checks |

**Frontend has no owner.** Still unassigned. Not your problem unless someone assigns it.

---

## Phase 0 — before writing any contract code

These block everything. Do them first.

- [x] ~~Confirm the RFQ signing question.~~ **Done — answered against mainnet
      on 25 Sep.** 284 of 295 tradable equities quote as `SWAP`, none as `RFQ`,
      and a built swap returns a plain unsigned transaction. No signature, so no
      ERC-1271 needed: **a contract can trade these directly.**
- [ ] **Decide the allowlist by liquidity instead.** 11 instruments cannot quote
      at all, and TSLAon cannot fill 10,000 USDT. Pick a target trade size and
      allowlist only instruments that quote at it. This replaces the signing
      question as the thing that shapes what the vault can hold.
- [ ] Agree the **contract interface** with Vincent — the exact functions he calls
- [ ] Agree the **event schema** with Vincent — what you emit, so he can index it
- [ ] Agree the **valuation model** — see note below
- [ ] Sort out the `api/` + `lib/binance/` overlap. That code is Binance API
      exploration sitting in your tree, and it is Vincent's BE-01. Either hand it
      over as findings or agree a re-split — one message, before either of you builds more.

> **On valuation:** the PRD treats this as the hard unsolved problem. The proposed
> architecture sidesteps it — deposits and withdrawals are both *proportional*, so
> the contract never needs to know what the pot is worth. Confirm Vincent is happy
> with that before he builds a pricing API you will not use.

### Decisions you need from other people

- [x] Which token is money — **USDT**
- [x] Minimum first deposit — **10 USDT**
- [x] Is the first investor automatically the manager? — **No, anyone can seed**
- [x] Who can replace a manager or pause things? — **governance (slow) replaces; guardian (instant) pauses**
- [ ] Max number of stocks per vault — this bounds withdrawal gas *(you, before SC-04)*

---

## Phase 1 — SC-02 · the vault exists and can be seeded

- [x] `AssetRegistry` — the allowlist of permitted stocks and permitted routers
- [x] `VaultFactory` — deploys vaults, emits `VaultCreated`
- [x] `FolioVault` skeleton — is itself the ERC-20 share token
- [x] Lifecycle states: `DRAFT → SEEDED → ACTIVE` built; `PAUSED` and `CLOSED` are declared, wired in SC-06
- [x] Roles: manager, governance, guardian, investor — and their boundaries
- [x] `seed()` — first deposit mints the first shares
- [x] Mint dead shares to `0xdEaD` so the vault can never be emptied to zero
- [ ] An unseeded vault must reject later investors — *checked in SC-03, when `requestSubscription` exists*
- [x] Tests: seeding works, wrong states revert, only the right roles can call

## Phase 2 — SC-03 · later investors can join

- [ ] `requestSubscription()` — money goes into escrow, **not** into the pot yet
- [ ] `executeSubscription()` — manager spends it buying pro-rata; shares minted
      from the measured balance growth
- [ ] `cancelSubscription()` — investor gets their money back if the manager stalls
- [ ] Always round shares **down** so existing holders are never diluted
- [ ] `minSharesOut` so an investor can reject a bad execution
- [ ] Tests: share price never moves on a deposit; a cash-only deposit mints zero

## Phase 3 — SC-04 · the manager can trade, but is locked down

This is the dangerous one. Binance hands back opaque calldata pointed at a router.

- [ ] `TradeGuard` — snapshot every balance, run the trade, then assert:
      - [ ] sold no more than authorised
      - [ ] bought at least the minimum
      - [ ] **nothing else went down**
      - [ ] escrow untouched
- [ ] Only allowlisted routers and allowlisted stocks
- [ ] Reset token approval to zero in the same transaction
- [ ] Target weights stored and versioned — but **advisory, not enforced**
      (prices drift on their own; enforcing would brick the vault)
- [ ] Tests: hostile calldata cannot drain the vault

## Phase 4 — SC-05 · getting money out

- [ ] `redeem()` — burn shares, receive your exact percentage of every holding
- [ ] Round every leg down; dust stays with remaining holders
- [ ] No queue and no manager approval needed — exit can never be blocked
- [ ] Tests: withdrawing X% removes X% of everything and nothing else

## Phase 5 — SC-06 · emergency controls

- [ ] `pause()` / `unpause()`
- [ ] **Withdrawals still work while paused** — a pause that traps people is not safety
- [ ] `replaceManager()` with a timelock
- [ ] Tests: paused blocks deposits and trades, never exits

## Phase 6 — SC-07 · prove it and ship it

- [ ] Invariant tests (properties, not examples):
  - [ ] share value never drops when someone deposits
  - [ ] withdrawal is exactly proportional
  - [ ] no manager action reduces a balance except an authorised trade
  - [ ] anyone can always exit
  - [ ] dead shares can never be redeemed
- [ ] Adversarial tests: hostile token, reentrancy, rounding abuse, wrong roles
- [ ] Deploy scripts
- [ ] Hand Vincent: ABI, event list, contract addresses, deployment block,
      decimals and rounding rules
- [ ] Your own notes for the developer-experience report — **write these as you go,
      the organisers reject AI-written ones**

---

## Right now

**Nothing blocks the contract work any more.** The execution path is verified:
the vault can trade tokenized stocks directly, no signature required.

**SC-02 is built.** Next is SC-03 (later investors joining), which needs one decision first: how
long a subscription waits before the investor may cancel it. Still to agree with Vincent: the
interface and event schema, and the allowlist by liquidity.
