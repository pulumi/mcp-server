import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';
import { logger } from '../../logging/logging.js';

export const connectStdioTransport = () => {
  const transport = new StdioServerTransport();

  const server = createServer();
  // Connect the server to the transport
  server.connect(transport).catch((error) => {
    logger.error('Failed to connect server:', error);
    process.exit(1);
  });
};
