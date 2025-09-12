import express from 'express';
import { logger } from '../../logging/logging.js';
import { SessionManager } from './sessionManager.js';
import { SESSION_CONFIG } from './config.js';

/**
 * Routes MCP HTTP requests to appropriate session handlers.
 * Handles session creation for initialize requests and routing to existing sessions.
 */
export class HttpRequestRouter {
  private sessionManager: SessionManager;

  constructor(sessionConfig: typeof SESSION_CONFIG) {
    this.sessionManager = new SessionManager(sessionConfig);
  }

  /**
   * Routes an MCP HTTP request to the appropriate handler.
   * Returns Express middleware function for use in the transport layer.
   */
  createHandler(): express.RequestHandler {
    return async (req, res) => {
      try {
        await this.routeRequest(req, res);
      } catch (error) {
        logger.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    };
  }

  /**
   * Core routing logic for MCP requests.
   * Determines routing based on session ID and request type.
   */
  private async routeRequest(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const isInitialize = this.isInitializeRequest(req.body);

    if (!sessionId && isInitialize) {
      await this.handleNewSession(req, res);
    } else if (sessionId && !isInitialize) {
      await this.handleExistingSession(req, res, sessionId);
    } else {
      this.handleInvalidRequest(res, sessionId, isInitialize);
    }
  }

  /**
   * Creates a new session for initialize requests.
   */
  private async handleNewSession(req: express.Request, res: express.Response): Promise<void> {
    const session = await this.sessionManager.createSession(req.headers.origin);
    res.header('Mcp-Session-Id', session.id);
    await session.transport.handleRequest(req, res, req.body);
  }

  /**
   * Routes requests to existing sessions after validation.
   */
  private async handleExistingSession(
    req: express.Request,
    res: express.Response,
    sessionId: string
  ): Promise<void> {
    const session = this.sessionManager.getAndUpdateSession(sessionId, req.headers.origin);

    if (!session) {
      // Return 404 for both nonexistent sessions and origin mismatches
      // to prevent session enumeration attacks
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.header('Mcp-Session-Id', sessionId);
    await session.transport.handleRequest(req, res, req.body);
  }

  /**
   * Handles invalid request combinations (session ID with initialize, or no session without initialize).
   */
  private handleInvalidRequest(
    res: express.Response,
    sessionId: string | undefined,
    isInitialize: boolean
  ): void {
    const errorMsg =
      sessionId && isInitialize
        ? 'Bad Request: cannot send initialize request with existing session ID.'
        : 'Bad Request: invalid session ID or method.';

    res.status(400).json({ error: errorMsg });
  }

  /**
   * Cleans up the router and its session manager.
   */
  destroy(): void {
    this.sessionManager.destroy();
  }

  /**
   * Checks if the request body contains an MCP initialize method.
   * Supports both single requests and batched request arrays.
   */
  private isInitializeRequest(body: unknown): boolean {
    const hasInitializeMethod = (obj: unknown): boolean =>
      obj !== null &&
      typeof obj === 'object' &&
      'method' in obj &&
      (obj as { method: unknown }).method === 'initialize';

    return Array.isArray(body) ? body.some(hasInitializeMethod) : hasInitializeMethod(body);
  }
}
