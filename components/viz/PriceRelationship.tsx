'use client';

import {CategoryBars} from './CategoryBars';

export interface RatioBucket {
  label: string;
  value: number;
  color: string;
  note?: string;
}

export interface PriceSample {
  symbol: string;
  tokenPrice: number;
  referencePrice: number;
  ratio: number;
  residualPct: number;
}

/**
 * Shows what the two price fields on /rwa/tokens actually are. They are not two
 * independent observations: tokenPrice is referencePrice x tokenToShareRatio,
 * so the difference between them carries no market information.
 */
export function PriceRelationship({
  buckets,
  samples,
  maxResidualPct,
}: {
  buckets: RatioBucket[];
  samples: PriceSample[];
  maxResidualPct: number;
}) {
  return (
    <div>
      <div className="mb-5 rounded-lg border border-[#e8d9b0] bg-[#fdfaf0] p-4">
        <p className="text-[13px] font-semibold text-[#8a6d1f]">
          These are not two independent prices.
        </p>
        <p className="mt-1 text-[13px] leading-[1.65] text-muted-2">
          Across all {samples.length > 0 ? 'checked' : ''} instruments,{' '}
          <code className="font-mono text-[12px]">tokenPrice</code> equals{' '}
          <code className="font-mono text-[12px]">referencePrice x tokenToShareRatio</code> to
          within {maxResidualPct.toExponential(1)}%. Subtracting one from the other measures the
          share ratio, not a market gap.
        </p>
      </div>

      <h3 className="mb-2 text-[13px] font-semibold">Worked examples</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="pb-2 pr-3 font-medium">Token</th>
              <th className="pb-2 pr-3 text-right font-medium">tokenPrice</th>
              <th className="pb-2 pr-3 text-right font-medium">referencePrice</th>
              <th className="pb-2 pr-3 text-right font-medium">ratio</th>
              <th className="pb-2 text-right font-medium">residual</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {samples.map((sample) => (
              <tr key={sample.symbol} className="border-b border-line">
                <td className="py-2 pr-3 font-sans font-medium">{sample.symbol}</td>
                <td className="py-2 pr-3 text-right">{sample.tokenPrice.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right">{sample.referencePrice.toFixed(4)}</td>
                <td className="py-2 pr-3 text-right text-[#2a78d6]">
                  x{sample.ratio.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}
                </td>
                <td className="py-2 text-right text-[#0ca30c]">
                  {sample.residualPct === 0 ? '0' : sample.residualPct.toExponential(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-2 mt-6 text-[13px] font-semibold">
        Share ratios across the universe — this part is real
      </h3>
      <p className="mb-3 text-[13px] leading-[1.6] text-muted-2">
        One token does not always mean one share. This matters for vault accounting: a basket that
        treats every token as one share will misprice the 10:1 instruments by an order of
        magnitude.
      </p>
      <CategoryBars rows={buckets} unit=" tokens" />

      <div className="mt-5 rounded-lg bg-[#f1f4f8] p-3">
        <p className="text-[13px] font-semibold">Where a real divergence signal would come from</p>
        <p className="mt-1 text-[13px] leading-[1.65] text-muted-2">
          An executable on-chain price, not a derived one — the aggregator quote{' '}
          <code className="font-mono text-[12px]">GET /api/v1/dex/aggregator/quote</code> returns
          what a trade would actually fill at. Compare that against{' '}
          <code className="font-mono text-[12px]">referencePrice x tokenToShareRatio</code> and the
          difference is genuine. That is one quote per instrument, so it is a per-basket call, not
          a universe-wide sweep.
        </p>
      </div>
    </div>
  );
}
