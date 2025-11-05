// Backend Server - Modern TypeScript implementation
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Request, Response, NextFunction } from 'express';
import { LightningRouter } from './routes/lightning';
import { LiveRouter } from './routes/live';
import { JukeboxRouter } from './routes/jukebox';
import { ErrorHandler } from './middleware/errorHandler';
import { RoomsRouter } from './routes/rooms';
import { Nip05Router } from './routes/nip05';
import { Logger } from './utils/logger';

import path from 'path';

// Load environment variables from backend folder
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

export class BackendServer {
  private app: express.Application;
  private port: number;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env['PORT'] || '3002', 10);
    this.logger = new Logger('BackendServer');

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: false, // Disable CSP for development
        crossOriginEmbedderPolicy: false
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin:
          process.env['NODE_ENV'] === 'production'
            ? process.env['FRONTEND_URL']
            : [
                'http://localhost:3000',
                'http://localhost:3001',
                'http://localhost:3002',
                'http://localhost:8080'
              ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
      })
    );

    // Compression and logging
    // this.app.use(compression()); // Temporarily disabled due to type issues
    this.app.use(morgan('combined'));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files (for serving built frontend)
    // Only serve if dist directory exists
    const distPath = path.resolve(__dirname, '../dist');
    try {
      const fs = require('fs');
      if (fs.existsSync(distPath)) {
        this.app.use(express.static('dist'));
      }
    } catch {
      // dist directory doesn't exist, skip static file serving
    }
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0'
      });
    });

    // API routes
    this.app.use('/lightning', new LightningRouter().getRouter());
    this.app.use('/live', new LiveRouter().getRouter());
    this.app.use('/multi', new RoomsRouter().getRouter());
    this.app.use('/jukebox', new JukeboxRouter().getRouter());

    // Create NIP-05 router and service instance (shared)
    const nip05Router = new Nip05Router();
    const nip05Service = nip05Router.getService();

    // Serve .well-known/nostr.json for NIP-05 (MUST be before catch-all route)
    // Use the same service instance as the router to ensure data consistency
    this.app.get('/.well-known/nostr.json', (req: Request, res: Response) => {
      try {
        const json = nip05Service.getNostrJson();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json(json);
      } catch (error) {
        this.logger.error('Error serving nostr.json:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate nostr.json'
        });
      }
    });

    this.app.use('/nip05', nip05Router.getRouter());

    // Serve React app for all other routes (SPA fallback)
    // Only if dist/index.html exists
    this.app.get('*', (req: Request, res: Response, next: NextFunction) => {
      const fs = require('fs');
      const indexPath = path.resolve(__dirname, '../dist/index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile('index.html', { root: 'dist' });
      } else {
        // If no index.html, return 404 for non-API routes
        if (!req.path.startsWith('/api') && !req.path.startsWith('/lightning') &&
            !req.path.startsWith('/live') && !req.path.startsWith('/multi') &&
            !req.path.startsWith('/jukebox') && !req.path.startsWith('/nip05')) {
          res.status(404).json({
            success: false,
            error: 'Route not found',
            path: req.path
          });
        } else {
          next();
        }
      }
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path,
        method: req.method
      });
    });

    // Global error handler
    this.app.use(
      (error: Error, req: Request, res: Response, next: NextFunction) => {
        new ErrorHandler().getHandler()(error, req, res, next);
      }
    );
  }

  public start(): void {
    this.app.listen(this.port, () => {
      this.logger.info(`🚀 Backend server started on port ${this.port}`);
      this.logger.info(
        `📊 Environment: ${process.env['NODE_ENV'] || 'development'}`
      );
      this.logger.info(`🔗 Health check: http://localhost:${this.port}/health`);

      // Log configuration status
      this.logConfiguration();
    });
  }

  private logConfiguration(): void {
    const config = {
      LNBITS_URL: !!process.env['LNBITS_URL'],
      LNBITS_API_KEY: !!process.env['LNBITS_API_KEY'],
      WEBHOOK_URL: !!process.env['WEBHOOK_URL'],
      NODE_ENV: process.env['NODE_ENV'] || 'development'
    };

    this.logger.info('Configuration status:', config);

    if (!config.LNBITS_API_KEY) {
      this.logger.warn(
        '⚠️  LNBITS_API_KEY not configured - Lightning payments will be disabled'
      );
    }

    if (!config.WEBHOOK_URL) {
      this.logger.warn(
        '⚠️  WEBHOOK_URL not configured - Webhook processing may fail'
      );
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new BackendServer();
  server.start();
}
