const { validateConfig } = require('./config');
const logger = require('./logger');
const { startScheduler, stopScheduler } = require('./scheduler');

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown requested', { signal });
  stopScheduler();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
  process.exitCode = 1;
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

async function main() {
  validateConfig();
  await startScheduler();
}

main()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((err) => {
    logger.error('Worker failed to start', { error: err.message });
    process.exit(1);
  });
