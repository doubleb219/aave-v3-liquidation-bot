import { ethers, BigNumber, Contract } from 'ethers';
import config from '../config';
import logger from '../services/logger';
import priceMonitor from '../services/priceMonitor';
import { LiquidationTarget, Asset, LiquidationProfitCalculation, ExecutionResult, FlashLoanParams } from '../interfaces';

// ABIs
const POOL_ABI = [
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external',
  'function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function transfer(address recipient, uint256 amount) external returns (bool)'
];

const FLASH_LOAN_EXECUTOR_ABI = [
  'function executeOperation(address[] calldata assets, uint256[] calldata amounts, uint256[] calldata premiums, address initiator, bytes calldata params) external returns (bool)'
];

/**
 * Core liquidator service responsible for executing liquidations
 */
class Liquidator {
  private provider: ethers.providers.Provider;
  private wallet: ethers.Wallet | null;
  private pool: Contract;
  private flashLoanExecutor: Contract;

  // Flash loan premium percentage (e.g., 0.09% = 9/10000)
  private flashLoanPremium = 9;

  constructor() {
    config.initProvider();
    if (!config.provider || !config.wallet) {
      throw new Error('Provider or wallet not initialized');
    }

    this.provider = config.provider;
    this.wallet = config.wallet;

    this.pool = new ethers.Contract(
      config.aavePoolAddress,
      POOL_ABI,
      this.wallet
    );

    // The flash loan executor contract address should be deployed separately
    this.flashLoanExecutor = new ethers.Contract(
      '0xa653ddBAAec984570F5428b0604Ebd38f9df65Ea', // Replace with your deployed flash loan executor address
      FLASH_LOAN_EXECUTOR_ABI,
      this.wallet
    );
  }

  /**
   * Calculate profit potential for liquidating a position
   */
  public async calculateLiquidationProfit(
    target: LiquidationTarget,
    debtAsset: Asset,
    collateralAsset: Asset
  ): Promise<LiquidationProfitCalculation> {
    try {
      // Get latest prices
      const debtAssetPrice = await priceMonitor.getPriceData(debtAsset.address);
      const collateralAssetPrice = await priceMonitor.getPriceData(collateralAsset.address);

      // Get max debt to cover (either 50% or 100% depending on health factor)
      const closeFactorMultiplier = target.healthFactor.lt(config.closeFactorHfThreshold)
        ? 10000 // 100%
        : 5000;  // 50%

      const maxDebtToCover = debtAsset.amount.mul(closeFactorMultiplier).div(10000);

      // Use a smaller amount to be safe (e.g., 95% of max)
      const debtToCover = maxDebtToCover.mul(95).div(100);

      // Get liquidation bonus
      const liquidationBonus = collateralAsset.liquidationBonus || 1.05;

      // Calculate collateral to receive
      // Formula: (debtAssetPrice * debtToCover * 10^collateralDecimals * liquidationBonus) / (collateralAssetPrice * 10^debtDecimals)
      const collateralToReceive = debtAssetPrice.aaveOraclePrice
        .mul(debtToCover)
        .mul(BigNumber.from(10).pow(collateralAsset.decimals))
        .mul(Math.floor(liquidationBonus * 10000))
        .div(collateralAssetPrice.aaveOraclePrice)
        .div(BigNumber.from(10).pow(debtAsset.decimals))
        .div(10000);

      // Calculate USD values
      const debtAmountUsd = parseFloat(ethers.utils.formatUnits(debtToCover, debtAsset.decimals))
        * parseFloat(ethers.utils.formatUnits(debtAssetPrice.aaveOraclePrice, 8));

      const collateralAmountUsd = parseFloat(ethers.utils.formatUnits(collateralToReceive, collateralAsset.decimals))
        * parseFloat(ethers.utils.formatUnits(collateralAssetPrice.aaveOraclePrice, 8));

      // Calculate profit
      const grossProfitUsd = collateralAmountUsd - debtAmountUsd;

      // Calculate flash loan cost (0.09% fee)
      const flashLoanCostUsd = debtAmountUsd * (this.flashLoanPremium / 10000);

      // Estimate gas cost
      const gasPrice = await this.provider.getGasPrice();
      const gasLimit = 1000000; // Adjust based on your contract's gas usage
      const gasCostWei = gasPrice.mul(gasLimit);
      // const ethPriceUsd = parseFloat(
      //   ethers.utils.formatUnits(
      //     (await priceMonitor.getPriceData(config.aavePoolAddress)).aaveOraclePrice,
      //     8
      //   )
      // );
      const ethPriceUsd = 0
      const gasCostUsd = parseFloat(ethers.utils.formatEther(gasCostWei)) * ethPriceUsd;

      // Calculate net profit
      const netProfitUsd = grossProfitUsd - flashLoanCostUsd - gasCostUsd;
      const profitable = netProfitUsd > config.minProfitUsd;

      // Calculate execution priority (higher = more profitable)
      const executionPriority = profitable ? (netProfitUsd / debtAmountUsd) * 100 : 0;
      return {
        target,
        debtAsset,
        collateralAsset,
        debtToCover,
        collateralToReceive,
        liquidationBonus,
        estimatedProfitUsd: grossProfitUsd,
        estimatedGasCostUsd: gasCostUsd + flashLoanCostUsd,
        netProfitUsd,
        profitable,
        executionPriority
      };
    } catch (error) {
      logger.error(`Error calculating liquidation profit:`, error);
      throw error;
    }
  }

  /**
   * Execute a liquidation using a flash loan
   */
  public async executeLiquidation(
    calculation: LiquidationProfitCalculation
  ): Promise<ExecutionResult> {
    try {
      const { target, debtAsset, collateralAsset, debtToCover } = calculation;
      console.log("debtAsset address", debtAsset.address);
      console.log("collateralAsset address", collateralAsset.address);
      // Encode params for the flash loan executor
      const params = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'address', 'uint256', 'bool'],
        [
          collateralAsset.address,
          debtAsset.address,
          target.user,
          debtToCover,
          false // Don't receive aToken, receive the underlying asset instead
        ]
      );
      // Setup flash loan params
      const flashLoanParams: FlashLoanParams = {
        assets: [debtAsset.address],
        amounts: [debtToCover],
        interestRateModes: [0], // 0 for no debt (flash loan)
        receiver: this.flashLoanExecutor.address,
        params,
        referralCode: 0
      };

      // Check if gas price is acceptable
      const currentGasPrice = await this.provider.getGasPrice();
      const maxGasPrice = ethers.utils.parseUnits(config.maxGasPriceGwei.toString(), 'gwei');

      if (currentGasPrice.gt(maxGasPrice)) {
        logger.warn(`Current gas price (${ethers.utils.formatUnits(currentGasPrice, 'gwei')} gwei) exceeds maximum (${config.maxGasPriceGwei} gwei)`);
        return {
          success: false,
          error: 'Gas price too high',
          timestamp: Date.now()
        };
      }
      console.log("flashLoanParams assets", flashLoanParams.assets);
      console.log("flashLoanParams amount", flashLoanParams.amounts.map((amount) => ethers.utils.formatUnits(amount)));
      // Execute flash loan
      const tx = await this.pool.flashLoan(
        flashLoanParams.receiver,
        flashLoanParams.assets,
        flashLoanParams.amounts,
        flashLoanParams.interestRateModes,
        this.wallet!.address,
        flashLoanParams.params,
        flashLoanParams.referralCode,
        {
          gasLimit: 2000000,
          gasPrice: currentGasPrice
        }
      );

      logger.info(`Flash loan liquidation transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait(1);

      const success = receipt.status === 1;
      const gasUsed = receipt.gasUsed;
      const gasCostWei = gasUsed.mul(receipt.effectiveGasPrice);

      if (success) {
        logger.info(`Liquidation successful! Tx hash: ${receipt.transactionHash}`);

        // Calculate actual profit based on received tokens
        // This would require checking token balances before and after

        return {
          success: true,
          transactionHash: receipt.transactionHash,
          gasUsed,
          gasCostWei,
          timestamp: Date.now()
        };
      } else {
        logger.error(`Liquidation failed! Tx hash: ${receipt.transactionHash}`);
        return {
          success: false,
          transactionHash: receipt.transactionHash,
          error: 'Transaction failed',
          gasUsed,
          gasCostWei,
          timestamp: Date.now()
        };
      }
    } catch (error) {
      logger.error('Error executing liquidation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      };
    }
  }
}

export default new Liquidator(); 