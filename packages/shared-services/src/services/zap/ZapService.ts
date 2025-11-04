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

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get Lightning callback URL from author's LUD16 address
   */
  async getInvoiceCallBack(
    eventData: unknown,
    authorData: unknown
  ): Promise<ZapCallback | null> {
    try {
      console.log('getInvoiceCallBack called with:', { eventData, authorData });

      // Check for zap-lnurl tag first, then fall back to author's lud16
      const zapLNURL = (eventData as any).tags.find(
        (tag: any) => tag[0] === 'zap-lnurl'
      );
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
          : eventCreatorProfileContent.lud16;

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
      const lnurl = lud16;
      const callString = `${callback}?amount=${amount}&nostr=${eventFinal}&lnurl=${lnurl}`;
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
    // If NWC is configured, pay via NWC and do not open invoice overlay
    try {
      const nwcUri =
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('nwcConnectionString')) ||
        (typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem('nwcConnectionString'));

      if (nwcUri) {
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
      return; // Do not fallback to invoice overlay when NWC is configured
    }

    // Fallback only when no NWC configuration is present
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
}
