// NwcSecureStorage - encrypted-at-rest storage for NWC connection strings.
//
// NWC URIs embed a wallet secret, so they must not sit in localStorage as
// plaintext. Connections are encrypted with the same device-key helper used for
// private keys (see DeviceKeyCrypto). NOTE: that is obfuscation only - the
// device key lives in localStorage too - but it keeps secrets out of plaintext
// storage dumps and casual inspection.
//
// WebCrypto is async while the app reads connections synchronously in many
// places, so this module keeps a decrypted in-memory cache:
//   1. call `hydrateNwcConnections()` once at startup (and after cross-tab
//      storage events with `force: true`);
//   2. use the sync getters/setters afterwards - writes update the cache
//      immediately and are persisted (encrypted) in the background.
// Legacy plaintext arrays under the same key are read transparently and
// re-written encrypted on hydration.

import {
  encryptWithDeviceKey,
  decryptWithDeviceKey,
  isEncryptedPayload,
  type EncryptedPayload
} from '../DeviceKeyCrypto';

export const NWC_CONNECTIONS_STORAGE_KEY = 'nwcConnections';
export const NWC_ACTIVE_CONNECTION_STORAGE_KEY = 'nwcActiveConnectionId';

export interface NwcStoredConnection {
  id: string;
  label: string;
  uri: string;
  capabilities?: {
    methods?: string[];
    notifications?: string[];
  };
  createdAt: number;
}

type Envelope = { v: 1; enc: EncryptedPayload };

let cache: NwcStoredConnection[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

async function readStored(): Promise<NwcStoredConnection[]> {
  if (!hasStorage()) return [];
  const raw = localStorage.getItem(NWC_CONNECTIONS_STORAGE_KEY);
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;

  // Legacy plaintext array
  if (Array.isArray(parsed)) {
    const legacy = parsed as NwcStoredConnection[];
    cache = legacy;
    // Re-write encrypted right away (best effort)
    try {
      await persistNow();
    } catch (error) {
      console.error('Failed to encrypt legacy NWC connections:', error);
    }
    return legacy;
  }

  const enc = (parsed as Partial<Envelope> | null)?.enc;
  if (isEncryptedPayload(enc)) {
    const plaintext = await decryptWithDeviceKey(enc);
    const list = JSON.parse(plaintext) as unknown;
    return Array.isArray(list) ? (list as NwcStoredConnection[]) : [];
  }
  return [];
}

async function persistNow(): Promise<void> {
  if (!hasStorage()) return;
  const snapshot = cache;
  if (snapshot.length === 0) {
    localStorage.removeItem(NWC_CONNECTIONS_STORAGE_KEY);
    return;
  }
  const enc = await encryptWithDeviceKey(JSON.stringify(snapshot));
  const envelope: Envelope = { v: 1, enc };
  localStorage.setItem(NWC_CONNECTIONS_STORAGE_KEY, JSON.stringify(envelope));
}

function schedulePersist(): Promise<void> {
  persistChain = persistChain
    .then(() => {
      return persistNow();
    })
    .catch(error => {
      console.error('Failed to persist NWC connections:', error);
    });
  return persistChain;
}

/**
 * Load (and decrypt) saved connections into the in-memory cache.
 * Safe to call repeatedly; pass `force` to re-read storage (e.g. after a
 * `storage` event from another tab).
 */
export function hydrateNwcConnections(options?: {
  force?: boolean;
}): Promise<void> {
  if (hydrated && !options?.force) return Promise.resolve();
  if (hydrating && !options?.force) return hydrating;

  hydrating = (async () => {
    try {
      cache = await readStored();
    } catch (error) {
      // e.g. device key was cleared: ciphertext is unrecoverable. Keep storage
      // untouched until the user saves a new connection.
      console.error('Failed to read NWC connections:', error);
      cache = [];
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();
  return hydrating;
}

/** Sync read of the decrypted cache (call `hydrateNwcConnections` first). */
export function getCachedNwcConnections(): NwcStoredConnection[] {
  return cache.map(c => ({ ...c }));
}

/**
 * Replace all connections. Cache updates synchronously; the encrypted write is
 * queued. Resolves when the write has been flushed.
 */
export function setCachedNwcConnections(
  connections: NwcStoredConnection[]
): Promise<void> {
  cache = connections.map(c => ({ ...c }));
  hydrated = true;
  return schedulePersist();
}

/** Resolves once all queued writes have been flushed. */
export function flushNwcConnections(): Promise<void> {
  return persistChain;
}

/** Remove all stored connections (cache + storage). */
export function clearNwcConnections(): void {
  cache = [];
  persistChain = persistChain.then(() => {
    if (hasStorage()) localStorage.removeItem(NWC_CONNECTIONS_STORAGE_KEY);
  });
}

/**
 * Async helper for non-UI code (e.g. ZapService): the active connection URI,
 * decrypted. Falls back to the legacy single-connection keys.
 */
export async function loadActiveNwcUri(): Promise<string | null> {
  if (!hasStorage()) return null;
  await hydrateNwcConnections();

  try {
    const activeId = localStorage.getItem(NWC_ACTIVE_CONNECTION_STORAGE_KEY);
    if (activeId) {
      const connection = cache.find(c => c.id === activeId);
      if (connection?.uri) return connection.uri;
    }
  } catch {
    // ignore
  }

  // Legacy single-connection format (plaintext; removed on migration)
  return (
    localStorage.getItem('nwcConnectionString') ||
    (typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('nwcConnectionString')) ||
    null
  );
}
