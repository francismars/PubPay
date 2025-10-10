import { RelayConnection, RelayInfo } from '@pubpay/shared-types';
export declare class RelayManager {
    private connections;
    private relayInfo;
    private defaultRelays;
    constructor(defaultRelays?: string[]);
    /**
     * Initialize relay connections
     */
    private initializeConnections;
    /**
     * Add a new relay
     */
    addRelay(relayUrl: string): void;
    /**
     * Remove a relay
     */
    removeRelay(relayUrl: string): void;
    /**
     * Get all relay connections
     */
    getConnections(): RelayConnection[];
    /**
     * Get connected relays only
     */
    getConnectedRelays(): string[];
    /**
     * Get disconnected relays
     */
    getDisconnectedRelays(): string[];
    /**
     * Update relay connection status
     */
    updateConnectionStatus(relayUrl: string, status: RelayConnection['status'], error?: string): void;
    /**
     * Update relay latency
     */
    updateLatency(relayUrl: string, latency: number): void;
    /**
     * Get relay info
     */
    getRelayInfo(relayUrl: string): RelayInfo | null;
    /**
     * Set relay info
     */
    setRelayInfo(relayUrl: string, info: RelayInfo): void;
    /**
     * Check if relay is healthy
     */
    isRelayHealthy(relayUrl: string): boolean;
    /**
     * Get healthy relays
     */
    getHealthyRelays(): string[];
    /**
     * Get relay statistics
     */
    getRelayStats(): {
        total: number;
        connected: number;
        disconnected: number;
        healthy: number;
        averageLatency: number;
    };
    /**
     * Test relay connection
     */
    testRelay(relayUrl: string): Promise<boolean>;
    /**
     * Test all relays
     */
    testAllRelays(): Promise<void>;
    /**
     * Get recommended relays based on performance
     */
    getRecommendedRelays(limit?: number): string[];
    /**
     * Reset all connections
     */
    resetConnections(): void;
    /**
     * Get connection health report
     */
    getHealthReport(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        message: string;
        details: RelayConnection[];
    };
}
