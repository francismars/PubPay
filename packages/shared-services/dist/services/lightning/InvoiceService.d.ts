import { LightningInvoice, LightningPayment } from '@pubpay/shared-types';
export declare class InvoiceService {
    private invoices;
    private payments;
    /**
     * Create a new Lightning invoice
     */
    createInvoice(amount: number, description: string, options?: {
        comment?: string;
        expiry?: number;
        private?: boolean;
    }): LightningInvoice;
    /**
     * Get invoice by payment hash
     */
    getInvoice(paymentHash: string): LightningInvoice | null;
    /**
     * Update invoice status
     */
    updateInvoiceStatus(paymentHash: string, status: LightningInvoice['status']): boolean;
    /**
     * Mark invoice as paid
     */
    markInvoiceAsPaid(paymentHash: string, preimage: string, paidAt?: number): LightningPayment | null;
    /**
     * Get payment by payment hash
     */
    getPayment(paymentHash: string): LightningPayment | null;
    /**
     * Get all payments
     */
    getAllPayments(): LightningPayment[];
    /**
     * Get payments by status
     */
    getPaymentsByStatus(status: LightningPayment['status']): LightningPayment[];
    /**
     * Check if invoice is expired
     */
    isInvoiceExpired(paymentHash: string): boolean;
    /**
     * Get expired invoices
     */
    getExpiredInvoices(): LightningInvoice[];
    /**
     * Clean up expired invoices
     */
    cleanupExpiredInvoices(): number;
    /**
     * Get invoice statistics
     */
    getInvoiceStats(): {
        total: number;
        pending: number;
        paid: number;
        expired: number;
        totalAmount: number;
        totalPaid: number;
    };
    /**
     * Validate invoice
     */
    validateInvoice(invoice: LightningInvoice): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Generate payment hash
     */
    private generatePaymentHash;
    /**
     * Generate payment request (mock implementation)
     */
    private generatePaymentRequest;
    /**
     * Hash description for payment request
     */
    private hashDescription;
    /**
     * Clear all data
     */
    clear(): void;
}
