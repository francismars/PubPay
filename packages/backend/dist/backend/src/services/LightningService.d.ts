export interface LNURLResult {
    success: boolean;
    lnurl?: string;
    error?: string;
    existing?: boolean;
}
export declare class LightningService {
    private config;
    private logger;
    constructor();
    private validateConfig;
    /**
     * Enable Lightning payments for a live event
     */
    enableLightningPayments(eventId: string, frontendSessionId: string): Promise<LNURLResult>;
    /**
     * Create LNURL-pay link using LNBits API
     */
    private createLNBitsLNURL;
    /**
     * Get Lightning configuration status
     */
    getConfigStatus(): {
        enabled: boolean;
        lnbitsUrl: string;
        hasApiKey: boolean;
        webhookUrl: string;
    };
    /**
     * Test LNBits connectivity
     */
    testLNBitsConnection(): Promise<{
        success: boolean;
        error?: string;
        responseTime?: number;
    }>;
}
//# sourceMappingURL=LightningService.d.ts.map