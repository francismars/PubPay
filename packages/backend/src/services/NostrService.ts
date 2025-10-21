// NostrService - Handles Nostr operations including anonymous zap creation
import { Logger } from '../utils/logger';
import { SimplePool, finalizeEvent, nip19 } from 'nostr-tools';
import * as crypto from 'crypto';

export interface ZapResult {
  success: boolean;
  eventId?: string;
  error?: string;
  relays?: string[];
}

export class NostrService {
  private pool: SimplePool;
  private relays: string[];
  private logger: Logger;

  constructor() {
    this.pool = new SimplePool();
    this.relays = [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://relay.nostr.band'
    ];
    this.logger = new Logger('NostrService');
    
    this.logger.info('NostrService initialized with relays:', this.relays);
  }

  /**
   * Send anonymous zap to Nostr relays
   */
  async sendAnonymousZap(eventId: string, amount: number, comment: string): Promise<ZapResult> {
    try {
      this.logger.info(`Creating zap request for event ${eventId} with amount ${amount} sats`);
      
      // Generate anonymous key pair
      const privateKey = crypto.randomBytes(32);
      const publicKey = this.getPublicKeyFromPrivate(privateKey);
      
      // Decode event ID if it's encoded (note1... or nevent1...)
      const rawEventId = this.decodeEventId(eventId);
      
      // Get recipient public key from event
      const recipientPubkey = await this.getRecipientPubkey(rawEventId);
      if (!recipientPubkey) {
        throw new Error('Could not determine recipient public key');
      }

      // Create zap request (kind 9734)
      const zapRequest = this.createZapRequest(recipientPubkey, rawEventId, amount, comment, publicKey);
      
      // Create zap receipt (kind 9735)
      const zapReceipt = this.createZapReceipt(recipientPubkey, rawEventId, amount, comment, zapRequest);
      
      // Sign the zap receipt
      const signedEvent = this.signEvent(zapReceipt, privateKey);
      
      // Publish to relays
      const publishedRelays = await this.publishToRelays(signedEvent);
      
      this.logger.info(`✅ Zap published successfully to ${publishedRelays.length} relays`);
      
      return {
        success: true,
        eventId: signedEvent.id,
        relays: publishedRelays
      };
    } catch (error) {
      this.logger.error('Error sending anonymous zap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Decode event ID from note1... or nevent1... format
   */
  private decodeEventId(eventId: string): string {
    if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
      try {
        const decoded = nip19.decode(eventId);
        
        if (eventId.startsWith('note1')) {
          // note1... decodes to raw hex event ID
          return decoded.data as string;
        } else if (eventId.startsWith('nevent1')) {
          // nevent1... decodes to object with id field
          return (decoded.data as any).id;
        }
      } catch (error) {
        this.logger.warn('Failed to decode event ID, using as-is:', eventId);
      }
    }
    
    return eventId;
  }

  /**
   * Get recipient public key from event
   */
  private async getRecipientPubkey(eventId: string): Promise<string | null> {
    try {
      // Query relays for the event
      const events = await this.pool.querySync(this.relays, {
        ids: [eventId]
      });

      if (events.length === 0) {
        this.logger.warn(`Event ${eventId} not found on relays`);
        return null;
      }

      const event = events[0];
      if (!event) {
        this.logger.warn(`Event ${eventId} not found on relays`);
        return null;
      }
      return event.pubkey;
    } catch (error) {
      this.logger.error('Error getting recipient pubkey:', error);
      return null;
    }
  }

  /**
   * Create zap request (kind 9734)
   */
  private createZapRequest(
    recipientPubkey: string,
    eventId: string,
    _amount: number,
    comment: string,
    senderPubkey: string
  ): any {
    return {
      kind: 9734,
      content: comment,
      tags: [
        ['p', recipientPubkey],
        ['e', eventId],
        ['relays', ...this.relays]
      ],
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Create zap receipt (kind 9735)
   */
  private createZapReceipt(
    recipientPubkey: string,
    eventId: string,
    amount: number,
    _comment: string,
    zapRequest: any
  ): any {
    // Create a mock invoice for the zap receipt
    const mockInvoice = `lnbc${amount}u1p0...`; // Simplified mock invoice
    
    return {
      kind: 9735,
      content: '',
      tags: [
        ['p', recipientPubkey],
        ['e', eventId],
        ['bolt11', mockInvoice],
        ['description', JSON.stringify(zapRequest)]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Sign event with private key
   */
  private signEvent(event: any, privateKey: Buffer): any {
    // Convert Buffer to Uint8Array for finalizeEvent
    const privateKeyUint8 = new Uint8Array(privateKey);
    return finalizeEvent(event, privateKeyUint8);
  }

  /**
   * Publish event to relays
   */
  private async publishToRelays(event: any): Promise<string[]> {
    const publishedRelays: string[] = [];
    
    try {
      const publishPromises = this.relays.map(async (relay) => {
        try {
          await this.pool.publish([relay], event);
          publishedRelays.push(relay);
          this.logger.debug(`Published to relay: ${relay}`);
        } catch (error) {
          this.logger.warn(`Failed to publish to relay ${relay}:`, error);
        }
      });

      await Promise.allSettled(publishPromises);
      
      return publishedRelays;
    } catch (error) {
      this.logger.error('Error publishing to relays:', error);
      throw error;
    }
  }

  /**
   * Get public key from private key
   */
  private getPublicKeyFromPrivate(privateKey: Buffer): string {
    // This is a simplified implementation
    // In a real implementation, you'd use proper secp256k1 operations
    const hash = crypto.createHash('sha256').update(privateKey).digest();
    return Buffer.from(hash).toString('hex');
  }

  /**
   * Test relay connectivity
   */
  async testRelayConnectivity(): Promise<{
    connected: string[];
    failed: string[];
    totalRelays: number;
  }> {
    const connected: string[] = [];
    const failed: string[] = [];

    for (const relay of this.relays) {
      try {
        // Try to connect to relay
        const testEvent = {
          kind: 1,
          content: 'test',
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
          pubkey: 'test',
          id: 'test',
          sig: 'test'
        } as any;
        
        await this.pool.publish([relay], testEvent);
        connected.push(relay);
      } catch (error) {
        failed.push(relay);
        this.logger.warn(`Relay ${relay} failed connectivity test:`, error);
      }
    }

    return {
      connected,
      failed,
      totalRelays: this.relays.length
    };
  }

  /**
   * Close pool connections
   */
  close(): void {
    try {
      this.pool.close(this.relays);
      this.logger.info('Nostr pool connections closed');
    } catch (error) {
      this.logger.warn('Error closing Nostr pool:', error);
    }
  }
}
