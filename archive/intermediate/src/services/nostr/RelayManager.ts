// RelayManager - Handles relay connections and status
import { RelayConnection, RelayInfo } from '../../types/nostr';
import { RELAYS } from '../../utils/constants';

export class RelayManager {
  private connections: Map<string, RelayConnection> = new Map();
  private relayInfo: Map<string, RelayInfo> = new Map();
  private defaultRelays: string[];

  constructor(defaultRelays: string[] = RELAYS) {
    this.defaultRelays = defaultRelays;
    this.initializeConnections();
  }

  /**
   * Initialize relay connections
   */
  private initializeConnections(): void {
    this.defaultRelays.forEach(relayUrl => {
      this.connections.set(relayUrl, {
        url: relayUrl,
        status: 'disconnected',
        lastSeen: 0
      });
    });
  }

  /**
   * Add a new relay
   */
  addRelay(relayUrl: string): void {
    if (!this.connections.has(relayUrl)) {
      this.connections.set(relayUrl, {
        url: relayUrl,
        status: 'disconnected',
        lastSeen: 0
      });
    }
  }

  /**
   * Remove a relay
   */
  removeRelay(relayUrl: string): void {
    this.connections.delete(relayUrl);
    this.relayInfo.delete(relayUrl);
  }

  /**
   * Get all relay connections
   */
  getConnections(): RelayConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connected relays only
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, connection]) => connection.status === 'connected')
      .map(([url, _]) => url);
  }

  /**
   * Get disconnected relays
   */
  getDisconnectedRelays(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, connection]) => connection.status === 'disconnected')
      .map(([url, _]) => url);
  }

  /**
   * Update relay connection status
   */
  updateConnectionStatus(
    relayUrl: string,
    status: RelayConnection['status'],
    error?: string
  ): void {
    const connection = this.connections.get(relayUrl);
    if (connection) {
      connection.status = status;
      connection.lastSeen = Date.now();
      if (error) {
        connection.error = error;
      }
    }
  }

  /**
   * Update relay latency
   */
  updateLatency(relayUrl: string, latency: number): void {
    const connection = this.connections.get(relayUrl);
    if (connection) {
      connection.latency = latency;
    }
  }

  /**
   * Get relay info
   */
  getRelayInfo(relayUrl: string): RelayInfo | null {
    return this.relayInfo.get(relayUrl) || null;
  }

  /**
   * Set relay info
   */
  setRelayInfo(relayUrl: string, info: RelayInfo): void {
    this.relayInfo.set(relayUrl, info);
  }

  /**
   * Check if relay is healthy
   */
  isRelayHealthy(relayUrl: string): boolean {
    const connection = this.connections.get(relayUrl);
    if (!connection) return false;

    const now = Date.now();
    const timeSinceLastSeen = now - connection.lastSeen;
    const maxIdleTime = 5 * 60 * 1000; // 5 minutes

    return connection.status === 'connected' && timeSinceLastSeen < maxIdleTime;
  }

  /**
   * Get healthy relays
   */
  getHealthyRelays(): string[] {
    return Array.from(this.connections.keys()).filter(relayUrl =>
      this.isRelayHealthy(relayUrl)
    );
  }

  /**
   * Get relay statistics
   */
  getRelayStats(): {
    total: number;
    connected: number;
    disconnected: number;
    healthy: number;
    averageLatency: number;
  } {
    const connections = Array.from(this.connections.values());
    const connected = connections.filter(c => c.status === 'connected');
    const healthy = this.getHealthyRelays().length;
    const latencies = connected
      .map(c => c.latency)
      .filter(l => l !== undefined) as number[];

    return {
      total: connections.length,
      connected: connected.length,
      disconnected: connections.length - connected.length,
      healthy,
      averageLatency:
        latencies.length > 0
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length
          : 0
    };
  }

  /**
   * Test relay connection
   */
  async testRelay(relayUrl: string): Promise<boolean> {
    try {
      // This would implement actual relay testing
      // For now, simulate a test
      return new Promise(resolve => {
        setTimeout(() => {
          this.updateConnectionStatus(relayUrl, 'connected');
          resolve(true);
        }, 1000);
      });
    } catch (error) {
      this.updateConnectionStatus(
        relayUrl,
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return false;
    }
  }

  /**
   * Test all relays
   */
  async testAllRelays(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(relayUrl =>
      this.testRelay(relayUrl)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get recommended relays based on performance
   */
  getRecommendedRelays(limit: number = 3): string[] {
    const healthyRelays = this.getHealthyRelays();
    const connections = this.connections;

    return healthyRelays
      .map(relayUrl => ({
        url: relayUrl,
        connection: connections.get(relayUrl)!
      }))
      .sort(
        (a, b) =>
          (a.connection.latency || Infinity) -
          (b.connection.latency || Infinity)
      )
      .slice(0, limit)
      .map(relay => relay.url);
  }

  /**
   * Reset all connections
   */
  resetConnections(): void {
    this.connections.forEach((connection, relayUrl) => {
      connection.status = 'disconnected';
      connection.lastSeen = 0;
      connection.error = undefined;
      connection.latency = undefined;
    });
  }

  /**
   * Get connection health report
   */
  getHealthReport(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    details: RelayConnection[];
  } {
    const stats = this.getRelayStats();
    const connections = this.getConnections();

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let message: string;

    if (stats.healthy >= 3) {
      status = 'healthy';
      message = 'All relays are healthy';
    } else if (stats.connected >= 2) {
      status = 'degraded';
      message =
        'Some relays are disconnected but core functionality is available';
    } else {
      status = 'unhealthy';
      message = 'Most relays are disconnected - functionality may be limited';
    }

    return {
      status,
      message,
      details: connections
    };
  }
}
