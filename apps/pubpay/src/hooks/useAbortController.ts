import { useEffect, useRef } from 'react';

/**
 * Hook that provides an AbortController that is automatically aborted on unmount
 * Use this for all async operations to prevent memory leaks
 */
export const useAbortController = () => {
  // Initialize immediately so signal is available on first render
  const abortControllerRef = useRef<AbortController>(
    new AbortController()
  );

  useEffect(() => {
    // Create new AbortController on mount (in case component remounts)
    abortControllerRef.current = new AbortController();

    return () => {
      // Abort all pending operations on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    signal: abortControllerRef.current.signal,
    isAborted: abortControllerRef.current.signal.aborted
  };
};

