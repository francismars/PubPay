import { nip19 } from 'nostr-tools';

/**
 * Detect if we're in single post mode by checking URL parameters and pathname
 * Extracted to utility to remove duplication across hooks
 * 
 * @returns Object with singlePostMode flag and singlePostEventId if in single post mode
 */
export function detectSinglePostMode(): {
  singlePostMode: boolean;
  singlePostEventId: string | null;
} {
  let singlePostMode = false;
  let singlePostEventId: string | null = null;

  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qNote = params.get('note');
      const path = window.location.pathname || '';
      let noteRef: string | null = null;
      if (qNote) noteRef = qNote;
      else if (path.startsWith('/note/'))
        noteRef = path.split('/note/')[1] || null;

      if (noteRef) {
        try {
          const decoded = nip19.decode(noteRef);
          if (decoded.type === 'note' || decoded.type === 'nevent') {
            singlePostEventId =
              (decoded as any).data?.id || (decoded as any).data || null;
            singlePostMode = !!singlePostEventId;
          }
        } catch {
          // Invalid note reference, not in single post mode
        }
      }
    }
  } catch {
    // Error checking for single post mode, assume not in single post mode
  }

  return {
    singlePostMode,
    singlePostEventId
  };
}

