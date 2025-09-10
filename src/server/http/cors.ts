import express from 'express';
import { logger } from '../../logging/logging.js';

/**
 * CORS configuration for MCP HTTP transport.
 * - strict: Only allows explicitly configured origins
 * - development: Allows localhost + explicitly configured origins
 * - disabled: Allows all origins (not recommended for production)
 */
export interface CORSConfig {
  mode: 'strict' | 'development' | 'disabled';
  allowedOrigins: string[];
}

// Pattern to match localhost origins (IPv4, IPv6, and named localhost)
const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Loads CORS configuration from environment variables.
 * Uses MCP_CORS_MODE and MCP_ALLOWED_ORIGINS environment variables.
 */
export function loadCORSConfig(): CORSConfig {
  const validModes = ['strict', 'development', 'disabled'];
  const givenMode = (process.env.MCP_CORS_MODE || 'strict').toLowerCase();

  const mode = validModes.includes(givenMode) ? givenMode : 'strict';

  if (!validModes.includes(givenMode)) {
    logger.warn(`Invalid CORS mode '${givenMode}'. Defaulting to 'strict'.`);
  }

  const allowedOrigins = parseCommaSeparatedEnv(process.env.MCP_ALLOWED_ORIGINS);
  return { mode: mode as CORSConfig['mode'], allowedOrigins };
}

/**
 * Sets standard CORS headers for MCP HTTP responses.
 * Includes session ID header for MCP protocol communication.
 */
export function setCORSHeaders(res: express.Response, origin?: string): void {
  res.header('Access-Control-Max-Age', '3600');
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
}

/**
 * Checks if an origin is allowed based on CORS configuration.
 * In development mode, localhost origins are automatically allowed.
 */
export function isOriginAllowed(origin: string, config: CORSConfig): boolean {
  // Check explicit allowlist
  if (config.allowedOrigins.includes(origin)) return true;

  // In development mode, allow localhost origins
  if (config.mode === 'development' && LOCALHOST_PATTERN.test(origin)) return true;

  return false;
}

/**
 * Creates Express middleware for CORS validation and header setting.
 * Handles preflight OPTIONS requests and origin validation.
 */
export function createCORSMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    const corsConfig = loadCORSConfig();

    // If CORS is disabled, allow all origins
    if (corsConfig.mode === 'disabled') {
      setCORSHeaders(res);
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      return next();
    }

    // Allow requests without origin header (same-origin requests)
    if (!origin) {
      return next();
    }

    // Check if the origin is allowed
    if (!isOriginAllowed(origin, corsConfig)) {
      res.status(403).send('Origin not allowed');
      return;
    }

    setCORSHeaders(res, origin);

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  };
}

/**
 * Parses a comma-separated environment variable into a trimmed array.
 * Filters out empty values after trimming.
 */
function parseCommaSeparatedEnv(envValue: string | undefined): string[] {
  return (
    envValue
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) || []
  );
}
