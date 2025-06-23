import { ethers, Contract, BigNumber } from 'ethers';
import config from '../config';
import logger from './logger';
import { UserAccountData, LiquidationTarget, Asset } from '../interfaces';

// ABIs for interaction with Aave contracts
const POOL_ABI = [
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReservesList() external view returns (address[])',
  'function getUserEMode(address user) external view returns (uint256)'
];

const POOL_DATA_PROVIDER_ABI = [
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)'
];

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

class HealthFactorMonitor {
  private provider: ethers.providers.Provider;
  private pool: Contract;
  private poolDataProvider: Contract;
  private monitoredUsers: Map<string, LiquidationTarget> = new Map();
  private reservesList: string[] = [];
  private reservesData: Map<string, any> = new Map();
  private tokenSymbols: Map<string, string> = new Map();
  private tokenDecimals: Map<string, number> = new Map();

  constructor() {
    config.initProvider();
    if (!config.provider) {
      throw new Error('Provider not initialized');
    }

    this.provider = config.provider;
    this.pool = new ethers.Contract(
      config.aavePoolAddress,
      POOL_ABI,
      this.provider
    );

    this.poolDataProvider = new ethers.Contract(
      config.aavePoolDataProvider,
      POOL_DATA_PROVIDER_ABI,
      this.provider
    );
  }

  /**
   * Initialize by loading the reserves list
   */
  public async initialize(): Promise<void> {
    try {
      this.reservesList = await this.pool.getReservesList();
      logger.info(`Loaded ${this.reservesList.length} reserves`);

      // Pre-fetch reserve configuration data and token info
      for (const asset of this.reservesList) {
        await this.getReserveInfo(asset);
      }
    } catch (error) {
      logger.error('Failed to initialize HealthFactorMonitor:', error);
      throw error;
    }
  }

  /**
   * Get reserve info including token symbol, decimals, and configuration
   */
  private async getReserveInfo(asset: string): Promise<any> {
    // Check if we already have this data cached
    if (this.reservesData.has(asset)) {
      return this.reservesData.get(asset);
    }

    try {
      // Get reserve configuration data
      const configData = await this.poolDataProvider.getReserveConfigurationData(asset);

      // Get token symbol and decimals
      const token = new ethers.Contract(asset, ERC20_ABI, this.provider);
      const symbol = await token.symbol();
      const decimals = await token.decimals();

      this.tokenSymbols.set(asset, symbol);
      this.tokenDecimals.set(asset, decimals);

      const reserveInfo = {
        symbol,
        decimals,
        ltv: configData.ltv,
        liquidationThreshold: configData.liquidationThreshold,
        liquidationBonus: configData.liquidationBonus,
        usageAsCollateralEnabled: configData.usageAsCollateralEnabled
      };

      this.reservesData.set(asset, reserveInfo);
      return reserveInfo;
    } catch (error) {
      logger.error(`Failed to get reserve info for ${asset}:`, error);
      throw error;
    }
  }

  /**
   * Get user account data from Aave
   */
  public async getUserAccountData(userAddress: string): Promise<UserAccountData> {
    try {
      const data = await this.pool.getUserAccountData(userAddress);

      return {
        totalCollateralBase: data.totalCollateralBase,
        totalDebtBase: data.totalDebtBase,
        availableBorrowsBase: data.availableBorrowsBase,
        currentLiquidationThreshold: data.currentLiquidationThreshold,
        ltv: data.ltv,
        healthFactor: data.healthFactor,
        user: userAddress
      };
    } catch (error) {
      logger.error(`Failed to get user account data for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed user position including collateral and debt assets
   */
  public async getUserDetailedPosition(userAddress: string): Promise<LiquidationTarget> {
    try {
      // Get basic account data first
      const accountData = await this.getUserAccountData(userAddress);

      // Get E-Mode category ID
      const eModeCategoryId = await this.pool.getUserEMode(userAddress);
      // Initialize arrays for collateral and debt assets
      const collateralAssets: Asset[] = [];
      const debtAssets: Asset[] = [];

      // Check each reserve to see if the user has collateral or debt
      for (const asset of this.reservesList) {
        const userReserveData = await this.poolDataProvider.getUserReserveData(asset, userAddress);

        // If user has either collateral or debt in this asset
        if (
          userReserveData.currentATokenBalance.gt(0) ||
          userReserveData.currentStableDebt.gt(0) ||
          userReserveData.currentVariableDebt.gt(0)
        ) {
          const reserveInfo = await this.getReserveInfo(asset);

          // If user has collateral
          if (userReserveData.currentATokenBalance.gt(0) && userReserveData.usageAsCollateralEnabled) {
            collateralAssets.push({
              symbol: reserveInfo.symbol,
              address: asset,
              decimals: reserveInfo.decimals,
              amount: userReserveData.currentATokenBalance,
              amountUsd: 0, // Will be calculated later with price data
              lastUpdateTimestamp: Date.now(),
              liquidationThreshold: reserveInfo.liquidationThreshold.toNumber() / 10000, // Convert from basis points
              liquidationBonus: reserveInfo.liquidationBonus.toNumber() / 10000 // Convert from basis points
            });
          }

          // If user has debt
          const totalDebt = userReserveData.currentStableDebt.add(userReserveData.currentVariableDebt);
          if (totalDebt.gt(0)) {
            debtAssets.push({
              symbol: reserveInfo.symbol,
              address: asset,
              decimals: reserveInfo.decimals,
              amount: totalDebt,
              amountUsd: 0, // Will be calculated later with price data
              lastUpdateTimestamp: Date.now()
            });
          }
        }
      }

      return {
        user: userAddress,
        healthFactor: accountData.healthFactor,
        totalCollateralBase: accountData.totalCollateralBase,
        totalDebtBase: accountData.totalDebtBase,
        collateralAssets,
        debtAssets,
        eModeCategoryId: eModeCategoryId.toNumber()
      };
    } catch (error) {
      logger.error(`Failed to get detailed position for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Scan for accounts with low health factors
   */
  public async scanForLowHealthFactors(addresses: string[]): Promise<LiquidationTarget[]> {
    const targets: LiquidationTarget[] = [];

    for (const address of addresses) {
      try {
        const userData = await this.getUserAccountData(address);

        // If health factor is below our monitoring threshold, get detailed position
        if (
          userData.healthFactor.lt(
            ethers.utils.parseUnits(config.healthFactorThreshold.toString(), 18)
          )
        ) {
          console.log('HF < 1 address', address)
          const detailedPosition = await this.getUserDetailedPosition(address);
          targets.push(detailedPosition);

          // Also update our monitored users map
          this.monitoredUsers.set(address, detailedPosition);
        }
      } catch (error) {
        logger.error(`Error scanning health factor for ${address}:`, error);
      }
    }

    return targets;
  }

  /**
   * Get users with health factor below liquidation threshold
   */
  public async getLiquidatablePositions(): Promise<LiquidationTarget[]> {
    const liquidatablePositions: LiquidationTarget[] = [];

    // First update the health factors of already monitored users
    const monitoredAddresses = Array.from(this.monitoredUsers.keys());

    for (const address of monitoredAddresses) {
      try {
        const userData = await this.getUserAccountData(address);
        const currentTarget = this.monitoredUsers.get(address);

        if (currentTarget) {
          // Update the health factor
          currentTarget.healthFactor = userData.healthFactor;

          // If health factor is below liquidation threshold, add to liquidatable positions
          if (userData.healthFactor.lt(config.healthFactorLiquidationThreshold)) {
            // Refresh the detailed position to get the most up-to-date data
            const detailedPosition = await this.getUserDetailedPosition(address);
            liquidatablePositions.push(detailedPosition);
          }
        }
      } catch (error) {
        logger.error(`Error updating health factor for ${address}:`, error);
      }
    }

    return liquidatablePositions;
  }

  /**
   * Listen for borrow or repay events to identify new positions to monitor
   */
  public async startEventListening(): Promise<void> {
    // Implementation will depend on how you want to track new positions
    // Could listen for Borrow and Repay events from the Aave Pool
    logger.info('Starting event listening for borrow and repay events');

    // Example implementation would go here
  }
}

export default new HealthFactorMonitor(); 