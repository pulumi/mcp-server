import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../logging/logging.js';
import { createServer, Server } from '../server.js';
import { SESSION_CONFIG } from './config.js';

/**
 * Represents an active MCP session with its associated transport and server.
 * Each session is tied to a specific origin for security.
 */
export interface MCPSession {
  /** Unique session identifier */
  id: string;
  /** HTTP transport for this session */
  transport: StreamableHTTPServerTransport;
  /** MCP server instance for this session */
  server: Server;
  /** Last activity timestamp for cleanup purposes */
  lastActivity: number;
  /** Origin that created this session (for security validation) */
  origin?: string;
}

/**
 * Manages MCP sessions for HTTP transport.
 * Handles session creation, cleanup, and lifecycle management.
 */
export class SessionManager {
  private sessions = new Map<string, MCPSession>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private config: typeof SESSION_CONFIG;

  constructor(config: typeof SESSION_CONFIG) {
    this.config = config;
    this.startCleanup();
  }

  /**
   * Creates a new MCP session with associated transport and server.
   * Enforces session limits and associates the session with an origin.
   */
  async createSession(origin?: string): Promise<MCPSession> {
    // Enforce maximum session limit
    if (this.sessions.size >= this.config.maxSessions) {
      logger.warn(
        `Maximum sessions (${this.config.maxSessions}) reached, cleaning up expired sessions`
      );
      this.cleanup();
    }

    // Generate unique session ID
    const id = randomUUID();

    // Create MCP transport and server instances
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id
    });

    const server = createServer();
    await server.connect(transport);

    // Auto-cleanup when transport closes
    transport.onclose = () => {
      this.sessions.delete(id);
    };

    // Create and store the new session
    const session: MCPSession = {
      id,
      transport,
      server,
      lastActivity: Date.now(),
      origin
    };

    this.sessions.set(session.id, session);

    return session;
  }

  /**
   * Gets a session and updates its activity time if validation passes.
   * Returns the session if validation passes, undefined otherwise.
   */
  getAndUpdateSession(sessionId: string, requestOrigin?: string): MCPSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Security check: ensure request origin matches session origin
    if (session.origin !== requestOrigin) {
      return undefined;
    }

    // Update last activity time
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Deletes a specific session by ID.
   * Performs cleanup and removes from session map.
   */
  deleteSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      this.cleanupSession(session);
      this.sessions.delete(id);
    }
  }

  /**
   * Cleans up expired sessions based on their last activity.
   * Called periodically by the cleanup timer.
   */
  cleanup(): void {
    const now = Date.now();
    const expiredSessions = Array.from(this.sessions.entries()).filter(
      ([, session]) => now - session.lastActivity > this.config.sessionTimeout
    );

    expiredSessions.forEach(([id, session]) => {
      this.cleanupSession(session);
      this.sessions.delete(id);
    });
  }

  /**
   * Shuts down the session manager and cleans up all resources.
   * Stops the cleanup timer and closes all active sessions.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Cleanup all sessions
    Array.from(this.sessions.values()).forEach((session) => this.cleanupSession(session));
    this.sessions.clear();
  }

  /**
   * Cleans up a single session by closing its server.
   * Handles errors gracefully during cleanup.
   */
  private cleanupSession(session: MCPSession): void {
    try {
      session.server.close();
    } catch (error) {
      logger.warn(`Error cleaning up session ${session.id}:`, error);
    }
  }

  /**
   * Starts the periodic cleanup timer.
   * Runs session cleanup at configured intervals.
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
}
