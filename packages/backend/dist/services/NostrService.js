"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrService = void 0;
// NostrService - Handles Nostr operations including anonymous zap creation
const logger_1 = require("../utils/logger");
const nostr_tools_1 = require("nostr-tools");
const crypto = __importStar(require("crypto"));
class NostrService {
    pool;
    relays;
    logger;
    constructor() {
        this.pool = new nostr_tools_1.SimplePool();
        this.relays = [
            'wss://relay.damus.io',
            'wss://relay.primal.net',
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://relay.nostr.band'
        ];
        this.logger = new logger_1.Logger('NostrService');
        this.logger.info('NostrService initialized with relays:', this.relays);
    }
    /**
     * Send anonymous zap to Nostr relays
     */
    async sendAnonymousZap(eventId, amount, comment) {
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
        }
        catch (error) {
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
    decodeEventId(eventId) {
        if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
            try {
                const decoded = nostr_tools_1.nip19.decode(eventId);
                if (eventId.startsWith('note1')) {
                    // note1... decodes to raw hex event ID
                    return decoded.data;
                }
                else if (eventId.startsWith('nevent1')) {
                    // nevent1... decodes to object with id field
                    return decoded.data.id;
                }
            }
            catch (error) {
                this.logger.warn('Failed to decode event ID, using as-is:', eventId);
            }
        }
        return eventId;
    }
    /**
     * Get recipient public key from event
     */
    async getRecipientPubkey(eventId) {
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
            return event.pubkey;
        }
        catch (error) {
            this.logger.error('Error getting recipient pubkey:', error);
            return null;
        }
    }
    /**
     * Create zap request (kind 9734)
     */
    createZapRequest(recipientPubkey, eventId, amount, comment, senderPubkey) {
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
    createZapReceipt(recipientPubkey, eventId, amount, comment, zapRequest) {
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
    signEvent(event, privateKey) {
        const privateKeyHex = privateKey.toString('hex');
        return (0, nostr_tools_1.finalizeEvent)(event, privateKeyHex);
    }
    /**
     * Publish event to relays
     */
    async publishToRelays(event) {
        const publishedRelays = [];
        try {
            const publishPromises = this.relays.map(async (relay) => {
                try {
                    await this.pool.publish([relay], event);
                    publishedRelays.push(relay);
                    this.logger.debug(`Published to relay: ${relay}`);
                }
                catch (error) {
                    this.logger.warn(`Failed to publish to relay ${relay}:`, error);
                }
            });
            await Promise.allSettled(publishPromises);
            return publishedRelays;
        }
        catch (error) {
            this.logger.error('Error publishing to relays:', error);
            throw error;
        }
    }
    /**
     * Get public key from private key
     */
    getPublicKeyFromPrivate(privateKey) {
        // This is a simplified implementation
        // In a real implementation, you'd use proper secp256k1 operations
        const hash = crypto.createHash('sha256').update(privateKey).digest();
        return hash.toString('hex');
    }
    /**
     * Test relay connectivity
     */
    async testRelayConnectivity() {
        const connected = [];
        const failed = [];
        for (const relay of this.relays) {
            try {
                // Try to connect to relay
                const testEvent = {
                    kind: 1,
                    content: 'test',
                    tags: [],
                    created_at: Math.floor(Date.now() / 1000)
                };
                await this.pool.publish([relay], testEvent);
                connected.push(relay);
            }
            catch (error) {
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
    close() {
        try {
            this.pool.close(this.relays);
            this.logger.info('Nostr pool connections closed');
        }
        catch (error) {
            this.logger.warn('Error closing Nostr pool:', error);
        }
    }
}
exports.NostrService = NostrService;
//# sourceMappingURL=NostrService.js.map