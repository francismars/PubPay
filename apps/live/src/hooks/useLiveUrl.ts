// React hook for parsing and managing Live page URLs
// Handles route params, query params, path parsing, and event listeners

import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { parseLiveUrl } from '../utils/urlParser';

/**
 * Result of useLiveUrl hook
 */
export interface UseLiveUrlResult {
  /** The parsed event ID (undefined if none or invalid) */
  eventId: string | undefined;
  /** Whether to show the note loader UI */
  showNoteLoader: boolean;
  /** Whether to show the main layout UI */
  showMainLayout: boolean;
  /** Error message if validation failed */
  error: string | null;
}

/**
 * Type for error callback function
 */
type ErrorCallback = (message: string) => void;

/**
 * Hook for parsing and managing Live page URLs
 * Handles route params, query params, path parsing, URL normalization,
 * and browser navigation events
 *
 * @param showLoadingError - Callback function to display error messages
 * @returns Hook result with eventId, UI state, and error information
 */
export function useLiveUrl(
  showLoadingError: ErrorCallback
): UseLiveUrlResult {
  const { eventId: routeEventId } = useParams<{ eventId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  const [showNoteLoader, setShowNoteLoader] = useState(true);
  const [showMainLayout, setShowMainLayout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedEventId, setParsedEventId] = useState<string | undefined>(
    undefined
  );

  // Parse URL and update state
  useEffect(() => {
    try {
      const parsed = parseLiveUrl(
        routeEventId,
        location.pathname,
        searchParams
      );

      // Store parsed eventId for return value
      setParsedEventId(parsed.eventId || undefined);

      // Update UI state BEFORE normalizing URL
      // This ensures the DOM is ready when useLiveFunctionality tries to show loading messages
      setShowNoteLoader(parsed.shouldShowLoader);
      setShowMainLayout(parsed.shouldShowMainLayout);
      setError(parsed.error || null);

      // Normalize URL if needed (using React Router instead of window.history)
      if (parsed.normalizedPath && window.location.pathname !== parsed.normalizedPath) {
        navigate(parsed.normalizedPath, { replace: true });
        // State is already updated above, so the DOM will be ready
        return;
      }

      // Handle errors
      if (parsed.error) {
        showLoadingError(parsed.error);

        // Prefill input if candidate looks valid (for error display)
        if (parsed.eventId) {
          setTimeout(() => {
            const input = document.getElementById(
              'note1LoaderInput'
            ) as HTMLInputElement | null;
            if (input && parsed.eventId) {
              input.value = parsed.eventId;
              input.focus();
              input.select();
            }
          }, 50);
        }
      } else {
        // Clear any previous error
        const errorElement = document.getElementById('noteLoaderError');
        if (errorElement) {
          errorElement.style.display = 'none';
        }
      }
    } catch {
      // Fallback on any error
      setShowNoteLoader(true);
      setShowMainLayout(false);
      setError('Failed to parse URL');
      showLoadingError(
        'Failed to parse URL. Please enter a valid nostr identifier.'
      );
    }
  }, [
    routeEventId,
    location.pathname,
    location.search,
    navigate,
    showLoadingError
  ]);

  // Handle browser back/forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      // Re-parse URL on browser navigation
      // Extract eventId from path since routeEventId might be stale
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const pathPartsWithoutLive = pathParts.filter(p => p !== 'live');
      const eventIdFromPath = pathPartsWithoutLive[pathPartsWithoutLive.length - 1];

      const currentSearchParams = new URLSearchParams(window.location.search);
      const parsed = parseLiveUrl(
        eventIdFromPath,
        window.location.pathname,
        currentSearchParams
      );

      // Update parsed eventId
      setParsedEventId(parsed.eventId || undefined);
      setShowNoteLoader(parsed.shouldShowLoader);
      setShowMainLayout(parsed.shouldShowMainLayout);
      setError(parsed.error || null);

      if (parsed.error) {
        showLoadingError(parsed.error);
      } else {
        // Clear error on successful navigation
        const errorElement = document.getElementById('noteLoaderError');
        if (errorElement) {
          errorElement.style.display = 'none';
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showLoadingError]);

  // Handle noteLoaderSubmitted custom event from useLiveFunctionality
  // This event is fired when user submits a note ID from the input field
  useEffect(() => {
    const handleNoteLoaderSubmitted = () => {
      // Update state to show main layout
      setShowNoteLoader(false);
      setShowMainLayout(true);

      // Clear any errors
      setError(null);
      const errorElement = document.getElementById('noteLoaderError');
      if (errorElement) {
        errorElement.style.display = 'none';
      }

      // The URL has already been updated by useLiveFunctionality
      // We just need to update the UI state
      // Note: React Router will handle the re-render when the URL changes
    };

    window.addEventListener('noteLoaderSubmitted', handleNoteLoaderSubmitted);
    return () => {
      window.removeEventListener('noteLoaderSubmitted', handleNoteLoaderSubmitted);
    };
  }, []);

  // Clear input field if it contains "live" keyword (edge case)
  // This prevents the input from showing "live" when navigating to /live/
  useEffect(() => {
    if (showNoteLoader) {
      setTimeout(() => {
        const input = document.getElementById(
          'note1LoaderInput'
        ) as HTMLInputElement | null;
        if (input && (input.value === 'live' || input.value.trim() === 'live')) {
          input.value = '';
        }
      }, 10);
    }
  }, [showNoteLoader]);

  return {
    eventId: parsedEventId,
    showNoteLoader,
    showMainLayout,
    error
  };
}
