// NostrClient - Handles all Nostr protocol interactions
import {
  NostrEvent,
  NostrFilter,
  RelayConnection,
  EventHandler,
  Subscription
} from '@pubpay/shared-types';
import { RELAYS } from '../../utils/constants';
import { QueryClient } from '@tanstack/react-query';
import * as NostrTools from 'nostr-tools';

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
    // Initialize NostrTools.SimplePool using npm package
    this.pool = new NostrTools.SimplePool();
    
    // Add error handling to the pool's internal relay connections
    this.setupPoolErrorHandling();
  }

  /**
   * Setup error handling for the pool's internal relay connections
   */
  private setupPoolErrorHandling(): void {
    // Override the pool's publish method to catch errors
    const originalPublish = this.pool.publish.bind(this.pool);
    
    this.pool.publish = async (relays: string[], event: any) => {
      try {
        return await originalPublish(relays, event);
      } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || '';
        
        // Handle known relay response errors gracefully
        if (errorMessage.includes('pow:') || 
            errorMessage.includes('duplicate:') ||
            errorMessage.includes('blocked:') ||
            errorMessage.includes('invalid:') ||
            errorMessage.includes('pubkey not admitted') ||
            errorMessage.includes('admission')) {
          
          
          // Don't re-throw these errors
          return;
        }
        
        // Re-throw other errors
        throw error;
      }
    };
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
      }, options.timeout);
    }

    // Subscribe to each filter individually to avoid subscribeMany issues
    const subscriptions: any[] = [];
    filters.forEach(filter => {
      const sub = this.pool.subscribe(this.relays, filter, {
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
      subscriptions.push(sub);
    });

    // Create a combined subscription object
    const sub = {
      close: () => {
        subscriptions.forEach(s => s.close());
      }
    };

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
      
      
      // Check for PoW requirements and treat as non-fatal
      if (msg.includes('pow:') || msg.toLowerCase().includes('proof-of-work')) {
        return; // soft-success
      }
      
      throw new Error(`Failed to publish event ${event.id}: ${msg}`);
    }
  }

  /**
   * Test publishing to individual relays for debugging
   */
  async testRelayPublish(event: NostrEvent, relayUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Don't modify the event - just test with the original event
      // The duplicate errors are expected and don't indicate failure
      await this.pool.publish([relayUrl], event);
      return { success: true };
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      
      // Ignore duplicate errors as they're expected when testing
      if (msg.includes('duplicate')) {
        return { success: true };
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Get a summary of relay health and status
   */
  async getRelayHealthSummary(event: NostrEvent): Promise<{
    totalRelays: number;
    workingRelays: string[];
    failedRelays: { relay: string; error: string }[];
    powRelays: { relay: string; bits: number }[];
    issues: string[];
  }> {
    const results = await this.testAllRelays(event);
    
    const workingRelays = results.filter(r => r.success).map(r => r.relay);
    const failedRelays = results.filter(r => !r.success).map(r => ({ relay: r.relay, error: r.error || 'Unknown error' }));
    
    // Extract PoW requirements
    const powRelays = failedRelays
      .filter(failed => failed.error.includes('pow:'))
      .map(failed => {
        const bitsMatch = failed.error.match(/pow:\s*(\d+)\s*bits/);
        return {
          relay: failed.relay,
          bits: bitsMatch ? parseInt(bitsMatch[1]) : 0
        };
      });
    
    const issues: string[] = [];
    
    // Categorize common issues
    failedRelays.forEach(failed => {
      if (failed.error.includes('pubkey not admitted') || failed.error.includes('blocked')) {
        issues.push(`${failed.relay}: Admission policy (new users not allowed)`);
      } else if (failed.error.includes('pow:')) {
        const bitsMatch = failed.error.match(/pow:\s*(\d+)\s*bits/);
        const bits = bitsMatch ? bitsMatch[1] : 'unknown';
        issues.push(`${failed.relay}: Requires ${bits}-bit proof-of-work`);
      } else if (failed.error.includes('WebSocket') || failed.error.includes('connection')) {
        issues.push(`${failed.relay}: Connection failed (relay may be down)`);
      } else {
        issues.push(`${failed.relay}: ${failed.error}`);
      }
    });
    
    const summary = {
      totalRelays: this.relays.length,
      workingRelays,
      failedRelays,
      powRelays,
      issues
    };
    
    
    return summary;
  }

  /**
   * Test specifically for PoW requirements across all relays
   */
  async testPowRequirements(event: NostrEvent): Promise<{ relay: string; bits: number; error: string }[]> {
    const results = await this.testAllRelays(event);
    
    const powResults = results
      .filter(r => r.error?.includes('pow:'))
      .map(r => {
        const bitsMatch = r.error?.match(/pow:\s*(\d+)\s*bits/);
        return {
          relay: r.relay,
          bits: bitsMatch ? parseInt(bitsMatch[1]) : 0,
          error: r.error || 'Unknown PoW error'
        };
      });
    
    
    return powResults;
  }

 

  /**
   * Test all relays individually to identify which ones are blocking
   */
  async testAllRelays(event: NostrEvent): Promise<{ relay: string; success: boolean; error?: string }[]> {
    const results = [];
    
    for (const relay of this.relays) {
      const result = await this.testRelayPublish(event, relay);
      results.push({
        relay,
        success: result.success,
        error: result.error
      });
    }
    
    return results;
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


        // Ensure filters are plain objects and properly format hashtag properties
        const cleanFilters = filters
          .map(filter => {
            const cleanFilter: any = {};

            // Copy standard properties
            if (filter.kinds) cleanFilter.kinds = filter.kinds;
            if (filter.authors) cleanFilter.authors = filter.authors;
            if (filter.ids) cleanFilter.ids = filter.ids;
            if (filter.limit) cleanFilter.limit = filter.limit;
            if (filter.until) cleanFilter.until = filter.until;
            if (filter.since) cleanFilter.since = filter.since;

            // Handle hashtag properties properly - ensure they are arrays
            if ((filter as any)['#t']) {
              cleanFilter['#t'] = Array.isArray((filter as any)['#t'])
                ? (filter as any)['#t']
                : [(filter as any)['#t']];
            }
            if ((filter as any)['#e']) {
              cleanFilter['#e'] = Array.isArray((filter as any)['#e'])
                ? (filter as any)['#e']
                : [(filter as any)['#e']];
            }
            if ((filter as any)['#p']) {
              cleanFilter['#p'] = Array.isArray((filter as any)['#p'])
                ? (filter as any)['#p']
                : [(filter as any)['#p']];
            }
            if ((filter as any)['#a']) {
              cleanFilter['#a'] = Array.isArray((filter as any)['#a'])
                ? (filter as any)['#a']
                : [(filter as any)['#a']];
            }

            return cleanFilter;
          })
          .filter(filter => {
            // Filter out empty filters
            const hasKinds = filter.kinds && filter.kinds.length > 0;
            const hasAuthors = filter.authors && filter.authors.length > 0;
            const hasIds = filter.ids && filter.ids.length > 0;
            const hasTags =
              filter['#t'] || filter['#e'] || filter['#p'] || filter['#a'];

            // Additional validation: ensure filter is a proper object
            const isValidObject =
              filter && typeof filter === 'object' && !Array.isArray(filter);

            return (
              isValidObject && hasKinds && (hasAuthors || hasIds || hasTags)
            );
          });

        // If no valid filters remain, return empty array
        if (cleanFilters.length === 0) {
          resolve([]);
          return;
        }

        const events: NostrEvent[] = [];
        let isComplete = false;
        let completedSubscriptions = 0;
        const totalSubscriptions = cleanFilters.length;

        // Subscribe to each filter individually
        const subscriptions = cleanFilters.map(filter => {
          return this.pool.subscribe(this.relays, filter, {
            onevent(event: NostrEvent) {
              events.push(event);
            },
            oneose() {
              completedSubscriptions++;
              if (
                completedSubscriptions === totalSubscriptions &&
                !isComplete
              ) {
                isComplete = true;
                resolve(events);
              }
            },
            onclosed() {
              completedSubscriptions++;
              if (
                completedSubscriptions === totalSubscriptions &&
                !isComplete
              ) {
                isComplete = true;
                resolve(events);
              }
            }
          });
        });

        // Store all subscriptions for cleanup
        const subscription = {
          close: () => {
            subscriptions.forEach(sub => sub.close());
          }
        };

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!isComplete) {
            isComplete = true;
            subscription.close();
            resolve(events);
          }
        }, 10000);
      } catch (error) {
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
    this.subscriptions.forEach(subscription => {
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
    
    if (this.pool && typeof this.pool.close === 'function') {
      try {
        this.pool.close();
      } catch (_err) {
        // Ignore close errors (can occur in StrictMode double-unmounts)
      }
    }
  }
}
