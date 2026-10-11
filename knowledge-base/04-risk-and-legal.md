# Risk and legal questions

This is product issue-spotting, not a legal classification. Launch jurisdiction and investor segment remain undecided. Malaysia is included only as a conditional example, not an assumed target market.

## What can be decentralized?

| Layer | Potential onchain component | Remaining dependency |
|---|---|---|
| Portfolio accounting | Shares, holdings, fee rules | Oracle quality and valuation policy |
| Manager authority | Enforced trade permissions | Strategy judgment, keys and governance |
| Tokenized stock | Transfer and token custody | Issuer, legal claim, stock custodian and corporate actions |
| Entry and exit | Vault requests and settlement | Market depth, issuer access, eligibility and operational availability |
| Platform | Published contracts and alternative interfaces | Hosting, admin powers, compliance and incident operators |

“Non-custodial” must be precise: an investor may hold a receipt token while assets sit in a contract. That does not remove issuer/custodian exposure or establish insolvency protection.

## Risk register

| Risk | Failure scenario | Proposed response / remaining exposure |
|---|---|---|
| Legal eligibility | Investors can buy vault shares but the vault cannot legally access or redeem its assets | Confirm issuer terms and legal structure before offering; downstream transfer controls if needed |
| Issuer/custodian | Asset backing becomes inaccessible | Review enforceable claims and concentration; onchain transparency cannot eliminate insolvency risk |
| Liquidity | Portfolio shares promise fast exits while underlying liquidity disappears | Capacity limits, disclosed dealing windows/queues, stress tests and fair allocation of exit costs |
| Valuation | Stale stock price lets one investor dilute others | Validated prices, deviation limits, controlled dealing and visible price timestamps |
| Manager abuse | Allowed trade extracts value through an illiquid or related venue | Asset/venue restrictions, price bounds, monitoring and conflicts policy |
| Concentration | Several holdings depend on the same issuer or sector | Report underlying and provider concentration separately |
| Contract/admin | Exploit or upgrade changes investor protections | Reviewed code, constrained keys, change notices and incident response |
| Stablecoin | Reserve/deposit asset loses value or is frozen | Explicit exposure reporting and contingency procedures; never label it risk-free cash |
| Performance marketing | Short lucky record ranks above robust strategies | Minimum observation periods, benchmark comparison, closed-vault history and net returns |
| Fees | Frequent trades or resets reward managers despite poor investor outcomes | Cost transparency; carefully designed high-water marks and cash-flow equalization if performance fees apply |

## Legal workstream

Assess separately: the portfolio share, underlying token, manager activity, platform operation, solicitation/distribution, custody/control, secondary trading and any personalized advice. A DAO or permissionless contract is not, by itself, an answer to these questions.

In Malaysia, the SC lists fund management, securities dealing and investment advice among regulated activities. Its digital guidelines and tokenisation FAQ entry points are relevant starting materials. This does not establish which permissions this platform needs. [SC licensing](https://www.sc.com.my/regulation/licensing), [digital guidelines](https://www.sc.com.my/development/digital/guidelines), [regulatory FAQs](https://www.sc.com.my/regulation/regulatory-faqs).

Questions for jurisdiction-specific counsel and providers:

1. What entity operates the platform and each pool, and what rights does a share legally convey?
2. Which investors may be solicited, admitted, and receive transferred shares?
3. Which permissions apply to platform, curator and discretionary manager roles?
4. May the chosen issuer's instruments be held in pooled vaults and distributed through this model?
5. Who can redeem directly, and what happens if that party is unavailable or ineligible?
6. What disclosure, reporting, safeguarding, marketing, sanctions and tax obligations follow?
7. What happens on manager removal, platform shutdown, issuer insolvency or contract upgrade?

Obtain a defined route to lawful operation before accepting live capital. A non-US audience is not a single regulatory market.
