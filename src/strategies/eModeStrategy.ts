import { BigNumber } from 'ethers';
import config from '../config';
import logger from '../services/logger';
import priceMonitor from '../services/priceMonitor';
import healthFactorMonitor from '../services/healthFactorMonitor';
import liquidator from '../core/liquidator';
import { LiquidationTarget, LiquidationProfitCalculation, ExecutionResult } from '../interfaces';

/**
 * Strategy that focuses on liquidating positions in E-Mode
 * 
 * E-Mode positions may use different price sources and have higher LTV,
 * which can create unique liquidation opportunities.
 */
class EModeStrategy {
  private isEnabled = true;
  private executionHistory: ExecutionResult[] = [];
  private priorityMultiplier = 1.2; // E-Mode positions get 20% priority boost
  
  // Map of E-Mode categories to track
  private eModeCategoryNames: Record<number, string> = {
    1: 'Stablecoins',
    2: 'ETH',
    3: 'BTC',
    // Add other E-Mode categories as necessary
  };

  /**
   * Initialize strategy
   */
  public async initialize(): Promise<void> {
    logger.info(`E-Mode Strategy initialized with priority multiplier: ${this.priorityMultiplier}`);
  }

  /**
   * Enable or disable the strategy
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`E-Mode Strategy ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Scan for E-Mode liquidation opportunities
   */
  public async scan(): Promise<LiquidationProfitCalculation[]> {
    if (!this.isEnabled) {
      return [];
    }
    
    try {
      const opportunities: LiquidationProfitCalculation[] = [];
      
      // 1. Get liquidatable positions
      const liquidatablePositions = await healthFactorMonitor.getLiquidatablePositions();
      
      // 2. Filter for positions in E-Mode
      const eModePositions = liquidatablePositions.filter(p => p.eModeCategoryId !== 0);
      
      logger.info(`Found ${eModePositions.length} liquidatable E-Mode positions`);
      
      // 3. For each E-Mode position, check liquidation profitability
      for (const position of eModePositions) {
        logger.info(`Analyzing E-Mode position for ${position.user} (Category: ${this.eModeCategoryNames[position.eModeCategoryId] || position.eModeCategoryId})`);
        
        // For each debt-collateral pair in the position
        for (const debtAsset of position.debtAssets) {
          // Get the latest price data for the debt asset
          await priceMonitor.getPriceData(debtAsset.address);
          
          for (const collateralAsset of position.collateralAssets) {
            // Get the latest price data for the collateral asset
            await priceMonitor.getPriceData(collateralAsset.address);
            
            // Calculate profit for liquidating this debt with this collateral
            const profitCalculation = await liquidator.calculateLiquidationProfit(
              position,
              debtAsset,
              collateralAsset
            );
            
            // If profitable, boost priority for E-Mode positions
            if (profitCalculation.profitable) {
              // Boost priority based on E-Mode category
              profitCalculation.executionPriority *= this.priorityMultiplier;
              
              // Log the opportunity
              logger.info(`E-Mode liquidation opportunity:
                User: ${position.user}
                E-Mode Category: ${this.eModeCategoryNames[position.eModeCategoryId] || position.eModeCategoryId}
                Health Factor: ${position.healthFactor.toString()}
                Debt Asset: ${debtAsset.symbol}
                Collateral Asset: ${collateralAsset.symbol}
                Debt To Cover: ${profitCalculation.debtToCover.toString()}
                Collateral To Receive: ${profitCalculation.collateralToReceive.toString()}
                Estimated Profit: $${profitCalculation.netProfitUsd.toFixed(2)}
                Adjusted Priority: ${profitCalculation.executionPriority.toFixed(2)}
              `);
              
              opportunities.push(profitCalculation);
            }
          }
        }
      }
      
      // Sort opportunities by priority (highest first)
      opportunities.sort((a, b) => b.executionPriority - a.executionPriority);
      
      return opportunities;
    } catch (error) {
      logger.error('Error scanning for E-Mode opportunities:', error);
      return [];
    }
  }

  /**
   * Execute the best E-Mode liquidation opportunity
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
      
      logger.info(`Executing E-Mode liquidation for ${bestOpportunity.target.user}`);
      
      const result = await liquidator.executeLiquidation(bestOpportunity);
      this.executionHistory.push(result);
      
      return result;
    } catch (error) {
      logger.error('Error executing E-Mode strategy:', error);
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
  
  /**
   * Analysis of E-Mode specifics that might affect liquidation
   * 
   * This method analyzes E-Mode specific factors such as 
   * custom price sources, higher LTVs, etc.
   */
  public async analyzeEModeSpecificFactors(position: LiquidationTarget): Promise<Record<string, any>> {
    try {
      // Get E-Mode category details
      const categoryName = this.eModeCategoryNames[position.eModeCategoryId] || 'Unknown';
      
      // For each asset in position, check if it's relevant to E-Mode
      const relevantCollateral = position.collateralAssets.filter(asset => {
        // Logic to determine if asset is relevant to this E-Mode category
        // This would depend on specific E-Mode configurations
        return true;
      });
      
      // Analyze if there are special price sources used in E-Mode
      const priceSourceAnalysis = [];
      for (const asset of position.collateralAssets.concat(position.debtAssets)) {
        const priceData = await priceMonitor.getPriceData(asset.address);
        
        // Check if this asset might use a different price source in E-Mode
        // This is a simplification; actual implementation would depend on AAVE's E-Mode configuration
        const eModeSpecificPriceSource = asset.priceSource !== undefined;
        
        priceSourceAnalysis.push({
          asset: asset.symbol,
          address: asset.address,
          eModeSpecificPriceSource,
          priceDiscrepancy: priceData.discrepancyPercentage
        });
      }
      
      return {
        eModeCategoryId: position.eModeCategoryId,
        categoryName,
        relevantCollateralCount: relevantCollateral.length,
        priceSourceAnalysis,
        // Other E-Mode specific factors
      };
    } catch (error) {
      logger.error(`Error analyzing E-Mode specific factors for ${position.user}:`, error);
      return {};
    }
  }
}

export default new EModeStrategy(); 