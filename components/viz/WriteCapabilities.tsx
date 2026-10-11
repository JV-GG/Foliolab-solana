/**
 * Write-side endpoints, described but never called. Nothing on this page can
 * move funds; these are listed so the capability surface is visible.
 */
const WRITE_ENDPOINTS = [
  {
    path: 'GET /api/v1/dex/aggregator/approve-transaction',
    does: 'Builds ERC-20 approval calldata for the router or RFQ vendor.',
    returns: 'Unsigned calldata + spender address + gas fields.',
    risk: 'builds',
  },
  {
    path: 'GET /api/v1/dex/aggregator/swap',
    does: 'Builds the swap transaction for a held quoteId.',
    returns: 'Unsigned tx payload, or rfq.typedDataToSign for equities.',
    risk: 'builds',
  },
  {
    path: 'GET /api/v1/dex/aggregator/quote-and-swap',
    does: 'Quote and unsigned transaction in a single call.',
    returns: 'Quote plus unsigned tx.',
    risk: 'builds',
  },
  {
    path: 'POST /api/v1/dex/aggregator/order/submit',
    does: 'Submits a signed EIP-712 RFQ order to the vendor.',
    returns: 'orderId to poll. This is how tokenized equities actually trade.',
    risk: 'sends',
  },
  {
    path: 'POST /api/v1/dex/.../broadcast-transaction',
    does: 'Broadcasts a signed transaction to the chain.',
    returns: 'txHash.',
    risk: 'sends',
  },
] as const;

const RISK_STYLE = {
  builds: {label: 'Builds unsigned payload', color: '#fab219', icon: '▲'},
  sends: {label: 'Sends to mainnet', color: '#d03b3b', icon: '■'},
} as const;

export function WriteCapabilities() {
  return (
    <div>
      <div className="mb-4 rounded-lg border border-[#e0b4b4] bg-[#fdf6f6] p-3">
        <p className="text-[13px] leading-[1.6] text-[#ad354b]">
          <strong>None of these are called by this page.</strong> They are listed for reference
          only. The probe catalogue in <code className="font-mono">api/endpoints.ts</code> excludes
          them for the same reason.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="pb-2 pr-4 font-semibold">Endpoint</th>
              <th className="pb-2 pr-4 font-semibold">What it does</th>
              <th className="pb-2 font-semibold">Effect</th>
            </tr>
          </thead>
          <tbody>
            {WRITE_ENDPOINTS.map((endpoint) => {
              const risk = RISK_STYLE[endpoint.risk];
              return (
                <tr key={endpoint.path} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <code className="font-mono text-[11px] text-ink">{endpoint.path}</code>
                  </td>
                  <td className="py-3 pr-4 text-muted-2">
                    {endpoint.does}
                    <br />
                    <span className="text-[12px] text-ink-muted">{endpoint.returns}</span>
                  </td>
                  <td className="whitespace-nowrap py-3">
                    <span className="flex items-center gap-1.5" style={{color: risk.color}}>
                      <span aria-hidden>{risk.icon}</span>
                      <span className="text-[12px] text-ink">{risk.label}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] leading-[1.7] text-muted-2">
        The split that matters: <strong>builds</strong> endpoints return an unsigned payload and are
        harmless on their own — the API never receives a private key. Only a wallet signature plus a{' '}
        <strong>sends</strong> call moves anything.
      </p>
    </div>
  );
}
