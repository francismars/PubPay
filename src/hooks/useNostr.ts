// useNostr - Custom hook for Nostr functionality
// Note: This is a vanilla JS hook, not a React hook
import { useAppStore, useLiveEventStore } from '../stores';
import { NostrClient, EventManager, ProfileService } from '../services/nostr';
import { ErrorService } from '../services/ErrorService';
import { LiveEvent, User, Zap } from '../types/common';

export interface UseNostrOptions {
  autoConnect?: boolean;
  relays?: string[];
  onEvent?: (event: LiveEvent) => void;
  onZap?: (zap: Zap) => void;
  onProfile?: (user: User) => void;
}

export class UseNostr {
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private error: string | null = null;
  private options: UseNostrOptions;

  private nostrClient: NostrClient;
  private eventManager: EventManager;
  private profileService: ProfileService;
  private errorService: ErrorService;

  constructor(options: UseNostrOptions = {}) {
    this.options = options;
    this.nostrClient = new NostrClient(options.relays);
    this.eventManager = new EventManager(this.nostrClient);
    this.profileService = new ProfileService(this.nostrClient, this.eventManager);
    this.errorService = new ErrorService();
  }

  // Connect to relays
  async connect(): Promise<boolean> {
    if (this.isConnecting || this.isConnected) return this.isConnected;

    this.isConnecting = true;
    this.error = null;

    try {
      // Test relay connections - using a simple method for now
      await this.nostrClient.subscribeToEvents([{ kinds: [0], limit: 1 }], () => {});
      this.isConnected = true;
      this.errorService.info('Connected to Nostr relays');
      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to connect to relays';
      this.errorService.error('Failed to connect to Nostr relays', err as Error);
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  // Disconnect from relays
  disconnect(): void {
    this.nostrClient.unsubscribeAll();
    this.isConnected = false;
    this.errorService.info('Disconnected from Nostr relays');
  }

  // Subscribe to live events
  async subscribeToLiveEvents(pubkey: string, identifier: string): Promise<void> {
    if (!this.isConnected) {
      this.errorService.warn('Not connected to relays');
      return;
    }

    try {
      this.nostrClient.subscribeToLiveEvents(
        pubkey,
        identifier,
        async (event) => {
          const liveEvent = await this.eventManager.handleLiveEvent(event);
          if (liveEvent) {
            this.options.onEvent?.(liveEvent);
          }
        }
      );
    } catch (err) {
      this.errorService.error('Failed to subscribe to live events', err as Error);
    }
  }

  // Subscribe to chat messages
  async subscribeToChat(pubkey: string, identifier: string): Promise<void> {
    if (!this.isConnected) {
      this.errorService.warn('Not connected to relays');
      return;
    }

    try {
      this.nostrClient.subscribeToLiveChat(
        pubkey,
        identifier,
        async (event) => {
          const noteData = await this.eventManager.handleNoteEvent(event as any);
          if (noteData) {
            const chatMessage = {
              id: event.id,
              pubkey: event.pubkey,
              content: noteData.content,
              created_at: event.created_at,
              author: noteData.author || undefined
            };
            this.options.onEvent?.(chatMessage as any);
          }
        }
      );
    } catch (err) {
      this.errorService.error('Failed to subscribe to chat', err as Error);
    }
  }

  // Subscribe to zaps
  async subscribeToZaps(eventId: string): Promise<void> {
    if (!this.isConnected) {
      this.errorService.warn('Not connected to relays');
      return;
    }

    try {
      this.nostrClient.subscribeToZaps(
        eventId,
        async (event) => {
          const zap = await this.eventManager.handleZapEvent(event);
          if (zap) {
            this.options.onZap?.(zap);
          }
        }
      );
    } catch (err) {
      this.errorService.error('Failed to subscribe to zaps', err as Error);
    }
  }

  // Get user profile
  async getProfile(pubkey: string): Promise<User | null> {
    try {
      return await this.profileService.getProfile(pubkey);
    } catch (err) {
      this.errorService.error('Failed to get profile', err as Error);
      return null;
    }
  }

  // Get multiple profiles
  async getProfiles(pubkeys: string[]): Promise<Map<string, User>> {
    try {
      return await this.profileService.getProfiles(pubkeys);
    } catch (err) {
      this.errorService.error('Failed to get profiles', err as Error);
      return new Map();
    }
  }

  // Getters
  get connected(): boolean { return this.isConnected; }
  get connecting(): boolean { return this.isConnecting; }
  get lastError(): string | null { return this.error; }
  get client(): NostrClient { return this.nostrClient; }
  get eventManagerInstance(): EventManager { return this.eventManager; }
  get profileServiceInstance(): ProfileService { return this.profileService; }
  get errorServiceInstance(): ErrorService { return this.errorService; }
}
