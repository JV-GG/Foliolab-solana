/**
 * /api-visual — what the Binance Web3 API actually returns, drawn.
 *
 * A Server Component: every call is made on the server, so the API secret never
 * enters the client bundle. Rendered per request because it reports live
 * mainnet state; `fetch` is uncached by default in Next 16, and force-dynamic
 * keeps it out of the build-time prerender.
 */
import {
  getMarketChains,
  getRwaPlatforms,
  getRwaTokens,
  getTradingChains,
  getWalletChains,
} from '@/lib/binance/queries';
import type {Chain, Outcome, RwaToken} from '@/lib/binance/types';
import {CategoryBars} from '@/components/viz/CategoryBars';
import {
  PriceRelationship,
  type PriceSample,
  type RatioBucket,
} from '@/components/viz/PriceRelationship';
import {ExecutionFlow} from '@/components/viz/ExecutionFlow';
import {Panel, StatTile, Unavailable} from '@/components/viz/primitives';
import {StatusBreakdown} from '@/components/viz/StatusBreakdown';
import {WriteCapabilities} from '@/components/viz/WriteCapabilities';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'API visual — Binance Web3 data',
  description: 'What each Binance Web3 API endpoint returns, visualised from live mainnet data.',
};

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * tokenPrice is derived: referencePrice x tokenToShareRatio. The residual below
 * measures how exactly that holds, and it is effectively zero for every token —
 * which is why the pair carries no divergence signal.
 */
function priceSamples(tokens: RwaToken[], limit: number): PriceSample[] {
  return tokens
    .map((token) => {
      const tokenPrice = toNumber(token.tokenPrice);
      const referencePrice = toNumber(token.referencePrice);
      const ratio = toNumber(token.tokenToShareRatio);
      if (tokenPrice === null || referencePrice === null || ratio === null) return null;
      const implied = referencePrice * ratio;
      if (implied === 0) return null;
      return {
        symbol: token.tokenSymbol,
        tokenPrice,
        referencePrice,
        ratio,
        residualPct: Math.abs((tokenPrice - implied) / implied) * 100,
      };
    })
    .filter((sample): sample is PriceSample => sample !== null)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);
}

function maxResidual(tokens: RwaToken[]): number {
  return priceSamples(tokens, tokens.length).reduce((worst, s) => Math.max(worst, s.residualPct), 0);
}

function ratioBuckets(tokens: RwaToken[], colors: string[]): RatioBucket[] {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    const ratio = toNumber(token.tokenToShareRatio);
    if (ratio === null) continue;
    const label =
      ratio === 1 ? '1 : 1' : ratio >= 1.5 ? `${Math.round(ratio)} : 1` : 'fractional (~1:1)';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value], i) => ({label, value, color: colors[i % colors.length]}))
    .sort((a, b) => b.value - a.value);
}

function countBy<T>(items: T[], key: (item: T) => string): {label: string; value: number}[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, value]) => ({label, value}))
    .sort((a, b) => b.value - a.value);
}

function ChainPanel({
  results,
}: {
  results: {label: string; outcome: Outcome<Chain[]>}[];
}) {
  const ok = results.filter((r) => r.outcome.ok);
  if (ok.length === 0) {
    const first = results[0].outcome;
    return (
      <Unavailable
        error={first.ok ? 'unknown' : first.error}
        endpoint="GET /api/v1/dex/{market,balance,aggregator}/supported/chain"
      />
    );
  }

  const rows = results.map((result, i) => ({
    label: result.label,
    value: result.outcome.ok ? result.outcome.data.length : 0,
    color: SERIES[i % SERIES.length],
    note: result.outcome.ok
      ? result.outcome.data
          .map((chain) => chain.shortName)
          .slice(0, 22)
          .join(' · ')
      : `unavailable — ${result.outcome.error}`,
  }));

  return (
    <>
      <CategoryBars rows={rows} unit=" chains" />
      <p className="mt-3 text-[12px] leading-[1.6] text-muted-2">
        Hover a bar to list the chains. Coverage differs per module — a chain that quotes may not
        report balances, which is worth knowing before you assume one address works everywhere.
      </p>
    </>
  );
}

export default async function ApiVisualPage() {
  const [tokens, platforms, marketChains, walletChains, tradingChains] = await Promise.all([
    getRwaTokens(),
    getRwaPlatforms(),
    getMarketChains(),
    getWalletChains(),
    getTradingChains(),
  ]);

  const samples = tokens.ok ? priceSamples(tokens.data, 6) : [];
  const buckets = tokens.ok ? ratioBuckets(tokens.data, SERIES) : [];
  const residual = tokens.ok ? maxResidual(tokens.data) : 0;
  const tradable = tokens.ok
    ? tokens.data.filter((t) => t.statusInfo?.reasonCode === 'TRADING').length
    : 0;

  return (
    <main className="mx-auto max-w-[1500px] px-[5%] pb-16 pt-8 sm:pt-11">
      <header className="mb-8">
        <p className="mb-3 text-[12px] font-[750] tracking-[2px] text-[#738195]">
          BINANCE WEB3 API — LIVE BSC MAINNET
        </p>
        <h1 className="mb-[10px] text-[clamp(26px,3vw,40px)] leading-[1.15] tracking-[-1.4px]">
          What the API actually returns.
        </h1>
        <p className="max-w-[70ch] text-[15px] leading-[1.6] text-muted">
          Every figure below is read live from mainnet on each request. Read-only: this page calls
          no endpoint that builds or sends a transaction. Where a call fails, the panel says so
          rather than showing a placeholder.
        </p>
      </header>

      {!tokens.ok && (
        <div className="mb-8">
          <Unavailable error={tokens.error} endpoint="GET /api/v1/dex/market/rwa/tokens" />
        </div>
      )}

      {tokens.ok && (
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="INSTRUMENTS"
            value={tokens.data.length.toLocaleString('en-US')}
            note="tokenized equities and ETFs on BSC"
          />
          <StatTile
            label="TRADABLE NOW"
            value={tradable.toLocaleString('en-US')}
            note={`${((tradable / tokens.data.length) * 100).toFixed(0)}% of the universe`}
          />
          <StatTile
            label="ISSUERS"
            value={String(new Set(tokens.data.map((t) => t.platformId)).size)}
            note={[...new Set(tokens.data.map((t) => t.platformId))].join(', ')}
          />
          <StatTile
            label="NON 1:1 TOKENS"
            value={String(
              tokens.data.filter((token) => Number(token.tokenToShareRatio) !== 1).length,
            )}
            note="1 token ≠ 1 share — must be handled in vault accounting"
          />
        </section>
      )}

      <div className="flex flex-col gap-6">
        <Panel
          title="tokenPrice vs referencePrice — what the pair really is"
          subtitle="Checked against all 488 instruments rather than assumed. The result changes how a divergence check has to be built."
          source="GET /api/v1/dex/market/rwa/tokens → tokenPrice, referencePrice, tokenToShareRatio"
        >
          {tokens.ok ? (
            <PriceRelationship buckets={buckets} samples={samples} maxResidualPct={residual} />
          ) : (
            <Unavailable error={tokens.error} endpoint="GET /api/v1/dex/market/rwa/tokens" />
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Panel
            title="Tradability right now"
            subtitle="Market state per instrument, straight from statusInfo.reasonCode."
            source="GET /api/v1/dex/market/rwa/tokens → statusInfo.reasonCode"
          >
            {tokens.ok ? (
              <StatusBreakdown
                counts={countBy(tokens.data, (t) => t.statusInfo?.reasonCode ?? 'UNKNOWN').map(
                  (row) => ({code: row.label, count: row.value}),
                )}
              />
            ) : (
              <Unavailable error={tokens.error} endpoint="GET /api/v1/dex/market/rwa/tokens" />
            )}
          </Panel>

          <Panel
            title="Instruments by issuer"
            subtitle="Who issues the tokenized stock you would actually hold."
            source="GET /api/v1/dex/market/rwa/tokens · /rwa/platforms"
          >
            {tokens.ok ? (
              <>
                <CategoryBars
                  rows={countBy(tokens.data, (t) => t.platformId).map((row, i) => ({
                    ...row,
                    color: SERIES[i % SERIES.length],
                    note: platforms.ok
                      ? platforms.data.find((p) => p.platformId === row.label)?.website
                      : undefined,
                  }))}
                />
                <p className="mt-3 text-[12px] leading-[1.6] text-muted-2">
                  assetType separates plain equities from leveraged products:{' '}
                  {countBy(tokens.data, (t) => `type ${t.assetType ?? '—'}`)
                    .map((r) => `${r.label} → ${r.value}`)
                    .join(', ')}
                  . Filter on it before building a basket.
                </p>
              </>
            ) : (
              <Unavailable error={tokens.error} endpoint="GET /api/v1/dex/market/rwa/tokens" />
            )}
          </Panel>
        </div>

        <Panel
          title="Chain coverage by API module"
          subtitle="Each module supports a different set of chains."
          source="GET /api/v1/dex/{market,balance,aggregator}/supported/chain"
        >
          <ChainPanel
            results={[
              {label: 'Market', outcome: marketChains},
              {label: 'Wallet', outcome: walletChains},
              {label: 'Trading', outcome: tradingChains},
            ]}
          />
        </Panel>

        <Panel
          title="Execution paths"
          subtitle="The quote response's executionMode decides which track applies. Tokenized equities take the RFQ track — a different flow from an ordinary swap."
          source="GET /api/v1/dex/aggregator/quote → executionMode"
        >
          <ExecutionFlow />
        </Panel>

        <Panel
          title="Writing on-chain — capability only"
          subtitle="What the write side can do. Described, never invoked."
          source="not called by this page"
        >
          <WriteCapabilities />
        </Panel>
      </div>
    </main>
  );
}
