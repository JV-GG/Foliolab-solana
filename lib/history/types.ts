import type {Address, Hex} from 'viem';

export type ActivityType = 'deposit' | 'redeem' | 'rebalance' | 'plan' | 'seed';

export interface BaseActivity {
  id: string;
  type: ActivityType;
  vault: Address;
  vaultName: string;
  vaultSymbol: string;
  txHash: Hex;
  blockNumber: number;
  timestamp: number; // Unix ms
}

export interface DepositActivity extends BaseActivity {
  type: 'deposit';
  investor: Address;
  usdtAmount: string;
  sharesMinted: string;
  priceTimestamp?: number;
}

export interface PayoutToken {
  asset: Address;
  symbol: string;
  decimals: number;
  amount: string;
}

export interface RedeemActivity extends BaseActivity {
  type: 'redeem';
  investor: Address;
  sharesBurned: string;
  payouts: PayoutToken[];
}

export interface RebalanceActivity extends BaseActivity {
  type: 'rebalance';
  sellToken: Address;
  sellSymbol: string;
  sellAmount: string;
  buyToken: Address;
  buySymbol: string;
  buyAmount: string;
  planVersion: number;
}

export interface PlanActivity extends BaseActivity {
  type: 'plan';
  version: number;
  planText: string;
}

export interface SeedActivity extends BaseActivity {
  type: 'seed';
  investor: Address;
  usdtAmount: string;
  sharesMinted: string;
}

export type ActivityItem =
  | DepositActivity
  | RedeemActivity
  | RebalanceActivity
  | PlanActivity
  | SeedActivity;

export interface HistoryResponse {
  items: ActivityItem[];
  latestBlock: number;
}
