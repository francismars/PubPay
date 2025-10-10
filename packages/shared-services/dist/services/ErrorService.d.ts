export declare enum ErrorLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error",
    CRITICAL = "critical"
}
export interface ErrorLog {
    id: string;
    level: ErrorLevel;
    message: string;
    error?: Error;
    context?: any;
    timestamp: number;
    userId?: string;
    sessionId?: string;
    url?: string;
    userAgent?: string;
}
export declare class ErrorService {
    private logs;
    private maxLogs;
    private isDevelopment;
    constructor(isDevelopment?: boolean);
    /**
     * Log an error
     */
    log(level: ErrorLevel, message: string, error?: Error, context?: any): string;
    /**
     * Log debug message
     */
    debug(message: string, context?: any): string;
    /**
     * Log info message
     */
    info(message: string, context?: any): string;
    /**
     * Log warning
     */
    warn(message: string, error?: Error, context?: any): string;
    /**
     * Log error
     */
    error(message: string, error?: Error, context?: any): string;
    /**
     * Log critical error
     */
    critical(message: string, error?: Error, context?: any): string;
    /**
     * Handle and log error
     */
    handleError(error: Error, context?: any): string;
    /**
     * Handle network error
     */
    handleNetworkError(error: Error, url: string, method: string): string;
    /**
     * Handle Nostr error
     */
    handleNostrError(error: Error, context?: any): string;
    /**
     * Handle Lightning error
     */
    handleLightningError(error: Error, context?: any): string;
    /**
     * Get error logs
     */
    getLogs(level?: ErrorLevel, limit?: number): ErrorLog[];
    /**
     * Get error statistics
     */
    getErrorStats(): {
        total: number;
        byLevel: Record<ErrorLevel, number>;
        recent: number;
        critical: number;
    };
    /**
     * Clear logs
     */
    clearLogs(): void;
    /**
     * Export logs
     */
    exportLogs(): string;
    /**
     * Setup global error handlers
     */
    private setupGlobalErrorHandlers;
    /**
     * Output to console
     */
    private outputToConsole;
    /**
     * Send to external service
     */
    private sendToExternalService;
    /**
     * Generate unique error ID
     */
    private generateErrorId;
    /**
     * Get current user ID
     */
    private getCurrentUserId;
    /**
     * Get current session ID
     */
    private getCurrentSessionId;
}
