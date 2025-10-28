"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LightningService = void 0;
// LightningService - Backend implementation for Lightning payments
const logger_1 = require("../utils/logger");
class LightningService {
    config;
    logger;
    constructor() {
        this.config = {
            enabled: true,
            lnbitsUrl: process.env['LNBITS_URL'] || 'https://legend.lnbits.com',
            apiKey: process.env['LNBITS_API_KEY'] || '',
            webhookUrl: process.env['WEBHOOK_URL'] || ''
        };
        this.logger = new logger_1.Logger('LightningService');
        // Validate configuration
        this.validateConfig();
    }
    validateConfig() {
        if (!this.config.apiKey) {
            this.logger.error('❌ LNBITS_API_KEY environment variable is not set!');
            this.logger.error('Please create a .env file with your LNBits configuration.');
            this.config.enabled = false;
        }
        if (!this.config.webhookUrl) {
            this.logger.warn('⚠️  WEBHOOK_URL environment variable is not set, using default fallback');
            this.logger.warn('This will not work for production. Please set WEBHOOK_URL in your .env file.');
        }
        this.logger.info('Lightning configuration:', {
            enabled: this.config.enabled,
            lnbitsUrl: this.config.lnbitsUrl,
            hasApiKey: !!this.config.apiKey,
            webhookUrl: this.config.webhookUrl
        });
    }
    /**
     * Enable Lightning payments for a live event
     */
    async enableLightningPayments(eventId, frontendSessionId) {
        if (!this.config.enabled) {
            return {
                success: false,
                error: 'Lightning payments are disabled - LNBITS_API_KEY not configured'
            };
        }
        if (!eventId) {
            return {
                success: false,
                error: 'Event ID is required'
            };
        }
        try {
            this.logger.info('Creating LNBits LNURL:', {
                eventId,
                frontendSessionId,
                baseUrl: this.config.lnbitsUrl,
                hasApiKey: !!this.config.apiKey,
                webhookUrl: this.config.webhookUrl
            });
            const result = await this.createLNBitsLNURL(eventId, frontendSessionId);
            return {
                success: true,
                lnurl: result.lnurl,
                id: result.id,
                existing: false
            };
        }
        catch (error) {
            this.logger.error('Error creating LNURL:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Create LNURL-pay link using LNBits API
     */
    async createLNBitsLNURL(eventId, _frontendSessionId) {
        const requestBody = {
            description: `PubPay Live - Real-time Tip Tracker`,
            min: 1000, // 1 sat minimum
            max: 100000000, // 1M sats maximum
            comment_chars: 200,
            webhook_url: this.config.webhookUrl,
            success_text: 'You just experienced the future of live payments!',
            currency: 'sat'
        };
        this.logger.info('LNBits request body:', requestBody);
        const response = await fetch(`${this.config.lnbitsUrl}/lnurlp/api/v1/links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.config.apiKey
            },
            body: JSON.stringify(requestBody)
        });
        this.logger.info('LNBits API response:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        });
        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error('LNBits API error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`LNBits API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = (await response.json());
        this.logger.info('LNBits API response data:', data);
        if (!data.lnurl) {
            this.logger.error('No LNURL in LNBits response:', data);
            throw new Error('No LNURL returned from LNBits API');
        }
        this.logger.info(`✅ Created LNURL for event ${eventId}: ${data.lnurl}`);
        this.logger.info(`📋 LNURL-pay ID: ${data.id}`);
        return {
            lnurl: data.lnurl,
            id: data.id // Include the LNURL-pay ID for webhook mapping
        };
    }
    /**
     * Get Lightning configuration status
     */
    getConfigStatus() {
        return {
            enabled: this.config.enabled,
            lnbitsUrl: this.config.lnbitsUrl,
            hasApiKey: !!this.config.apiKey,
            webhookUrl: this.config.webhookUrl
        };
    }
    /**
     * Test LNBits connectivity
     */
    async testLNBitsConnection() {
        if (!this.config.enabled) {
            return {
                success: false,
                error: 'Lightning service is disabled'
            };
        }
        try {
            const startTime = Date.now();
            const response = await fetch(`${this.config.lnbitsUrl}/api/v1/wallet`, {
                method: 'GET',
                headers: {
                    'X-Api-Key': this.config.apiKey
                }
            });
            const responseTime = Date.now() - startTime;
            if (response.ok) {
                return {
                    success: true,
                    responseTime
                };
            }
            else {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                    responseTime
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
exports.LightningService = LightningService;
//# sourceMappingURL=LightningService.js.map