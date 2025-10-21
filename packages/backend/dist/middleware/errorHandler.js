"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
const logger_1 = require("./logger");
class ErrorHandler {
    logger;
    constructor() {
        this.logger = new logger_1.Logger('ErrorHandler');
    }
    getHandler() {
        return (error, req, res, next) => {
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
exports.ErrorHandler = ErrorHandler;
//# sourceMappingURL=errorHandler.js.map