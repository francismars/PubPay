// WebhookService - Handles Lightning webhook processing
import { WebhookData, LightningSession } from '../../types/lightning';
import { LightningService } from './LightningService';
import { InvoiceService } from './InvoiceService';

export class WebhookService {
  private lightningService: LightningService;
  private invoiceService: InvoiceService;
  private webhookHandlers: Map<string, (data: WebhookData) => void> = new Map();

  constructor(
    lightningService: LightningService,
    invoiceService: InvoiceService
  ) {
    this.lightningService = lightningService;
    this.invoiceService = invoiceService;
  }

  /**
   * Process incoming webhook data
   */
  async processWebhook(webhookData: WebhookData): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // Validate webhook data
      const validation = this.validateWebhookData(webhookData);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid webhook data: ${validation.errors.join(', ')}`
        };
      }

      // Find matching session
      const session = this.findMatchingSession(webhookData);
      if (!session) {
        return {
          success: false,
          error: 'No matching session found for webhook'
        };
      }

      // Process payment
      const payment = await this.processPayment(webhookData, session);
      if (!payment) {
        return {
          success: false,
          error: 'Failed to process payment'
        };
      }

      // Notify handlers
      this.notifyHandlers(webhookData);

      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error) {
      console.error('Error processing webhook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Register webhook handler
   */
  registerHandler(id: string, handler: (data: WebhookData) => void): void {
    this.webhookHandlers.set(id, handler);
  }

  /**
   * Unregister webhook handler
   */
  unregisterHandler(id: string): void {
    this.webhookHandlers.delete(id);
  }

  /**
   * Validate webhook data
   */
  private validateWebhookData(data: WebhookData): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.payment_hash) {
      errors.push('Payment hash is required');
    }

    if (!data.payment_request) {
      errors.push('Payment request is required');
    }

    if (data.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!data.status) {
      errors.push('Status is required');
    }

    if (!['paid', 'expired', 'cancelled'].includes(data.status)) {
      errors.push('Invalid status');
    }

    if (data.created_at <= 0) {
      errors.push('Created timestamp is required');
    }

    if (data.paid_at && data.paid_at < data.created_at) {
      errors.push('Paid timestamp cannot be before created timestamp');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Find matching session for webhook data
   */
  private findMatchingSession(
    webhookData: WebhookData
  ): LightningSession | null {
    const sessions = this.lightningService.getActiveSessions();

    // Try to match by description (event ID)
    if (webhookData.description) {
      const session = sessions.find(s => s.eventId === webhookData.description);
      if (session) return session;
    }

    // Try to match by comment
    if (webhookData.comment) {
      const session = sessions.find(s => s.eventId === webhookData.comment);
      if (session) return session;
    }

    return null;
  }

  /**
   * Process payment from webhook data
   */
  private async processPayment(
    webhookData: WebhookData,
    session: LightningSession
  ): Promise<boolean> {
    try {
      if (webhookData.status === 'paid') {
        // Mark invoice as paid
        const payment = this.invoiceService.markInvoiceAsPaid(
          webhookData.payment_hash,
          webhookData.payment_hash, // Using payment_hash as preimage for mock
          webhookData.paid_at
        );

        if (!payment) {
          console.error('Failed to create payment record');
          return false;
        }

        // Debug log removed
        return true;
      } else if (webhookData.status === 'expired') {
        // Mark invoice as expired
        this.invoiceService.updateInvoiceStatus(
          webhookData.payment_hash,
          'expired'
        );
        // Debug log removed
        return true;
      } else if (webhookData.status === 'cancelled') {
        // Mark invoice as cancelled
        this.invoiceService.updateInvoiceStatus(
          webhookData.payment_hash,
          'cancelled'
        );
        // Debug log removed
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error processing payment:', error);
      return false;
    }
  }

  /**
   * Notify all registered handlers
   */
  private notifyHandlers(webhookData: WebhookData): void {
    this.webhookHandlers.forEach((handler, id) => {
      try {
        handler(webhookData);
      } catch (error) {
        console.error(`Error in webhook handler ${id}:`, error);
      }
    });
  }

  /**
   * Get webhook statistics
   */
  getWebhookStats(): {
    totalHandlers: number;
    activeSessions: number;
    recentWebhooks: number;
  } {
    return {
      totalHandlers: this.webhookHandlers.size,
      activeSessions: this.lightningService.getActiveSessions().length,
      recentWebhooks: 0 // This would track recent webhook count
    };
  }

  /**
   * Test webhook processing
   */
  async testWebhook(testData: Partial<WebhookData>): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const mockWebhookData: WebhookData = {
      payment_hash: testData.payment_hash || 'test_payment_hash',
      payment_request: testData.payment_request || 'lnbc100u1p...',
      amount: testData.amount || 100,
      description: testData.description || 'test_description',
      comment: testData.comment || 'test_comment',
      created_at: testData.created_at || Date.now(),
      paid_at: testData.paid_at || Date.now(),
      status: testData.status || 'paid'
    };

    return this.processWebhook(mockWebhookData);
  }

  /**
   * Clear all handlers
   */
  clearHandlers(): void {
    this.webhookHandlers.clear();
  }
}
