// ErrorHandler - Centralized error handling middleware
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

export class ErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ErrorHandler');
  }

  getHandler() {
    return (error: Error, req: Request, res: Response, _next: NextFunction): void => {
      this.logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params
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
