/**
 * LiveEventService - Handles parsing and extraction of live event data
 * 
 * Provides functionality to:
 * - Parse live event (kind 30311) data from tags
 * - Extract metadata (title, summary, status, streaming URL, etc.)
 * - Format timestamps and participant data
 * - Validate live event structure
 */

import { Kind30311Event } from '@pubpay/shared-types';

export interface LiveEventMetadata {
  title: string;
  summary: string;
  status: 'live' | 'planned' | 'ended' | 'unknown';
  streaming?: string;
  recording?: string;
  starts?: string;
  ends?: string;
  currentParticipants: string;
  totalParticipants: string;
  participants: Participant[];
  identifier?: string;
  hostPubkey?: string;
}

export interface Participant {
  pubkey: string;
  role?: string;
  relay?: string;
  petname?: string;
}

export interface LiveEventData extends LiveEventMetadata {
  eventId: string;
  pubkey: string;
  createdAt: number;
  content: string;
}

export class LiveEventService {
  /**
   * Extract all metadata from a live event
   */
  extractMetadata(event: Kind30311Event): LiveEventMetadata {
    const tags = event.tags;

    // Extract identifier from 'd' tag
    const identifierTag = tags.find((tag: string[]) => tag[0] === 'd');
    const identifier = identifierTag?.[1];

    // Extract title
    const titleTag = tags.find((tag: string[]) => tag[0] === 'title');
    const title = titleTag?.[1] || 'Live Event';

    // Extract summary
    const summaryTag = tags.find((tag: string[]) => tag[0] === 'summary');
    const summary = summaryTag?.[1] || '';

    // Extract status
    const statusTag = tags.find((tag: string[]) => tag[0] === 'status');
    const statusValue = statusTag?.[1] || 'unknown';
    const status = this.normalizeStatus(statusValue);

    // Extract streaming URL
    const streamingTag = tags.find((tag: string[]) => tag[0] === 'streaming');
    const streaming = streamingTag?.[1];

    // Extract recording URL
    const recordingTag = tags.find((tag: string[]) => tag[0] === 'recording');
    const recording = recordingTag?.[1];

    // Extract start time
    const startsTag = tags.find((tag: string[]) => tag[0] === 'starts');
    const starts = startsTag?.[1];

    // Extract end time
    const endsTag = tags.find((tag: string[]) => tag[0] === 'ends');
    const ends = endsTag?.[1];

    // Extract participant counts
    const currentParticipantsTag = tags.find(
      (tag: string[]) => tag[0] === 'current_participants'
    );
    const currentParticipants = currentParticipantsTag?.[1] || '0';

    const totalParticipantsTag = tags.find(
      (tag: string[]) => tag[0] === 'total_participants'
    );
    const totalParticipants = totalParticipantsTag?.[1] || '0';

    // Extract participants (p tags)
    const participantTags = tags.filter((tag: string[]) => tag[0] === 'p');
    const participants: Participant[] = participantTags.map((tag: string[]) => ({
      pubkey: tag[1] || '',
      relay: tag[2],
      petname: tag[3],
      role: tag[3] // Role is often in position 3
    })).filter((p: Participant) => p.pubkey);

    // Find host from participants (look for "Host" role)
    const hostParticipant = participants.find(
      (p: Participant) => p.role && p.role.toLowerCase() === 'host'
    );
    const hostPubkey = hostParticipant?.pubkey || event.pubkey;

    return {
      title,
      summary,
      status,
      streaming,
      recording,
      starts,
      ends,
      currentParticipants,
      totalParticipants,
      participants,
      identifier,
      hostPubkey
    };
  }

  /**
   * Get complete live event data including metadata
   */
  getLiveEventData(event: Kind30311Event): LiveEventData {
    const metadata = this.extractMetadata(event);

    return {
      ...metadata,
      eventId: event.id,
      pubkey: event.pubkey,
      createdAt: event.created_at,
      content: event.content
    };
  }

  /**
   * Extract identifier from live event
   */
  getIdentifier(event: Kind30311Event): string | undefined {
    const identifierTag = event.tags.find((tag: string[]) => tag[0] === 'd');
    return identifierTag?.[1];
  }

  /**
   * Extract streaming URL from live event
   */
  getStreamingUrl(event: Kind30311Event): string | undefined {
    const streamingTag = event.tags.find((tag: string[]) => tag[0] === 'streaming');
    return streamingTag?.[1];
  }

  /**
   * Extract recording URL from live event
   */
  getRecordingUrl(event: Kind30311Event): string | undefined {
    const recordingTag = event.tags.find((tag: string[]) => tag[0] === 'recording');
    return recordingTag?.[1];
  }

  /**
   * Extract status from live event
   */
  getStatus(event: Kind30311Event): 'live' | 'planned' | 'ended' | 'unknown' {
    const statusTag = event.tags.find((tag: string[]) => tag[0] === 'status');
    const statusValue = statusTag?.[1] || 'unknown';
    return this.normalizeStatus(statusValue);
  }

  /**
   * Extract participants from live event
   */
  getParticipants(event: Kind30311Event): Participant[] {
    const participantTags = event.tags.filter((tag: string[]) => tag[0] === 'p');
    return participantTags.map((tag: string[]) => ({
      pubkey: tag[1] || '',
      relay: tag[2],
      petname: tag[3],
      role: tag[3]
    })).filter((p: Participant) => p.pubkey);
  }

  /**
   * Get host pubkey from live event
   */
  getHostPubkey(event: Kind30311Event): string {
    const participants = this.getParticipants(event);
    const hostParticipant = participants.find(
      (p: Participant) => p.role && p.role.toLowerCase() === 'host'
    );
    return hostParticipant?.pubkey || event.pubkey;
  }

  /**
   * Format timestamp to locale string
   */
  formatTimestamp(timestamp: string | undefined): string {
    if (!timestamp) return '';
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      return date.toLocaleString();
    } catch {
      return '';
    }
  }

  /**
   * Format timestamp to ISO string
   */
  formatTimestampISO(timestamp: string | undefined): string {
    if (!timestamp) return '';
    try {
      const date = new Date(parseInt(timestamp) * 1000);
      return date.toISOString();
    } catch {
      return '';
    }
  }

  /**
   * Check if event is currently live
   */
  isLive(event: Kind30311Event): boolean {
    return this.getStatus(event) === 'live';
  }

  /**
   * Check if event has ended
   */
  isEnded(event: Kind30311Event): boolean {
    return this.getStatus(event) === 'ended';
  }

  /**
   * Check if event is planned (not yet started)
   */
  isPlanned(event: Kind30311Event): boolean {
    return this.getStatus(event) === 'planned';
  }

  /**
   * Generate a-tag for live event (used in filters)
   */
  generateATag(pubkey: string, identifier: string): string {
    return `30311:${pubkey}:${identifier}`;
  }

  /**
   * Parse a-tag to extract pubkey and identifier
   */
  parseATag(aTag: string): { pubkey: string; identifier: string } | null {
    const parts = aTag.split(':');
    if (parts.length === 3 && parts[0] === '30311') {
      return {
        pubkey: parts[1],
        identifier: parts[2]
      };
    }
    return null;
  }

  /**
   * Normalize status value to known status types
   */
  private normalizeStatus(status: string): 'live' | 'planned' | 'ended' | 'unknown' {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'live') return 'live';
    if (normalized === 'planned') return 'planned';
    if (normalized === 'ended') return 'ended';
    return 'unknown';
  }

  /**
   * Validate live event structure
   */
  validateEvent(event: Kind30311Event): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (event.kind !== 30311) {
      errors.push(`Invalid event kind: expected 30311, got ${event.kind}`);
    }

    if (!event.id) {
      errors.push('Missing event ID');
    }

    if (!event.pubkey) {
      errors.push('Missing pubkey');
    }

    if (!Array.isArray(event.tags)) {
      errors.push('Tags must be an array');
    }

    // Check for identifier tag
    const identifierTag = event.tags.find((tag: string[]) => tag[0] === 'd');
    if (!identifierTag || !identifierTag[1]) {
      errors.push('Missing identifier (d tag)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
