// InvoiceService - Handles Lightning invoice operations
import { LightningInvoice, LightningPayment } from '../../types/lightning';
import { isValidZapAmount } from '../../utils/validation';

export class InvoiceService {
  private invoices: Map<string, LightningInvoice> = new Map();
  private payments: Map<string, LightningPayment> = new Map();

  /**
   * Create a new Lightning invoice
   */
  createInvoice(
    amount: number,
    description: string,
    options: {
      comment?: string;
      expiry?: number;
      private?: boolean;
    } = {}
  ): LightningInvoice {
    if (!isValidZapAmount(amount)) {
      throw new Error('Invalid zap amount');
    }

    const paymentHash = this.generatePaymentHash();
    const paymentRequest = this.generatePaymentRequest(amount, description, paymentHash);
    const now = Date.now();

    const invoice: LightningInvoice = {
      payment_hash: paymentHash,
      payment_request: paymentRequest,
      description: options.comment ? `${description} - ${options.comment}` : description,
      amount_msat: amount * 1000,
      amount_sat: amount,
      created_at: now,
      expires_at: now + (options.expiry || 60 * 60 * 1000), // Default 1 hour
      status: 'pending'
    };

    this.invoices.set(paymentHash, invoice);
    return invoice;
  }

  /**
   * Get invoice by payment hash
   */
  getInvoice(paymentHash: string): LightningInvoice | null {
    return this.invoices.get(paymentHash) || null;
  }

  /**
   * Update invoice status
   */
  updateInvoiceStatus(
    paymentHash: string,
    status: LightningInvoice['status']
  ): boolean {
    const invoice = this.invoices.get(paymentHash);
    if (invoice) {
      invoice.status = status;
      return true;
    }
    return false;
  }

  /**
   * Mark invoice as paid
   */
  markInvoiceAsPaid(
    paymentHash: string,
    preimage: string,
    paidAt: number = Date.now()
  ): LightningPayment | null {
    const invoice = this.invoices.get(paymentHash);
    if (!invoice) {
      return null;
    }

    // Update invoice status
    invoice.status = 'paid';

    // Create payment record
    const payment: LightningPayment = {
      id: paymentHash,
      payment_hash: paymentHash,
      amount_msat: invoice.amount_msat,
      amount_sat: invoice.amount_sat,
      created_at: invoice.created_at,
      status: 'completed',
      description: invoice.description,
      preimage
    };

    this.payments.set(paymentHash, payment);
    return payment;
  }

  /**
   * Get payment by payment hash
   */
  getPayment(paymentHash: string): LightningPayment | null {
    return this.payments.get(paymentHash) || null;
  }

  /**
   * Get all payments
   */
  getAllPayments(): LightningPayment[] {
    return Array.from(this.payments.values());
  }

  /**
   * Get payments by status
   */
  getPaymentsByStatus(status: LightningPayment['status']): LightningPayment[] {
    return Array.from(this.payments.values()).filter(p => p.status === status);
  }

  /**
   * Check if invoice is expired
   */
  isInvoiceExpired(paymentHash: string): boolean {
    const invoice = this.invoices.get(paymentHash);
    if (!invoice) return true;

    return Date.now() > invoice.expires_at;
  }

  /**
   * Get expired invoices
   */
  getExpiredInvoices(): LightningInvoice[] {
    const now = Date.now();
    return Array.from(this.invoices.values()).filter(
      invoice => invoice.expires_at < now && invoice.status === 'pending'
    );
  }

  /**
   * Clean up expired invoices
   */
  cleanupExpiredInvoices(): number {
    const expiredInvoices = this.getExpiredInvoices();
    let cleanedCount = 0;

    expiredInvoices.forEach(invoice => {
      invoice.status = 'expired';
      cleanedCount++;
    });

    return cleanedCount;
  }

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
    } {
    const invoices = Array.from(this.invoices.values());
    const payments = Array.from(this.payments.values());

    return {
      total: invoices.length,
      pending: invoices.filter(i => i.status === 'pending').length,
      paid: invoices.filter(i => i.status === 'paid').length,
      expired: invoices.filter(i => i.status === 'expired').length,
      totalAmount: invoices.reduce((sum, i) => sum + i.amount_sat, 0),
      totalPaid: payments.reduce((sum, p) => sum + p.amount_sat, 0)
    };
  }

  /**
   * Validate invoice
   */
  validateInvoice(invoice: LightningInvoice): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!invoice.payment_hash) {
      errors.push('Payment hash is required');
    }

    if (!invoice.payment_request) {
      errors.push('Payment request is required');
    }

    if (invoice.amount_sat <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!invoice.description) {
      errors.push('Description is required');
    }

    if (invoice.created_at <= 0) {
      errors.push('Created timestamp is required');
    }

    if (invoice.expires_at <= invoice.created_at) {
      errors.push('Expiry must be after creation time');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate payment hash
   */
  private generatePaymentHash(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate payment request (mock implementation)
   */
  private generatePaymentRequest(
    amount: number,
    description: string,
    paymentHash: string
  ): string {
    // This is a mock implementation
    // In a real implementation, this would generate a proper BOLT11 invoice
    const timestamp = Math.floor(Date.now() / 1000);
    const amountStr = amount.toString().padStart(4, '0');
    const descriptionHash = this.hashDescription(description);

    return `lnbc${amountStr}u1p${paymentHash.slice(0, 8)}...${descriptionHash.slice(0, 8)}`;
  }

  /**
   * Hash description for payment request
   */
  private hashDescription(description: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(description);
    return Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.invoices.clear();
    this.payments.clear();
  }
}
