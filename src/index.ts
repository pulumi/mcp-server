import { cmd } from './cmd/cmd.js';
import { logger } from './logging/logging.js';

const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

// Handle termination signals
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info('Shutting down Pulumi MCP server...');
    process.exit(1);
  });
});

cmd();
