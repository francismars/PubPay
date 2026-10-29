// ErrorHandler - Centralized error handling middleware
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';

const SENSITIVE_KEY =
  /^(password|adminToken|admin_token|secret|token|authorization|api[_-]?key|x-room-password|x-room-admin-token|x-webhook-secret)$/i;

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return redactRecord(value as Record<string, unknown>);
  }
  return value;
}

function redactRecord(
  input: Record<string, unknown> | undefined | null
): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

export class ErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ErrorHandler');
  }

  getHandler() {
    return (
      error: Error,
      req: Request,
      res: Response,
      _next: NextFunction
    ): void => {
      this.logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: (req.url || '').split('?')[0],
        method: req.method,
        body: redactRecord(req.body as Record<string, unknown>),
        query: redactRecord(req.query as Record<string, unknown>),
        params: redactRecord(req.params as Record<string, unknown>)
      });

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: isDevelopment ? error.message : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    };
  }
}
