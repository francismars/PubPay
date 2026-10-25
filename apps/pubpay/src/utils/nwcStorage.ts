import {
  hydrateNwcConnections,
  getCachedNwcConnections,
  setCachedNwcConnections,
  flushNwcConnections
} from '@pubpay/shared-services';
import { STORAGE_KEYS } from '../constants';

export interface NWCConnection {
  id: string;
  label: string;
  uri: string;
  capabilities?: {
    methods?: string[];
    notifications?: string[];
  };
  createdAt: number;
}

// Connections (which embed wallet secrets) are stored encrypted at rest by
// NwcSecureStorage in @pubpay/shared-services. The sync functions below read
// from its decrypted in-memory cache, so `initNWCStorage()` must have resolved
// before first use (it is awaited before the app renders).
const ACTIVE_KEY = 'nwcActiveConnectionId';

/**
 * Decrypt saved connections into memory. Call once at startup, and with
 * `force` after cross-tab `storage` events.
 */
export function initNWCStorage(options?: { force?: boolean }): Promise<void> {
  return hydrateNwcConnections(options);
}

/**
 * Get all saved NWC connections
 */
export function getNWCConnections(): NWCConnection[] {
  return getCachedNwcConnections() as NWCConnection[];
}

/**
 * Save NWC connections (cache updates immediately, encrypted write is queued)
 */
export function saveNWCConnections(connections: NWCConnection[]): void {
  void setCachedNwcConnections(connections);
}

/**
 * Add or update an NWC connection
 */
export function saveNWCConnection(connection: NWCConnection): void {
  const connections = getNWCConnections();
  const index = connections.findIndex(c => c.id === connection.id);

  if (index >= 0) {
    connections[index] = connection;
  } else {
    connections.push(connection);
  }

  saveNWCConnections(connections);
}

/**
 * Delete an NWC connection
 */
export function deleteNWCConnection(id: string): void {
  const connections = getNWCConnections();
  const filtered = connections.filter(c => c.id !== id);
  saveNWCConnections(filtered);

  // If we deleted the active connection, clear the active ID
  const activeId = getActiveNWCConnectionId();
  if (activeId === id) {
    clearActiveNWCConnection();
  }
}

/**
 * Get the active NWC connection ID
 */
export function getActiveNWCConnectionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/**
 * Set the active NWC connection
 */
export function setActiveNWCConnection(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch (error) {
    console.error('Failed to set active NWC connection:', error);
  }
}

/**
 * Clear the active NWC connection
 */
export function clearActiveNWCConnection(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch (error) {
    console.error('Failed to clear active NWC connection:', error);
  }
}

/**
 * Get the active NWC connection
 */
export function getActiveNWCConnection(): NWCConnection | null {
  const activeId = getActiveNWCConnectionId();
  if (!activeId) return null;

  const connections = getNWCConnections();
  return connections.find(c => c.id === activeId) || null;
}

/**
 * Get the active NWC URI (for backward compatibility)
 */
export function getActiveNWCUri(): string | null {
  const connection = getActiveNWCConnection();
  return connection?.uri || null;
}

/**
 * Migrate old single connection to new format
 */
export function migrateOldNWCConnection(): void {
  try {
    const oldUri = localStorage.getItem(STORAGE_KEYS.NWC_CONNECTION_STRING);
    if (!oldUri) return;

    // Check if we already have connections
    const existing = getNWCConnections();
    if (existing.length > 0) return; // Already migrated

    // Create a connection from the old format
    const oldCaps = localStorage.getItem(STORAGE_KEYS.NWC_CAPABILITIES);
    let capabilities: NWCConnection['capabilities'] | undefined;
    if (oldCaps) {
      try {
        capabilities = JSON.parse(oldCaps);
      } catch {
        // Ignore parse errors
      }
    }

    const connection: NWCConnection = {
      id: `migrated-${Date.now()}`,
      label: 'My Wallet',
      uri: oldUri,
      capabilities,
      createdAt: Date.now()
    };

    saveNWCConnection(connection);
    setActiveNWCConnection(connection.id);

    // Remove the legacy plaintext connection string, but only once the
    // encrypted copy has been written.
    void flushNwcConnections().then(() => {
      try {
        if (getNWCConnections().some(c => c.id === connection.id)) {
          localStorage.removeItem(STORAGE_KEYS.NWC_CONNECTION_STRING);
          sessionStorage.removeItem(STORAGE_KEYS.NWC_CONNECTION_STRING);
        }
      } catch {
        // ignore
      }
    });
  } catch (error) {
    console.error('Failed to migrate old NWC connection:', error);
  }
}

/**
 * Generate a unique ID for a new connection
 */
export function generateNWCConnectionId(): string {
  return `nwc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
