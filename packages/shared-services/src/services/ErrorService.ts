// ErrorService - Handles error logging and reporting
// import { ERROR_MESSAGES } from '../../utils/constants';

export enum ErrorLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
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

export class ErrorService {
  private logs: ErrorLog[] = [];
  private maxLogs: number = 1000;
  private isDevelopment: boolean;

  constructor(isDevelopment: boolean = false) {
    this.isDevelopment = isDevelopment;
    this.setupGlobalErrorHandlers();
  }

  /**
   * Log an error
   */
  log(
    level: ErrorLevel,
    message: string,
    error?: Error,
    context?: any
  ): string {
    const errorLog: ErrorLog = {
      id: this.generateErrorId(),
      level,
      message,
      error,
      context,
      timestamp: Date.now(),
      userId: this.getCurrentUserId(),
      sessionId: this.getCurrentSessionId(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    this.logs.push(errorLog);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output based on level
    this.outputToConsole(errorLog);

    // Send to external service in production
    if (!this.isDevelopment) {
      this.sendToExternalService(errorLog);
    }

    return errorLog.id;
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: any): string {
    return this.log(ErrorLevel.DEBUG, message, undefined, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: any): string {
    return this.log(ErrorLevel.INFO, message, undefined, context);
  }

  /**
   * Log warning
   */
  warn(message: string, error?: Error, context?: any): string {
    return this.log(ErrorLevel.WARN, message, error, context);
  }

  /**
   * Log error
   */
  error(message: string, error?: Error, context?: any): string {
    return this.log(ErrorLevel.ERROR, message, error, context);
  }

  /**
   * Log critical error
   */
  critical(message: string, error?: Error, context?: any): string {
    return this.log(ErrorLevel.CRITICAL, message, error, context);
  }

  /**
   * Handle and log error
   */
  handleError(error: Error, context?: any): string {
    const message = error.message || 'Unknown error occurred';
    return this.error(message, error, context);
  }

  /**
   * Handle network error
   */
  handleNetworkError(error: Error, url: string, method: string): string {
    const message = `Network error: ${method} ${url}`;
    return this.error(message, error, { url, method });
  }

  /**
   * Handle Nostr error
   */
  handleNostrError(error: Error, context?: any): string {
    const message = 'Nostr protocol error';
    return this.error(message, error, { ...context, type: 'nostr' });
  }

  /**
   * Handle Lightning error
   */
  handleLightningError(error: Error, context?: any): string {
    const message = 'Lightning payment error';
    return this.error(message, error, { ...context, type: 'lightning' });
  }

  /**
   * Get error logs
   */
  getLogs(level?: ErrorLevel, limit?: number): ErrorLog[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    if (limit) {
      filteredLogs = filteredLogs.slice(-limit);
    }

    return filteredLogs;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byLevel: Record<ErrorLevel, number>;
    recent: number;
    critical: number;
    } {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recent = this.logs.filter(log => now - log.timestamp < oneHour);

    const byLevel = this.logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<ErrorLevel, number>);

    return {
      total: this.logs.length,
      byLevel,
      recent: recent.length,
      critical: byLevel[ErrorLevel.CRITICAL] || 0
    };
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error, {
        type: 'uncaught',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(
        new Error(event.reason),
        { type: 'unhandledrejection' }
      );
    });
  }

  /**
   * Output to console
   */
  private outputToConsole(log: ErrorLog): void {
    const timestamp = new Date(log.timestamp).toISOString();
    const prefix = `[${timestamp}] [${log.level.toUpperCase()}]`;

    switch (log.level) {
    case ErrorLevel.DEBUG:
      console.debug(prefix, log.message, log.context);
      break;
    case ErrorLevel.INFO:
      console.info(prefix, log.message, log.context);
      break;
    case ErrorLevel.WARN:
      console.warn(prefix, log.message, log.error, log.context);
      break;
    case ErrorLevel.ERROR:
    case ErrorLevel.CRITICAL:
      console.error(prefix, log.message, log.error, log.context);
      break;
    }
  }

  /**
   * Send to external service
   */
  private sendToExternalService(log: ErrorLog): void {
    // In a real implementation, this would send to an external logging service
    // like Sentry, LogRocket, or a custom API endpoint
    console.log('Would send to external service:', log);
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current user ID
   */
  private getCurrentUserId(): string | undefined {
    // This would get the current user ID from your auth system
    return undefined;
  }

  /**
   * Get current session ID
   */
  private getCurrentSessionId(): string | undefined {
    // This would get the current session ID
    return undefined;
  }
}
