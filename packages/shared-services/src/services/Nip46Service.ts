import { SimplePool } from 'nostr-tools';
import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  type BunkerPointer
} from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { DEFAULT_WRITE_RELAYS } from '../utils/constants';

const STORAGE_KEY = 'nip46_session';

export type Nip46PersistedSession = {
  clientSkHex: string;
  bunkerPointer: BunkerPointer;
  /**
   * When true, do not send the NIP-46 `connect` RPC. Required for NostrConnect
   * (QR) flow: the handshake ack already proves the URI secret; signers such as
   * Primal reject `connect` with that same secret ("We don't accept connect
   * requests with new secret.").
   */
  skipConnectRpc?: boolean;
};

export class Nip46Service {
  static readonly STORAGE_KEY = STORAGE_KEY;

  static clearPersistedSession(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  static savePersistedSession(
    clientSecretKey: Uint8Array,
    bunkerPointer: BunkerPointer,
    meta?: { skipConnectRpc?: boolean }
  ): void {
    const payload: Nip46PersistedSession = {
      clientSkHex: bytesToHex(clientSecretKey),
      bunkerPointer,
      ...(meta?.skipConnectRpc === true ? { skipConnectRpc: true } : {})
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  static loadPersistedSession(): Nip46PersistedSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Nip46PersistedSession;
      if (
        !parsed.clientSkHex ||
        !parsed.bunkerPointer?.pubkey ||
        !Array.isArray(parsed.bunkerPointer.relays) ||
        parsed.bunkerPointer.relays.length === 0
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Build a Nostr Connect URI for QR / deep-link pairing (see NIP-46).
   */
  static createNostrConnectPairingRequest(): {
    uri: string;
    clientSecretKey: Uint8Array;
  } {
    const relays = [...DEFAULT_WRITE_RELAYS];
    const clientSecretKey = generateSecretKey();
    const clientPubkey = getPublicKey(clientSecretKey);
    const secret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const uri = createNostrConnectURI({
      clientPubkey,
      relays,
      secret,
      name: 'PUBPAY.me'
    });
    return { uri, clientSecretKey };
  }

  /**
   * Wait for a signer to acknowledge the nostrconnect:// URI (QR flow).
   */
  static async waitForNostrConnectPairing(
    clientSecretKey: Uint8Array,
    connectionURI: string,
    maxWaitMs = 480_000
  ): Promise<{ publicKey: string }> {
    const pool = new SimplePool();
    try {
      const signer = await BunkerSigner.fromURI(
        clientSecretKey,
        connectionURI,
        { pool },
        maxWaitMs
      );
      const publicKey = await signer.getPublicKey();
      this.savePersistedSession(clientSecretKey, signer.bp, {
        skipConnectRpc: true
      });
      await signer.close();
      return { publicKey };
    } finally {
      try {
        pool.destroy();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Pair using a bunker:// URL or NIP-05 identifier (NIP-46 guide flow C).
   */
  static async pairWithBunkerInput(input: string): Promise<{ publicKey: string }> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Enter a bunker URL or NIP-05 address');
    }
    const bp = await parseBunkerInput(trimmed);
    if (!bp || bp.relays.length === 0) {
      throw new Error('Invalid bunker URL or NIP-05 identifier');
    }
    const clientSecretKey = generateSecretKey();
    const pool = new SimplePool();
    try {
      const signer = BunkerSigner.fromBunker(clientSecretKey, bp, { pool });
      await signer.connect();
      const publicKey = await signer.getPublicKey();
      this.savePersistedSession(clientSecretKey, signer.bp);
      await signer.close();
      return { publicKey };
    } finally {
      try {
        pool.destroy();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Sign an event template via the persisted NIP-46 bunker session.
   */
  static async signNostrEvent(ev: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey?: string;
  }): Promise<Record<string, unknown>> {
    const persisted = this.loadPersistedSession();
    if (!persisted) {
      throw new Error(
        'NIP-46 session missing. Please sign out and connect your signer again.'
      );
    }
    const clientSk = hexToBytes(persisted.clientSkHex);
    const pool = new SimplePool();
    try {
      const signer = BunkerSigner.fromBunker(clientSk, persisted.bunkerPointer, {
        pool
      });
      if (!persisted.skipConnectRpc) {
        await signer.connect();
      }
      const template = {
        kind: ev.kind,
        created_at: ev.created_at,
        tags: ev.tags,
        content: ev.content,
        pubkey: ev.pubkey || ''
      };
      const signed = await signer.signEvent(template as any);
      await signer.close();
      return signed as unknown as Record<string, unknown>;
    } finally {
      try {
        pool.destroy();
      } catch {
        // ignore
      }
    }
  }
}
