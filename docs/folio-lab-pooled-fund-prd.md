# Folio Lab: seeded pooled portfolio PRD

Updated 18 September 2026. Supersedes the individual-wallet basket plan.

## Confirmed direction

The founding investor seeds a portfolio. Its initial allocation is recorded onchain for later investors to inspect. An authorized fund manager changes allocations, and the portfolio reflects those changes.

This is a pooled-fund model: investors participate in one shared vault through portfolio shares. Subsequent investors join its current holdings and valuation, rather than buying a frozen copy of the initial allocation. The seed investor and manager may be the same person, but funding the vault does not implicitly grant management authority.

The pooled interpretation follows the founder's clarification; specific accounting, permission and settlement choices below are proposed requirements for implementing it.

## Problem, goals and user stories

Investors need to inspect a funded strategy, join it on fair accounting terms and observe how its manager changes the allocation. The previous browser simulation does not demonstrate custody, share issuance or onchain manager execution.

Release goals: prove one seeded portfolio, one subsequent subscription, one manager rebalance and one redemption; reconcile all share and asset movements; preserve initial and later allocations in an inspectable history.

- As a founding investor, I want to seed a portfolio and receive shares representing my contribution.
- As a later investor, I want to inspect the current strategy and history, then join at the applicable current share price.
- As a manager, I want to rebalance vault assets within published permissions and limits.
- As an investor, I want my portfolio exposure and value to reflect confirmed trades and market movements, and to exit under published settlement terms.

## Core flow

1. **Create:** publish the manager address, approved assets, target weights, valuation policy, limits and withdrawal terms. Deploy/register the vault and its share token.
2. **Seed:** the founding investor contributes the accepted funding asset. Mint initial shares using a documented initial-price and anti-inflation policy. Require a configured minimum seed; the amount is still to be chosen.
3. **Allocate and activate:** execute approved purchases from the vault. Record initial target weights and actual resulting quantities, residual funding balance, prices/timestamps and transaction references. Open to later investors only after the required seed/allocation conditions pass. Failed initial trades leave the vault visibly unready, with a defined seed recovery path.
4. **Subscribe:** a later investor deposits and receives shares at the applicable valid pre-deposit valuation. Pending deposits are not investable vault capital until accepted. Hold accepted funding assets as an explicit reserve until an authorized allocation trade; do not pretend subscription instantly achieves target weights.
5. **Rebalance:** the manager submits a proposed target or trade plan. Validate permissions, assets, venue, prices, slippage and liquidity. Only confirmed trades update executed holdings. Record partial completion honestly if the plan spans transactions.
6. **Read back:** the app reconciles actual vault balances, total shares, investor shares and fresh valuation. Existing investors remain exposed to the shared vault without signing every manager trade.
7. **Exit:** the investor requests redemption; lock the requested shares, settle using the documented dealing policy, then burn shares against payment. Show pending, settled or failed status explicitly.

### What “update the portfolio” means

- **Target allocation** is the manager's intention. Publishing new weights records a new version; it does not exchange any assets.
- **Actual holdings** change after successful trades. Current weights also drift as prices change, even without manager activity.
- **History** retains the seed snapshot, target versions, executions, subscriptions and redemptions. Do not overwrite the original portfolio record.
- **Investor participation** is their share balance divided by total shares. Rebalancing alone does not change their share count. Trading costs and market movement can change share value.
- Onchain records should contain enforceable configuration, shares and transaction events. Readable descriptions can be stored offchain with an onchain content hash/version. A holdings dashboard is derived from verified balances and price data, not merely a published allocation label.

## P0 requirements and acceptance criteria

| ID | Requirement | Acceptance outcome |
|---|---|---|
| P01 | Vault lifecycle and roles | Draft → seeded → active transitions are checked; an unseeded/unready vault cannot accept later subscriptions. Only the assigned manager can trade. Seed investor, manager and admin permissions are explicit. |
| P02 | Initial seed and shares | Seed assets actually arrive in the vault; initial shares mint once under tested decimal/rounding rules. Zero/tiny deposits, unsolicited donations and repeated initialization cannot extract another investor's value. |
| P03 | Initial allocation and history | Initial targets and confirmed holdings are separately inspectable. Failed trades cannot be recorded as executed. Allocation changes append versioned events. |
| P04 | Later subscriptions | Issue shares from valid pre-deposit NAV, with documented rounding and a user minimum-share bound. Stale/invalid valuation stops acceptance. Deposits do not manufacture returns or dilute existing holders beyond disclosed rounding/costs. |
| P05 | Constrained manager execution | Contract-level controls enforce asset/venue/recipient permissions and execution bounds. Arbitrary transfers to the manager are rejected. Every swap uses required fresh data and simulation; frontend checks alone are insufficient. |
| P06 | Consistent dealing and rebalance | Serialize settlement and multi-leg rebalance through an explicit vault state. Unsettled deposits and locked redemption shares are accounted for separately. A failed leg is recoverable without replaying confirmed trades; no unfair dealing against partially updated valuation. |
| P07 | Portfolio valuation | Show quantities, reserve, liabilities, total shares and valuation timestamps. NAV equals asset value minus liabilities/accrued costs; share price equals NAV divided by outstanding shares. Missing/stale valuation is unavailable, not zero. Market moves update estimated weights without fabricating onchain trades. |
| P08 | Redemption | Use one published settlement asset and a queue when liquidity is insufficient. Locked shares cannot be redeemed twice. Burn/payment are coupled safely; a failed settlement preserves the investor's claim. A dashboard estimate is not a guaranteed payout. |
| P09 | Emergency behavior | Define which operations pause, who can pause/resume or replace a manager, and how seed/pending/active investors recover or exit. Test unauthorized calls, failed trades, stale prices and insufficient liquidity. |
| P10 | Integrated demonstration | Show seed → allocation → later subscription → manager rebalance → redemption, with actual contract events and reconciled balances in the chosen demonstration environment. Clearly distinguish simulation from mainnet execution. |

Illustration, excluding fees and rounding: seed 1,000 units at an initial share price of 1 yields 1,000 shares. If NAV later becomes 1,200, a 120-unit subscription receives 100 shares at 1.20. NAV becomes 1,320 and supply 1,100; the deposit leaves price at 1.20. This is an accounting example, not a promised return.

P1: additional curated portfolios, richer history visualizations and notifications. P2: fee monetization, secondary share trading, open creator onboarding and autonomous strategies. For the first build, propose zero management/performance fees, no leverage/bridges and restricted share transfers pending a defined access model.

## Two-engineer task plan

Confirmed ownership: **Aik Wei owns smart contracts. Vincent owns the backend.** Frontend implementation is not assigned by this split; the screens described in the product requirements remain a separate delivery dependency. Backend APIs and a reproducible integration script can prove the core flow while the frontend owner is decided.

Aik Wei owns enforceable onchain state, accounting and permissions. Vincent owns external API integrations, persisted metadata, transaction preparation, indexing and read APIs. The backend never becomes the authority for minting shares or bypassing contract controls. Reuse reviewed vault infrastructure only if its actual permissions, supported assets and accounting fit.

### Aik Wei — smart contracts

| Task | Owner | PRD | Deliverable and expected outcome | Dependency |
|---|---|---|---|---|
| SC-01 | Aik Wei | P01, P05, P07 | Evaluate vault infrastructure and define lifecycle, callable functions, events, errors and valuation trust model. Outcome: a supported contract design and versioned interface Vincent can integrate. | Vincent's BE-01 route findings; joint kickoff |
| SC-02 | Aik Wei | P01–03 | Implement deployment/registration, roles, seed funding, initial share issuance and activation rules. Outcome: initial capital is held by the vault; the founder receives correct shares; unready vaults reject later subscriptions. | SC-01 |
| SC-03 | Aik Wei | P02, P04, P07 | Implement valuation validation and later subscription accounting, including decimals, rounding, minimum shares and donation protection. Outcome: contracts issue shares at valid dealing values; stale or unauthorized valuation cannot mint shares. | SC-02; agreed valuation source |
| SC-04 | Aik Wei | P03, P05–06 | Implement target-allocation versioning, permitted execution adapter and rebalance state controls. Outcome: authorized trades alter vault holdings; arbitrary transfers and unsafe dealing are rejected; events preserve target and execution history. | SC-01–03; BE-04 payload integration |
| SC-05 | Aik Wei | P06, P08 | Implement withdrawal requests, share locking, queue settlement and coupled payment/burn. Outcome: no double withdrawal; insufficient liquidity or failed payment preserves the claim. | SC-03–04 |
| SC-06 | Aik Wei | P09 | Implement pause/resume, manager replacement and recovery permissions. Outcome: emergency actions have explicit authority and tested investor recovery behavior. | SC-02–05 |
| SC-07 | Aik Wei | P01–10 | Run contract unit/invariant and adversarial tests; provide deployment scripts, addresses, ABIs, deployment blocks and own integration notes. Outcome: reproducible contracts with evidence for accounting and permission gates. | SC-02–06 |

### Vincent — backend

| Task | Owner | PRD | Deliverable and expected outcome | Dependency |
|---|---|---|---|---|
| BE-01 | Vincent | P03, P05, P07 | Integrate server-side Binance Web3 access; verify token/provider metadata, market/reference data and usable swap routes. Outcome: documented supported instruments and actual API responses; explicit unavailable states and protected credentials. | API credentials; coordinate feasibility with SC-01 |
| BE-02 | Vincent | P01, P03 | Build authenticated portfolio metadata APIs and storage for descriptions, terms and versioned allocation drafts. Verify signed wallet challenges with expiring, single-use nonces. Outcome: authorized edits persist; an offchain draft cannot masquerade as an onchain active portfolio. | Joint interface contract; SC-01 |
| BE-03 | Vincent | P01–04, P06, P08 | Build the contract-event indexer and transaction monitor. Outcome: seed, share mint/burn, rebalance and withdrawal histories persist and match confirmed chain state after restarts; duplicate logs and chain reorganizations are handled. | SC-01 event schema; deployed contracts for final verification |
| BE-04 | Vincent | P05–06 | Build quotes, readiness checks, simulation and unsigned manager transaction preparation. Outcome: payloads reference the correct vault, chain, spender, amounts, minimum outputs, deadline and allocation version; missing/stale data stops preparation. | BE-01; SC-01 adapter interface; SC-04 for final integration |
| BE-05 | Vincent | P02, P04, P08 | Build seed, subscription and redemption preview/preparation APIs. Outcome: wallet clients receive contract-compatible unsigned requests, estimates and status; actual minted/burned shares come from confirmed contract results. | SC-02–03, SC-05; BE-03 |
| BE-06 | Vincent | P03, P07 | Build holdings, ownership, valuation and allocation-history APIs. Outcome: initial/target/current allocation are distinct; raw quantities reconcile at a stated block; valuation timestamps and unavailable prices are exposed; pending transactions stay separate. | BE-01, BE-03; SC-03 reads |
| BE-07 | Vincent | P06, P08–09 | Build operation-status, retry and monitoring services. Outcome: partial rebalances, queued exits, pauses and failed transactions are visible; retries reconcile chain state and never automatically replay confirmed actions. | BE-03–05; SC-04–06 |
| BE-08 | Vincent | P10 | Deploy backend, document APIs/setup and run integration checks with Aik Wei; keep own experience notes. Outcome: reproducible seed → subscribe → rebalance → redeem flow with reconciled records, protected secrets and an accessible service. | BE-01–07; SC-07 |

### Shared handoffs and authority

| Boundary | Aik Wei supplies / enforces | Vincent supplies / consumes |
|---|---|---|
| Contract interface | Versioned ABI, events, custom errors, chain/address manifest and deployment block | Typed integration, request validation, API contract and indexed history |
| Monetary amounts | Raw integer amounts, asset/share decimals and rounding rules | Decimal-safe input parsing; raw amounts serialized as strings; matching display estimates |
| Valuation | Accepted oracle/authentication model, freshness checks and authoritative share-settlement calculation | Price feeds and timestamped display estimates; any valuation submission only through the explicitly authorized contract path |
| Manager rebalance | Role/asset/venue/recipient restrictions and settlement locks enforced onchain | Route discovery, quote bounds, simulation and unsigned payloads for the manager's wallet |
| Signing | Contract verifies the authorized caller or explicitly scoped authorization | Backend prepares requests; investor/manager wallet signs. Server possession of a wallet address is not signing authority. |
| Confirmation | Events and current contract state are authoritative | Pending/confirmed/failed statuses, reorg rollback, replay-safe indexing and balance reconciliation |

Agree the valuation trust model before implementing subscriptions: a backend-calculated NAV must not be trusted simply because it arrived through the app. Specify an onchain-verifiable source or an explicit authenticated valuation mechanism, including stale-price and manipulation controls.

Parallel start: Aik Wei runs SC-01 while Vincent runs BE-01 and scaffolds BE-02 against an agreed interface. Freeze the first ABI/event schema, then integrate seed, later subscription, rebalance and redemption in that order. Interface changes require a version update and matching integration check by both owners.

Frontend remains **unassigned**: creation/seed screens, factsheets, wallet signing, manager console, investor dashboard and withdrawal screens still need an owner. Vincent's backend assignment does not implicitly include these. The API/script demonstration is an integration milestone; the full user-facing journey remains incomplete until its client is connected.

## Success metrics and release gates

Leading: every P0 acceptance scenario passes; zero unresolved critical accounting/permission defects; one complete demonstration with two investor identities and one manager; contract balances, share supply and event-derived UI agree after every step. Test that proportional ownership sums correctly and accepted capital, executed costs and redemptions reconcile.

Post-demo learning: test whether five prospective users can explain initial versus current allocation, their share ownership and withdrawal timing; proposed target is four out of five without prompting. Fundraising/AUM is not a demonstration success requirement.

The earlier 10-days-per-engineer estimate no longer applies. First time-box SC-01 and BE-01 to a shared two-working-day feasibility window, then each owner estimates their remaining tasks from the actual contract and API gaps. Include frontend capacity when estimating the full user-facing release. The knowledge base's hackathon deadline remains a constraint, not evidence that new pooled infrastructure can be safely completed by then. Cut extra baskets and visual polish first. If the pooled mainnet path is not feasible, surface that decision explicitly rather than silently reverting to individual wallets.

## Open decisions

| Decision | Owner | Timing |
|---|---|---|
| Is the founding investor also the manager, and who appoints/replaces the manager? | Vincent, with Aik Wei implementing permissions | Before SC-02 |
| Minimum seed, spend/settlement token, supported assets and concentration limits | Vincent + Aik Wei | Before SC-02–04 |
| Existing vault integration, oracle policy, initial share pricing, rounding and donation handling | Aik Wei, with Vincent supplying integration evidence | SC-01/SC-03; blocks subscriptions |
| Redemption dealing windows, costs, queue policy and pause/recovery authority | Vincent + Aik Wei | Before SC-05 |
| Does the selected provider/route support a pooled vault as holder and trader? | Vincent/provider + Aik Wei | SC-01/BE-01; blocks live pooled integration |
| Who builds/connects the frontend and wallet signing client? | Vincent + Aik Wei to assign | Before committing the complete demo schedule |
| Public offering/access and legal rights attached to shares | Founder with appropriate advisers | Separate production gate before accepting public investment |

Source basis: [hackathon scope](../knowledge-base/06-bnb-hackathon.md), [product mechanics](../knowledge-base/03-product-and-mechanics.md), [risk register](../knowledge-base/04-risk-and-legal.md), and founder scope/ownership decisions recorded on 18 September 2026. This document specifies planned work; no contracts were deployed and no funds moved in preparing it.
