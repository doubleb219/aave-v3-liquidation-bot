import { BigNumber } from 'ethers';
import config from '../config';
import logger from '../services/logger';
import priceMonitor from '../services/priceMonitor';
import healthFactorMonitor from '../services/healthFactorMonitor';
import liquidator from '../core/liquidator';
import { LiquidationTarget, LiquidationProfitCalculation, ExecutionResult } from '../interfaces';

/**
 * Strategy that exploits oracle price update delays
 * 
 * This strategy looks for significant discrepancies between on-chain oracle prices
 * and current market prices, which can create profitable liquidation opportunities.
 */
class OracleDelayStrategy {
  private isEnabled = true;
  private executionHistory: ExecutionResult[] = [];
  private minPriceDiscrepancyPercent = 2; // 2% minimum discrepancy

  /**
   * Initialize strategy
   */
  public async initialize(): Promise<void> {
    this.minPriceDiscrepancyPercent = config.priceDifferenceThreshold;
    logger.info(`Oracle Delay Strategy initialized with min discrepancy: ${this.minPriceDiscrepancyPercent}%`);
  }

  /**
   * Enable or disable the strategy
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`Oracle Delay Strategy ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Scan for oracle delay opportunities
   */
  public async scan(): Promise<LiquidationProfitCalculation[]> {
    if (!this.isEnabled) {
      return [];
    }
    
    try {
      const opportunities: LiquidationProfitCalculation[] = [];
      
      // 1. Get liquidatable positions
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();
      
      // 2. For each position, check for price discrepancies
      for (const position of liquidatablePositions) {
        // Check each debt and collateral asset for price discrepancies
        for (const debtAsset of position.debtAssets) {
          const debtPriceData = await priceMonitor.getPriceData(debtAsset.address);
          
          // Only proceed if we have both oracle and external price for debt
          if (!debtPriceData.discrepancyPercentage) {
            continue;
          }
          
          // Check if debt asset has significant price discrepancy
          const hasSignificantDebtDiscrepancy = 
            debtPriceData.discrepancyPercentage >= this.minPriceDiscrepancyPercent;
          
          for (const collateralAsset of position.collateralAssets) {
            const collateralPriceData = await priceMonitor.getPriceData(collateralAsset.address);
            
            // Only proceed if we have both oracle and external price for collateral
            if (!collateralPriceData.discrepancyPercentage) {
              continue;
            }
            
            // Check if collateral asset has significant price discrepancy
            const hasSignificantCollateralDiscrepancy = 
              collateralPriceData.discrepancyPercentage >= this.minPriceDiscrepancyPercent;
            
            // If either asset has a significant price discrepancy, calculate profit
            if (hasSignificantDebtDiscrepancy || hasSignificantCollateralDiscrepancy) {
              const profitCalculation = await liquidator.calculateLiquidationProfit(
                position,
                debtAsset,
                collateralAsset
              );
              
              // If profitable, enhance priority based on discrepancy magnitude
              if (profitCalculation.profitable) {
                // Boost priority based on combined discrepancy percentage
                const combinedDiscrepancy = 
                  (debtPriceData.discrepancyPercentage || 0) + 
                  (collateralPriceData.discrepancyPercentage || 0);
                
                // Boost priority proportionally to discrepancy
                const priorityBoost = 1 + (combinedDiscrepancy / 100);
                profitCalculation.executionPriority *= priorityBoost;
                
                // Log the opportunity
                logger.info(`Oracle delay opportunity:
                  User: ${position.user}
                  Health Factor: ${position.healthFactor.toString()}
                  Debt Asset: ${debtAsset.symbol} (Discrepancy: ${debtPriceData.discrepancyPercentage}%)
                  Collateral Asset: ${collateralAsset.symbol} (Discrepancy: ${collateralPriceData.discrepancyPercentage}%)
                  Estimated Profit: $${profitCalculation.netProfitUsd.toFixed(2)}
                  Adjusted Priority: ${profitCalculation.executionPriority.toFixed(2)}
                `);
                
                opportunities.push(profitCalculation);
              }
            }
          }
        }
      }
      
      // Sort opportunities by priority (highest first)
      opportunities.sort((a, b) => b.executionPriority - a.executionPriority);
      
      return opportunities;
    } catch (error) {
      logger.error('Error scanning for oracle delay opportunities:', error);
      return [];
    }
  }

  /**
   * Execute the best opportunity
   */
  public async execute(): Promise<ExecutionResult | null> {
    if (!this.isEnabled) {
      return null;
    }
    
    try {
      // 1. Scan for opportunities
      const opportunities = await this.scan();
      
      if (opportunities.length === 0) {
        return null;
      }
      
      // 2. Execute the best opportunity
      const bestOpportunity = opportunities[0];
      
      logger.info(`Executing oracle delay liquidation for ${bestOpportunity.target.user}`);
      
      const result = await liquidator.executeLiquidation(bestOpportunity);
      this.executionHistory.push(result);
      
      return result;
    } catch (error) {
      logger.error('Error executing oracle delay strategy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get execution history
   */
  public getExecutionHistory(): ExecutionResult[] {
    return this.executionHistory;
  }
}

export default new OracleDelayStrategy(); 