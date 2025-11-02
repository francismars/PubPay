"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
// WebhookService - Handles Lightning webhook processing and zap creation
const logger_1 = require("../utils/logger");
const NostrService_1 = require("./NostrService");
const SessionService_1 = require("./SessionService");
class WebhookService {
    nostrService;
    sessionService;
    logger;
    constructor() {
        this.nostrService = new NostrService_1.NostrService();
        this.sessionService = SessionService_1.SessionService.getInstance();
        this.logger = new logger_1.Logger('WebhookService');
    }
    /**
     * Process incoming webhook data from LNBits
     */
    async processWebhook(webhookData) {
        try {
            this.logger.info('Processing webhook:', {
                lnurlpId: webhookData.lnurlp,
                amount: webhookData.amount,
                comment: webhookData.comment,
                timestamp: new Date().toISOString()
            });
            // Validate webhook data
            const validation = this.validateWebhookData(webhookData);
            if (!validation.valid) {
                this.logger.error('Invalid webhook data:', validation.errors);
                return {
                    success: false,
                    error: `Invalid webhook data: ${validation.errors.join(', ')}`
                };
            }
            // Find matching session
            const mapping = this.sessionService.getLNURLMapping(webhookData.lnurlp);
            if (!mapping) {
                this.logger.error('LNURL-pay ID not found in mappings:', webhookData.lnurlp);
                return {
                    success: false,
                    error: 'Payment session not found',
                    message: 'The LNURL-pay ID does not match any active session'
                };
            }
            const { frontendSessionId, eventId } = mapping;
            this.logger.info(`Found mapping: ${webhookData.lnurlp} -> ${frontendSessionId}/${eventId}`);
            // Verify session is active
            const session = this.sessionService.getSession(frontendSessionId);
            if (!session ||
                !session.events[eventId] ||
                !session.events[eventId].active) {
                this.logger.error('Invalid or inactive session:', {
                    frontendSessionId,
                    eventId,
                    sessionExists: !!session,
                    eventExists: session?.events?.[eventId] ? true : false,
                    eventActive: session?.events?.[eventId]?.active
                });
                return {
                    success: false,
                    error: 'Invalid or inactive session',
                    message: 'The payment session is either not found, inactive, or does not match the event ID'
                };
            }
            // Update last seen
            this.sessionService.updateLastSeen(frontendSessionId, eventId);
            // Process payment and create zap
            const amount = webhookData.amount || 1000; // Default to 1 sat if not provided
            const comment = webhookData.comment || 'Lightning payment';
            this.logger.info(`⚡ Processing Lightning payment: ${amount} sats for event ${eventId} with comment: "${comment}"`);
            try {
                await this.nostrService.sendAnonymousZap(eventId, amount, comment);
                this.logger.info(`✅ Successfully published anonymous zap: ${amount} sats for event ${eventId}`);
                return {
                    success: true,
                    message: 'Payment processed and zap published successfully',
                    paymentInfo: {
                        amount,
                        comment,
                        eventId,
                        frontendSessionId
                    },
                    zapStatus: 'Published to Nostr relays'
                };
            }
            catch (error) {
                this.logger.error(`❌ Failed to publish zap: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // Don't fail the webhook response, just log the error
                return {
                    success: true,
                    message: 'Payment received but zap publishing failed',
                    paymentInfo: {
                        amount,
                        comment,
                        eventId,
                        frontendSessionId
                    },
                    zapStatus: 'Payment received, zap publishing failed'
                };
            }
        }
        catch (error) {
            this.logger.error('💥 Error processing webhook:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                webhookData,
                stack: error instanceof Error ? error.stack : undefined
            });
            return {
                success: false,
                error: 'Failed to process webhook',
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Validate webhook data structure
     */
    validateWebhookData(webhookData) {
        const errors = [];
        if (!webhookData) {
            errors.push('Webhook data is missing');
            return { valid: false, errors };
        }
        if (!webhookData.lnurlp) {
            errors.push('Missing LNURL-pay ID');
        }
        if (webhookData.amount &&
            (typeof webhookData.amount !== 'number' || webhookData.amount < 0)) {
            errors.push('Invalid amount');
        }
        // Handle comments flexibly like legacy - convert arrays to strings, allow any format
        if (webhookData.comment) {
            if (Array.isArray(webhookData.comment)) {
                // Convert array to string (join with spaces)
                webhookData.comment = webhookData.comment.join(' ');
            }
            else if (typeof webhookData.comment !== 'string') {
                // Convert other types to string
                webhookData.comment = String(webhookData.comment);
            }
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    /**
     * Get webhook processing statistics
     */
    getStats() {
        // This would be implemented with proper metrics collection
        // For now, return placeholder data
        return {
            totalProcessed: 0,
            successfulZaps: 0,
            failedZaps: 0,
            averageAmount: 0
        };
    }
}
exports.WebhookService = WebhookService;
//# sourceMappingURL=WebhookService.js.map