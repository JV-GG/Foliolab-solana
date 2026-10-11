/**
 * The two execution paths the Trading API exposes. Which one applies is decided
 * by `executionMode` on the quote response — RFQ is the path tokenized equities
 * take, which is why it matters here.
 */
const SWAP_STEPS = [
  {call: 'GET /aggregator/quote', note: 'quoteId, expires ~30s'},
  {call: 'GET /aggregator/approve-transaction', note: 'only if allowance is short'},
  {call: 'GET /aggregator/swap', note: 'returns unsigned tx'},
  {call: 'sign locally', note: 'wallet signs — key never leaves the client'},
  {call: 'POST /broadcast-transaction', note: 'returns txHash'},
  {call: 'GET /transaction-detail-by-txhash', note: 'poll until confirmed'},
];

const RFQ_STEPS = [
  {call: 'GET /aggregator/quote', note: 'returns executionMode=RFQ + vendorName'},
  {call: 'GET /aggregator/approve-transaction', note: 'scoped to that vendor'},
  {call: 'GET /aggregator/swap', note: 'returns rfq.typedDataToSign'},
  {call: 'sign EIP-712', note: 'eth_signTypedData_v4, signer must match quote'},
  {call: 'POST /aggregator/order/submit', note: 'userSignature + quoteId + requestId'},
  {call: 'GET /aggregator/order/{orderId}', note: 'authoritative status, not Wallet API'},
];

function Track({
  title,
  badge,
  badgeColor,
  steps,
  accent,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  steps: {call: string; note: string}[];
  accent: string;
}) {
  return (
    <div className="flex-1">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold text-white"
          style={{background: badgeColor}}
        >
          {badge}
        </span>
      </div>
      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <li key={step.call} className="relative pl-6">
            <span
              aria-hidden
              className="absolute left-[7px] top-0 h-full w-[2px]"
              style={{background: i === steps.length - 1 ? 'transparent' : accent, opacity: 0.25}}
            />
            <span
              aria-hidden
              className="absolute left-0 top-[6px] grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white"
              style={{background: accent}}
            >
              {i + 1}
            </span>
            <div className="pb-4">
              <code className="font-mono text-[12px] text-ink">{step.call}</code>
              <p className="mt-0.5 text-[11px] leading-[1.5] text-muted-2">{step.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ExecutionFlow() {
  return (
    <div className="flex flex-col gap-8 sm:flex-row sm:gap-10">
      <Track
        title="Ordinary tokens"
        badge="SWAP"
        badgeColor="#2a78d6"
        accent="#2a78d6"
        steps={SWAP_STEPS}
      />
      <Track
        title="Tokenized equities"
        badge="RFQ"
        badgeColor="#eb6834"
        accent="#eb6834"
        steps={RFQ_STEPS}
      />
    </div>
  );
}
