import { BigNumber } from 'ethers';
import axios from 'axios';
import config from '../config';
import logger from '../services/logger';
import healthFactorMonitor from '../services/healthFactorMonitor';
import priceMonitor from '../services/priceMonitor';
import liquidator from '../core/liquidator';
import { LiquidationTarget, LiquidationProfitCalculation, ExecutionResult } from '../interfaces';

/**
 * Strategy Manager responsible for orchestrating different liquidation strategies
 */
class StrategyManager {
  private isRunning = false;
  private knownAddresses: string[] = [];
  private lastExecutionTime = 0;
  private executionHistory: ExecutionResult[] = [];
  private executionCooldown = 60000; // 1 minute in ms

  /**
   * Initialize the strategy manager
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize health factor monitor
      await healthFactorMonitor.initialize();

      // Load known addresses (this could be loaded from a DB or file)
      // For demonstration we'll use a few sample addresses
      logger.info('Started loading Monitored Addresses...');
      this.knownAddresses = await this.getMonitoredAddresses();
      console.log(`Loaded ${this.knownAddresses.length} monitored addresses`);

      logger.info('Strategy manager initialized');
    } catch (error) {
      logger.error('Failed to initialize strategy manager:', error);
      throw error;
    }
  }

  /**
   * Get the addresses being monitored
   */
  public async getMonitoredAddresses(): Promise<string[]> {
    const addresses = new Set<string>();
    // Get the last 10,000 transactions from the Aave contract
    const response = await axios.get(`https://api-sepolia.etherscan.io/api`, {
      params: {
        module: 'account',
        action: 'txlist',
        address: config.aavePoolAddress,
        startblock: 0,
        endblock: 99999999,
        page: 1,
        offset: 10,
        sort: 'desc',
        apikey: "KZ89J4VBDV2XBYGCYFA56CANT2W7CWVKU4"
      }
    });
    if (response.data.status === '1' && response.data.result) {
      // Extract unique addresses from transactions
      // console.log(`Found ${response.data.result} transactions`);
      for (const tx of response.data.result) {
        addresses.add(tx.from.toLowerCase());
      }
    }
    return Array.from(addresses);
  }
  /**
   * Start monitoring and executing strategies
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Strategy manager is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Strategy manager started');

    // Start listening for events
    await healthFactorMonitor.startEventListening();

    // Initial scan for low health factors
    await this.scanForOpportunities();

    // Set up continuous monitoring
    this.continuousMonitoring();
  }

  /**
   * Stop the strategy manager
   */
  public stop(): void {
    this.isRunning = false;
    logger.info('Strategy manager stopped');
  }

  /**
   * Continuous monitoring loop
   */
  private async continuousMonitoring(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Scan for liquidation opportunities
      await this.scanForOpportunities();

      // Execute liquidations if profitable
      await this.executeStrategy();

      // Schedule next check
      setTimeout(() => this.continuousMonitoring(), 30000); // Check every 30 seconds
    } catch (error) {
      logger.error('Error in continuous monitoring:', error);

      // Even if there's an error, continue monitoring
      setTimeout(() => this.continuousMonitoring(), 60000); // Wait a bit longer after an error
    }
  }

  /**
   * Scan for liquidation opportunities
   */
  private async scanForOpportunities(): Promise<void> {
    try {
      // Scan known addresses for low health factors
      const targets = await healthFactorMonitor.scanForLowHealthFactors(this.knownAddresses);

      logger.info(`Found ${targets.length} potential liquidation targets`);

      // Get liquidatable positions
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();

      logger.info(`Found ${liquidatablePositions.length} liquidatable positions`);

      // For each liquidatable position, calculate profit
      for (const position of liquidatablePositions) {
        await this.assessPosition(position);
      }
    } catch (error) {
      logger.error('Error scanning for opportunities:', error);
      throw error;
    }
  }

  /**
   * Assess a position for liquidation profitability
   */
  private async assessPosition(target: LiquidationTarget): Promise<void> {
    try {
      // Iterate through all debt assets and check profitability with each collateral asset
      for (const debtAsset of target.debtAssets) {
        // Get the latest price data for the debt asset
        await priceMonitor.getPriceData(debtAsset.address);

        // Check for price anomalies
        const hasDebtPriceDiscrepancy = priceMonitor.hasPriceDiscrepancy(debtAsset.address);

        // For each collateral asset
        for (const collateralAsset of target.collateralAssets) {
          // Get the latest price data for the collateral asset
          await priceMonitor.getPriceData(collateralAsset.address);

          // Check for price anomalies
          const hasCollateralPriceDiscrepancy = priceMonitor.hasPriceDiscrepancy(collateralAsset.address);

          // Calculate profit for liquidating this debt with this collateral
          const profitCalculation = await liquidator.calculateLiquidationProfit(
            target,
            debtAsset,
            collateralAsset
          );

          // Log the result
          if (profitCalculation.profitable) {
            logger.info(`Found profitable liquidation opportunity:
              User: ${target.user}
              Health Factor: ${target.healthFactor.toString()}
              Debt Asset: ${debtAsset.symbol}
              Collateral Asset: ${collateralAsset.symbol}
              Debt To Cover: ${profitCalculation.debtToCover.toString()}
              Collateral To Receive: ${profitCalculation.collateralToReceive.toString()}
              Estimated Profit: $${profitCalculation.netProfitUsd.toFixed(2)}
              Price Discrepancy (Debt): ${hasDebtPriceDiscrepancy ? 'Yes' : 'No'}
              Price Discrepancy (Collateral): ${hasCollateralPriceDiscrepancy ? 'Yes' : 'No'}
            `);
          }
        }
      }
    } catch (error) {
      logger.error(`Error assessing position for ${target.user}:`, error);
    }
  }

  /**
   * Execute the most profitable strategy
   */
  private async executeStrategy(): Promise<void> {
    try {
      // Check cooldown period
      const now = Date.now();
      if (now - this.lastExecutionTime < this.executionCooldown) {
        return;
      }

      // Get liquidatable positions
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();

      if (liquidatablePositions.length === 0) {
        return;
      }

      // Find the most profitable liquidation across all positions
      let bestOpportunity: LiquidationProfitCalculation | null = null;

      for (const position of liquidatablePositions) {
        for (const debtAsset of position.debtAssets) {
          for (const collateralAsset of position.collateralAssets) {
            const profitCalculation = await liquidator.calculateLiquidationProfit(
              position,
              debtAsset,
              collateralAsset
            );

            if (profitCalculation.profitable) {
              // Check if this is better than our current best opportunity
              if (
                !bestOpportunity ||
                profitCalculation.executionPriority > bestOpportunity.executionPriority
              ) {
                bestOpportunity = profitCalculation;
              }
            }
          }
        }
      }

      // If we found a profitable opportunity, execute it
      if (bestOpportunity) {
        logger.info(`Executing liquidation for ${bestOpportunity.target.user}`);

        // Execute the liquidation
        const result = await liquidator.executeLiquidation(bestOpportunity);

        // Record the execution
        this.lastExecutionTime = now;
        this.executionHistory.push(result);

        // Log the result
        if (result.success) {
          logger.info(`Liquidation successful! Tx hash: ${result.transactionHash}`);
        } else {
          logger.error(`Liquidation failed: ${result.error}`);
        }
      }
    } catch (error) {
      logger.error('Error executing strategy:', error);
    }
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(): ExecutionResult[] {
    return this.executionHistory;
  }

  /**
   * Apply the oracle delay exploitation strategy
   * Looks for significant discrepancies between oracle prices and market prices
   */
  public async oracleDelayStrategy(): Promise<void> {
    try {
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();

      for (const position of liquidatablePositions) {
        // Check each debt-collateral pair for price discrepancies
        for (const debtAsset of position.debtAssets) {
          const debtPrice = await priceMonitor.getPriceData(debtAsset.address);

          if (!priceMonitor.hasPriceDiscrepancy(debtAsset.address)) {
            continue; // Skip if no price discrepancy
          }

          for (const collateralAsset of position.collateralAssets) {
            const collateralPrice = await priceMonitor.getPriceData(collateralAsset.address);

            // If we have significant price discrepancies, prioritize this liquidation
            if (priceMonitor.hasPriceDiscrepancy(collateralAsset.address)) {
              const profitCalculation = await liquidator.calculateLiquidationProfit(
                position,
                debtAsset,
                collateralAsset
              );

              if (profitCalculation.profitable) {
                // Boost the execution priority for oracle delay opportunities
                profitCalculation.executionPriority *= 1.5;

                logger.info(`Oracle delay opportunity found for ${position.user}`);

                // Execute immediately if very profitable
                if (profitCalculation.netProfitUsd > config.minProfitUsd * 2) {
                  const result = await liquidator.executeLiquidation(profitCalculation);
                  this.executionHistory.push(result);
                  this.lastExecutionTime = Date.now();

                  logger.info(`Oracle delay liquidation executed: ${result.success}`);

                  // Break after one successful execution to avoid gas wars
                  if (result.success) {
                    return;
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error in oracle delay strategy:', error);
    }
  }

  /**
   * Apply the E-Mode liquidation strategy
   * Focuses on E-Mode positions which may use custom price feeds
   */
  public async eModeStrategy(): Promise<void> {
    try {
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();

      // Filter for positions in E-Mode
      const eModePositions = liquidatablePositions.filter(p => p.eModeCategoryId !== 0);

      logger.info(`Found ${eModePositions.length} liquidatable E-Mode positions`);

      for (const position of eModePositions) {
        // Analyze E-Mode position
        for (const debtAsset of position.debtAssets) {
          for (const collateralAsset of position.collateralAssets) {
            const profitCalculation = await liquidator.calculateLiquidationProfit(
              position,
              debtAsset,
              collateralAsset
            );

            if (profitCalculation.profitable) {
              // Prioritize E-Mode liquidations slightly higher
              profitCalculation.executionPriority *= 1.2;

              // Execute if very profitable
              if (profitCalculation.netProfitUsd > config.minProfitUsd * 1.5) {
                const result = await liquidator.executeLiquidation(profitCalculation);
                this.executionHistory.push(result);
                this.lastExecutionTime = Date.now();

                logger.info(`E-Mode liquidation executed: ${result.success}`);

                if (result.success) {
                  return;
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error in E-Mode strategy:', error);
    }
  }
}

export default new StrategyManager(); 