/**
 * Utility functions for handling async operations with abort signals
 * Helps prevent memory leaks by allowing cancellation of async operations
 */

/**
 * Wraps an async operation to check if it should continue
 * Throws an error if operation was aborted
 */
export async function withAbortCheck<T>(
  signal: AbortSignal | undefined,
  operation: () => Promise<T>
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }

  const result = await operation();

  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }

  return result;
}

/**
 * Checks if an error is an abort error
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'Operation aborted')
  );
}

/**
 * Safely executes an async operation, ignoring abort errors
 * Returns null if the operation was aborted (component unmounted)
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    return await withAbortCheck(signal, operation);
  } catch (error) {
    if (isAbortError(error)) {
      // Silently ignore abort errors (component unmounted)
      return null;
    }
    throw error;
  }
}

/**
 * Creates a timeout that is automatically cleared if the signal is aborted
 * Returns the timeout ID for manual cleanup if needed
 */
export function safeTimeout(
  callback: () => void,
  delay: number,
  signal?: AbortSignal
): NodeJS.Timeout | null {
  if (signal?.aborted) {
    return null;
  }

  const timeoutId = setTimeout(() => {
    if (!signal?.aborted) {
      callback();
    }
  }, delay);

  return timeoutId;
}

