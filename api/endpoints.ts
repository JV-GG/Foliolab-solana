/**
 * Catalogue of READ-ONLY Binance Web3 API endpoints.
 *
 * Every entry here only reads. Endpoints that build or send transactions are
 * deliberately absent — see the DELIBERATELY_EXCLUDED note at the bottom.
 *
 * Paths are transcribed from the product introduction pages. The docs' parameter
 * tables are rendered client-side and could not be read, so `query` below is a
 * best-effort starting point: when a required parameter is missing the API says
 * so, and that error is itself useful output.
 */
import {BSC_CHAIN_ID} from './client.ts';

export interface EndpointSpec {
  id: string;
  group: 'market' | 'portfolio' | 'rwa' | 'wallet' | 'trading';
  method: 'GET' | 'POST';
  path: string;
  description: string;
  query?: Record<string, string | number>;
  body?: unknown;
  /** Needs a wallet address; filled from PROBE_ADDRESS. */
  needsAddress?: boolean;
  /** Needs a token contract address; filled from PROBE_TOKEN. */
  needsToken?: boolean;
  /** Needs a transaction hash; filled from PROBE_TXHASH. */
  needsTxHash?: boolean;
}

/** Verified from Binance's own B402 docs: USDT on BSC mainnet. */
export const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';
/** Wrapped BNB on BSC mainnet. */
export const BSC_WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
/** Ondo tokenized AAPL on BSC (AAPLon) — discovered via rwa.search. */
export const BSC_AAPL_ONDO = '0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4';

export const ENDPOINTS: EndpointSpec[] = [
  // ---------------------------------------------------------------- market
  {
    id: 'market.chains',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/supported/chain',
    description: 'Blockchains the market service supports',
  },
  {
    id: 'market.price',
    group: 'market',
    method: 'POST',
    path: '/api/v1/dex/market/price',
    description: 'Latest token prices (batch, up to 100)',
    body: [{binanceChainId: String(BSC_CHAIN_ID), tokenContractAddress: BSC_WBNB}],
  },
  {
    id: 'market.candles',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/candles',
    description: 'Candlestick / K-line data for a token',
    query: {binanceChainId: BSC_CHAIN_ID, interval: '1h', limit: 5},
    needsToken: true,
  },
  {
    id: 'market.search',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/search',
    description: 'Search tokens by symbol or contract address',
    query: {chains: BSC_CHAIN_ID, search: 'BNB'},
  },
  {
    id: 'market.hotToken',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/hot-token',
    description: 'Hot token rankings with sorting and filters',
    query: {binanceChainId: BSC_CHAIN_ID, limit: 5},
  },
  {
    id: 'market.basicInfo',
    group: 'market',
    method: 'POST',
    path: '/api/v1/dex/market/token/basic-info',
    description: 'Name, symbol, logo, decimals, creator, creation time',
    query: {binanceChainId: BSC_CHAIN_ID, tokenContractAddress: BSC_WBNB},
    body: [{binanceChainId: String(BSC_CHAIN_ID), tokenContractAddress: BSC_WBNB}],
  },
  {
    id: 'market.advancedInfo',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/advanced-info',
    description: 'Holder distribution by wallet type, launch info, metrics',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsToken: true,
  },
  {
    id: 'market.priceInfo',
    group: 'market',
    method: 'POST',
    path: '/api/v1/dex/market/price-info',
    description: 'Price plus trading data (batch, up to 100)',
    body: [{binanceChainId: String(BSC_CHAIN_ID), tokenContractAddress: BSC_WBNB}],
  },
  {
    id: 'market.topLiquidity',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/top-liquidity',
    description: 'Top liquidity pools for a token, with USD liquidity',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsToken: true,
  },
  {
    id: 'market.trades',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/trades',
    description: 'On-chain trade history, filterable by tag and address',
    query: {binanceChainId: BSC_CHAIN_ID, limit: 5},
    needsToken: true,
  },
  {
    id: 'market.holder',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/holder',
    description: 'Token holders ranked by holdings (max 100, no paging)',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsToken: true,
  },
  {
    id: 'market.topTrader',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/token/top-trader',
    description: 'Top addresses by realised PnL (max 100, no paging)',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsToken: true,
  },
  {
    id: 'market.devInfo',
    group: 'market',
    method: 'GET',
    path: '/api/v1/dex/market/memepump/tokenDevInfo',
    description: 'Developer profile and historical launch stats',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsToken: true,
  },

  // ------------------------------------------------------------- portfolio
  {
    id: 'portfolio.chains',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/portfolio/supported/chain',
    description: 'Chains available for address portfolio analysis',
  },
  {
    id: 'portfolio.overview',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/portfolio/overview',
    description: 'Realised PnL, win rate, top profitable tokens',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsAddress: true,
  },
  {
    id: 'portfolio.recentPnl',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/portfolio/recent-pnl',
    description: 'Recent realised PnL list for an address',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsAddress: true,
  },
  {
    id: 'portfolio.latestPnl',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/portfolio/token/latest-pnl',
    description: 'Latest realised PnL for one token, with buy/sell stats',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsAddress: true,
    needsToken: true,
  },
  {
    id: 'portfolio.dexHistory',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/portfolio/dex-history',
    description: 'Swap trade history, filterable by time/token/type',
    query: {binanceChainId: BSC_CHAIN_ID, limit: 5},
    needsAddress: true,
  },
  {
    id: 'portfolio.leaderboard',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/leaderboard/list',
    description: 'Top wallets by PnL, win rate or volume. timeFrame/sortBy are numeric enums (1-based)',
    query: {binanceChainId: BSC_CHAIN_ID, timeFrame: 1, sortBy: 1, limit: 5},
  },
  {
    id: 'portfolio.addressTracker',
    group: 'portfolio',
    method: 'GET',
    path: '/api/v1/dex/market/address-tracker/trades',
    description: 'Latest trades from tracked addresses. trackerType is a numeric enum (1 works)',
    query: {binanceChainId: BSC_CHAIN_ID, trackerType: 1, limit: 5},
  },

  // ------------------------------------------------------------------- rwa
  {
    id: 'rwa.platforms',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/platforms',
    description: 'Supported RWA issuance platforms (Ondo, xStocks, bStock…)',
  },
  {
    id: 'rwa.tokens',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/tokens',
    description: 'RWA token list with underlying asset data, by platform/sector',
    query: {limit: 10},
  },
  {
    id: 'rwa.price',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/price',
    description: 'RWA prices: on-chain price AND underlying reference price',
    query: {binanceChainId: BSC_CHAIN_ID, tokenContractAddresses: BSC_AAPL_ONDO},
  },
  {
    id: 'rwa.search',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/search',
    description: 'Search RWA tokens by keyword or contract address',
    query: {keyword: 'AAPL'},
  },
  {
    id: 'rwa.underlyingProfile',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/underlying-profile',
    description: 'Underlying company information for an RWA token',
    query: {binanceChainId: BSC_CHAIN_ID, tokenContractAddress: BSC_AAPL_ONDO},
  },
  {
    id: 'rwa.underlyingMarket',
    group: 'rwa',
    method: 'GET',
    path: '/api/v1/dex/market/rwa/underlying-market',
    description: 'Market data for the underlying asset (hours, status, price)',
    query: {binanceChainId: BSC_CHAIN_ID, tokenContractAddress: BSC_AAPL_ONDO},
  },

  // ---------------------------------------------------------------- wallet
  {
    id: 'wallet.chains',
    group: 'wallet',
    method: 'GET',
    path: '/api/v1/dex/balance/supported/chain',
    description: 'Chains supported for balance queries',
  },
  {
    id: 'wallet.allBalances',
    group: 'wallet',
    method: 'GET',
    path: '/api/v1/dex/balance/all-token-balances-by-address',
    description: 'Every token balance for a wallet',
    query: {chains: BSC_CHAIN_ID},
    needsAddress: true,
  },
  {
    id: 'wallet.tokenBalances',
    group: 'wallet',
    method: 'POST',
    path: '/api/v1/dex/balance/token-balances-by-address',
    description: 'Balances for specific tokens',
    needsAddress: true,
  },
  {
    id: 'wallet.txHistory',
    group: 'wallet',
    method: 'GET',
    path: '/api/v1/dex/post-transaction/transactions-by-address',
    description: 'On-chain transaction history for a wallet',
    query: {chains: BSC_CHAIN_ID, limit: 5},
    needsAddress: true,
  },
  {
    id: 'wallet.txDetail',
    group: 'wallet',
    method: 'GET',
    path: '/api/v1/dex/post-transaction/transaction-detail-by-txhash',
    description: 'Full transaction detail by hash',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsTxHash: true,
  },

  // --------------------------------------------------------------- trading
  {
    id: 'trading.chains',
    group: 'trading',
    method: 'GET',
    path: '/api/v1/dex/aggregator/supported/chain',
    description: 'Chains supported by the swap aggregator',
  },
  {
    id: 'trading.quote',
    group: 'trading',
    method: 'GET',
    path: '/api/v1/dex/aggregator/quote',
    description: 'Price quote. Read-only: returns a price, executes nothing. Shows executionMode (SWAP vs RFQ for equity tokens)',
    query: {
      binanceChainId: BSC_CHAIN_ID,
      fromTokenAddress: BSC_USDT,
      toTokenAddress: BSC_WBNB,
      amount: '1000000000000000000',
    },
  },
  {
    id: 'trading.history',
    group: 'trading',
    method: 'GET',
    path: '/api/v1/dex/aggregator/history',
    description: 'Status of past aggregator transactions',
    query: {binanceChainId: BSC_CHAIN_ID},
    needsAddress: true,
  },
];

/**
 * DELIBERATELY EXCLUDED — these build or send transactions and are not probes:
 *
 *   GET  /api/v1/dex/aggregator/swap                 builds an unsigned swap tx
 *   GET  /api/v1/dex/aggregator/quote-and-swap       quote + unsigned tx
 *   GET  /api/v1/dex/aggregator/approve-transaction  builds an ERC-20 approval
 *   POST /api/v1/dex/aggregator/order/submit         submits a signed RFQ order
 *   POST .../broadcast-transaction                   BROADCASTS ON MAINNET
 *
 * Transaction API and DeFi API endpoints are omitted because their exact paths
 * are not stated in the docs pages that could be read. Add them once verified
 * against the REST reference rather than guessing.
 */
