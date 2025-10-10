import { ApiResponse, PaginatedResponse } from '@pubpay/shared-types';
import { LightningConfig } from '@pubpay/shared-types';
export declare class PaymentAPI {
    private baseUrl;
    constructor(baseUrl?: string);
    /**
     * Enable Lightning payments
     */
    enableLightningPayments(data: {
        frontendSessionId: string;
        eventId: string;
    }): Promise<ApiResponse<{
        lnurl: string;
        existing: boolean;
    }>>;
    /**
     * Disable Lightning payments
     */
    disableLightningPayments(data: {
        frontendSessionId: string;
        eventId: string;
    }): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Get Lightning payment status
     */
    getLightningStatus(sessionId: string): Promise<ApiResponse<{
        enabled: boolean;
        lnurl?: string;
        eventId?: string;
    }>>;
    /**
     * Get payment history
     */
    getPaymentHistory(params?: {
        page?: number;
        limit?: number;
        eventId?: string;
    }): Promise<PaginatedResponse<{
        id: string;
        amount: number;
        description: string;
        status: string;
        createdAt: number;
    }>>;
    /**
     * Create payment request
     */
    createPaymentRequest(data: {
        amount: number;
        description: string;
        eventId: string;
        comment?: string;
    }): Promise<ApiResponse<{
        paymentRequest: string;
        paymentHash: string;
        expiresAt: number;
    }>>;
    /**
     * Check payment status
     */
    checkPaymentStatus(paymentHash: string): Promise<ApiResponse<{
        status: string;
        paidAt?: number;
        amount?: number;
    }>>;
    /**
     * Get Lightning configuration
     */
    getLightningConfig(): Promise<ApiResponse<LightningConfig>>;
    /**
     * Update Lightning configuration
     */
    updateLightningConfig(config: Partial<LightningConfig>): Promise<ApiResponse<LightningConfig>>;
}
