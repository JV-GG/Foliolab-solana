# Developer-experience notes: raw facts, NOT the report

These are facts gathered from the repo, commit history and code comments, for the team to use when
writing the developer-experience report. **The organisers reject AI-written reports.** Write the
report yourselves, in your own words, from what you actually lived through. Delete, correct or
add to anything here. Each fact says where it came from so you can check it.

## Binance Web3 API

- **Docs could not be read for parameters.** The parameter tables render client-side, so
  parameter names were worked out by probing mainnet and reading `40001` error messages.
  Source: `api/README.md`, verified 18 Sep 2026.
- **Parameter naming is inconsistent:**
  - the chain parameter is `binanceChainId`, not `chainId`
  - the token parameter is `tokenContractAddress`, not `tokenAddress`, but `rwa/price` takes the plural `tokenContractAddresses`
  - `token/search` takes `chains` and `search`
  - enums are numbers (`trackerType=1`), not strings
  - POST endpoints still need some fields in the query string

  Source: `api/README.md`.
- **Errors come back as HTTP 200** with `success: false`, so the status code can't be trusted.
  Source: `api/README.md`, `AGENTS.md`.
- **Request signing.** HMAC-SHA256 over `timestamp + method + path + body`, and the signed
  path has to include the `/build` prefix. Otherwise you get `40102 Invalid signature`.
  Source: `app/api/README.md`, `api/README.md`.
- **No testnet.** Everything reads real BSC mainnet state, so the team built against an anvil
  fork of mainnet instead. Source: `api/README.md`, `AGENTS.md`.
- **Transaction API and DeFi API paths** weren't stated on any docs page the team could read.
  Source: `api/README.md` "Known gaps".
- **Some RWA tokens use the `RFQ` execution mode**, revealed only by `trading.quote`
  (`SWAP` for ordinary tokens). Source: `api/README.md`.
- **Swap details verified 10 Oct:**
  - the swap's `tx.to` equals the quote's `approveTarget`
  - Ondo quotes need `userWalletAddress` set to the vault contract, not the user
  - `/swap` needs `quoteId` and `slippagePercent`

  Source: `AGENTS.md`.

## Network / environment

- **Malaysian ISP DNS sinkhole.** On 19 Sep 2026 the local resolver returned one Telekom
  Malaysia address (`175.139.142.25`) for every Binance hostname, so every call failed with
  `UND_ERR_CONNECT_TIMEOUT`. Fixed by resolving through 1.1.1.1 (`BINANCE_WEB3_DNS`), and the
  team built `api/doctor.ts` to tell DNS, TCP, TLS, HTTP and auth failures apart.
  Source: `api/README.md`, `lib/binance/client.ts`.

## Tokenized stocks on BSC

- **Liquidity was the real limit.** Fork survey on 10 Oct, Binance route vs signed price at
  200 / 1,000 USDT:
  - AAPLon, NVDAon, AVGOon and TSMon filled within 1%
  - GOOGLon only filled at 200
  - MSFTon returned about $0
  - AMZNon, AMDon, QQQon and SPYon lost 6–96%
  - METAon and TSLAon could not be quoted

  Source: `AGENTS.md`, commit `7db9680`.
- **No reliable on-chain price feed** for these tokens on BSC, so deposits use backend-signed
  EIP-712 prices. Source: `contracts/README.md`, `AGENTS.md`.
- **Ondo tokens trade off-hours and at weekends.** On 10 Oct the team decided to check the
  token's own trading status (`reasonCode`), not US market hours. Source: `lib/pricing/rules.ts`.
- **Dust.** 1 wei of a sold stock kept it in the vault's held list forever. Found in review and
  fixed before the mainnet deploy by treating ≤ 1/1,000,000 of a token as dust.
  Source: `contracts/KNOWN_ISSUES.md` #2.

## Tooling and process

- **Next.js 16 breaking changes** meant agents had to read `node_modules/next/dist/docs/`
  instead of relying on older knowledge. Source: `AGENTS.md`.
- **The spec's 24 h governance timelock** would have blocked every allowlist change before the
  deadline, so the mainnet deploy skips it. Source: `contracts/script/Deploy.s.sol`.
- **AI security review.** 3 passes, 36 review agents, on 10 Oct. Six findings, one fixed, the
  rest accepted for the demo. Source: `contracts/KNOWN_ISSUES.md`.
- **Timeline from git.** Research and PRD on 18 Sep. Contracts, backend, investor UI and curator
  console on 10 Oct. Mainnet addresses and on-chain history on 11 Oct.

## Things only you know (fill in yourselves)

- How long the first successful Binance API call took, and what blocked it
- Latency you saw, and any failed simulations or reverted transactions on the fork or mainnet
- What was confusing in the BNB Chain / Ondo / Binance docs, with exact URLs
- What you'd ask Binance or BNB Chain to change
- What the mainnet run was like: gas, approvals, wallet UX
