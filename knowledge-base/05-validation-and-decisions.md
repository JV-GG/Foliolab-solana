# Validation, economics and decisions

Current delivery priority: [BNB hackathon prototype](06-bnb-hackathon.md). The production validation sequence below is deferred rather than a prerequisite to the simulated demo.

## Decision log

| Date | Item | Status |
|---|---|---|
| 2026-09-17 | Creator-led DeFi portfolio marketplace, initially motivated by tokenized stocks | Founder intent |
| 2026-09-17 | Start with curated, constrained vaults | Recommendation; not approved |
| 2026-09-17 | Reuse established infrastructure if suitable | Recommendation; diligence required |
| 2026-09-17 | Market, investor segment, issuer and legal structure | Open |
| 2026-09-17 | Hackathon first; BNB tokenized-stocks event selected | Founder direction |
| 2026-09-17 | BSC mainnet submission; initial browser simulation | Event requirement / current prototype |
| 2026-09-18 | Seeded pooled portfolio: founding investor seeds the vault, later investors receive shares, manager rebalances shared holdings | Founder direction; supersedes individual-wallet basket proposal |
| 2026-09-18 | Aik Wei owns smart contracts; Vincent owns backend; frontend owner remains open | Confirmed team assignment; see [PRD and task plan](../docs/folio-lab-pooled-fund-prd.md) |

## Riskiest assumptions and cheap tests

Suggested discovery sample sizes and gates below are planning heuristics, not statistical proof.

| Assumption | Test | Evidence to seek / reason to stop |
|---|---|---|
| Users want delegation beyond a tokenized ETF | Interview 12–15 prospective investors about their last actual allocation | Repeated unmet need, existing workaround and willingness to pay; stop if simple ETFs satisfy it |
| Credible managers will participate | Interview 5–8 managers and inspect strategy records | At least two credible pilot candidates and some route to customers; no money collected during discovery |
| Legal/provider access is practical | Choose one market, consult counsel, obtain issuer integration terms | Written viable route including pooled holdings and redemption; redesign if prohibited or uneconomic |
| Exits work at target size | Obtain quotes and simulate rebalancing/redemptions in normal and stressed conditions | Costs and timing fit the proposed product promise |
| Investors understand risk | Test prototype factsheets and withdrawal screens | Users correctly explain possible loss, fees and exit timing without prompting |
| Differentiation beats existing tools | Have users compare prototype with Chamber and direct tokenized ETFs | A recurring, specific reason to choose it beyond promotional rewards |

## Suggested first month

Week 1: choose a target segment; document alternatives; begin investor and manager interviews; scope counsel/provider questions.

Week 2: build clickable factsheets and simulated portfolio histories; test strategy comparison, costs and withdrawal understanding.

Week 3: assess infrastructure integrations and liquidity; develop realistic operating-cost estimates; review failure scenarios.

Week 4: decide whether to build a restricted pilot, pivot to infrastructure/analytics, or stop. A live-money pilot follows legal, security and operational readiness, not a calendar deadline.

## Business model

Candidate revenue: a share of disclosed management fees, potentially carefully structured performance fees, or recurring software fees for professional managers. Avoid assuming trading volume is desirable when turnover increases investor costs.

Illustrative annual management-fee revenue, before expenses:

Platform revenue = average fee-paying AUM × annual management fee × platform share.

At a hypothetical 1% management fee and a 20% platform share:

| Average AUM | Gross platform revenue / year |
|---|---:|
| $10 million | $20,000 |
| $50 million | $100,000 |
| $100 million | $200,000 |

These are arithmetic scenarios, not forecasts or recommended pricing. At a 0.2% effective platform take, covering a hypothetical $500,000 annual fixed cost requires $250 million average AUM before variable costs. This is why distribution and retention are fundamental.

Track issuer/execution spreads, manager compensation, audits, legal/compliance, pricing data, infrastructure, customer support and acquisition. Disclose underlying ETF expenses and issuer costs alongside vault fees where applicable. Do not double-count platform revenue if fees are already shared with managers.

## Metrics

Primary: retained fee-paying AUM and investor outcomes against an appropriate benchmark after costs. Supporting: funded conversion, cohort retention, repeat deposits, redemption completion time, slippage, mandate breaches, incident rate, manager concentration and contribution margin. TVL inflated by incentives and gross trading volume are weak substitutes.

## Next founder decisions

1. First jurisdiction and investor segment.
2. Primary differentiation: manager access, a specific mandate, distribution partnership, or infrastructure for professionals.
3. Active manager discretion versus fixed rules.
4. Practical appetite for permissioned access and a licensed partner.
5. Available budget, team, and evidence required before live deployment.

## Terms

**AUM:** assets under management. **NAV:** asset value minus liabilities. **Vault share:** accounting interest in a portfolio contract, with legal rights separately defined. **Slippage:** execution price difference from the expected price. **High-water mark:** a reference peak used in some performance-fee systems to avoid charging again for recovery of past losses. **Tokenized stock:** a token linked to a security; rights depend on its legal structure. **Risk appetite:** willingness to accept risk; distinct from financial capacity to absorb loss.
