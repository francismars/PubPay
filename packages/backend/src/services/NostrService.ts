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
    // Use a comprehensive list of reliable relays for better profile discovery
    this.relays = [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://nos.lol',
      'wss://relay.snort.social',
      'wss://relay.nostr.band',
      'wss://nostr.mom',
      'wss://nostr.bitcoiner.social',
      'wss://relay.nostr.bg'
    ];
    this.logger = new Logger('NostrService');

    this.logger.info('NostrService initialized with relays:', this.relays);
  }

  /**
   * Send anonymous zap to Nostr relays
   */
  async sendAnonymousZap(
    eventId: string,
    amount: number,
    comment: string
  ): Promise<ZapResult> {
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
      const decodedResult = this.decodeEventId(eventId);
      const rawEventId = decodedResult.eventId;
      const authorFromNevent = decodedResult.author;
      const relaysFromNevent = decodedResult.relays || [];
      this.logger.info('✅ Event ID decoded:', {
        original: eventId,
        decoded: rawEventId,
        authorFromNevent: authorFromNevent ? authorFromNevent.substring(0, 16) + '...' : 'none',
        relaysFromNevent: relaysFromNevent.length > 0 ? relaysFromNevent : 'none'
      });

      // Get recipient public key from event
      // Use author from nevent1 if available, otherwise query relays
      this.logger.info('🔍 Getting recipient public key from event...');
      const recipientPubkey = authorFromNevent || await this.getRecipientPubkey(rawEventId);
      if (!recipientPubkey) {
        this.logger.error('❌ Could not determine recipient public key');
        throw new Error('Could not determine recipient public key');
      }
      this.logger.info('✅ Recipient public key found:', {
        pubkey: recipientPubkey.substring(0, 16) + '...'
      });

      // Get recipient's Lightning address from profile
      // Try nevent1 relays FIRST (where event was published) - profile more likely to be there
      // If that fails, fall back to default relays
      let lightningAddress: string | null = null;
      
      if (relaysFromNevent.length > 0) {
        this.logger.info('🔍 Trying nevent1 relays first for profile lookup', {
          neventRelays: relaysFromNevent,
          pubkey: recipientPubkey.substring(0, 16) + '...'
        });
        lightningAddress = await this.getLightningAddress(recipientPubkey, relaysFromNevent);
        
        if (!lightningAddress) {
          this.logger.info('⚠️ Profile not found on nevent1 relays, trying default relays', {
            defaultRelays: this.relays
          });
          lightningAddress = await this.getLightningAddress(recipientPubkey, this.relays);
        } else {
          this.logger.info('✅ Profile found on nevent1 relays');
        }
      } else {
        this.logger.info('🔍 No nevent1 relays, using default relays for profile lookup', {
          defaultRelays: this.relays
        });
        lightningAddress = await this.getLightningAddress(recipientPubkey, this.relays);
      }
      if (!lightningAddress) {
        const relaysQueried = relaysFromNevent.length > 0 
          ? [...relaysFromNevent, ...this.relays] 
          : this.relays;
        this.logger.error('❌ No Lightning address found in recipient profile', {
          pubkey: recipientPubkey.substring(0, 16) + '...',
          relaysQueried: relaysQueried
        });
        throw new Error('Recipient has no Lightning address configured');
      }
      this.logger.info('✅ Lightning address found:', lightningAddress);

      // Get LNURL callback URL
      this.logger.info('🔍 Getting LNURL callback URL...');
      const lnurlCallback = await this.getLNURLCallback(lightningAddress);
      this.logger.info('✅ LNURL callback URL:', lnurlCallback);

      // Create zap request (kind 9734)
      this.logger.info('🔄 Creating zap request (kind 9734)...');
      const zapRequest = this.createZapRequest(
        recipientPubkey,
        rawEventId,
        amount,
        comment,
        publicKey
      );
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
      const zapResult = await this.sendZapRequestToCallback(
        signedEvent,
        lnurlCallback,
        amount
      );

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
   * Returns the event ID, author, and relays (if available from nevent1)
   */
  private decodeEventId(eventId: string): { 
    eventId: string; 
    author?: string; 
    relays?: string[] 
  } {
    this.logger.info('🔍 Decoding event ID:', eventId);

    if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
      try {
        const decoded = nip19.decode(eventId);
        this.logger.info('✅ Event ID decoded successfully:', decoded);

        if (eventId.startsWith('note1')) {
          // note1... decodes to raw hex event ID
          const rawId = decoded.data as string;
          this.logger.info('📝 note1 decoded to:', rawId);
          return { eventId: rawId };
        } else if (eventId.startsWith('nevent1')) {
          // nevent1... decodes to object with id, author, and relays fields
          const neventData = decoded.data as any;
          const rawId = neventData.id;
          const author = neventData.author;
          // Normalize relays: remove trailing slashes and ensure wss:// prefix
          const rawRelays = neventData.relays || [];
          const relays = rawRelays
            .map((r: string) => {
              let normalized = r.trim();
              // Remove trailing slash
              if (normalized.endsWith('/')) {
                normalized = normalized.slice(0, -1);
              }
              // Ensure it starts with wss:// or ws://
              if (!normalized.startsWith('wss://') && !normalized.startsWith('ws://')) {
                normalized = `wss://${normalized}`;
              }
              return normalized;
            })
            .filter((r: string) => r.length > 0);
          this.logger.info('📝 nevent1 decoded to:', {
            id: rawId,
            author: author ? author.substring(0, 16) + '...' : 'none',
            relays: relays.length > 0 ? relays : 'none'
          });
          return { eventId: rawId, author, relays };
        }
      } catch (error) {
        this.logger.warn(
          `❌ Failed to decode event ID, using as-is: ${eventId} - ${error}`
        );
      }
    }

    this.logger.info('📝 Using event ID as-is:', eventId);
    return { eventId };
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
      recipientPubkey: recipientPubkey
        ? `${recipientPubkey.substring(0, 16)}...`
        : 'UNDEFINED',
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
    this.logger.info(
      '🔍 Creating zap request manually (avoiding makeZapRequest bug)'
    );

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
  private async getLightningAddress(
    pubkey: string, 
    relays?: string[]
  ): Promise<string | null> {
    const relaysToUse = relays || this.relays;
    this.logger.info('🔍 Fetching profile from relays:', {
      pubkey: pubkey.substring(0, 16) + '...',
      relays: relaysToUse,
      relayCount: relaysToUse.length
    });

    try {
      // Use subscription-based approach to ensure we wait for relay responses
      // pool.get() might return null too quickly if connections fail silently
ubuntu@pubpay:~/pubpay/packages/backend$ node -e "
const { SimplePool } = require('nostr-tools');
const pool = new SimplePool();
console.log('Testing nevent1 relays from production...');
pool.get(['wss://no.str.cr', 'wss://nos.lol'], {
  kinds: [0],
  authors: ['5d3ab876c206a37ad3b094e20bfc3941df3fa21a15ac8ea76d6918473789669a']
}).then(profile => {
  console.log('Result:', profile ? 'Profile found!' : 'Profile not found');
  if (profile && profile.content) {
    try {
      const data = JSON.parse(profile.content);
      console.log('Lightning address:', data.lud16 || data.lud06 || 'none');
    } catch(e) {}
  }
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
"
Testing nevent1 relays from production...
Result: Profile not found
      const startTime = Date.now();

      let profile: any = null;
      let fetchError: Error | null = null;

      try {
        // Use subscription with oneose to ensure we wait for relay responses
        const logger = this.logger; // Capture logger for use in callbacks
        this.logger.info('🔄 Starting subscription-based profile fetch', {
          pubkey: pubkey.substring(0, 16) + '...',
          relayCount: relaysToUse.length
        });
        const profilePromise = new Promise<any>((resolve, reject) => {
          let resolved = false;
          const events: any[] = [];
          const subscriptionStartTime = Date.now();

          logger.info('📡 Creating subscription to relays', {
            pubkey: pubkey.substring(0, 16) + '...',
            relayCount: relaysToUse.length,
            relayList: relaysToUse
          });
          
          // Track connection status per relay
          const relayStatus: Record<string, { connected: boolean; eventsReceived: number; errors: string[] }> = {};
          relaysToUse.forEach(relay => {
            relayStatus[relay] = { connected: false, eventsReceived: 0, errors: [] };
          });
          
          const sub = this.pool.subscribe(relaysToUse, {
            kinds: [0],
            authors: [pubkey]
          }, {
            onevent(event: any) {
              const relayUrl = (event as any)?._relay || 'unknown';
              if (relayStatus[relayUrl]) {
                relayStatus[relayUrl].eventsReceived++;
                relayStatus[relayUrl].connected = true;
              }
              logger.info('📥 Profile event received', {
                pubkey: pubkey.substring(0, 16) + '...',
                eventPubkey: event?.pubkey?.substring(0, 16) + '...',
                relay: relayUrl,
                totalEvents: events.length + 1
              });
              // Collect events and take the first matching profile event
              if (event && event.pubkey === pubkey) {
                events.push(event);
                // Take the first (and should be only) profile event
                if (!resolved) {
                  resolved = true;
                  sub.close();
                  resolve(event);
                }
              }
            },
            oneose() {
              const timeSinceStart = Date.now() - subscriptionStartTime;
              logger.info('✅ Profile subscription EOSE (end of stream)', {
                pubkey: pubkey.substring(0, 16) + '...',
                eventsFound: events.length,
                relaysQueried: relaysToUse.length,
                timeSinceStart: `${timeSinceStart}ms`,
                relayList: relaysToUse,
                relayStatus: relayStatus
              });
              // End of stream - check if we got any events
              // If EOSE came very quickly (< 100ms), wait longer as relays might still be connecting
              const minWaitTime = timeSinceStart < 100 ? 2000 : 500;
              logger.info('⏳ Waiting additional time after EOSE', {
                minWaitTime: `${minWaitTime}ms`,
                reason: timeSinceStart < 100 ? 'EOSE came too quickly, waiting for relay responses' : 'Normal wait'
              });
              if (!resolved) {
                setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    sub.close();
                    logger.info('🏁 Finalizing profile fetch after EOSE wait', {
                      eventsFound: events.length,
                      totalTime: `${Date.now() - subscriptionStartTime}ms`
                    });
                    // Return the most recent event if any, otherwise null
                    resolve(events.length > 0 ? events[0] : null);
                  }
                }, minWaitTime);
              }
            },
            onclose() {
              logger.info('🔌 Profile subscription closed', {
                pubkey: pubkey.substring(0, 16) + '...',
                eventsFound: events.length,
                resolved,
                relayStatus: relayStatus
              });
              // Only resolve if we haven't already and we have events
              // Don't resolve with null on close - wait for oneose() instead
              if (!resolved && events.length > 0) {
                resolved = true;
                resolve(events[0]);
              }
            }
          });

          // Add timeout
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              sub.close();
              reject(new Error('Profile fetch timeout after 15 seconds'));
            }
          }, 15000);
        });

        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Profile fetch timeout after 15 seconds')), 15000)
        );

        profile = await Promise.race([
          profilePromise,
          timeoutPromise
        ]) as any;
      } catch (error) {
        fetchError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn('⚠️ Profile fetch error:', {
          error: fetchError.message,
          errorStack: fetchError.stack,
          pubkey: pubkey.substring(0, 16) + '...',
          relays: relaysToUse
        });
      }

      const fetchDuration = Date.now() - startTime;

      this.logger.info('⏱️ Profile fetch completed', {
        duration: `${fetchDuration}ms`,
        found: !!profile,
        error: fetchError ? fetchError.message : null
      });

      if (!profile) {
        this.logger.warn('❌ Profile not found on relays via subscription', {
          pubkey: pubkey.substring(0, 16) + '...',
          relays: relaysToUse,
          duration: `${Date.now() - startTime}ms`
        });

        // Fallback: Try using pool.get() as a last resort
        // Sometimes pool.get() works when subscription doesn't
        this.logger.info('🔄 Attempting fallback: pool.get()', {
          pubkey: pubkey.substring(0, 16) + '...'
        });
        try {
          const fallbackProfile = await this.pool.get(relaysToUse, {
            kinds: [0],
            authors: [pubkey]
          });
          if (fallbackProfile) {
            this.logger.info('✅ Profile found via fallback pool.get()', {
              pubkey: pubkey.substring(0, 16) + '...'
            });
            // Update profile variable so it gets processed below
            profile = fallbackProfile as any;
          } else {
            this.logger.warn('⚠️ Fallback pool.get() returned null');
          }
        } catch (fallbackError) {
          this.logger.warn('⚠️ Fallback pool.get() also failed', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }

        // If fallback didn't find profile, return null
        if (!profile) {
          return null;
        }
      }

      if (!profile.content) {
        this.logger.warn('❌ Profile has no content', {
          pubkey: pubkey.substring(0, 16) + '...',
          profileId: profile.id
        });
        return null;
      }

      this.logger.info('✅ Profile found, parsing content...', {
        pubkey: pubkey.substring(0, 16) + '...',
        contentLength: profile.content.length
      });

      let profileData;
      try {
        profileData = JSON.parse(profile.content);
      } catch (parseError) {
        this.logger.error('❌ Failed to parse profile JSON:', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          contentPreview: profile.content.substring(0, 100)
        });
        return null;
      }

      const lightningAddress = profileData.lud16 || profileData.lud06 || null;
      if (lightningAddress) {
        this.logger.info('✅ Lightning address found in profile:', {
          address: lightningAddress,
          type: profileData.lud16 ? 'lud16' : 'lud06'
        });
      } else {
        this.logger.warn('❌ No Lightning address (lud16/lud06) in profile', {
          pubkey: pubkey.substring(0, 16) + '...',
          profileKeys: Object.keys(profileData)
        });
      }

      return lightningAddress;
    } catch (error) {
      this.logger.error('❌ Error getting Lightning address:', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        pubkey: pubkey.substring(0, 16) + '...',
        relays: relaysToUse
      });
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

    const data = (await response.json()) as {
      callback?: string;
      reason?: string;
    };
    if (!data.callback) {
      throw new Error('No callback URL found in LNURL discovery');
    }

    return data.callback;
  }

  /**
   * Send zap request to LNURL callback and pay the invoice
   */
  private async sendZapRequestToCallback(
    zapRequest: any,
    callbackUrl: string,
    amount: number
  ): Promise<any> {
    const zapRequestUrl = `${callbackUrl}?nostr=${encodeURIComponent(JSON.stringify(zapRequest))}&amount=${amount}`;

    this.logger.info('📡 Sending zap request to LNURL callback:', {
      url: zapRequestUrl,
      amount: amount
    });

    const response = await fetch(zapRequestUrl);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LNURL callback error: ${response.status} - ${errorText}`
      );
    }

    const responseData = (await response.json()) as {
      pr?: string;
      reason?: string;
    };
    if (!responseData.pr) {
      throw new Error(
        `LNURL callback error: ${responseData.reason || 'No invoice returned'}`
      );
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

    const paymentResponse = await fetch(
      `${lnbitsConfig.baseUrl}/api/v1/payments`,
      {
        method: 'POST',
        headers: {
          'X-Api-Key': lnbitsConfig.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          out: true,
          bolt11: responseData.pr
        })
      }
    );

    if (!paymentResponse.ok) {
      const errorData = (await paymentResponse.json()) as { detail?: string };
      throw new Error(
        `Failed to pay invoice: ${errorData.detail || 'Unknown error'}`
      );
    }

    const paymentData = (await paymentResponse.json()) as {
      payment_hash?: string;
      status?: string;
    };
    this.logger.info('✅ Lightning invoice paid successfully!', {
      paymentId: paymentData.payment_hash,
      amount: amount,
      status: paymentData.status
    });

    this.logger.info(
      '🎉 Zap flow completed - recipient will publish zap receipt (kind 9735)'
    );

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
