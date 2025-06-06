import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const config = {
  network: process.env.NETWORK || 'mainnet',
  chainId: parseInt(process.env.CHAIN_ID || '1', 10),

  // Provider configuration
  rpcUrl: process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc',
  wsRpcUrl: process.env.WS_RPC_URL || '',

  // Wallet configuration
  privateKey: process.env.PRIVATE_KEY || '',
  publicAddress: process.env.PUBLIC_ADDRESS || '',

  // AAVE contract addresses
  aavePoolAddress: process.env.AAVE_POOL_ADDRESS || '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', // Mainnet
  aavePoolDataProvider: process.env.AAVE_POOL_DATA_PROVIDER || '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3', // Mainnet
  aaveOracleAddress: process.env.AAVE_ORACLE_ADDRESS || '0x54586bE62E3c3580375aE3723C145253060Ca0C2', // Mainnet

  // Strategy configuration
  minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || '50'),
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '100'),
  healthFactorThreshold: parseFloat(process.env.HEALTH_FACTOR_THRESHOLD || '1.05'),
  maxPositionsToMonitor: parseInt(process.env.MAX_POSITIONS_TO_MONITOR || '100', 10),
  liquidationBonusThreshold: parseFloat(process.env.LIQUIDATION_BONUS_THRESHOLD || '1.05'),
  priceDifferenceThreshold: parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.02'),

  // DEX configuration
  uniswapRouter: process.env.UNISWAP_ROUTER || '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  sushiswapRouter: process.env.SUSHISWAP_ROUTER || '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',

  // Monitoring
  logLevel: process.env.LOG_LEVEL || 'info',
  enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',

  // Gas configuration
  gasLimitBuffer: parseFloat(process.env.GAS_LIMIT_BUFFER || '1.2'),
  flashbotsAuthKey: process.env.FLASHBOTS_AUTH_KEY || '',

  // Commonly used constants
  secondsPerDay: 86400,
  healthFactorLiquidationThreshold: ethers.utils.parseUnits('1', 18),
  closeFactorHfThreshold: ethers.utils.parseUnits('0.95', 18),

  // Price API configuration
  coingeckoApiKey: process.env.COINGECKO_API_KEY || '',
  cryptocompareApiKey: process.env.CRYPTOCOMPARE_API_KEY || '',

  // Network provider instance (will be initialized at runtime)
  provider: null as ethers.providers.Provider | null,
  wallet: null as ethers.Wallet | null,

  // Initialize provider and wallet
  initProvider: (): void => {
    if (!config.provider) {
      if (config.wsRpcUrl) {
        config.provider = new ethers.providers.WebSocketProvider(config.wsRpcUrl);
      } else if (config.rpcUrl) {
        config.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      } else {
        throw new Error('No RPC URL provided');
      }
    }

    if (!config.wallet && config.privateKey) {
      config.wallet = new ethers.Wallet(config.privateKey, config.provider);
    }
  }
};

export default config; 