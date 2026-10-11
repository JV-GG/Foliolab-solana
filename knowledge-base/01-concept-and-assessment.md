# Concept and assessment

## What the product is

A marketplace where strategy creators establish investment mandates, investors contribute assets into segregated smart-contract vaults, and authorized managers rebalance within published rules. Investors receive portfolio shares that account for their proportional participation. The legal rights attached to those shares still require definition.

The platform is the launchpad and distribution layer. Each vault is a separate investment product. A platform governance token, if ever introduced, would be a third and separate instrument; it is unnecessary for testing the core product.

Proposed positioning: **A marketplace of onchain investment portfolios with visible holdings, enforceable strategy limits, and clear withdrawal terms.**

## Is this a decentralized ETF or unit trust?

Economically, yes: investors pool money, a strategy allocates it, fees are charged, and investors share gains and losses. Legally and operationally, the analogy has limits.

| Dimension | Typical open-ended unit trust / mutual fund | ETF | Proposed vault |
|---|---|---|---|
| Investor interest | Units or shares in a pooled vehicle | Shares in a pooled vehicle | Tokenized vault shares; legal claim to be designed |
| Entry and exit | Subscribe/redeem under fund dealing rules | Retail normally trades on exchange; authorized participants create/redeem | Direct deposit/redemption, potentially queued |
| Price | Dealing NAV under valuation policy | Market price may differ from NAV | NAV-based accounting; any secondary price may differ |
| Management | Active or passive | Active or passive | Human, rules-based, or automated |
| Safeguards | Applicable fund law, governance and service providers | Applicable fund and exchange rules | Code plus the applicable legal and operational structure |

The ETF mechanics above are grounded in the [SEC investor bulletin](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-24). Unit-trust details vary by jurisdiction; the comparison is conceptual, not a classification opinion.

A vault accepting subscriptions and redemptions is closer operationally to an open-ended fund. Transferable shares and a liquid secondary market add ETF-like behavior, but listing a token on a DEX does not establish ETF status or guarantee arbitrage back to NAV. Nor does choosing an index strategy make it an ETF.

## Customer problem hypotheses

Investor job: “I already hold assets onchain and want a managed allocation without selecting and rebalancing every holding myself.” Current alternatives include a broker-held ETF, buying a tokenized ETF, manually holding tokenized shares, and existing managed vaults.

Manager job: “I have a repeatable strategy and an audience, and want to manage eligible outside capital without building all the investment infrastructure.” The platform cannot assume software removes managers' licensing obligations.

Possible value: lower operational friction, observable holdings and fees, constrained manager permissions, and comparable strategy reporting. None proves willingness to pay. A tokenized broad-market ETF may already satisfy much of the investor need with fewer layers.

## Strategic options

| Approach | Main attraction | Main weakness |
|---|---|---|
| Open creator launchpad | Broad creator supply | Trust, weak strategies, distribution and legal complexity |
| Curated manager marketplace | Easier initial quality control | Operationally intensive; still needs differentiation |
| Rules-based thematic baskets | Clear mandate and reproducibility | Easily copied; overlap with ETFs |
| Personalized individual vaults | User-specific constraints | More costs and suitability complexity |
| Infrastructure for licensed managers | Defined business customers | Longer sales cycles and integration demands |
| Portfolio analytics first | Cheap way to test discovery and comparison | Does not itself meet managed-investment demand |

**Recommended experiment:** a curated marketplace in one eligible segment with two or three simple strategy prototypes. This intentionally narrows the founder's eventual open-launchpad vision while testing demand.

## What could make it defensible

A manager network with demonstrable skill and an audience; a distribution partner; reliably enforced mandates; credible, comparable performance data; or superior eligibility and exit handling in a specific market. These are potential advantages, not current assets.

The strongest argument against building: a customer can buy a tokenized ETF or use an established vault protocol, while this platform adds fees, contract exposure, and another operational dependency. Proceed only if users identify a concrete benefit that outweighs those costs.
