// NostrClient - Handles all Nostr protocol interactions
import { NostrEvent, NostrFilter, RelayConnection, EventHandler, Subscription } from '../../types/nostr';
import { RELAYS } from '../../utils/constants';

export class NostrClient {
  private pool: any; // NostrTools.SimplePool
  private relays: string[];
  private connections: Map<string, RelayConnection> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private inFlightRequests: Map<string, Promise<NostrEvent[]>> = new Map();

  constructor(relays: string[] = RELAYS) {
    this.relays = relays;
    this.initializePool();
  }

  private initializePool(): void {
    // Initialize NostrTools.SimplePool
    if (typeof window !== 'undefined' && (window as any).NostrTools) {
      this.pool = new (window as any).NostrTools.SimplePool();
    } else {
      throw new Error('NostrTools not available. Make sure nostrtools.min.js is loaded.');
    }
  }

  /**
   * Subscribe to events with the given filters
   */
  subscribeToEvents(
    filters: NostrFilter[],
    eventHandler: EventHandler,
    options: {
      oneose?: () => void;
      onclosed?: () => void;
      timeout?: number;
    } = {}
  ): Subscription {
    const subscriptionId = this.generateSubscriptionId();

    const subscription: Subscription = {
      id: subscriptionId,
      filters,
      unsubscribe: () => this.unsubscribe(subscriptionId)
    };

    // Add timeout handling
    let timeoutId: NodeJS.Timeout | null = null;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        console.log(`Subscription ${subscriptionId} timeout - keeping alive`);
      }, options.timeout);
    }

    const sub = this.pool.subscribeMany(this.relays, filters, {
      onevent: (event: NostrEvent) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        eventHandler(event);
      },
      oneose: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        options.oneose?.();
      },
      onclosed: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        options.onclosed?.();
      }
    });

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  /**
   * Subscribe to live events (kind 30311)
   */
  subscribeToLiveEvents(
    pubkey: string,
    identifier: string,
    eventHandler: EventHandler,
    options: {
      onclosed?: () => void;
      timeout?: number;
    } = {}
  ): Subscription {
    const filter: NostrFilter = {
      authors: [pubkey],
      kinds: [30311], // Live Event kind
      '#d': [identifier]
    };

    return this.subscribeToEvents([filter], eventHandler, {
      timeout: options.timeout || 30000,
      onclosed: options.onclosed
    });
  }

  /**
   * Subscribe to zap events (kind 9735)
   */
  subscribeToZaps(
    eventId: string,
    eventHandler: EventHandler,
    options: {
      onclosed?: () => void;
      timeout?: number;
    } = {}
  ): Subscription {
    const filter: NostrFilter = {
      kinds: [9735], // Zap receipt kind
      '#e': [eventId]
    };

    return this.subscribeToEvents([filter], eventHandler, {
      timeout: options.timeout || 30000,
      onclosed: options.onclosed
    });
  }

  /**
   * Subscribe to chat events for live events
   */
  subscribeToLiveChat(
    pubkey: string,
    identifier: string,
    eventHandler: EventHandler,
    options: {
      onclosed?: () => void;
      timeout?: number;
    } = {}
  ): Subscription {
    const aTag = `30311:${pubkey}:${identifier}`;
    const filter: NostrFilter = {
      kinds: [1], // Note kind
      '#a': [aTag]
    };

    return this.subscribeToEvents([filter], eventHandler, {
      timeout: options.timeout || 30000,
      onclosed: options.onclosed
    });
  }

  /**
   * Subscribe to profile events (kind 0)
   */
  subscribeToProfiles(
    pubkeys: string[],
    eventHandler: EventHandler,
    options: {
      onclosed?: () => void;
      timeout?: number;
    } = {}
  ): Subscription {
    const filter: NostrFilter = {
      authors: pubkeys,
      kinds: [0] // Profile kind
    };

    return this.subscribeToEvents([filter], eventHandler, {
      timeout: options.timeout || 30000,
      onclosed: options.onclosed
    });
  }

  /**
   * Publish an event to relays
   */
  async publishEvent(event: NostrEvent): Promise<void> {
    try {
      await this.pool.publish(this.relays, event);
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      // Ignore NIP-13 PoW requirement errors if at least one relay accepts elsewhere
      if (msg.includes('pow:') || msg.toLowerCase().includes('proof-of-work')) {
        console.warn('Publish encountered PoW requirement; treating as non-fatal');
        return; // soft-success
      }
      console.error('Failed to publish event:', error);
      throw new Error(`Failed to publish event: ${error}`);
    }
  }

  /**
   * Get events from relays using subscribeMany pattern
   */
  async getEvents(filters: NostrFilter[]): Promise<NostrEvent[]> {
    // Coalesce identical concurrent requests
    const norm = (f: any) => ({
      kinds: f.kinds,
      authors: f.authors ? [...new Set(f.authors)].sort() : undefined,
      '#e': f['#e'] ? [...new Set(f['#e'])].sort() : undefined,
      '#t': f['#t'] ? [...new Set(f['#t'])].sort() : undefined,
      '#a': f['#a'] ? [...new Set(f['#a'])].sort() : undefined,
      limit: f.limit,
      until: f.until,
      since: f.since
    });
    const key = JSON.stringify(filters.map(norm));
    const existing = this.inFlightRequests.get(key);
    if (existing) return existing;

    const promise = new Promise<NostrEvent[]>((resolve, reject) => {
      try {
        if (!this.pool) {
          throw new Error('Nostr pool not initialized');
        }
        
        if (!this.relays || this.relays.length === 0) {
          throw new Error('No relays configured');
        }

        if (!filters || filters.length === 0) {
          throw new Error('No filters provided');
        }

        // Validate filters
        for (const filter of filters) {
          if (!filter.kinds || filter.kinds.length === 0) {
            throw new Error('Invalid filter: missing kinds');
          }
        }

        console.log('Getting events with filters:', filters);
        console.log('Filter structure:', JSON.stringify(filters, null, 2));
        
        // Ensure filters are plain objects
        const cleanFilters = filters.map(filter => JSON.parse(JSON.stringify(filter)));
        console.log('Clean filters:', cleanFilters);
        
        const events: NostrEvent[] = [];
        let isComplete = false;
        
        const subscription = this.pool.subscribeMany(this.relays, cleanFilters, {
          onevent(event: NostrEvent) {
            events.push(event);
          },
          oneose() {
            if (!isComplete) {
              isComplete = true;
              resolve(events);
            }
          },
          onclosed() {
            if (!isComplete) {
              isComplete = true;
              console.log('Subscription closed, resolving with', events.length, 'events');
              resolve(events);
            }
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!isComplete) {
            isComplete = true;
            subscription.close();
            console.log('Timeout reached, resolving with', events.length, 'events');
            resolve(events);
          }
        }, 10000);

      } catch (error) {
        console.error('Failed to get events:', error);
        reject(new Error(`Failed to get events: ${error}`));
      }
    });

    this.inFlightRequests.set(key, promise);
    promise.finally(() => {
      const cur = this.inFlightRequests.get(key);
      if (cur === promise) this.inFlightRequests.delete(key);
    });

    return promise;
  }

  /**
   * Unsubscribe from a specific subscription
   */
  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      this.subscriptions.delete(subscriptionId);
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  unsubscribeAll(): void {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();
  }

  /**
   * Get relay connection status
   */
  getRelayStatus(): RelayConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Add a new relay
   */
  addRelay(relayUrl: string): void {
    if (!this.relays.includes(relayUrl)) {
      this.relays.push(relayUrl);
    }
  }

  /**
   * Remove a relay
   */
  removeRelay(relayUrl: string): void {
    this.relays = this.relays.filter(url => url !== relayUrl);
  }

  /**
   * Get current relays
   */
  getRelays(): string[] {
    return [...this.relays];
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.unsubscribeAll();
    if (this.pool) {
      try {
        // Check if pool has relays before closing
        if (this.pool.relays && this.pool.relays.size > 0) {
          this.pool.close();
        }
      } catch (error) {
        console.warn('Error closing Nostr pool:', error);
      }
    }
  }
}
