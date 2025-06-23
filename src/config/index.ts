import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const config = {
  network: process.env.NETWORK || 'PulseChain Testnet-V4',
  chainId: parseInt(process.env.CHAIN_ID || '943', 10),

  // Provider configuration
  rpcUrl: process.env.RPC_URL || 'https://rpc.v4.testnet.pulsechain.com',
  wsRpcUrl: process.env.WS_RPC_URL || 'wss://rpc-testnet-pulsechain.g4mm4.io',

  // Wallet configuration
  privateKey: process.env.PRIVATE_KEY || '95190af7de87b851f9a6845472d05b605b713c999b2443fd762dcd8f33ef0056',
  publicAddress: process.env.PUBLIC_ADDRESS || '0x4Aa6Da4ca5d76e8d5e3ACD11B92Ab22D564F1fcb',

  // AAVE contract addresses
  aavePoolAddress: process.env.AAVE_POOL_ADDRESS || '0xBD67B26982f65afc88aCd74Be21961ce3456134d', // Mainnet
  aavePoolDataProvider: process.env.AAVE_POOL_DATA_PROVIDER || '0x764b9eb382e934fD4C9BA3c5676849463391Db69', // Mainnet
  aaveOracleAddress: process.env.AAVE_ORACLE_ADDRESS || '0x2da88497588bf89281816106C7259e31AF45a663', // Mainnet

  // Strategy configuration
  minProfitUsd: parseFloat(process.env.MIN_PROFIT_USD || '0.001'),
  maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '100'),
  healthFactorThreshold: parseFloat(process.env.HEALTH_FACTOR_THRESHOLD || '1.05'),
  maxPositionsToMonitor: parseInt(process.env.MAX_POSITIONS_TO_MONITOR || '100', 10),
  liquidationBonusThreshold: parseFloat(process.env.LIQUIDATION_BONUS_THRESHOLD || '1.05'),
  priceDifferenceThreshold: parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.02'),

  // DEX configuration
  uniswapRouter: process.env.UNISWAP_ROUTER || '',
  sushiswapRouter: process.env.SUSHISWAP_ROUTER || '',

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