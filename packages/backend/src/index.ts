// Backend Server - Modern TypeScript implementation
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { LightningRouter } from './routes/lightning.js';
import { ErrorHandler } from './middleware/errorHandler.js';
import { RoomsRouter } from './routes/rooms.js';
import { Nip05Router } from './routes/nip05.js';
import { Logger } from './utils/logger.js';
import { asOptionalString } from './utils/requestParams.js';
import { getWebhookSecret } from './utils/webhookAuth.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from backend folder
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

function resolveCorsOrigin():
  | boolean
  | string
  | string[]
  | ((
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => void) {
  if (process.env['NODE_ENV'] !== 'production') {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3010',
      'http://localhost:3002',
      'http://localhost:8080'
    ];
  }
  const raw = process.env['FRONTEND_URL']?.trim();
  if (!raw) {
    // Fail closed: never reflect arbitrary Origin when misconfigured
    return false;
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export class BackendServer {
  private app: express.Application;
  private port: number;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env['PORT'] || '3002', 10);
    this.logger = new Logger('BackendServer');

    if (
      process.env['NODE_ENV'] === 'production' &&
      !process.env['FRONTEND_URL']?.trim()
    ) {
      this.logger.error(
        'FRONTEND_URL is required in production (CORS fail-closed)'
      );
    }
    if (
      process.env['NODE_ENV'] === 'production' &&
      !getWebhookSecret()
    ) {
      this.logger.error(
        'WEBHOOK_SECRET is required in production — webhooks will be rejected'
      );
    }

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    if (process.env['TRUST_PROXY'] === '1' || process.env['TRUST_PROXY'] === 'true') {
      this.app.set('trust proxy', 1);
    }

    this.app.use(
      helmet({
        contentSecurityPolicy: process.env['NODE_ENV'] === 'production',
        crossOriginEmbedderPolicy: false
      })
    );

    this.app.use(
      cors({
        origin: resolveCorsOrigin(),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'X-Room-Password',
          'X-Room-Admin-Token',
          'X-Webhook-Secret'
        ]
      })
    );

    // Strip query strings from access logs (passwords/tokens must not appear)
    morgan.token('url', req => (req.url || '').split('?')[0] || '');
    this.app.use(morgan('combined'));

    this.app.use(
      rateLimit({
        windowMs: 60_000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many requests' }
      })
    );

    this.app.use(
      '/lightning',
      rateLimit({
        windowMs: 60_000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false
      })
    );
    this.app.use(
      '/nip05',
      rateLimit({
        windowMs: 60_000,
        max: 40,
        standardHeaders: true,
        legacyHeaders: false
      })
    );

    // 1mb default (down from 10mb). Schedule imports stay well under this.
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
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
    this.app.use('/multi', new RoomsRouter().getRouter());

    // Create NIP-05 router and service instance (shared)
    const nip05Router = new Nip05Router();
    const nip05Service = nip05Router.getService();

    // Serve .well-known/nostr.json for NIP-05
    // Use the same service instance as the router to ensure data consistency
    // Supports optional ?name=<name> query parameter for filtering
    this.app.get('/.well-known/nostr.json', (req: Request, res: Response) => {
      try {
        // Extract name parameter, treat empty string as undefined (no filter)
        const nameParam = asOptionalString(req.query.name);
        const name =
          nameParam && nameParam.trim() !== '' ? nameParam.trim() : undefined;
        const json = nip05Service.getNostrJson(name);
        // CORS is handled by the cors() middleware above
        // Content-Type is set by res.json()
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

// Always start — this file is the sole entrypoint; an import.meta.url vs
// argv[1] "is main" guard breaks under PM2 fork mode (argv[1] is PM2's wrapper).
const server = new BackendServer();
server.start();
