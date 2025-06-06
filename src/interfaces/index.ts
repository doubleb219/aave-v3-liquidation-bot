import { BigNumber } from 'ethers';

// User account data from Aave
export interface UserAccountData {
  totalCollateralBase: BigNumber;
  totalDebtBase: BigNumber;
  availableBorrowsBase: BigNumber;
  currentLiquidationThreshold: BigNumber;
  ltv: BigNumber;
  healthFactor: BigNumber;
  user: string;
}

// Position to potentially liquidate
export interface LiquidationTarget {
  user: string;
  healthFactor: BigNumber;
  totalCollateralBase: BigNumber;
  totalDebtBase: BigNumber;
  collateralAssets: Asset[];
  debtAssets: Asset[];
  eModeCategoryId: number;
}

// Asset details
export interface Asset {
  symbol: string;
  address: string;
  decimals: number;
  amount: BigNumber;
  amountUsd: number;
  lastUpdateTimestamp: number;
  priceSource?: string;
  liquidationBonus?: number;
  liquidationThreshold?: number;
}

// Price data from various sources
export interface PriceData {
  assetAddress: string;
  aaveOraclePrice: BigNumber;
  dexPrice?: BigNumber;
  externalApiPrice?: BigNumber;
  timestamp: number;
  discrepancyPercentage?: number;
}

// Profit calculation for a liquidation
export interface LiquidationProfitCalculation {
  target: LiquidationTarget;
  debtAsset: Asset;
  collateralAsset: Asset;
  debtToCover: BigNumber;
  collateralToReceive: BigNumber;
  liquidationBonus: number;
  estimatedProfitUsd: number;
  estimatedGasCostUsd: number;
  netProfitUsd: number;
  profitable: boolean;
  executionPriority: number;
}

// Execution result
export interface ExecutionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: BigNumber;
  gasCostWei?: BigNumber;
  profitAmount?: BigNumber;
  profitUsd?: number;
  timestamp: number;
}

// Flash loan parameters
export interface FlashLoanParams {
  assets: string[];
  amounts: BigNumber[];
  interestRateModes: number[];
  receiver: string;
  params: string;
  referralCode: number;
}

// DEX swap parameters
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: BigNumber;
  amountOutMinimum: BigNumber;
  deadline: number;
  routerAddress: string;
}

// Strategy configuration
export interface StrategyConfig {
  name: string;
  enabled: boolean;
  description: string;
  targetAssets?: string[];
  minHealthFactor?: BigNumber;
  maxHealthFactor?: BigNumber;
  minProfitUsd?: number;
  priorityMultiplier?: number;
  preferredDexRouter?: string;
}

// Notification message
export interface NotificationMessage {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  data?: any;
  timestamp: number;
} 