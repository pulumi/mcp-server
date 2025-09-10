// HTTP server constants (all timeouts in milliseconds)
export const HTTP_SERVER_CONFIG = {
  timeout: 60000, // 60 seconds
  keepAliveTimeout: 60000, // 60 seconds
  headersTimeout: 60000, // 60 seconds
  defaultHost: '0.0.0.0', // Listen on all interfaces
  mcpEndpoint: '/mcp' // MCP protocol endpoint
} as const;

// Session manager constants
export const SESSION_CONFIG = {
  sessionTimeout: parseInt(process.env.MCP_SESSION_TIMEOUT || '1800000'), // 30 minutes default
  cleanupInterval: parseInt(process.env.MCP_CLEANUP_INTERVAL || '300000'), // 5 minutes default
  maxSessions: parseInt(process.env.MCP_MAX_SESSIONS || '1000') // 1000 sessions default
} as const;
