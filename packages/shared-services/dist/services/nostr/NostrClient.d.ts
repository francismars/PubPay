import { NostrEvent, NostrFilter, RelayConnection, EventHandler, Subscription } from '@pubpay/shared-types';
export declare class NostrClient {
    private pool;
    private relays;
    private connections;
    private subscriptions;
    private inFlightRequests;
    constructor(relays?: string[]);
    private initializePool;
    /**
     * Setup error handling for the pool's internal relay connections
     */
    private setupPoolErrorHandling;
    /**
     * Subscribe to events with the given filters
     */
    subscribeToEvents(filters: NostrFilter[], eventHandler: EventHandler, options?: {
        oneose?: () => void;
        onclosed?: () => void;
        timeout?: number;
    }): Subscription;
    /**
     * Subscribe to live events (kind 30311)
     */
    subscribeToLiveEvents(pubkey: string, identifier: string, eventHandler: EventHandler, options?: {
        onclosed?: () => void;
        timeout?: number;
    }): Subscription;
    /**
     * Subscribe to zap events (kind 9735)
     */
    subscribeToZaps(eventId: string, eventHandler: EventHandler, options?: {
        onclosed?: () => void;
        timeout?: number;
    }): Subscription;
    /**
     * Subscribe to chat events for live events
     */
    subscribeToLiveChat(pubkey: string, identifier: string, eventHandler: EventHandler, options?: {
        onclosed?: () => void;
        timeout?: number;
    }): Subscription;
    /**
     * Subscribe to profile events (kind 0)
     */
    subscribeToProfiles(pubkeys: string[], eventHandler: EventHandler, options?: {
        onclosed?: () => void;
        timeout?: number;
    }): Subscription;
    /**
     * Publish an event to relays
     */
    publishEvent(event: NostrEvent): Promise<void>;
    /**
     * Test publishing to individual relays for debugging
     */
    testRelayPublish(event: NostrEvent, relayUrl: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Get a summary of relay health and status
     */
    getRelayHealthSummary(event: NostrEvent): Promise<{
        totalRelays: number;
        workingRelays: string[];
        failedRelays: {
            relay: string;
            error: string;
        }[];
        powRelays: {
            relay: string;
            bits: number;
        }[];
        issues: string[];
    }>;
    /**
     * Test specifically for PoW requirements across all relays
     */
    testPowRequirements(event: NostrEvent): Promise<{
        relay: string;
        bits: number;
        error: string;
    }[]>;
    /**
     * Test all relays individually to identify which ones are blocking
     */
    testAllRelays(event: NostrEvent): Promise<{
        relay: string;
        success: boolean;
        error?: string;
    }[]>;
    /**
     * Get events from relays using subscribeMany pattern
     */
    getEvents(filters: NostrFilter[]): Promise<NostrEvent[]>;
    /**
     * Unsubscribe from a specific subscription
     */
    private unsubscribe;
    /**
     * Unsubscribe from all subscriptions
     */
    unsubscribeAll(): void;
    /**
     * Get relay connection status
     */
    getRelayStatus(): RelayConnection[];
    /**
     * Add a new relay
     */
    addRelay(relayUrl: string): void;
    /**
     * Remove a relay
     */
    removeRelay(relayUrl: string): void;
    /**
     * Get current relays
     */
    getRelays(): string[];
    /**
     * Generate unique subscription ID
     */
    private generateSubscriptionId;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
