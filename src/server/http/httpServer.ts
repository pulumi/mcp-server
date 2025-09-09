import express from 'express';
import { logger } from '../../logging/logging.js';
import { AddressInfo } from 'net';
import { createCORSMiddleware } from './cors.js';
import { HttpRequestRouter } from './router.js';
import { HTTP_SERVER_CONFIG, SESSION_CONFIG } from './config.js';

/**
 * Starts the MCP HTTP server on the specified port.
 * Sets up Express with CORS, session management, and request handling.
 */
export const startMcpHttpServer = (port: number) => {
  // Initialize components with configs
  const requestRouter = new HttpRequestRouter(SESSION_CONFIG);

  // Create Express application with JSON parsing
  const app = express();
  app.use(express.json());

  // Apply CORS validation to MCP endpoint
  app.use(HTTP_SERVER_CONFIG.mcpEndpoint, createCORSMiddleware());

  // Route all MCP requests through the dedicated endpoint
  app.all(HTTP_SERVER_CONFIG.mcpEndpoint, requestRouter.createHandler());

  // Determine host and start the HTTP server
  const host = process.env.MCP_HTTP_HOST || HTTP_SERVER_CONFIG.defaultHost;
  const server = app.listen(port, host, () => {
    const addr = server.address() as AddressInfo;
    logger.info(`MCP server listening on ${host}:${addr.port}${HTTP_SERVER_CONFIG.mcpEndpoint}`);
  });

  // Configure server timeouts for stability
  server.timeout = HTTP_SERVER_CONFIG.timeout;
  server.keepAliveTimeout = HTTP_SERVER_CONFIG.keepAliveTimeout;
  server.headersTimeout = HTTP_SERVER_CONFIG.headersTimeout;

  // Handle server errors
  server.on('error', (error: Error) => {
    logger.error('Server error:', error);
  });

  // Set up graceful shutdown handlers
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    server.close(() => {
      requestRouter.destroy();
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};
