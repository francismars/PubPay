// Event ID parsing and validation utilities
// Uses shared validation functions from @pubpay/shared-utils

import { nip19 } from 'nostr-tools';
import {
  isValidNevent,
  isValidNaddr,
  isValidNprofile,
  isValidNote
} from '@pubpay/shared-utils';

/**
 * Strip nostr: protocol prefix from identifier
 * @param identifier - The identifier with or without nostr: prefix
 * @returns The identifier without the nostr: prefix
 */
export function stripNostrPrefix(identifier: string): string {
  return identifier.replace(/^nostr:/, '');
}

/**
 * Validate a Nostr identifier (note1, nevent1, naddr1, nprofile1)
 * Uses shared validation functions where possible, then validates structure with nip19.decode
 * @param noteId - The identifier to validate
 * @throws Error if the identifier is invalid
 */
export function validateNoteId(noteId: string): void {
  // Check if noteId is empty or just whitespace
  if (!noteId || noteId.trim() === '') {
    throw new Error('Please enter a note ID');
  }

  // Trim whitespace
  const trimmed = noteId.trim();

  // Use shared validation functions for initial format check
  if (trimmed.startsWith('note1')) {
    if (!isValidNote(trimmed)) {
      throw new Error('Invalid note ID format');
    }
  } else if (trimmed.startsWith('nevent1')) {
    if (!isValidNevent(trimmed)) {
      throw new Error('Invalid event ID format');
    }
  } else if (trimmed.startsWith('naddr1')) {
    if (!isValidNaddr(trimmed)) {
      throw new Error('Invalid addressable event format');
    }
  } else if (trimmed.startsWith('nprofile1')) {
    if (!isValidNprofile(trimmed)) {
      throw new Error('Invalid profile format');
    }
  } else {
    throw new Error(
      'Invalid format. Please enter a valid nostr note ID (note1...), event ID (nevent1...), addressable event (naddr1...), or profile (nprofile1...)'
    );
  }

  // Validate Bech32 format and structure according to NIP-19
  try {
    const decoded = nip19.decode(trimmed);

    // Validate decoded structure
    if (decoded.type === 'note') {
      // For note1: should have a 32-byte hex string
      if (
        !decoded.data ||
        typeof decoded.data !== 'string' ||
        decoded.data.length !== 64
      ) {
        throw new Error('Invalid note ID format');
      }
    } else if (decoded.type === 'nevent') {
      // For nevent1: should have an id field with 32-byte hex string
      if (
        !decoded.data ||
        !decoded.data.id ||
        typeof decoded.data.id !== 'string' ||
        decoded.data.id.length !== 64
      ) {
        throw new Error('Invalid event ID format');
      }
    } else if (decoded.type === 'naddr') {
      // For naddr1: should have identifier, pubkey, and kind fields
      if (
        !decoded.data ||
        !decoded.data.identifier ||
        !decoded.data.pubkey ||
        typeof decoded.data.kind !== 'number'
      ) {
        throw new Error('Invalid addressable event format');
      }
      // Validate it's a live event kind
      if (decoded.data.kind !== 30311) {
        throw new Error('Only live events (kind 30311) are supported');
      }
    } else if (decoded.type === 'nprofile') {
      // For nprofile1: should have pubkey field
      if (!decoded.data || !decoded.data.pubkey) {
        throw new Error('Invalid profile format');
      }
    } else {
      throw new Error('Unsupported identifier type');
    }
  } catch (error) {
    // Re-throw our custom errors
    if (
      error instanceof Error &&
      (error.message.includes('Invalid') ||
        error.message.includes('Unsupported') ||
        error.message.includes('Please enter'))
    ) {
      throw error;
    }
    // Wrap nip19 decode errors
    throw new Error(
      'Invalid nostr identifier format. Please check the note ID and try again.'
    );
  }
}

/**
 * Parse and decode a Nostr identifier
 * Strips prefix, validates, and decodes the identifier
 * @param identifier - The identifier to parse
 * @returns The decoded data with type information
 * @throws Error if the identifier is invalid
 */
export function parseEventId(identifier: string): {
  type: 'note' | 'nevent' | 'naddr' | 'nprofile';
  data: any;
} {
  const clean = stripNostrPrefix(identifier);
  validateNoteId(clean);
  const decoded = nip19.decode(clean);
  // Type assertion is safe because validateNoteId ensures it's one of these types
  return decoded as {
    type: 'note' | 'nevent' | 'naddr' | 'nprofile';
    data: any;
  };
}

/**
 * Determine what type of content to load based on identifier
 * @param identifier - The identifier to check
 * @returns The content type
 * @throws Error if the identifier type is unknown
 */
export function getContentType(
  identifier: string
): 'live' | 'note' | 'profile' {
  const clean = stripNostrPrefix(identifier);

  if (clean.startsWith('naddr1')) return 'live';
  if (clean.startsWith('note1') || clean.startsWith('nevent1')) return 'note';
  if (clean.startsWith('nprofile1')) return 'profile';

  throw new Error('Unknown identifier type');
}
