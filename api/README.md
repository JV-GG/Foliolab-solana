# Binance Web3 API explorer

A read-only probe for finding out what each Binance Web3 API endpoint actually
returns. Standalone — no framework, no build step, runs on Node 24's native
TypeScript support. It will survive the Vite migration unchanged.

Related PRD task: **BE-01** (Vincent). This is an exploration tool, not the
backend integration itself.

## Setup

1. Create a project at <https://web3.binance.com/en/dev-portal/project> and
   generate an API key + secret.
2. Put them in the repo-root `.env.local` (copy `.env.example`); the CLI reads it too. `api/.env` still works as a fallback.
3. Optionally set `PROBE_ADDRESS` to any BSC wallet you want to inspect — it is
   only ever read.

## Use

```bash
node api/probe.ts                  # list all 34 endpoints
node api/probe.ts --all            # probe everything
node api/probe.ts rwa              # probe the whole RWA group
node api/probe.ts rwa.tokens       # probe one endpoint
node api/probe.ts rwa.tokens --raw # also print full JSON
node api/signcheck.ts              # verify signing, no credentials needed
```

Each run prints the response **shape** — key names, types and sample values —
rather than dumping the whole payload. Full JSON is written to
`api/responses/<id>.json` (git-ignored) for when you need the detail.

Failures print the API's own error text, which is how you discover the
parameters an endpoint actually wants.

## Safety

**Everything in the catalogue is read-only. Nothing here can move funds.**

These endpoints exist but are deliberately excluded from `endpoints.ts`:

| Endpoint | Why excluded |
|---|---|
| `/aggregator/swap` | Builds an unsigned swap transaction |
| `/aggregator/quote-and-swap` | Quote plus unsigned transaction |
| `/aggregator/approve-transaction` | Builds an ERC-20 approval |
| `/aggregator/order/submit` | Submits a signed RFQ order |
| `.../broadcast-transaction` | **Broadcasts on mainnet** |

`trading.quote` is included and is safe: it returns a price and executes nothing.
It is also the endpoint that reveals `executionMode` — `SWAP` for ordinary
tokens, `RFQ` for equity/RWA tokens, which is the flow tokenized stocks use.

Everything targets **BSC mainnet (chainId 56)**. There is no testnet for this
API — it reads real chain state.

## Layout

| File | Purpose |
|---|---|
| `client.ts` | HMAC-SHA256 signing and the signed `fetch`. ~100 lines, deliberately transparent. |
| `endpoints.ts` | The catalogue. Add endpoints here. |
| `probe.ts` | CLI runner. |
| `shape.ts` | Turns a JSON response into a type tree. |
| `signcheck.ts` | Verifies signing against the documented example. |

## Parameter conventions (verified live, 18 Sep 2026)

The docs' parameter tables render client-side and cannot be read. These were
established by probing mainnet and reading the `40001` error messages:

| Convention | Value |
|---|---|
| Chain parameter | `binanceChainId` — **not** `chainId` |
| Token parameter | `tokenContractAddress` — **not** `tokenAddress` |
| Plural exception | `rwa/price` takes `tokenContractAddresses` (plural) |
| `token/search` | takes `chains` and `search`, not `binanceChainId`/`keyword` |
| Enums are numeric | `trackerType=1`, `timeFrame=1`, `sortBy=1` — not strings |
| POST endpoints | still need `binanceChainId` + `tokenContractAddress` in the **query string**, not only the body |
| Errors return HTTP 200 | check `success: false` / `code`, not the status code |

That last one matters for the backend: a failed call is still `HTTP 200`.

## Known gaps

- **Transaction API and DeFi API are missing.** Their exact paths are not stated
  on any docs page that could be read. Add them from the REST reference rather
  than guessing.
- **9 endpoints need `PROBE_ADDRESS` or `PROBE_TXHASH`** in `.env.local` before
  they will run. Any BSC address works; it is only read.
- `leaderboard` accepts several `timeFrame`/`sortBy` integers; only `1` was
  confirmed. Map the rest if you need them.
- An official SDK exists (`@binance-web3/wallet`) if you would rather not
  maintain the signing yourself.

## If every call times out (`UND_ERR_CONNECT_TIMEOUT`)

Run `node api/doctor.ts` first — it distinguishes DNS, TCP, TLS, HTTP and auth
failures instead of leaving you with a bare "fetch failed".

Observed on this project (19 Sep 2026): the local resolver returned a single
Telekom Malaysia address, `175.139.142.25`, for *every* Binance hostname, while
public DNS returned the real CloudFront addresses. Those real addresses connect
in under 10ms and answer with HTTP 401, so the API itself is fine — the name
just does not resolve correctly. Malaysia has previously ordered ISP-level
blocks on Binance domains, so treat this as an environment fact rather than a
bug in the app.

Two ways to fix it:

**In the project, no root needed.** Set `BINANCE_WEB3_DNS=1.1.1.1` in `.env.local`.
Requests then resolve through that server instead of the system resolver; TLS
still validates against the real hostname, so nothing is weakened. This is what
is currently enabled here, and it applies to both the CLI and the Next app.

**System-wide, permanent.** Point the machine at a working resolver — the doctor
prints the exact WSL commands. This also fixes curl, the browser and every other
tool, and lets you remove `BINANCE_WEB3_DNS`. Note WSL regenerates
`/etc/resolv.conf` on each start, so it needs `generateResolvConf = false` in
`/etc/wsl.conf` — and that file may already have `[boot]`/`[user]` sections, so
append rather than overwrite.

Two knock-on effects worth planning for:

- **Teammates on the same ISP will hit this too.** Worth telling Vincent before
  he starts BE-01.
- **Hosted deploys are unaffected** — Vercel, Railway and similar resolve
  normally, so the demo deployment will not inherit the problem. Only local
  development does.

## If you get `40102 Invalid signature`

The signed path must include the `/build` prefix exactly as sent. `client.ts`
signs and sends the identical string, so this should not happen — but if it
does, compare `signedPath` in the saved response JSON against the request URL.
