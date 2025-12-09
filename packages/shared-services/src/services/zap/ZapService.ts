// import { NostrEvent } from '@/types/nostr'; // Unused import
import { nip57, nip19, getEventHash, generateSecretKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from '../../utils/constants';
import { AuthService } from '../AuthService';

export interface ZapCallback {
  callbackToZap: string;
  lud16ToZap: string;
}

export interface ZapEventData {
  zapEvent: unknown;
  amountPay: number;
}

export class ZapService {
  private baseUrl: string;
  // In-memory cache for lightning address validation (only during processing, not persistent)
  private static lightningValidationCache = new Map<string, { valid: boolean; timestamp: number }>();
  private static readonly VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Validate if a lightning address supports Nostr zaps
   * Returns true if valid, false if invalid, null if validation is pending
   */
  static async validateLightningAddress(lud16: string): Promise<boolean> {
    if (!lud16 || typeof lud16 !== 'string') {
      return false;
    }

    // Check in-memory cache first (only for current session)
    const cached = this.lightningValidationCache.get(lud16);
    if (cached && Date.now() - cached.timestamp < this.VALIDATION_CACHE_TTL) {
      return cached.valid;
    }

    // Basic format check
    const ludSplit = lud16.split('@');
    if (ludSplit.length !== 2) {
      this.lightningValidationCache.set(lud16, { valid: false, timestamp: Date.now() });
      return false;
    }

    try {
      // Check if we're already validating this address (prevent duplicate calls)
      const validationKey = `validating:${lud16}`;
      if (this.lightningValidationCache.has(validationKey)) {
        // Wait a bit for the ongoing validation
        await new Promise(resolve => setTimeout(resolve, 100));
        const cached = this.lightningValidationCache.get(lud16);
        if (cached) {
          return cached.valid;
        }
        // If still not cached, proceed with validation
      }

      // Mark as validating to prevent duplicate calls
      this.lightningValidationCache.set(validationKey, { valid: false, timestamp: Date.now() });

      const url = `https://${ludSplit[1]}/.well-known/lnurlp/${ludSplit[0]}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        clearTimeout(timeoutId);
        this.lightningValidationCache.delete(validationKey);

        if (!response.ok) {
          this.lightningValidationCache.set(lud16, { valid: false, timestamp: Date.now() });
          return false;
        }

        const lnurlinfo = await response.json();
        const isValid = lnurlinfo.allowsNostr === true;

        this.lightningValidationCache.set(lud16, { valid: isValid, timestamp: Date.now() });
        return isValid;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        this.lightningValidationCache.delete(validationKey);

        // Network errors, timeouts, or CORS errors - treat as invalid silently
        // CORS errors are common when servers don't allow cross-origin requests
        // Don't log these as they're expected behavior for many lightning servers
        this.lightningValidationCache.set(lud16, { valid: false, timestamp: Date.now() });
        return false;
      }
    } catch (error) {
      // Handle any other errors silently (including CORS)
      // CORS errors are expected when servers don't allow cross-origin requests
      this.lightningValidationCache.set(lud16, { valid: false, timestamp: Date.now() });
      return false;
    }
  }

  /**
   * Clear validation cache (useful for testing or manual refresh)
   */
  static clearValidationCache(): void {
    this.lightningValidationCache.clear();
  }

  /**
   * Get Lightning callback URL from author's LUD16 address
   * @param eventData - Optional event data (null for profile zaps)
   * @param authorData - Author/profile data containing lud16
   */
  async getInvoiceCallBack(
    eventData: unknown | null, // Allow null for profile zaps
    authorData: unknown
  ): Promise<ZapCallback | null> {
    try {
      console.log('getInvoiceCallBack called with:', { eventData, authorData });

      // Check for zap-lnurl tag first (if eventData exists), then fall back to author's lud16
      let zapLNURL = null;
      if (eventData) {
        zapLNURL = (eventData as any).tags?.find(
          (tag: any) => tag[0] === 'zap-lnurl'
        );
      }
      
      let eventCreatorProfileContent: any = {};
      try {
        eventCreatorProfileContent = JSON.parse(
          (authorData as any)?.content || '{}'
        );
      } catch {
        eventCreatorProfileContent = {};
      }

      const lud16 =
        zapLNURL && zapLNURL.length > 0
          ? zapLNURL[1]
          : eventCreatorProfileContent.lud16 || eventCreatorProfileContent.lud06;

      if (!lud16) {
        console.error('No LUD16 address found for author');
        return null;
      }

      const ludSplit = lud16.split('@');
      if (ludSplit.length !== 2) {
        console.error('Invalid lud16 format');
        return null;
      }

      let errorResponse = null;
      let response: Response | undefined;

      try {
        response = await fetch(
          `https://${ludSplit[1]}/.well-known/lnurlp/${ludSplit[0]}`
        );
      } catch {
        errorResponse = 'CAN\'T PAY: Failed to fetch lud16';
      }

      if (!response || response === undefined) {
        errorResponse = 'CAN\'T PAY: Failed to fetch lud16';
      }

      if (errorResponse) {
        console.error(errorResponse);
        throw new Error(errorResponse);
      }

      const lnurlinfo = await response!.json();
      if (!(lnurlinfo.allowsNostr === true)) {
        errorResponse = 'CAN\'T PAY: No nostr support';
      }

      if (errorResponse) {
        console.error(errorResponse);
        throw new Error(errorResponse);
      }

      return {
        callbackToZap: lnurlinfo.callback,
        lud16ToZap: lud16
      };
    } catch (error) {
      // Re-throw errors that we explicitly threw (they have our error messages)
      if (error instanceof Error && error.message.startsWith('CAN\'T PAY:')) {
        throw error;
      }
      // For unexpected errors, wrap and throw
      console.error('Error getting invoice callback:', error);
      throw new Error('CAN\'T PAY: Failed to fetch lud16');
    }
  }

  /**
   * Create a zap event
   */
  async createZapEvent(
    eventData: unknown,
    rangeValue: number,
    lud16: string,
    pubKey: string | null = null,
    comment: string = ''
  ): Promise<ZapEventData | null> {
    try {
      // Find zap-min tag for minimum amount
      const zapMintag = (eventData as any).tags.find(
        (tag: any) => tag[0] === 'zap-min'
      );
      const zapTagAmount = zapMintag ? zapMintag[1] : 1000;
      const amountPay =
        rangeValue !== -1
          ? parseInt(rangeValue.toString()) * 1000
          : Math.floor(parseInt(zapTagAmount));

      // Create zap request using nip57.makeZapRequest
      const zapEvent = await nip57.makeZapRequest({
        event: eventData as any,
        pubkey: (eventData as any).pubkey,
        amount: amountPay,
        comment,
        relays: RELAYS
      });

      console.log('Created zap event:', zapEvent);

      // Add additional tags
      zapEvent.tags.push(['zap-lnurl', lud16]);
      zapEvent.tags.push(['t', 'pubpay']);

      if (pubKey !== null) {
        (zapEvent as any).pubkey = pubKey;
        const eventID = getEventHash(zapEvent as any);
        if (eventID !== null) (zapEvent as any).id = eventID;
      }

      return {
        zapEvent,
        amountPay
      };
    } catch (error) {
      console.error('Error creating zap event:', error);
      return null;
    }
  }

  /**
   * Create a zap request event for a profile (without an event)
   * Following NIP-57: profile zaps don't include an 'e' tag
   * @param recipientPubkey - Hex-encoded pubkey of the recipient
   * @param amount - Amount in sats (will be converted to millisats)
   * @param lud16 - Lightning address of the recipient
   * @param pubKey - Optional sender pubkey (for non-anonymous zaps)
   * @param comment - Optional comment/message
   * @returns ZapEventData with the zap request event and amount in millisats
   */
  async createProfileZapEvent(
    recipientPubkey: string,
    amount: number, // in sats
    lud16: string,
    pubKey: string | null = null,
    comment: string = ''
  ): Promise<ZapEventData | null> {
    try {
      const amountPay = amount * 1000; // Convert to millisats

      // Create zap request manually (following NIP-57 Appendix B)
      // For profile zaps, we don't use nip57.makeZapRequest since it requires an event
      const zapRequest = {
        kind: 9734,
        content: comment || '',
        tags: [
          ['relays', ...RELAYS],
          ['amount', amountPay.toString()],
          ['lnurl', lud16], // Optional but recommended per NIP-57
          ['p', recipientPubkey]
          // NO 'e' tag - this makes it a profile zap
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
        id: '',
        sig: ''
      };

      // Add additional tags
      zapRequest.tags.push(['zap-lnurl', lud16]);
      zapRequest.tags.push(['t', 'pubpay']);

      if (pubKey !== null) {
        zapRequest.pubkey = pubKey;
        const eventID = getEventHash(zapRequest as any);
        if (eventID !== null) zapRequest.id = eventID;
      }

      console.log('Created profile zap request:', zapRequest);

      return {
        zapEvent: zapRequest,
        amountPay
      };
    } catch (error) {
      console.error('Error creating profile zap event:', error);
      return null;
    }
  }

  /**
   * Sign and send zap event
   */
  async signZapEvent(
    zapEvent: unknown,
    callbackToZap: string,
    amountPay: number,
    lud16ToZap: string,
    eventoToZapID: string,
    anonymousZap: boolean = false,
    decryptedPrivateKey?: string | null // Optional: decrypted private key from auth state
  ): Promise<boolean> {
    try {
      // Check for authentication state using AuthService
      const { publicKey, encryptedPrivateKey, method: signInMethod } = AuthService.getStoredAuthData();

      console.log('Sign in method:', signInMethod);
      console.log('Public key:', publicKey);
      console.log('Has encrypted private key:', !!encryptedPrivateKey);
      console.log('Has decrypted private key from auth state:', !!decryptedPrivateKey);

      // Use decrypted private key from auth state if provided (for password-encrypted keys)
      let privateKey: string | null = decryptedPrivateKey || null;

      // If not provided, try to decrypt from storage
      if (!privateKey && encryptedPrivateKey && signInMethod === 'nsec') {
        try {
          // Check if password is required
          if (AuthService.requiresPassword()) {
            console.error('Password required to decrypt private key for zap');
            throw new Error('Your private key is password-protected. Please log in again and enter your password to sign zaps.');
          }
          // Try to decrypt with device key (automatic, no password needed)
          privateKey = await AuthService.decryptStoredPrivateKey();
          // Validate that decrypted key is a string and looks like nsec
          if (!privateKey || typeof privateKey !== 'string' || !privateKey.startsWith('nsec')) {
            console.error('Invalid decrypted private key format:', typeof privateKey);
            throw new Error('Unable to decrypt your private key. The format appears invalid. Please log in again.');
          }
        } catch (error) {
          console.error('Failed to decrypt private key for zap:', error);
          // Re-throw with clearer message if it's our custom error, otherwise wrap it
          if (error instanceof Error && !error.message.includes('password') && !error.message.includes('decrypt')) {
            throw new Error(`Unable to sign zap: ${error.message}`);
          }
          throw error;
        }
      } else if (!privateKey) {
        // Check for legacy plaintext format (for backward compatibility)
        const legacyKey = localStorage.getItem('privateKey') || sessionStorage.getItem('privateKey');
        if (legacyKey && !legacyKey.startsWith('{') && !legacyKey.startsWith('[')) {
          privateKey = legacyKey;
        }
      }

      console.log('Has private key:', !!privateKey);
      let zapFinalized;

      if (anonymousZap === true) {
        console.log('Using anonymous zap signing');
        const privateKey = generateSecretKey();
        zapFinalized = finalizeEvent(zapEvent as any, privateKey);
      } else if (signInMethod === 'externalSigner') {
        console.log('Using external signer');
        const eventString = JSON.stringify(zapEvent);
        sessionStorage.setItem(
          'SignZapEvent',
          JSON.stringify({
            callback: callbackToZap,
            amount: amountPay,
            lud16: lud16ToZap,
            event: zapEvent,
            id: eventoToZapID
          })
        );
        window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
        return true;
      } else if (signInMethod === 'extension') {
        console.log('Using extension signing');
        if ((window as any).nostr !== null) {
          zapFinalized = await (window as any).nostr.signEvent(zapEvent);
        }
      } else if (signInMethod === 'nsec') {
        console.log('Using nsec signing');
        if (!privateKey) {
          console.error('No private key found. Please sign in first.');
          return false;
        }
        // Decrypt returns the nsec string, decode it to get the hex bytes
        const decoded = nip19.decode(privateKey);
        if (decoded.type !== 'nsec') {
          console.error('Invalid nsec format in decrypted private key');
          return false;
        }
        const privateKeyBytes = decoded.data as Uint8Array;
        zapFinalized = finalizeEvent(
          zapEvent as any,
          privateKeyBytes
        );
      } else {
        console.log(
          'No valid signing method found, falling back to anonymous zap'
        );
        const privateKey = generateSecretKey();
        zapFinalized = finalizeEvent(zapEvent as any, privateKey);
      }

      // Check if zapFinalized was successfully created
      if (!zapFinalized) {
        console.error('Failed to sign zap event - zapFinalized is undefined');
        return false;
      }

      // Get invoice and handle payment
      await this.getInvoiceandPay(
        callbackToZap,
        amountPay,
        zapFinalized,
        lud16ToZap,
        eventoToZapID
      );

      return true;
    } catch (error) {
      // Re-throw errors that have our error messages (from getInvoiceandPay)
      if (error instanceof Error && error.message.startsWith('CAN\'T PAY:')) {
        throw error;
      }
      // For other errors, log and return false
      console.error('Error signing zap event:', error);
      return false;
    }
  }

  /**
   * Get invoice and handle payment (matches original getInvoiceandPay)
   */
  async getInvoiceandPay(
    callback: string,
    amount: number,
    zapFinalized: unknown,
    lud16: string,
    eventID: string
  ): Promise<void> {
    try {
      if (!zapFinalized) {
        console.error('Cannot get invoice - zapFinalized is undefined');
        return;
      }

      const eventFinal = JSON.stringify(zapFinalized);
      const lnurl = encodeURIComponent(lud16);
      const separator = callback.includes('?') ? '&' : '?'; // if callback has query params
      const encodedNostr = encodeURIComponent(eventFinal);
      const callString = `${callback}${separator}amount=${amount}&nostr=${encodedNostr}&lnurl=${lnurl}`;
      console.log('Sending zap request to:', callString);
      const responseFinal = await fetch(callString);

      if (!responseFinal.ok) {
        const errorText = await responseFinal.text();
        const errorMessage = 'CAN\'T PAY: Failed to get invoice';
        console.error(
          'Failed to get invoice from callback:',
          responseFinal.status,
          errorText
        );
        throw new Error(errorMessage);
      }

      const responseData = await responseFinal.json();
      console.log('Lightning service response:', responseData);

      if (!responseData.pr) {
        const errorMessage = 'CAN\'T PAY: Failed to get invoice';
        console.error('No invoice (pr) in response:', responseData);
        throw new Error(errorMessage);
      }

      const { pr: invoice } = responseData;
        // Extract zap request ID from the signed zap request event
        const zapRequestID = (zapFinalized as any)?.id || '';
        // Pass the zap request event ID (for matching when zap receipt arrives) and post event ID
        await this.handleFetchedInvoice(invoice, eventID, amount, zapRequestID);
    } catch (error) {
      // Re-throw errors that we explicitly threw (they have our error messages)
      if (error instanceof Error && error.message.startsWith('CAN\'T PAY:')) {
        throw error;
      }
      // For unexpected errors, wrap and throw
      console.error('Error getting invoice and paying:', error);
      throw new Error('CAN\'T PAY: Failed to get invoice');
    }
  }

  /**
   * Handle fetched invoice (matches original handleFetchedInvoice)
   */
  async handleFetchedInvoice(
    invoice: string,
    zapEventID: string,
    amount: number = 0,
    zapRequestID: string = ''
  ): Promise<void> {
    console.log('handleFetchedInvoice called with:', {
      invoice: `${invoice.substring(0, 50)}...`,
      zapEventID,
      zapRequestID
    });
    // Check if NWC is configured and user preference for auto-pay
    try {
      // Helper function to get active NWC URI (checks both old and new storage formats)
      const getActiveNWCUri = (): string | null => {
        if (typeof localStorage === 'undefined') return null;
        
        // First check new multi-connection format
        try {
          const activeId = localStorage.getItem('nwcActiveConnectionId');
          if (activeId) {
            const connections = localStorage.getItem('nwcConnections');
            if (connections) {
              const parsed = JSON.parse(connections) as Array<{ id: string; uri: string }>;
              const connection = parsed.find(c => c.id === activeId);
              if (connection?.uri) {
                return connection.uri;
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
        
        // Fallback to old single connection format
        return (
          localStorage.getItem('nwcConnectionString') ||
          (typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem('nwcConnectionString')) ||
          null
        );
      };

      const nwcUri = getActiveNWCUri();

      // Check user preference for auto-pay (defaults to true for backward compatibility)
      const nwcAutoPayPref =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('nwcAutoPay')
          : null;
      const shouldAutoPay = nwcAutoPayPref === null || nwcAutoPayPref === 'true';

      if (nwcUri && shouldAutoPay) {
        const { NwcClient } = await import('../nwc/NwcClient');
        try {
          const { useUIStore } = await import('../state/uiStore');
          useUIStore
            .getState()
            .openToast('Sending invoice to wallet…', 'loading', true);
        } catch {
          void 0; // no-op: UI store not available in this environment
        }
        const client = new NwcClient(nwcUri);
        // Fire-and-forget; don't show overlays, don't fallback
        try {
          const { useUIStore } = await import('../state/uiStore');
          useUIStore
            .getState()
            .updateToast('Waiting for wallet…', 'loading', true);
        } catch {
          void 0; // no-op: toast not available
        }

        const timeoutMs = 45000;
        const timeoutPromise = new Promise<
          Awaited<ReturnType<typeof client.payInvoice>>
        >(resolve => {
          setTimeout(() => {
            resolve({
              error: { code: 'timeout', message: 'Wallet not responding' },
              result: null,
              result_type: 'error'
            });
          }, timeoutMs);
        });

        Promise.race([client.payInvoice(invoice), timeoutPromise as any])
          .then(resp => {
            try {
              const { useUIStore } = require('../state/uiStore');
              if (resp && !resp.error && resp.result) {
                useUIStore
                  .getState()
                  .updateToast('Paid via NWC', 'success', false);
                setTimeout(() => {
                  try {
                    useUIStore.getState().closeToast();
                  } catch {
                    void 0; // no-op
                  }
                }, 2000);
                console.log(
                  'Paid via NWC. Preimage:',
                  (resp.result as any).preimage
                );
              } else {
                const msg =
                  resp && resp.error && resp.error.message
                    ? resp.error.message
                    : 'NWC payment error';
                useUIStore.getState().updateToast(msg, 'error', true);
              }
            } catch {
              void 0; // no-op: UI store not available
            }
          })
          .catch(err => {
            console.warn('NWC payment exception:', err);
            try {
              const { useUIStore } = require('../state/uiStore');
              useUIStore
                .getState()
                .updateToast('NWC payment failed', 'error', true);
            } catch {
              void 0; // no-op
            }
          });
        return;
      }
    } catch (e) {
      console.warn('NWC flow error:', e);
      // Continue to show invoice overlay even if NWC check failed
    }

    // Show invoice overlay when:
    // 1. No NWC is configured, OR
    // 2. NWC is configured but user prefers to see invoice overlay (nwcAutoPay = false)
    try {
      const { useUIStore } = await import('../state/uiStore');
      // eventId: post event ID (for finding recipient)
      // zapRequestId: zap request event ID (for closing when payment detected)
      useUIStore
        .getState()
        .openInvoice({
          bolt11: invoice,
          amount,
          eventId: zapEventID, // Post event ID for finding recipient
          zapRequestId: zapRequestID // Zap request event ID for closing
        });
    } catch (e) {
      console.error('Failed to open invoice overlay via store:', e);
    }
  }

  /**
   * Send a zap to a profile (convenience method)
   * This method orchestrates the full flow: get callback, create zap request, sign and send
   * @param recipientPubkey - Hex-encoded pubkey of the recipient
   * @param recipientProfile - Profile data (kind 0 event) of the recipient
   * @param amount - Amount in sats
   * @param comment - Optional comment
   * @param senderPubkey - Optional sender pubkey (for non-anonymous zaps)
   * @param decryptedPrivateKey - Optional decrypted private key from auth state
   * @param anonymousZap - Whether this is an anonymous zap (default: false)
   * @returns Promise<boolean> - true if successful
   */
  async sendProfileZap(
    recipientPubkey: string,
    recipientProfile: unknown,
    amount: number,
    comment: string = '',
    senderPubkey?: string | null,
    decryptedPrivateKey?: string | null,
    anonymousZap: boolean = false
  ): Promise<boolean> {
    try {
      // Get invoice callback (pass null for eventData since this is a profile zap)
      const callback = await this.getInvoiceCallBack(null, recipientProfile);
      if (!callback) {
        throw new Error('CAN\'T PAY: Failed to get Lightning callback');
      }

      // Create zap request
      // For anonymous zaps, pass null for pubKey (will be set during signing with random key)
      const zapEventData = await this.createProfileZapEvent(
        recipientPubkey,
        amount,
        callback.lud16ToZap,
        anonymousZap ? null : (senderPubkey || null),
        comment
      );

      if (!zapEventData) {
        throw new Error('CAN\'T PAY: Failed to create zap request');
      }

      // Sign and send
      // For anonymous zaps, pass null for private key (will generate random key)
      return await this.signZapEvent(
        zapEventData.zapEvent,
        callback.callbackToZap,
        zapEventData.amountPay,
        callback.lud16ToZap,
        '', // No event ID for profile zaps
        anonymousZap, // Pass anonymous flag
        anonymousZap ? null : decryptedPrivateKey // No private key for anonymous zaps
      );
    } catch (error) {
      console.error('Error sending profile zap:', error);
      if (error instanceof Error && error.message.startsWith('CAN\'T PAY:')) {
        throw error;
      }
      throw new Error('CAN\'T PAY: Failed to send profile zap');
    }
  }
}
