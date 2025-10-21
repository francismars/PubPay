import { WebhookData } from '@pubpay/shared-types';
export interface WebhookResult {
    success: boolean;
    message?: string;
    error?: string;
    paymentInfo?: {
        amount: number;
        comment: string;
        eventId: string;
        frontendSessionId: string;
    };
    zapStatus?: string;
}
export declare class WebhookService {
    private nostrService;
    private sessionService;
    private logger;
    constructor();
    /**
     * Process incoming webhook data from LNBits
     */
    processWebhook(webhookData: WebhookData): Promise<WebhookResult>;
    /**
     * Validate webhook data structure
     */
    private validateWebhookData;
    /**
     * Get webhook processing statistics
     */
    getStats(): {
        totalProcessed: number;
        successfulZaps: number;
        failedZaps: number;
        averageAmount: number;
    };
}
//# sourceMappingURL=WebhookService.d.ts.map