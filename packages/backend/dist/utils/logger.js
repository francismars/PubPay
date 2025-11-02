"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
// Logger - Centralized logging utility
class Logger {
    context;
    constructor(context) {
        this.context = context;
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const contextStr = `[${this.context}]`;
        const levelStr = `[${level}]`;
        if (data) {
            return `${timestamp} ${levelStr} ${contextStr} ${message} ${JSON.stringify(data)}`;
        }
        return `${timestamp} ${levelStr} ${contextStr} ${message}`;
    }
    info(message, data) {
        console.log(this.formatMessage('INFO', message, data));
    }
    warn(message, data) {
        console.warn(this.formatMessage('WARN', message, data));
    }
    error(message, data) {
        console.error(this.formatMessage('ERROR', message, data));
    }
    debug(message, data) {
        if (process.env['NODE_ENV'] === 'development') {
            console.debug(this.formatMessage('DEBUG', message, data));
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map