# Route handlers

Server-only code. This is where the Binance Web3 API calls belong.

Anything under `app/api/` runs on the server, so the API key and secret never
reach the browser. Read them from `process.env` here — never prefix them with
`NEXT_PUBLIC_`, which would inline them into the client bundle.

Requests to `https://web3.binance.com` are signed HMAC-SHA256 over
`timestamp + method + path + body` with no separators, sent as `X-OC-APIKEY`,
`X-OC-TIMESTAMP` and `X-OC-SIGN`. The signed path must include the `/build`
prefix exactly as it appears on the wire.

Docs: https://web3.binance.com/en/dev-docs/authentication

Slice 1 (read-only instrument discovery) lands here as `rwa/route.ts`, calling
the Market API's RWA endpoints and returning real instrument metadata to replace
the fictional assets in `lib/domain/vault.ts`.
