// EventManager - Handles event processing and business logic
import { NostrEvent, Kind0Event, Kind1Event, Kind9735Event, Kind30311Event } from '../../types/nostr';
import { LiveEvent, Zap, User } from '../../types/common';
import { NostrClient } from './NostrClient';
import { validateEventData } from '../../utils/validation';

export class EventManager {
  private nostrClient: NostrClient;
  private profileCache: Map<string, User> = new Map();

  constructor(nostrClient: NostrClient) {
    this.nostrClient = nostrClient;
  }

  /**
   * Handle live event (kind 30311)
   */
  async handleLiveEvent(event: NostrEvent): Promise<LiveEvent | null> {
    try {
      const validation = validateEventData(event);
      if (!validation.isValid) {
        console.error('Invalid live event:', validation.errors);
        return null;
      }

      const liveEvent: LiveEvent = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        tags: event.tags,
        sig: event.sig
      };

      // Extract identifier from tags
      const identifierTag = event.tags.find(tag => tag[0] === 'd');
      if (identifierTag) {
        liveEvent.identifier = identifierTag[1];
      }

      return liveEvent;
    } catch (error) {
      console.error('Error handling live event:', error);
      return null;
    }
  }

  /**
   * Handle zap event (kind 9735)
   */
  async handleZapEvent(event: NostrEvent): Promise<Zap | null> {
    try {
      const validation = validateEventData(event);
      if (!validation.isValid) {
        console.error('Invalid zap event:', validation.errors);
        return null;
      }

      // Extract zap data from tags
      const bolt11Tag = event.tags.find(tag => tag[0] === 'bolt11');
      const descriptionTag = event.tags.find(tag => tag[0] === 'description');
      const preimageTag = event.tags.find(tag => tag[0] === 'preimage');
      const eventTag = event.tags.find(tag => tag[0] === 'e');
      const payerTag = event.tags.find(tag => tag[0] === 'p');

      if (!bolt11Tag || !eventTag || !payerTag) {
        console.error('Missing required zap tags');
        return null;
      }

      const eventId = eventTag[1];
      const payerPubkey = payerTag[1];
      const bolt11 = bolt11Tag[1];

      if (!eventId || !payerPubkey || !bolt11) {
        console.error('Invalid zap tag values');
        return null;
      }

      const zap: Zap = {
        id: event.id,
        eventId,
        payerPubkey,
        amount: this.extractZapAmount(bolt11),
        content: descriptionTag ? descriptionTag[1] : '',
        created_at: event.created_at,
        profile: await this.getProfile(payerPubkey) || undefined
      };

      return zap;
    } catch (error) {
      console.error('Error handling zap event:', error);
      return null;
    }
  }

  /**
   * Handle profile event (kind 0)
   */
  async handleProfileEvent(event: Kind0Event): Promise<User | null> {
    try {
      const validation = validateEventData(event);
      if (!validation.isValid) {
        console.error('Invalid profile event:', validation.errors);
        return null;
      }

      let profileData;
      try {
        profileData = JSON.parse(event.content);
      } catch (error) {
        console.error('Error parsing profile data:', error);
        return null;
      }

      const user: User = {
        id: event.pubkey,
        publicKey: event.pubkey,
        name: profileData.name || '',
        displayName: profileData.display_name || profileData.displayName || '',
        picture: profileData.picture || '',
        about: profileData.about || ''
      };

      // Cache the profile
      this.profileCache.set(event.pubkey, user);
      return user;
    } catch (error) {
      console.error('Error handling profile event:', error);
      return null;
    }
  }

  /**
   * Handle note event (kind 1)
   */
  async handleNoteEvent(event: Kind1Event): Promise<{ content: string; author: User | null } | null> {
    try {
      const validation = validateEventData(event);
      if (!validation.isValid) {
        console.error('Invalid note event:', validation.errors);
        return null;
      }

      const author = await this.getProfile(event.pubkey);
      return {
        content: event.content,
        author
      };
    } catch (error) {
      console.error('Error handling note event:', error);
      return null;
    }
  }

  /**
   * Get profile by public key
   */
  async getProfile(pubkey: string): Promise<User | null> {
    // Check cache first
    if (this.profileCache.has(pubkey)) {
      return this.profileCache.get(pubkey)!;
    }

    try {
      // Fetch profile from relays
      const events = await this.nostrClient.getEvents([{
        authors: [pubkey],
        kinds: [0]
      }]);

      if (events.length > 0) {
        const profile = await this.handleProfileEvent(events[0] as Kind0Event);
        return profile;
      }

      return null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }

  /**
   * Subscribe to live event participants' profiles
   */
  subscribeToLiveEventParticipants(
    liveEvent: LiveEvent,
    onProfile: (user: User) => void
  ): void {
    // Extract participant pubkeys from tags
    const participantTags = liveEvent.tags.filter(tag => tag[0] === 'p');
    const pubkeys = participantTags
      .map(tag => tag[1])
      .filter((pubkey): pubkey is string => pubkey !== undefined);

    if (pubkeys.length > 0) {
      this.nostrClient.subscribeToProfiles(pubkeys, async (event) => {
        const profile = await this.handleProfileEvent(event as Kind0Event);
        if (profile) {
          onProfile(profile);
        }
      });
    }
  }

  /**
   * Extract zap amount from bolt11 invoice
   */
  private extractZapAmount(bolt11: string): number {
    try {
      // This would need proper bolt11 parsing
      // For now, return a default amount
      return 100; // Default zap amount
    } catch (error) {
      console.error('Error extracting zap amount:', error);
      return 0;
    }
  }

  /**
   * Create a new live event
   */
  async createLiveEvent(
    content: string,
    identifier: string,
    tags: string[][] = []
  ): Promise<NostrEvent | null> {
    try {
      // This would need proper event creation with signing
      // For now, return null as this requires private key access
      console.warn('Event creation requires private key access - not implemented yet');
      return null;
    } catch (error) {
      console.error('Error creating live event:', error);
      return null;
    }
  }

  /**
   * Create a zap event
   */
  async createZapEvent(
    eventId: string,
    bolt11: string,
    preimage: string,
    content: string = ''
  ): Promise<NostrEvent | null> {
    try {
      // This would need proper event creation with signing
      // For now, return null as this requires private key access
      console.warn('Zap creation requires private key access - not implemented yet');
      return null;
    } catch (error) {
      console.error('Error creating zap event:', error);
      return null;
    }
  }

  /**
   * Get cached profiles
   */
  getCachedProfiles(): Map<string, User> {
    return new Map(this.profileCache);
  }

  /**
   * Clear profile cache
   */
  clearProfileCache(): void {
    this.profileCache.clear();
  }
}
