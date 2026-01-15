/**
 * Standardized Error Handling Utilities
 * Provides consistent error handling, logging, and error types across the application
 */

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',           // Non-critical, can be ignored
  MEDIUM = 'medium',     // Should be logged and handled
  HIGH = 'high',         // Critical, requires user notification
  CRITICAL = 'critical'  // Application-breaking, requires immediate attention
}

/**
 * Error categories for better organization
 */
export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  PARSING = 'parsing',
  SUBSCRIPTION = 'subscription',
  RENDERING = 'rendering',
  VIDEO = 'video',
  STORAGE = 'storage',
  UNKNOWN = 'unknown'
}

/**
 * Standardized error class with context
 */
export class AppError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly context?: Record<string, unknown>;
  public readonly originalError?: Error;
  public readonly timestamp: Date;

  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    this.severity = severity;
    this.category = category;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Converts error to a user-friendly message
   */
  toUserMessage(): string {
    switch (this.category) {
      case ErrorCategory.NETWORK:
        return 'Network error. Please check your connection and try again.';
      case ErrorCategory.VALIDATION:
        return this.message || 'Invalid input. Please check your data and try again.';
      case ErrorCategory.PARSING:
        return 'Failed to parse data. Please try again.';
      case ErrorCategory.SUBSCRIPTION:
        return 'Failed to subscribe to content. Please refresh and try again.';
      case ErrorCategory.RENDERING:
        return 'Failed to display content. Please refresh the page.';
      case ErrorCategory.VIDEO:
        return 'Video playback error. Please try refreshing the stream.';
      case ErrorCategory.STORAGE:
        return 'Storage error. Your data may not be saved.';
      default:
        return this.message || 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Converts error to a log-friendly object
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      category: this.category,
      context: this.context,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}

/**
 * Error logger with consistent formatting
 */
class ErrorLogger {
  private static formatMessage(
    message: string,
    severity: ErrorSeverity,
    category: ErrorCategory,
    context?: Record<string, unknown>
  ): string {
    const prefix = `[${severity.toUpperCase()}] [${category.toUpperCase()}]`;
    const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
    return `${prefix} ${message}${contextStr}`;
  }

  static log(error: AppError | Error, context?: Record<string, unknown>): void {
    if (error instanceof AppError) {
      const logObj = error.toLogObject();
      if (context) {
        logObj.additionalContext = context;
      }

      switch (error.severity) {
        case ErrorSeverity.CRITICAL:
        case ErrorSeverity.HIGH:
          console.error(this.formatMessage(error.message, error.severity, error.category, error.context), logObj);
          break;
        case ErrorSeverity.MEDIUM:
          console.warn(this.formatMessage(error.message, error.severity, error.category, error.context), logObj);
          break;
        case ErrorSeverity.LOW:
          console.log(this.formatMessage(error.message, error.severity, error.category, error.context));
          break;
      }
    } else {
      // Handle plain Error objects
      const message = this.formatMessage(
        error.message || 'Unknown error',
        ErrorSeverity.MEDIUM,
        ErrorCategory.UNKNOWN,
        context
      );
      console.error(message, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  }

  static logWarning(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: Record<string, unknown>): void {
    console.warn(this.formatMessage(message, ErrorSeverity.LOW, category, context));
  }

  static logInfo(message: string, category: ErrorCategory = ErrorCategory.UNKNOWN, context?: Record<string, unknown>): void {
    console.log(this.formatMessage(message, ErrorSeverity.LOW, category, context));
  }
}

/**
 * Safely executes a function and handles errors
 */
export function safeExecute<T>(
  fn: () => T,
  errorMessage: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: Record<string, unknown>
): T | null {
  try {
    return fn();
  } catch (error) {
    const appError = new AppError(
      errorMessage,
      severity,
      category,
      context,
      error instanceof Error ? error : new Error(String(error))
    );
    ErrorLogger.log(appError);
    return null;
  }
}

/**
 * Safely executes an async function and handles errors
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: Record<string, unknown>
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const appError = new AppError(
      errorMessage,
      severity,
      category,
      context,
      error instanceof Error ? error : new Error(String(error))
    );
    ErrorLogger.log(appError);
    return null;
  }
}

/**
 * Wraps an error in an AppError if it's not already one
 */
export function wrapError(
  error: unknown,
  message?: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: Record<string, unknown>
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      message || error.message || 'An error occurred',
      severity,
      category,
      context,
      error
    );
  }

  return new AppError(
    message || 'An unknown error occurred',
    severity,
    category,
    context
  );
}

/**
 * Handles errors with user notification
 */
export function handleError(
  error: unknown,
  userMessage?: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context?: Record<string, unknown>
): AppError {
  const appError = wrapError(error, userMessage, category, severity, context);
  ErrorLogger.log(appError);

  // For high/critical errors, you might want to show user notifications here
  // This could integrate with a notification system or error boundary
  if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
    // Example: Could trigger a global error handler or notification
    // showUserNotification(appError.toUserMessage());
  }

  return appError;
}

/**
 * Handles errors silently (logs but doesn't throw)
 * Useful for non-critical operations that can fail gracefully
 */
export function handleErrorSilently(
  error: unknown,
  message?: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN,
  context?: Record<string, unknown>
): void {
  const appError = wrapError(
    error,
    message,
    category,
    ErrorSeverity.LOW,
    context
  );
  ErrorLogger.log(appError);
}

/**
 * Creates an error handler for a specific category
 */
export function createErrorHandler(
  category: ErrorCategory,
  defaultSeverity: ErrorSeverity = ErrorSeverity.MEDIUM
) {
  return (
    error: unknown,
    message?: string,
    severity?: ErrorSeverity,
    context?: Record<string, unknown>
  ) => {
    return handleError(
      error,
      message,
      category,
      severity || defaultSeverity,
      context
    );
  };
}

/**
 * Pre-configured error handlers for common categories
 */
export const networkErrorHandler = createErrorHandler(ErrorCategory.NETWORK, ErrorSeverity.HIGH);
export const validationErrorHandler = createErrorHandler(ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM);
export const parsingErrorHandler = createErrorHandler(ErrorCategory.PARSING, ErrorSeverity.LOW);
export const subscriptionErrorHandler = createErrorHandler(ErrorCategory.SUBSCRIPTION, ErrorSeverity.MEDIUM);
export const renderingErrorHandler = createErrorHandler(ErrorCategory.RENDERING, ErrorSeverity.MEDIUM);
export const videoErrorHandler = createErrorHandler(ErrorCategory.VIDEO, ErrorSeverity.MEDIUM);
export const storageErrorHandler = createErrorHandler(ErrorCategory.STORAGE, ErrorSeverity.LOW);

/**
 * Logging utilities (for non-error logging)
 */
export const logger = {
  info: (message: string, category?: ErrorCategory, context?: Record<string, unknown>) => {
    ErrorLogger.logInfo(message, category, context);
  },
  warn: (message: string, category?: ErrorCategory, context?: Record<string, unknown>) => {
    ErrorLogger.logWarning(message, category, context);
  }
};

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
