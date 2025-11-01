import { RELAYS } from '../../utils/constants';
import * as NostrTools from 'nostr-tools';
export class NostrClient {
    constructor(relays = RELAYS) {
        this.connections = new Map();
        this.subscriptions = new Map();
        this.inFlightRequests = new Map();
        this.relays = relays;
        this.initializePool();
    }
    initializePool() {
        // Initialize NostrTools.SimplePool using npm package
        this.pool = new NostrTools.SimplePool();
        // Add error handling to the pool's internal relay connections
        this.setupPoolErrorHandling();
    }
    /**
     * Setup error handling for the pool's internal relay connections
     */
    setupPoolErrorHandling() {
        // Override the pool's publish method to catch errors
        const originalPublish = this.pool.publish.bind(this.pool);
        this.pool.publish = async (relays, event) => {
            try {
                return await originalPublish(relays, event);
            }
            catch (error) {
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
    subscribeToEvents(filters, eventHandler, options = {}) {
        const subscriptionId = this.generateSubscriptionId();
        const subscription = {
            id: subscriptionId,
            filters,
            unsubscribe: () => this.unsubscribe(subscriptionId)
        };
        // Add timeout handling
        let timeoutId = null;
        if (options.timeout) {
            timeoutId = setTimeout(() => { }, options.timeout);
        }
        // Subscribe to each filter individually to avoid subscribeMany issues
        const subscriptions = [];
        filters.forEach(filter => {
            const sub = this.pool.subscribe(this.relays, filter, {
                onevent: (event) => {
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
    subscribeToLiveEvents(pubkey, identifier, eventHandler, options = {}) {
        const filter = {
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
    subscribeToZaps(eventId, eventHandler, options = {}) {
        const filter = {
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
    subscribeToLiveChat(pubkey, identifier, eventHandler, options = {}) {
        const aTag = `30311:${pubkey}:${identifier}`;
        const filter = {
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
    subscribeToProfiles(pubkeys, eventHandler, options = {}) {
        const filter = {
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
    async publishEvent(event) {
        try {
            await this.pool.publish(this.relays, event);
        }
        catch (error) {
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
    async testRelayPublish(event, relayUrl) {
        try {
            // Don't modify the event - just test with the original event
            // The duplicate errors are expected and don't indicate failure
            await this.pool.publish([relayUrl], event);
            return { success: true };
        }
        catch (error) {
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
    async getRelayHealthSummary(event) {
        const results = await this.testAllRelays(event);
        const workingRelays = results.filter(r => r.success).map(r => r.relay);
        const failedRelays = results
            .filter(r => !r.success)
            .map(r => ({ relay: r.relay, error: r.error || 'Unknown error' }));
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
        const issues = [];
        // Categorize common issues
        failedRelays.forEach(failed => {
            if (failed.error.includes('pubkey not admitted') ||
                failed.error.includes('blocked')) {
                issues.push(`${failed.relay}: Admission policy (new users not allowed)`);
            }
            else if (failed.error.includes('pow:')) {
                const bitsMatch = failed.error.match(/pow:\s*(\d+)\s*bits/);
                const bits = bitsMatch ? bitsMatch[1] : 'unknown';
                issues.push(`${failed.relay}: Requires ${bits}-bit proof-of-work`);
            }
            else if (failed.error.includes('WebSocket') ||
                failed.error.includes('connection')) {
                issues.push(`${failed.relay}: Connection failed (relay may be down)`);
            }
            else {
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
    async testPowRequirements(event) {
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
    async testAllRelays(event) {
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
    async getEvents(filters) {
        // Coalesce identical concurrent requests
        const norm = (f) => ({
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
        if (existing)
            return existing;
        const promise = new Promise((resolve, reject) => {
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
                    const cleanFilter = {};
                    // Copy standard properties
                    if (filter.kinds)
                        cleanFilter.kinds = filter.kinds;
                    if (filter.authors)
                        cleanFilter.authors = filter.authors;
                    if (filter.ids)
                        cleanFilter.ids = filter.ids;
                    if (filter.limit)
                        cleanFilter.limit = filter.limit;
                    if (filter.until)
                        cleanFilter.until = filter.until;
                    if (filter.since)
                        cleanFilter.since = filter.since;
                    // Handle hashtag properties properly - ensure they are arrays
                    if (filter['#t']) {
                        cleanFilter['#t'] = Array.isArray(filter['#t'])
                            ? filter['#t']
                            : [filter['#t']];
                    }
                    if (filter['#e']) {
                        cleanFilter['#e'] = Array.isArray(filter['#e'])
                            ? filter['#e']
                            : [filter['#e']];
                    }
                    if (filter['#p']) {
                        cleanFilter['#p'] = Array.isArray(filter['#p'])
                            ? filter['#p']
                            : [filter['#p']];
                    }
                    if (filter['#a']) {
                        cleanFilter['#a'] = Array.isArray(filter['#a'])
                            ? filter['#a']
                            : [filter['#a']];
                    }
                    return cleanFilter;
                })
                    .filter(filter => {
                    // Filter out empty filters
                    const hasKinds = filter.kinds && filter.kinds.length > 0;
                    const hasAuthors = filter.authors && filter.authors.length > 0;
                    const hasIds = filter.ids && filter.ids.length > 0;
                    const hasTags = filter['#t'] || filter['#e'] || filter['#p'] || filter['#a'];
                    // Additional validation: ensure filter is a proper object
                    const isValidObject = filter && typeof filter === 'object' && !Array.isArray(filter);
                    return (isValidObject && hasKinds && (hasAuthors || hasIds || hasTags));
                });
                // If no valid filters remain, return empty array
                if (cleanFilters.length === 0) {
                    resolve([]);
                    return;
                }
                const events = [];
                let isComplete = false;
                let completedSubscriptions = 0;
                const totalSubscriptions = cleanFilters.length;
                // Subscribe to each filter individually
                const subscriptions = cleanFilters.map(filter => {
                    return this.pool.subscribe(this.relays, filter, {
                        onevent(event) {
                            events.push(event);
                        },
                        oneose() {
                            completedSubscriptions++;
                            if (completedSubscriptions === totalSubscriptions &&
                                !isComplete) {
                                isComplete = true;
                                resolve(events);
                            }
                        },
                        onclosed() {
                            completedSubscriptions++;
                            if (completedSubscriptions === totalSubscriptions &&
                                !isComplete) {
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
            }
            catch (error) {
                reject(new Error(`Failed to get events: ${error}`));
            }
        });
        this.inFlightRequests.set(key, promise);
        promise.finally(() => {
            const cur = this.inFlightRequests.get(key);
            if (cur === promise)
                this.inFlightRequests.delete(key);
        });
        return promise;
    }
    /**
     * Unsubscribe from a specific subscription
     */
    unsubscribe(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            this.subscriptions.delete(subscriptionId);
        }
    }
    /**
     * Unsubscribe from all subscriptions
     */
    unsubscribeAll() {
        this.subscriptions.forEach(subscription => {
            subscription.unsubscribe();
        });
        this.subscriptions.clear();
    }
    /**
     * Get relay connection status
     */
    getRelayStatus() {
        return Array.from(this.connections.values());
    }
    /**
     * Add a new relay
     */
    addRelay(relayUrl) {
        if (!this.relays.includes(relayUrl)) {
            this.relays.push(relayUrl);
        }
    }
    /**
     * Remove a relay
     */
    removeRelay(relayUrl) {
        this.relays = this.relays.filter(url => url !== relayUrl);
    }
    /**
     * Get current relays
     */
    getRelays() {
        return [...this.relays];
    }
    /**
     * Generate unique subscription ID
     */
    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.unsubscribeAll();
        if (this.pool && typeof this.pool.close === 'function') {
            try {
                this.pool.close();
            }
            catch (_err) {
                // Ignore close errors (can occur in StrictMode double-unmounts)
            }
        }
    }
}
