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

const STORAGE_KEY = 'nwcConnections';
const ACTIVE_KEY = 'nwcActiveConnectionId';

/**
 * Get all saved NWC connections
 */
export function getNWCConnections(): NWCConnection[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as NWCConnection[];
  } catch {
    return [];
  }
}

/**
 * Save NWC connections
 */
export function saveNWCConnections(connections: NWCConnection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch (error) {
    console.error('Failed to save NWC connections:', error);
  }
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
    
    // Optionally clear old keys (keep them for now for safety)
    // localStorage.removeItem('nwcConnectionString');
    // localStorage.removeItem('nwcCapabilities');
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

