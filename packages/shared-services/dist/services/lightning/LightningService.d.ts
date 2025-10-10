import { LightningInvoice, LightningPayment, LightningConfig, LightningSession, WebhookData } from '@pubpay/shared-types';
export declare class LightningService {
    private config;
    private sessions;
    private frontendSessionId;
    constructor(config: LightningConfig);
    /**
     * Enable Lightning payments for a live event
     */
    enableLightningPayments(eventId: string): Promise<{
        success: boolean;
        lnurl?: string;
        message?: string;
        error?: string;
    }>;
    /**
     * Disable Lightning payments for a live event
     */
    disableLightningPayments(eventId: string): Promise<{
        success: boolean;
        message?: string;
        error?: string;
    }>;
    /**
     * Get Lightning payment status
     */
    getLightningStatus(): {
        enabled: boolean;
        sessionId: string | null;
        activeSessions: number;
    };
    /**
     * Get active sessions
     */
    getActiveSessions(): LightningSession[];
    /**
     * Get session by ID
     */
    getSession(sessionId: string): LightningSession | null;
    /**
     * Create Lightning invoice
     */
    createInvoice(amount: number, description: string, comment?: string): Promise<{
        success: boolean;
        invoice?: LightningInvoice;
        error?: string;
    }>;
    /**
     * Check payment status
     */
    checkPaymentStatus(paymentHash: string): Promise<{
        success: boolean;
        payment?: LightningPayment;
        error?: string;
    }>;
    /**
     * Handle webhook data from LNBits
     */
    handleWebhook(webhookData: WebhookData): {
        success: boolean;
        message?: string;
        error?: string;
    };
    /**
     * Generate QR code data for Lightning payment
     */
    generateLightningQR(lnurl: string): string;
    /**
     * Validate Lightning configuration
     */
    validateConfig(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Update Lightning configuration
     */
    updateConfig(newConfig: Partial<LightningConfig>): void;
    /**
     * Get Lightning configuration
     */
    getConfig(): LightningConfig;
    /**
     * Clean up expired sessions
     */
    cleanupExpiredSessions(): void;
    /**
     * Generate unique frontend session ID
     */
    private generateFrontendSessionId;
    /**
     * Generate payment hash
     */
    private generatePaymentHash;
    /**
     * Cleanup resources
     */
    destroy(): void;
}
