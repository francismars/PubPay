// useError - Custom hook for error handling
// Note: This is a vanilla JS hook, not a React hook
import { ErrorService, ErrorLevel } from '../services/ErrorService';

export interface UseErrorOptions {
  autoLog?: boolean;
  showNotifications?: boolean;
  maxErrors?: number;
}

export class UseError {
  private errors: any[] = [];
  private isLogging: boolean = false;
  private options: UseErrorOptions;

  private errorService: ErrorService;

  constructor(options: UseErrorOptions = {}) {
    this.options = {
      autoLog: true,
      showNotifications: true,
      maxErrors: 100,
      ...options
    };
    this.errorService = new ErrorService();
  }

  // Log error
  logError(
    level: ErrorLevel,
    message: string,
    error?: Error,
    context?: any
  ): string {
    const errorId = this.errorService.log(level, message, error, context);

    if (this.options.autoLog) {
      this.errors.push({
        id: errorId,
        level,
        message,
        error,
        context,
        timestamp: Date.now()
      });
      this.errors = this.errors.slice(-(this.options.maxErrors || 100));
    }

    return errorId;
  }

  // Log debug message
  logDebug(message: string, context?: any): string {
    return this.logError(ErrorLevel.DEBUG, message, undefined, context);
  }

  // Log info message
  logInfo(message: string, context?: any): string {
    return this.logError(ErrorLevel.INFO, message, undefined, context);
  }

  // Log warning
  logWarning(message: string, error?: Error, context?: any): string {
    return this.logError(ErrorLevel.WARN, message, error, context);
  }

  // Log error
  logErrorLevel(message: string, error?: Error, context?: any): string {
    return this.logError(ErrorLevel.ERROR, message, error, context);
  }

  // Log critical error
  logCritical(message: string, error?: Error, context?: any): string {
    return this.logError(ErrorLevel.CRITICAL, message, error, context);
  }

  // Handle error
  handleError(error: Error, context?: any): string {
    return this.logError(ErrorLevel.ERROR, error.message, error, context);
  }

  // Handle network error
  handleNetworkError(error: Error, url: string, method: string): string {
    return this.logError(
      ErrorLevel.ERROR,
      `Network error: ${method} ${url}`,
      error,
      { url, method }
    );
  }

  // Handle Nostr error
  handleNostrError(error: Error, context?: any): string {
    return this.logError(ErrorLevel.ERROR, 'Nostr protocol error', error, {
      ...context,
      type: 'nostr'
    });
  }

  // Handle Lightning error
  handleLightningError(error: Error, context?: any): string {
    return this.logError(ErrorLevel.ERROR, 'Lightning payment error', error, {
      ...context,
      type: 'lightning'
    });
  }

  // Clear errors
  clearErrors(): void {
    this.errors = [];
  }

  // Clear specific error
  clearError(errorId: string): void {
    this.errors = this.errors.filter(err => err.id !== errorId);
  }

  // Get error statistics
  getErrorStats() {
    return this.errorService.getErrorStats();
  }

  // Get errors by level
  getErrorsByLevel(level: ErrorLevel) {
    return this.errors.filter(err => err.level === level);
  }

  // Get recent errors
  getRecentErrors(limit: number = 10) {
    return this.errors.slice(-limit);
  }

  // Export errors
  exportErrors() {
    return this.errorService.exportLogs();
  }

  // Test error handling
  testError() {
    return this.logError(ErrorLevel.INFO, 'Test error message', undefined, {
      test: true
    });
  }

  // Set logging state
  setLogging(logging: boolean): void {
    this.isLogging = logging;
  }

  // Get error service
  getErrorService() {
    return this.errorService;
  }

  // Getters
  get allErrors() {
    return this.errors;
  }
  get logging() {
    return this.isLogging;
  }
  get service() {
    return this.errorService;
  }
}
