// URL parsing utilities for Live page
// Pure functions for parsing and validating URLs

import {
  validateNostrIdentifierSafe,
  normalizeToNote1,
  buildNaddrFromNprofile,
  stripNostrPrefix
} from './eventIdParser';

/**
 * Result of parsing a live page URL
 */
export interface ParsedLiveUrl {
  /** The parsed event ID (null if none found or invalid) */
  eventId: string | null;
  /** Whether to show the note loader UI */
  shouldShowLoader: boolean;
  /** Whether to show the main layout UI */
  shouldShowMainLayout: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Normalized path to navigate to (if different from current) */
  normalizedPath?: string;
}

/**
 * Parse URL for live page - handles route params, query params, and path parsing
 * Pure function - no side effects
 *
 * @param routeEventId - Event ID from React Router params (e.g., from /live/:eventId)
 * @param currentPath - Current pathname (e.g., window.location.pathname)
 * @param searchParams - URL search params (e.g., from new URLSearchParams(window.location.search))
 * @returns Parsed URL result with UI state and error information
 */
export function parseLiveUrl(
  routeEventId: string | undefined,
  currentPath: string,
  searchParams: URLSearchParams
): ParsedLiveUrl {
  // 1. If we have a valid eventId from the route, validate it first
  // This matches the original behavior where route params are checked before query params
  if (routeEventId) {
    const candidate = stripNostrPrefix(routeEventId);
    const validPrefixes = ['note1', 'nevent1', 'naddr1', 'nprofile1'];

    // Check if it has a valid prefix
    if (validPrefixes.some(p => candidate.startsWith(p))) {
      const validation = validateNostrIdentifierSafe(candidate);
      if (validation.isValid) {
        // Valid identifier from route - show main layout
        return {
          eventId: candidate,
          shouldShowLoader: false,
          shouldShowMainLayout: true,
          normalizedPath: `/live/${candidate}`
        };
      }
      // Invalid bech32 format - show error
      return {
        eventId: null,
        shouldShowLoader: true,
        shouldShowMainLayout: false,
        error: validation.error,
        normalizedPath: '/live/'
      };
    } else {
      // Invalid prefix - show error
      return {
        eventId: null,
        shouldShowLoader: true,
        shouldShowMainLayout: false,
        error:
          'Invalid format. Please enter a valid nostr identifier (note1/nevent1/naddr1/nprofile1).',
        normalizedPath: '/live/'
      };
    }
  }

  // 2. Check for ?note= query parameter (from pubpay "View on live" link)
  const noteParam = searchParams.get('note');
  if (noteParam) {
    let noteId = noteParam.trim();

    // Convert hex string to note1 if needed
    const normalized = normalizeToNote1(noteId);
    if (normalized) {
      noteId = normalized;
    }

    // Validate
    const validation = validateNostrIdentifierSafe(noteId);
    if (validation.isValid) {
      return {
        eventId: noteId,
        shouldShowLoader: false,
        shouldShowMainLayout: true,
        normalizedPath: `/live/${noteId}`
      };
    }
    // If invalid, fall through to show loader with error
    // (We'll handle the error in the standard path below)
  }

  // 3. Check if we're under /live/ path
  if (!currentPath.startsWith('/live')) {
    return {
      eventId: null,
      shouldShowLoader: true,
      shouldShowMainLayout: false,
      normalizedPath: '/live/'
    };
  }

  // 4. Handle exactly /live/ or /live/live
  if (
    currentPath === '/live' ||
    currentPath === '/live/' ||
    currentPath === '/live/live' ||
    currentPath === '/live/live/'
  ) {
    return {
      eventId: null,
      shouldShowLoader: true,
      shouldShowMainLayout: false,
      normalizedPath: '/live/'
    };
  }

  // 5. Try compound form: /{nprofile...}/live/{event-id}
  const pathParts = currentPath.split('/').filter(Boolean);
  if (pathParts.includes('live')) {
    const possibleNprofile = pathParts[pathParts.length - 3];
    const liveIdentifier = pathParts[pathParts.length - 1];

    if (possibleNprofile && liveIdentifier) {
      const naddr = buildNaddrFromNprofile(possibleNprofile, liveIdentifier);
      if (naddr) {
        return {
          eventId: naddr,
          shouldShowLoader: false,
          shouldShowMainLayout: true,
          normalizedPath: `/live/${naddr}`
        };
      }
      // If buildNaddrFromNprofile fails, fall through to standard handling
    }
  }

  // 6. Standard handling: extract identifier from path
  // Filter out 'live' from path parts to get the actual identifier
  const pathPartsWithoutLive = pathParts.filter(p => p !== 'live');
  const lastPart = (pathPartsWithoutLive[pathPartsWithoutLive.length - 1] || '').trim();
  const candidate = stripNostrPrefix(lastPart);

  // 7. If no candidate, show loader
  if (!candidate || candidate === 'live' || candidate.trim() === '') {
    return {
      eventId: null,
      shouldShowLoader: true,
      shouldShowMainLayout: false,
      normalizedPath: '/live/'
    };
  }

  // 8. Validate candidate from path
  const validation = validateNostrIdentifierSafe(candidate);
  if (!validation.isValid) {
    // Determine if we should show error or just loader
    // Only show error if candidate looks like it might be valid (has valid prefix)
    const validPrefixes = ['note1', 'nevent1', 'naddr1', 'nprofile1'];
    const hasValidPrefix = validPrefixes.some(p => candidate.startsWith(p));

    if (hasValidPrefix) {
      // Looks like a valid identifier but failed validation - show error
      return {
        eventId: candidate, // Keep candidate for input prefilling
        shouldShowLoader: true,
        shouldShowMainLayout: false,
        error: validation.error,
        normalizedPath: '/live/'
      };
    } else {
      // Doesn't look like a valid identifier - just show loader, no error
      return {
        eventId: null,
        shouldShowLoader: true,
        shouldShowMainLayout: false,
        normalizedPath: '/live/'
      };
    }
  }

  // 9. Valid identifier - show main layout
  return {
    eventId: candidate,
    shouldShowLoader: false,
    shouldShowMainLayout: true,
    normalizedPath: `/live/${candidate}`
  };
}
