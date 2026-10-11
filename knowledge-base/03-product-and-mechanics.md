# Product and mechanics

Everything below is a proposed design, not an implemented system.

## Core flow

1. A manager submits identity, strategy, permitted assets, benchmark, limits, fees and withdrawal terms.
2. The platform evaluates the manager and confirms that the proposed asset and investor access route is viable.
3. A segregated vault is deployed with approved integrations and constrained trading permissions.
4. An eligible investor reviews the mandate, costs and risks, deposits the accepted asset, and receives vault shares under a published pricing policy.
5. The manager rebalances; holdings, mandate changes, fees and performance are recorded.
6. The investor requests redemption; shares are settled and burned against the appropriate proceeds, following liquidity and eligibility rules.

The manager should not be able to transfer vault assets to an arbitrary personal address. That control alone does not prevent loss: manipulated trades, malicious integrations, excessive costs and issuer failures still matter.

## Accounting

Illustrative accounting, before implementation-specific rounding and fee rules:

- NAV = fair value of vault assets minus liabilities and accrued fees.
- Share price = NAV / outstanding shares.
- New shares = net accepted deposit value / pre-deposit share price.
- Redemption value = shares redeemed × applicable settlement share price, minus disclosed costs.

Example: a vault has $100,000 NAV and 10,000 shares, so each share represents $10. A $1,000 net deposit receives 100 shares. After issuance, $101,000 divided by 10,100 remains $10. Market movements and costs change this value; deposits alone should not manufacture returns.

Specify initial issuance, donations, rounding, decimal handling, stale prices, rebasing assets and accrued fees. Use forward pricing or another validated dealing method when current executable prices are unavailable. A dashboard estimate is not necessarily a redemption quote.

For performance reporting, use time-weighted returns to compare strategies and investor-specific cash-flow returns for personal outcomes. Show net-of-fee results, inception date, benchmark, drawdown, exposure, and live-versus-backtest status. Preserve closed and failed vault history to reduce survivorship bias.

## Risk-based discovery

An investor's stated risk appetite is only one input. Time horizon, need for liquidity, experience, capacity for loss and eligibility also matter. Start with transparent filters; personalized recommendations need a separately assessed advice/suitability model.

Show distinct dimensions rather than a single reassuring score: market volatility, concentration, leverage, exit liquidity, issuer/custodian exposure, contract/admin exposure and manager behavior. An equity-light portfolio may still carry substantial stablecoin or issuer risk.

## MVP recommendation

One chain, one approved asset access route, one deposit denomination and a small curated set of managers. Select these only after eligibility and liquidity checks. Use existing reviewed vault infrastructure if integration diligence supports it.

Include mandate pages, wallet onboarding and required eligibility checks, deposits, monitored rebalances, transparent valuation, fee reporting, redemption queues where necessary, emergency procedures and manager history.

Exclude from the first experiment: leverage, lending vault shares as collateral, bridges, unrestricted assets, anonymous featured managers, instant-liquidity promises and a platform token. Revisit these only when evidence supports the extra complexity.

Use simulated strategy prototypes such as a broad equity allocation, an equity-plus-reserve allocation, and a concentrated theme. These illustrate different mandates, not investment recommendations or validated risk categories.

## Controls to specify before live funds

Asset/protocol allowlists; trade-size and slippage checks; manager permission boundaries; stale-price rejection; deposit/redemption synchronization; fee caps and notice periods; admin and upgrade authority; a response to unavailable issuer redemption; and a documented recovery path.

Portfolio weight limits require careful design: market moves can cause passive breaches. Distinguish prohibited trades from drift requiring rebalancing. A pause mechanism must explain which operations stop and how investors can eventually exit.

Acceptance scenarios include: issuer freeze; weekend price gap; failed redemption; manager key compromise; stablecoin depeg; corporate-action rebase; stale oracle; a large investor exit; and platform front-end outage. Security review must cover integrations and governance as well as the vault contract.
