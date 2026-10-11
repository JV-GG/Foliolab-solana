# Market and evidence

Checked 17 September 2026. This is a targeted landscape scan, not an exhaustive market-size study. No independent adoption or revenue estimates have been established.

## Competitive landscape

| Provider / alternative | Observed offering | Implication |
|---|---|---|
| Chamber, formerly dHEDGE | Its documentation describes manager-run vaults holding tokenized stocks, commodities and crypto with contract guardrails [S1–S2] | A direct competitor; cross-asset vaults alone are insufficient differentiation |
| Enzyme | Vault infrastructure with policies and configurable investor/share-transfer controls [S3–S4] | Potential infrastructure option as well as an adjacent competitor |
| Ondo Stocks | Tokenized stock/ETF supply, distribution and issuer redemption [S5–S6] | Potential asset supplier; users can also buy a tokenized ETF directly |
| xStocks | Tokenized equity distribution and partner integration [S7–S8] | Another supplier candidate; rights, eligibility and accounting require review |
| Broker ETFs and managed funds | Existing pooled investment experience [S9] | Benchmark for total cost, convenience and protections |

The build-versus-integrate decision remains open. Documentation does not demonstrate that a particular chain, asset, oracle, or legal model is compatible with our eventual vault design.

## Asset-provider findings

Ondo states that direct minting/redemption requires eligible, onboarded holders; merely holding tokens is insufficient. Its June 2026 announcement introduced 24/7 minting/redemption for a selected initial group, so blanket statements that all tokenized equities only redeem during stock-market hours are inaccurate. Availability must be checked per instrument and route. [S5–S6]

xStocks' partner page describes collateral backing, jurisdiction restrictions and balance rebasing for corporate actions. Kraken's disclosure explains that exposure is not ownership of the underlying company shares. Distinguish the economic treatment of dividends from shareholder voting or distribution rights. [S7–S8]

Provider pages can differ by venue and update date. Do not infer asset availability, spreads or trading hours from a different venue's FAQ. Contract addresses, prospectuses, final terms and integration tests remain outstanding.

## Source register

| ID | Primary source | Supports / limits |
|---|---|---|
| S1 | [Chamber overview](https://docs.chamberfi.com/introduction/what-is-chamber) | Managed vaults, shares, guardrails; provider description, not security verification |
| S2 | [dHEDGE to Chamber](https://docs.chamberfi.com/introduction/dhedge-to-chamber) | Explicit rebrand and stated product continuity |
| S3 | [Enzyme policies](https://docs.enzyme.finance/enzyme-blue-protocol/topics/policies) | Examples of manager and investor constraints |
| S4 | [Enzyme subscription controls](https://docs.enzyme.finance/onyx-user-documentation/enzyme-vault/subscription/control) | Whitelisting and share-transfer configuration; separate product documentation from S3 |
| S5 | [Ondo Stocks](https://ondo.finance/ondo-stocks) | Product access and redemption conditions; marketing claims require diligence |
| S6 | [Ondo 24/7 minting announcement](https://ondo.finance/blog/real-24-7-trading-for-tokenized-stocks) | 25 June 2026 announcement for selected assets, not universal availability |
| S7 | [xStocks partner information](https://xstocks.com/partner) | Partner restrictions, backing and corporate-action mechanics |
| S8 | [Kraken xStocks risk disclosure](https://www.kraken.com/legal/xstocks) | Underlying-share rights and issuer/counterparty risks; venue-specific |
| S9 | [SEC ETF investor bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-24) | US registered ETF mechanics, not a global legal definition |
| S10 | [SC Malaysia licensing](https://www.sc.com.my/regulation/licensing) | Lists regulated activities including fund management and investment advice |
| S11 | [SC Malaysia digital guidelines](https://www.sc.com.my/development/digital/guidelines) | Relevant regulatory entry points; not approval for this model |
| S12 | [SC Malaysia regulatory FAQs](https://www.sc.com.my/regulation/regulatory-faqs) | Includes tokenised capital-market-product guidance; detailed application unresolved |

## Evidence gaps

Target-segment interviews; funded customer demand; actual competing vault costs and retention; provider approval for pooled investment use; issuer and custodian legal diligence; executable liquidity at intended trade sizes; contract permissions and audit scope; and a jurisdiction-specific legal analysis.

Category growth does not establish demand for a new managed-portfolio marketplace. Do not mix token trading volume, assets under management, and platform revenue when sizing the opportunity.
