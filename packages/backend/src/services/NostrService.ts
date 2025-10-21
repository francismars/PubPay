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
      this.logger.info(`⚡ Creating zap request:`, {
        eventId,
        amount,
        comment,
        timestamp: new Date().toISOString()
      });
      
      // Generate anonymous key pair
      this.logger.info('🔑 Generating anonymous key pair...');
      const privateKey = crypto.randomBytes(32);
      const publicKey = this.getPublicKeyFromPrivate(privateKey);
      this.logger.info('✅ Anonymous key pair generated:', {
        publicKey: publicKey.substring(0, 16) + '...'
      });
      
      // Decode event ID if it's encoded (note1... or nevent1...)
      this.logger.info('🔍 Decoding event ID...');
      const rawEventId = this.decodeEventId(eventId);
      this.logger.info('✅ Event ID decoded:', {
        original: eventId,
        decoded: rawEventId
      });
      
      // Get recipient public key from event
      this.logger.info('🔍 Getting recipient public key from event...');
      const recipientPubkey = await this.getRecipientPubkey(rawEventId);
      if (!recipientPubkey) {
        this.logger.error('❌ Could not determine recipient public key');
        throw new Error('Could not determine recipient public key');
      }
      this.logger.info('✅ Recipient public key found:', {
        pubkey: recipientPubkey.substring(0, 16) + '...'
      });

      // Get recipient's Lightning address from profile
      this.logger.info('🔍 Getting recipient Lightning address...');
      const lightningAddress = await this.getLightningAddress(recipientPubkey);
      if (!lightningAddress) {
        this.logger.error('❌ No Lightning address found in recipient profile');
        throw new Error('Recipient has no Lightning address configured');
      }
      this.logger.info('✅ Lightning address found:', lightningAddress);

      // Get LNURL callback URL
      this.logger.info('🔍 Getting LNURL callback URL...');
      const lnurlCallback = await this.getLNURLCallback(lightningAddress);
      this.logger.info('✅ LNURL callback URL:', lnurlCallback);

      // Create zap request (kind 9734)
      this.logger.info('🔄 Creating zap request (kind 9734)...');
      const zapRequest = this.createZapRequest(recipientPubkey, rawEventId, amount, comment, publicKey);
      this.logger.info('✅ Zap request created:', {
        kind: zapRequest.kind,
        content: zapRequest.content,
        tagsCount: zapRequest.tags.length
      });
      
      // Sign the zap request
      this.logger.info('🔐 Signing zap request...');
      const signedEvent = this.signEvent(zapRequest, privateKey);
      this.logger.info('✅ Zap request signed:', {
        eventId: signedEvent.id,
        signature: signedEvent.sig.substring(0, 16) + '...'
      });
      
      // Send zap request to LNURL callback (NOT publish to relays)
      this.logger.info('📡 Sending zap request to LNURL callback...');
      const zapResult = await this.sendZapRequestToCallback(signedEvent, lnurlCallback, amount);
      
      this.logger.info(`✅ Zap request sent successfully:`, {
        amount,
        eventId: signedEvent.id,
        callbackUrl: lnurlCallback,
        result: zapResult
      });
      
      return {
        success: true,
        eventId: signedEvent.id,
        relays: [lnurlCallback] // LNURL callback instead of Nostr relays
      };
    } catch (error) {
      this.logger.error('💥 Error sending anonymous zap:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventId,
        amount,
        comment,
        stack: error instanceof Error ? error.stack : undefined
      });
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
    this.logger.info('🔍 Decoding event ID:', eventId);
    
    if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
      try {
        const decoded = nip19.decode(eventId);
        this.logger.info('✅ Event ID decoded successfully:', decoded);
        
        if (eventId.startsWith('note1')) {
          // note1... decodes to raw hex event ID
          const rawId = decoded.data as string;
          this.logger.info('📝 note1 decoded to:', rawId);
          return rawId;
        } else if (eventId.startsWith('nevent1')) {
          // nevent1... decodes to object with id field
          const rawId = (decoded.data as any).id;
          this.logger.info('📝 nevent1 decoded to:', rawId);
          return rawId;
        }
      } catch (error) {
        this.logger.warn('❌ Failed to decode event ID, using as-is:', eventId, error);
      }
    }
    
    this.logger.info('📝 Using event ID as-is:', eventId);
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
    amount: number,
    comment: string,
    _senderPubkey: string
  ): any {
    // Validate all parameters before calling makeZapRequest
    this.logger.info('🔍 Validating zap request parameters:', {
      recipientPubkey: recipientPubkey ? `${recipientPubkey.substring(0, 16)}...` : 'UNDEFINED',
      eventId: eventId ? `${eventId.substring(0, 16)}...` : 'UNDEFINED',
      amount: amount,
      comment: comment,
      relays: this.relays ? this.relays.length : 'UNDEFINED'
    });

    // Check for undefined values
    if (!recipientPubkey) {
      throw new Error('recipientPubkey is undefined');
    }
    if (!eventId) {
      throw new Error('eventId is undefined');
    }
    if (!amount || amount <= 0) {
      throw new Error(`Invalid amount: ${amount}`);
    }
    if (!this.relays || this.relays.length === 0) {
      throw new Error('No relays configured');
    }

    // Create zap request manually instead of using makeZapRequest
    // This avoids the nostr-tools makeZapRequest bug
    this.logger.info('🔍 Creating zap request manually (avoiding makeZapRequest bug)');
    
    const zapRequest = {
      kind: 9734,
      content: String(comment || ''),
      tags: [
        ['p', recipientPubkey],
        ['e', eventId],
        ['relays', ...this.relays]
      ],
      created_at: Math.floor(Date.now() / 1000)
    };
    
    this.logger.info('✅ Zap request created manually:', {
      kind: zapRequest.kind,
      content: zapRequest.content,
      tagsCount: zapRequest.tags.length,
      tags: zapRequest.tags
    });
    
    return zapRequest;
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
   * Get Lightning address from profile
   */
  private async getLightningAddress(pubkey: string): Promise<string | null> {
    try {
      const profile = await this.pool.get(this.relays, {
        kinds: [0],
        authors: [pubkey]
      });

      if (!profile || !profile.content) {
        return null;
      }

      const profileData = JSON.parse(profile.content);
      return profileData.lud16 || profileData.lud06 || null;
    } catch (error) {
      this.logger.error('Error getting Lightning address:', error);
      return null;
    }
  }

  /**
   * Get LNURL callback URL from Lightning address
   */
  private async getLNURLCallback(lightningAddress: string): Promise<string> {
    const ludSplit = lightningAddress.split('@');
    if (ludSplit.length !== 2) {
      throw new Error(`Invalid Lightning address format: ${lightningAddress}`);
    }

    const lnurlDiscoveryUrl = `https://${ludSplit[1]}/.well-known/lnurlp/${ludSplit[0]}`;
    
    const response = await fetch(lnurlDiscoveryUrl);
    if (!response.ok) {
      throw new Error(`LNURL discovery failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.callback) {
      throw new Error('No callback URL found in LNURL discovery');
    }

    return data.callback;
  }

  /**
   * Send zap request to LNURL callback and pay the invoice
   */
  private async sendZapRequestToCallback(zapRequest: any, callbackUrl: string, amount: number): Promise<any> {
    const zapRequestUrl = `${callbackUrl}?nostr=${encodeURIComponent(JSON.stringify(zapRequest))}&amount=${amount}`;
    
    this.logger.info('📡 Sending zap request to LNURL callback:', {
      url: zapRequestUrl,
      amount: amount
    });
    
    const response = await fetch(zapRequestUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LNURL callback error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    if (!responseData.pr) {
      throw new Error(`LNURL callback error: ${responseData.reason || 'No invoice returned'}`);
    }

    this.logger.info('✅ Received Lightning invoice from LNURL callback:', {
      invoice: responseData.pr.substring(0, 50) + '...',
      amount: amount
    });

    // Pay the invoice using LNBits API (this is the missing step!)
    this.logger.info('💳 Paying Lightning invoice using LNBits...');
    
    const lnbitsConfig = {
      baseUrl: process.env['LNBITS_URL'] || 'https://legend.lnbits.com',
      apiKey: process.env['LNBITS_API_KEY']
    };

    if (!lnbitsConfig.apiKey) {
      throw new Error('LNBITS_API_KEY not configured - cannot pay invoice');
    }

    const paymentResponse = await fetch(`${lnbitsConfig.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'X-Api-Key': lnbitsConfig.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        out: true,
        bolt11: responseData.pr
      })
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      throw new Error(`Failed to pay invoice: ${errorData.detail || 'Unknown error'}`);
    }

    const paymentData = await paymentResponse.json();
    this.logger.info('✅ Lightning invoice paid successfully!', {
      paymentId: paymentData.payment_hash,
      amount: amount,
      status: paymentData.status
    });

    this.logger.info('🎉 Zap flow completed - recipient will publish zap receipt (kind 9735)');

    return {
      invoice: responseData.pr,
      paymentData: paymentData,
      success: true
    };
  }

  /**
   * Get public key from private key
   */
  private getPublicKeyFromPrivate(privateKey: Buffer): string {
    // Use proper secp256k1 key generation from nostr-tools
    const { getPublicKey } = require('nostr-tools');
    
    // Convert Buffer to hex string
    const privateKeyHex = privateKey.toString('hex');
    
    // Generate public key using nostr-tools
    const publicKey = getPublicKey(privateKeyHex);
    
    this.logger.info('🔑 Generated public key:', {
      privateKeyLength: privateKey.length,
      publicKey: publicKey.substring(0, 16) + '...'
    });
    
    return publicKey;
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
