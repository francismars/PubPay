"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendServer = void 0;
// Backend Server - Modern TypeScript implementation
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const lightning_1 = require("./routes/lightning");
const live_1 = require("./routes/live");
const jukebox_1 = require("./routes/jukebox");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
const path_1 = __importDefault(require("path"));
// Load environment variables from project root
const envPath = path_1.default.resolve(__dirname, '../../../.env');
dotenv_1.default.config({ path: envPath });
class BackendServer {
    app;
    port;
    logger;
    constructor() {
        this.app = (0, express_1.default)();
        this.port = parseInt(process.env['PORT'] || '3000', 10);
        this.logger = new logger_1.Logger('BackendServer');
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }
    initializeMiddleware() {
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: false, // Disable CSP for development
            crossOriginEmbedderPolicy: false
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: process.env['NODE_ENV'] === 'production'
                ? process.env['FRONTEND_URL']
                : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        // Compression and logging
        // this.app.use(compression()); // Temporarily disabled due to type issues
        this.app.use((0, morgan_1.default)('combined'));
        // Body parsing
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        // Static files (for serving built frontend)
        this.app.use(express_1.default.static('dist'));
    }
    initializeRoutes() {
        // API routes
        this.app.use('/lightning', new lightning_1.LightningRouter().getRouter());
        this.app.use('/live', new live_1.LiveRouter().getRouter());
        this.app.use('/jukebox', new jukebox_1.JukeboxRouter().getRouter());
        // Health check endpoint
        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env['npm_package_version'] || '1.0.0'
            });
        });
        // Serve React app for all other routes (SPA fallback)
        this.app.get('*', (_req, res) => {
            res.sendFile('index.html', { root: 'dist' });
        });
    }
    initializeErrorHandling() {
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
        this.app.use((error, req, res, next) => {
            new errorHandler_1.ErrorHandler().getHandler()(error, req, res, next);
        });
    }
    start() {
        this.app.listen(this.port, () => {
            this.logger.info(`🚀 Backend server started on port ${this.port}`);
            this.logger.info(`📊 Environment: ${process.env['NODE_ENV'] || 'development'}`);
            this.logger.info(`🔗 Health check: http://localhost:${this.port}/health`);
            // Log configuration status
            this.logConfiguration();
        });
    }
    logConfiguration() {
        const config = {
            LNBITS_URL: !!process.env['LNBITS_URL'],
            LNBITS_API_KEY: !!process.env['LNBITS_API_KEY'],
            WEBHOOK_URL: !!process.env['WEBHOOK_URL'],
            NODE_ENV: process.env['NODE_ENV'] || 'development'
        };
        this.logger.info('Configuration status:', config);
        if (!config.LNBITS_API_KEY) {
            this.logger.warn('⚠️  LNBITS_API_KEY not configured - Lightning payments will be disabled');
        }
        if (!config.WEBHOOK_URL) {
            this.logger.warn('⚠️  WEBHOOK_URL not configured - Webhook processing may fail');
        }
    }
    getApp() {
        return this.app;
    }
}
exports.BackendServer = BackendServer;
// Start server if this file is run directly
if (require.main === module) {
    const server = new BackendServer();
    server.start();
}
//# sourceMappingURL=index.js.map