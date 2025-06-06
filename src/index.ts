import config from './config';
import logger from './services/logger';
import strategyManager from './strategies/strategyManager';

async function main() {
  try {
    logger.info('Starting AAVE Liquidation Bot...');
    
    // Initialize config (loads environment variables and sets up provider)
    config.initProvider();
    
    // Initialize strategy manager
    await strategyManager.initialize();
    
    // Start the strategy manager
    await strategyManager.start();

    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal, shutting down gracefully...');
      strategyManager.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal, shutting down gracefully...');
      strategyManager.stop();
      process.exit(0);
    });

    logger.info('Bot is running. Press CTRL+C to stop.');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main().catch(error => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
}); 