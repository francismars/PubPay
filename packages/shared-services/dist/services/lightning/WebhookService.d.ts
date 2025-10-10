import { WebhookData } from '@pubpay/shared-types';
import { LightningService } from './LightningService';
import { InvoiceService } from './InvoiceService';
export declare class WebhookService {
    private lightningService;
    private invoiceService;
    private webhookHandlers;
    constructor(lightningService: LightningService, invoiceService: InvoiceService);
    /**
     * Process incoming webhook data
     */
    processWebhook(webhookData: WebhookData): Promise<{
        success: boolean;
        message?: string;
        error?: string;
    }>;
    /**
     * Register webhook handler
     */
    registerHandler(id: string, handler: (data: WebhookData) => void): void;
    /**
     * Unregister webhook handler
     */
    unregisterHandler(id: string): void;
    /**
     * Validate webhook data
     */
    private validateWebhookData;
    /**
     * Find matching session for webhook data
     */
    private findMatchingSession;
    /**
     * Process payment from webhook data
     */
    private processPayment;
    /**
     * Notify all registered handlers
     */
    private notifyHandlers;
    /**
     * Get webhook statistics
     */
    getWebhookStats(): {
        totalHandlers: number;
        activeSessions: number;
        recentWebhooks: number;
    };
    /**
     * Test webhook processing
     */
    testWebhook(testData: Partial<WebhookData>): Promise<{
        success: boolean;
        message?: string;
        error?: string;
    }>;
    /**
     * Clear all handlers
     */
    clearHandlers(): void;
}
