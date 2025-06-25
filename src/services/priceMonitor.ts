import { ethers, BigNumber, Contract } from 'ethers';
import axios from 'axios';
import config from '../config';
import logger from './logger';
import { PriceData } from '../interfaces';

// ABI for price oracle interaction
const PRICE_ORACLE_ABI = [
  'function getAssetPrice(address asset) external view returns (uint256)',
  'function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)'
];

// DEX quoter ABI (Uniswap V3 style)
const QUOTER_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

class PriceMonitor {
  private provider: ethers.providers.Provider;
  private priceOracle: Contract;
  private uniswapQuoter: Contract;
  private sushiswapQuoter: Contract;
  private priceCache: Map<string, PriceData> = new Map();

  // Common token addresses
  private WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  private USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  private DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

  constructor() {
    config.initProvider();
    if (!config.provider) {
      throw new Error('Provider not initialized');
    }

    this.provider = config.provider;
    this.priceOracle = new ethers.Contract(
      config.aaveOracleAddress,
      PRICE_ORACLE_ABI,
      this.provider
    );

    // Initialize DEX quoters for on-chain price comparison
    this.uniswapQuoter = new ethers.Contract(
      '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6', // Uniswap V3 Quoter
      QUOTER_ABI,
      this.provider
    );

    this.sushiswapQuoter = new ethers.Contract(
      '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // SushiSwap Router
      QUOTER_ABI,
      this.provider
    );
  }

  /**
   * Get price data from multiple sources for a single asset
   */
  public async getPriceData(assetAddress: string): Promise<PriceData> {
    try {
      // Get price from Aave Oracle
      const aaveOraclePrice = await this.priceOracle.getAssetPrice(assetAddress);

      const priceData: PriceData = {
        assetAddress,
        aaveOraclePrice,
        // dexPrice,
        // externalApiPrice,
        timestamp: Date.now(),
        // discrepancyPercentage
      };

      // Cache the price data
      this.priceCache.set(assetAddress, priceData);
      return priceData;
    } catch (error) {
      logger.error(`Error getting price data for ${assetAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get price data for multiple assets at once
   */
  public async getPricesData(assetAddresses: string[]): Promise<PriceData[]> {
    try {
      // Get prices from Aave Oracle in batch
      const aaveOraclePrices = await this.priceOracle.getAssetsPrices(assetAddresses);

      // Create price data for each asset
      const pricesData: PriceData[] = [];

      for (let i = 0; i < assetAddresses.length; i++) {
        const assetAddress = assetAddresses[i];
        const aaveOraclePrice = aaveOraclePrices[i];


        const priceData: PriceData = {
          assetAddress,
          aaveOraclePrice,
          // externalApiPrice,
          timestamp: Date.now(),
          // discrepancyPercentage
        };

        // Cache the price data
        this.priceCache.set(assetAddress, priceData);
        pricesData.push(priceData);
      }
      return pricesData;
    } catch (error) {
      logger.error(`Error getting prices data:`, error);
      throw error;
    }
  }

  /**
   * Get price from external API (e.g. CoinGecko)
   */
  private async getExternalPrice(assetAddress: string): Promise<number | undefined> {
    try {
      // Map of common token addresses to their IDs on CoinGecko
      const tokenIdMap: Record<string, string> = {
        [this.WETH.toLowerCase()]: '+',
        [this.USDC.toLowerCase()]: 'usd-coin',
        [this.DAI.toLowerCase()]: 'dai',
        // Add more tokens as needed
      };

      const tokenId = tokenIdMap[assetAddress.toLowerCase()];
      if (!tokenId) {
        logger.debug(`No external API mapping for ${assetAddress}`);
        return undefined;
      }

      // Use CoinGecko API to get the price
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
        {
          headers: config.coingeckoApiKey ? {
            'x-cg-pro-api-key': config.coingeckoApiKey
          } : undefined
        }
      );

      if (response.data && response.data[tokenId] && response.data[tokenId].usd) {
        return response.data[tokenId].usd;
      }

      return undefined;
    } catch (error) {
      logger.error(`Error fetching external price for ${assetAddress}:`, error);
      return undefined;
    }
  }

  /**
   * Check if there's a significant price discrepancy for an asset
   */
  public hasPriceDiscrepancy(assetAddress: string): boolean {
    const cachedPrice = this.priceCache.get(assetAddress);

    if (!cachedPrice || !cachedPrice.discrepancyPercentage) {
      return false;
    }

    return cachedPrice.discrepancyPercentage > config.priceDifferenceThreshold;
  }
}

export default new PriceMonitor(); 