# AAVE V3 Liquidation Strategy Bot

![AAVE Liquidation Bot Banner](https://placehold.co/1200x400/0a0a3a/FFFFFF?text=AAVE+V3+Liquidation+Bot)

## Overview

This project implements an automated liquidation strategy for the AAVE V3 protocol, focusing on identifying and exploiting profitable liquidation opportunities. The bot uses AAVE's flash loans to execute liquidations without requiring significant upfront capital.

## Architecture

![System Architecture](https://placehold.co/1200x800/0a0a3a/FFFFFF?text=Liquidation+Bot+Architecture)

The system consists of the following components:

1. **Price Monitor**: Tracks on-chain and off-chain prices to identify discrepancies
2. **Health Factor Scanner**: Monitors accounts approaching liquidation threshold
3. **Liquidation Executor**: Executes profitable liquidations using flash loans
4. **Profit Calculator**: Evaluates potential profitability of liquidation opportunities
5. **Strategy Manager**: Orchestrates the overall liquidation strategy

## Profit Mechanism

The liquidation profit comes from the liquidation bonus offered by the protocol. When a position is liquidated, the liquidator can purchase the collateral at a discount.

![Liquidation Profit Mechanism](https://placehold.co/1200x600/0a0a3a/FFFFFF?text=Liquidation+Profit+Mechanism)

## Flash Loan Guide

### What are AAVE Flash Loans?

Flash loans allow you to borrow assets without upfront collateral, provided you return the borrowed amount (plus fee) within the same transaction.

### Flash Loan Parameters

AAVE V3 supports two types of flash loans:

1. **Simple Flash Loan**: Borrow and repay the same assets
2. **Flash Loan with Collateral Swap**: Borrow assets and repay different assets

Key parameters:

| Parameter | Description | Typical Value |
|-----------|-------------|---------------|
| `asset` | Address of the asset to borrow | e.g., USDC address |
| `amount` | Amount to borrow | Any amount available in the pool |
| `interestRateMode` | Type of interest rate | 0 for flash loans |
| `onBehalfOf` | Receiver of the debt | Same as caller for flash loans |
| `params` | Additional encoded parameters | Encoded execution logic |
| `referralCode` | Optional referral code | 0 if none |
| `flashLoanPremium` | Fee percentage | 0.09% in AAVE V3 |

### Optimal Flash Loan Usage

![Flash Loan Flow](https://placehold.co/1200x600/0a0a3a/FFFFFF?text=Flash+Loan+Liquidation+Flow)

For optimal flash loan usage in liquidations:

1. **Borrow the repayment asset**: Borrow the asset needed to repay the target's debt
2. **Execute liquidation**: Liquidate the target's position and receive discounted collateral
3. **Swap if necessary**: Convert received collateral to the borrowed asset if different
4. **Repay flash loan**: Return the borrowed amount plus fee

### Gas Optimization

- Bundle multiple liquidations in a single flash loan when possible
- Prioritize high-value liquidations to maximize profit relative to gas costs
- Use calldata efficiently by encoding complex operations

## Setup and Installation

```bash
# Clone the repository
git clone https://github.com/your-username/aave-liquidation-bot.git
cd aave-liquidation-bot

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# Run the bot
npm start
```

## Configuration

Configuration is done through environment variables:

```
# Network
NETWORK=mainnet
RPC_URL=https://your-rpc-provider.com

# Wallet
PRIVATE_KEY=your_private_key

# Thresholds
MIN_PROFIT_THRESHOLD=100 # Minimum profit in USD
MAX_GAS_PRICE=100 # Maximum gas price in gwei

# Monitoring
HEALTH_FACTOR_THRESHOLD=1.05 # Start monitoring positions below this threshold

# Notifications
DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
```

## Strategies Implemented

1. **Basic Liquidation**: Standard liquidation when health factor < 1
2. **Oracle Delay Exploitation**: Exploits price delays between oracles and market prices
3. **E-Mode Liquidations**: Specialized for E-Mode positions with custom price feeds
4. **Multi-Collateral Optimization**: Prioritizes liquidations with optimal collateral types

## Risks and Limitations

- **MEV and Front-running**: Liquidation transactions may be front-run by other bots
- **Gas Price Volatility**: High gas prices can reduce profitability
- **Oracle Reliability**: Relies on accurate price feeds
- **Contract Upgrades**: AAVE protocol upgrades may require bot updates

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is for educational purposes only. Use at your own risk. Always test thoroughly before deploying to production. 
