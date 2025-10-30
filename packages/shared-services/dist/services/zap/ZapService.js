// import { NostrEvent } from '@/types/nostr'; // Unused import
import * as NostrTools from 'nostr-tools';
export class ZapService {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }
    /**
     * Get Lightning callback URL from author's LUD16 address
     */
    async getInvoiceCallBack(eventData, authorData) {
        try {
            console.log('getInvoiceCallBack called with:', { eventData, authorData });
            // Check for zap-lnurl tag first, then fall back to author's lud16
            const zapLNURL = eventData.tags.find((tag) => tag[0] === 'zap-lnurl');
            let eventCreatorProfileContent = {};
            try {
                eventCreatorProfileContent = JSON.parse(authorData?.content || '{}');
            }
            catch {
                eventCreatorProfileContent = {};
            }
            const lud16 = zapLNURL && zapLNURL.length > 0
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
            let response;
            try {
                response = await fetch(`https://${ludSplit[1]}/.well-known/lnurlp/${ludSplit[0]}`);
            }
            catch {
                errorResponse = "CAN'T PAY: Failed to fetch lud16";
            }
            if (!response || response === undefined) {
                errorResponse = "CAN'T PAY: Failed to fetch lud16";
            }
            if (errorResponse) {
                console.error(errorResponse);
                return null;
            }
            const lnurlinfo = await response.json();
            if (!(lnurlinfo.allowsNostr === true)) {
                errorResponse = "CAN'T PAY: No nostr support";
            }
            if (errorResponse) {
                console.error(errorResponse);
                return null;
            }
            return {
                callbackToZap: lnurlinfo.callback,
                lud16ToZap: lud16
            };
        }
        catch (error) {
            console.error('Error getting invoice callback:', error);
            return null;
        }
    }
    /**
     * Create a zap event
     */
    async createZapEvent(eventData, rangeValue, lud16, pubKey = null) {
        try {
            // Find zap-min tag for minimum amount
            const zapMintag = eventData.tags.find((tag) => tag[0] === 'zap-min');
            const zapTagAmount = zapMintag ? zapMintag[1] : 1000;
            const amountPay = rangeValue !== -1
                ? parseInt(rangeValue.toString()) * 1000
                : Math.floor(parseInt(zapTagAmount));
            // Create zap request using NostrTools.nip57.makeZapRequest
            const zapEvent = await NostrTools.nip57.makeZapRequest({
                event: eventData,
                pubkey: eventData.pubkey,
                amount: amountPay,
                comment: '',
                relays: [
                    'wss://relay.damus.io',
                    'wss://relay.primal.net',
                    'wss://nostr.mutinywallet.com/',
                    'wss://relay.nostr.band/',
                    'wss://relay.nostr.nu/'
                ]
            });
            console.log('Created zap event:', zapEvent);
            // Add additional tags
            zapEvent.tags.push(['zap-lnurl', lud16]);
            zapEvent.tags.push(['t', 'pubpay']);
            if (pubKey !== null) {
                zapEvent.pubkey = pubKey;
                const eventID = NostrTools.getEventHash(zapEvent);
                if (eventID !== null)
                    zapEvent.id = eventID;
            }
            return {
                zapEvent,
                amountPay
            };
        }
        catch (error) {
            console.error('Error creating zap event:', error);
            return null;
        }
    }
    /**
     * Sign and send zap event
     */
    async signZapEvent(zapEvent, callbackToZap, amountPay, lud16ToZap, eventoToZapID, anonymousZap = false) {
        try {
            // Check for authentication state in localStorage/sessionStorage (React app)
            const publicKey = localStorage.getItem('publicKey') ||
                sessionStorage.getItem('publicKey');
            const signInMethod = localStorage.getItem('signInMethod') ||
                sessionStorage.getItem('signInMethod');
            const privateKey = localStorage.getItem('privateKey') ||
                sessionStorage.getItem('privateKey');
            console.log('Sign in method:', signInMethod);
            console.log('Public key:', publicKey);
            console.log('Has private key:', !!privateKey);
            let zapFinalized;
            if (anonymousZap === true) {
                console.log('Using anonymous zap signing');
                const privateKey = NostrTools.generateSecretKey();
                zapFinalized = NostrTools.finalizeEvent(zapEvent, privateKey);
            }
            else if (signInMethod === 'externalSigner') {
                console.log('Using external signer');
                const eventString = JSON.stringify(zapEvent);
                sessionStorage.setItem('SignZapEvent', JSON.stringify({
                    callback: callbackToZap,
                    amount: amountPay,
                    lud16: lud16ToZap,
                    event: zapEvent,
                    id: eventoToZapID
                }));
                window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
                return true;
            }
            else if (signInMethod === 'extension') {
                console.log('Using extension signing');
                if (window.nostr !== null) {
                    zapFinalized = await window.nostr.signEvent(zapEvent);
                }
            }
            else if (signInMethod === 'nsec') {
                console.log('Using nsec signing');
                if (!privateKey) {
                    console.error('No private key found. Please sign in first.');
                    return false;
                }
                const { data } = NostrTools.nip19.decode(privateKey);
                zapFinalized = NostrTools.finalizeEvent(zapEvent, data);
            }
            else {
                console.log('No valid signing method found, falling back to anonymous zap');
                const privateKey = NostrTools.generateSecretKey();
                zapFinalized = NostrTools.finalizeEvent(zapEvent, privateKey);
            }
            // Check if zapFinalized was successfully created
            if (!zapFinalized) {
                console.error('Failed to sign zap event - zapFinalized is undefined');
                return false;
            }
            // Get invoice and handle payment
            await this.getInvoiceandPay(callbackToZap, amountPay, zapFinalized, lud16ToZap, eventoToZapID);
            return true;
        }
        catch (error) {
            console.error('Error signing zap event:', error);
            return false;
        }
    }
    /**
     * Get invoice and handle payment (matches original getInvoiceandPay)
     */
    async getInvoiceandPay(callback, amount, zapFinalized, lud16, _eventID) {
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
                console.error('Failed to get invoice from callback:', responseFinal.status, errorText);
                return;
            }
            const responseData = await responseFinal.json();
            console.log('Lightning service response:', responseData);
            if (!responseData.pr) {
                console.error('No invoice (pr) in response:', responseData);
                return;
            }
            const { pr: invoice } = responseData;
            await this.handleFetchedInvoice(invoice, zapFinalized.id);
        }
        catch (error) {
            console.error('Error getting invoice and paying:', error);
        }
    }
    /**
     * Handle fetched invoice (matches original handleFetchedInvoice)
     */
    async handleFetchedInvoice(invoice, zapEventID) {
        console.log('handleFetchedInvoice called with:', {
            invoice: `${invoice.substring(0, 50)}...`,
            zapEventID
        });
        // If NWC is configured, pay via NWC and do not open invoice overlay
        try {
            const nwcUri = (typeof localStorage !== 'undefined' && localStorage.getItem('nwcConnectionString')) ||
                (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nwcConnectionString'));
            if (nwcUri) {
                const { NwcClient } = await import('../nwc/NwcClient');
                const client = new NwcClient(nwcUri);
                // Fire-and-forget; don't show overlays, don't fallback
                client
                    .payInvoice(invoice)
                    .then(resp => {
                    if (!resp.error && resp.result) {
                        console.log('Paid via NWC. Preimage:', resp.result.preimage);
                    }
                    else {
                        console.warn('NWC payment error:', resp.error);
                    }
                })
                    .catch(err => console.warn('NWC payment exception:', err));
                return;
            }
        }
        catch (e) {
            console.warn('NWC flow error:', e);
            return; // Do not fallback to invoice overlay when NWC is configured
        }
        // Fallback only when no NWC configuration is present
        try {
            const { useUIStore } = await import('../state/uiStore');
            useUIStore
                .getState()
                .openInvoice({ bolt11: invoice, amount: 0, eventId: zapEventID });
        }
        catch (e) {
            console.error('Failed to open invoice overlay via store:', e);
        }
    }
}
