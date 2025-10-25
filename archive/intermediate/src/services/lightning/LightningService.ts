// LightningService - Handles Lightning Network payments
import { LightningInvoice, LightningPayment, LightningConfig, LightningSession, WebhookData } from '../../types/lightning';
import { ApiResponse } from '../../types/common';
import { API_ENDPOINTS } from '../../utils/constants';

export class LightningService {
  private config: LightningConfig;
  private sessions: Map<string, LightningSession> = new Map();
  private frontendSessionId: string | null = null;

  constructor(config: LightningConfig) {
    this.config = config;
    this.frontendSessionId = this.generateFrontendSessionId();
  }

  /**
   * Enable Lightning payments for a live event
   */
  async enableLightningPayments(eventId: string): Promise<{
    success: boolean;
    lnurl?: string;
    message?: string;
    error?: string;
  }> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Lightning payments are disabled'
      };
    }

    if (!eventId) {
      return {
        success: false,
        error: 'Event ID is required'
      };
    }

    try {
      // Debug log removed
      console.log('🔌 LightningService: Request body:', {
        frontendSessionId: this.frontendSessionId,
        eventId
      });

      const response = await fetch(API_ENDPOINTS.LIGHTNING_ENABLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontendSessionId: this.frontendSessionId,
          eventId
        })
      });

      // Debug log removed
      // Debug log removed

      const data: ApiResponse<{ lnurl: string; existing: boolean }> = await response.json();
      // Debug log removed

      if (data.success && data.data) {
        // Store session
        const session: LightningSession = {
          sessionId: this.frontendSessionId!,
          eventId,
          lnurlpId: data.data.lnurl,
          createdAt: Date.now(),
          expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
          status: 'active'
        };

        this.sessions.set(this.frontendSessionId!, session);

        return {
          success: true,
          lnurl: data.data.lnurl,
          message: data.data.existing
            ? 'Lightning enabled (reusing existing link)'
            : 'Lightning enabled - scan QR to pay'
        };
      } else {
        return {
          success: false,
          error: data.error || 'Failed to enable Lightning payments'
        };
      }
    } catch (error) {
      console.error('Error enabling Lightning payments:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Disable Lightning payments for a live event
   */
  async disableLightningPayments(eventId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    if (!eventId) {
      return {
        success: false,
        error: 'Event ID is required'
      };
    }

    try {
      const response = await fetch(API_ENDPOINTS.LIGHTNING_DISABLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontendSessionId: this.frontendSessionId,
          eventId
        })
      });

      const data: ApiResponse<{ message: string }> = await response.json();

      if (data.success) {
        // Remove session
        if (this.frontendSessionId) {
          this.sessions.delete(this.frontendSessionId);
        }

        return {
          success: true,
          message: data.data?.message || 'Lightning payments disabled'
        };
      } else {
        return {
          success: false,
          error: data.error || 'Failed to disable Lightning payments'
        };
      }
    } catch (error) {
      console.error('Error disabling Lightning payments:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get Lightning payment status
   */
  getLightningStatus(): {
    enabled: boolean;
    sessionId: string | null;
    activeSessions: number;
    } {
    return {
      enabled: this.config.enabled,
      sessionId: this.frontendSessionId,
      activeSessions: this.sessions.size
    };
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): LightningSession[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'active' && session.expiresAt > now
    );
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): LightningSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Create Lightning invoice
   */
  async createInvoice(
    amount: number,
    description: string,
    comment?: string
  ): Promise<{
    success: boolean;
    invoice?: LightningInvoice;
    error?: string;
  }> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Lightning payments are disabled'
      };
    }

    try {
      // This would integrate with LNBits API
      // For now, return a mock response
      const mockInvoice: LightningInvoice = {
        payment_hash: this.generatePaymentHash(),
        payment_request: `lnbc${amount}u1p...`, // Mock bolt11
        description,
        amount_msat: amount * 1000,
        amount_sat: amount,
        created_at: Date.now(),
        expires_at: Date.now() + (60 * 60 * 1000), // 1 hour
        status: 'pending'
      };

      return {
        success: true,
        invoice: mockInvoice
      };
    } catch (error) {
      console.error('Error creating Lightning invoice:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentHash: string): Promise<{
    success: boolean;
    payment?: LightningPayment;
    error?: string;
  }> {
    try {
      // This would check with LNBits API
      // For now, return a mock response
      const mockPayment: LightningPayment = {
        id: paymentHash,
        payment_hash: paymentHash,
        amount_msat: 100000,
        amount_sat: 100,
        created_at: Date.now(),
        status: 'completed',
        description: 'Mock payment'
      };

      return {
        success: true,
        payment: mockPayment
      };
    } catch (error) {
      console.error('Error checking payment status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle webhook data from LNBits
   */
  handleWebhook(webhookData: WebhookData): {
    success: boolean;
    message?: string;
    error?: string;
  } {
    try {
      // Process webhook data
      // Debug log removed

      // Find matching session
      const session = Array.from(this.sessions.values()).find(
        s => s.eventId === webhookData.description
      );

      if (!session) {
        return {
          success: false,
          error: 'No matching session found'
        };
      }

      // Update session status
      session.status = 'active';

      return {
        success: true,
        message: 'Webhook processed successfully'
      };
    } catch (error) {
      console.error('Error handling webhook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate QR code data for Lightning payment
   */
  generateLightningQR(lnurl: string): string {
    return `lightning:${lnurl}`;
  }

  /**
   * Validate Lightning configuration
   */
  validateConfig(): {
    valid: boolean;
    errors: string[];
    } {
    const errors: string[] = [];

    if (!this.config.lnbitsUrl) {
      errors.push('LNBits URL is required');
    }

    if (!this.config.apiKey) {
      errors.push('LNBits API key is required');
    }

    if (!this.config.webhookUrl) {
      errors.push('Webhook URL is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update Lightning configuration
   */
  updateConfig(newConfig: Partial<LightningConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get Lightning configuration
   */
  getConfig(): LightningConfig {
    return { ...this.config };
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    this.sessions.forEach((session, sessionId) => {
      if (session.expiresAt < now) {
        session.status = 'expired';
        this.sessions.delete(sessionId);
      }
    });
  }

  /**
   * Generate unique frontend session ID
   */
  private generateFrontendSessionId(): string {
    return `frontend_${  crypto.randomUUID()}`;
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
   * Cleanup resources
   */
  destroy(): void {
    this.sessions.clear();
    this.frontendSessionId = null;
  }
}
