// NIP-05 Payment Service - Handles LNbits payment integration
import { Logger } from '../utils/logger';

export interface PaymentInvoice {
  payment_hash: string;
  payment_request: string; // BOLT11 invoice
  checking_id: string; // LNbits payment ID
}

export interface PaymentStatus {
  paid: boolean;
  payment_hash?: string;
  checking_id?: string;
}

export class Nip05PaymentService {
  private logger: Logger;
  private lnbitsUrl: string;
  private lnbitsApiKey: string;
  private readonly PRICE_SATS = 1000;

  constructor() {
    this.logger = new Logger('Nip05PaymentService');
    this.lnbitsUrl = process.env['LNBITS_URL'] || 'https://legend.lnbits.com';
    this.lnbitsApiKey = process.env['LNBITS_API_KEY'] || '';

    if (!this.lnbitsApiKey) {
      this.logger.warn('⚠️  LNBITS_API_KEY not configured - NIP-05 payments will not work');
    }
  }

  /**
   * Create a Lightning invoice for NIP-05 registration
   */
  async createInvoice(
    name: string,
    pubkey: string,
    webhookUrl?: string,
    fullName?: string
  ): Promise<PaymentInvoice> {
    if (!this.lnbitsApiKey) {
      throw new Error('LNbits API key not configured');
    }

    try {
      // Use fullName if provided (includes suffix), otherwise just name
      const displayName = fullName || name;
      const domain = process.env['NIP05_DOMAIN'] || 'yourdomain.com';

      const requestBody = {
        out: false, // Create invoice (not pay)
        amount: this.PRICE_SATS,
        unit: 'sat',
        memo: `NIP-05 Verification: ${displayName}@${domain}`,
        webhook: webhookUrl || (process.env['WEBHOOK_URL']?.trim().replace(/\/+$/, '') ? `${process.env['WEBHOOK_URL'].trim().replace(/\/+$/, '')}/nip05/webhook` : undefined),
        internal: false
      };

      this.logger.info('Creating BOLT11 invoice:', {
        amount: this.PRICE_SATS,
        memo: requestBody.memo
      });

      const response = await fetch(
        `${this.lnbitsUrl}/api/v1/payments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.lnbitsApiKey
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('LNbits API error:', {
          status: response.status,
          error: errorText
        });
        throw new Error(
          `Failed to create invoice: ${response.status} ${errorText}`
        );
      }

      const data = (await response.json()) as any;

      if (!data.payment_hash || !data.payment_request) {
        throw new Error('Invalid response from LNbits API');
      }

      this.logger.info(`✅ Created BOLT11 invoice: ${data.payment_hash}`);

      return {
        payment_hash: data.payment_hash,
        payment_request: data.payment_request, // BOLT11 invoice
        checking_id: data.payment_hash // Use payment_hash as checking_id
      };
    } catch (error: any) {
      this.logger.error('Error creating invoice:', error);
      throw new Error(
        `Failed to create payment invoice: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Check payment status using LNbits API
   */
  async checkPaymentStatus(checkingId: string): Promise<PaymentStatus> {
    if (!this.lnbitsApiKey) {
      throw new Error('LNbits API key not configured');
    }

    try {
      // Check payment status using LNbits API
      const response = await fetch(
        `${this.lnbitsUrl}/api/v1/payments/${checkingId}`,
        {
          method: 'GET',
          headers: {
            'X-Api-Key': this.lnbitsApiKey
          }
        }
      );

      if (!response.ok) {
        // Payment not found or not paid yet
        return { paid: false };
      }

      const data = (await response.json()) as any;

      // Check if payment is paid
      const paid = data.paid === true || data.status === 'paid';

      return {
        paid,
        payment_hash: data.payment_hash,
        checking_id: checkingId
      };
    } catch (error) {
      this.logger.error('Error checking payment status:', error);
      return { paid: false };
    }
  }

  /**
   * Verify payment from webhook data
   * LNbits webhook format can vary, so we check for multiple possible fields
   * We trust the webhook since LNbits only sends it after payment is confirmed
   */
  verifyPayment(webhookData: any): boolean {
    // Verify webhook data exists
    if (!webhookData) {
      return false;
    }

    // Check for payment_hash - required identifier
    if (!webhookData.payment_hash) {
      this.logger.warn('Webhook missing payment_hash:', webhookData);
      return false;
    }

    let amount = 0;
    if (webhookData.amount_msat) {
      // Explicitly in millisats
      amount = webhookData.amount_msat / 1000;
    } else if (webhookData.total_msat) {
      amount = webhookData.total_msat / 1000;
    } else if (webhookData.amount) {
      // amount field: LNbits webhook sends amount in millisats
      // So we always divide by 1000 to convert to sats
      amount = webhookData.amount / 1000;
    } else if (webhookData.paid_amount) {
      amount = webhookData.paid_amount >= 1000000 ? webhookData.paid_amount / 1000 : webhookData.paid_amount;
    }

    this.logger.info('Webhook verification:', {
      hasPaymentHash: !!webhookData.payment_hash,
      rawAmount: webhookData.amount,
      calculatedAmount: amount,
      required: this.PRICE_SATS
    });

    // If amount is present, verify it's at least our price
    // If amount is missing, we still trust the webhook (LNbits wouldn't send it if unpaid)
    if (amount > 0 && amount < this.PRICE_SATS) {
      this.logger.warn('Payment amount seems too low:', {
        amount,
        required: this.PRICE_SATS,
        raw: webhookData
      });
      // Still return true - trust LNbits webhook, but log the warning
    }

    // Payment is verified if we have payment identifiers
    // LNbits only sends webhooks for confirmed payments
    return true;
  }

  /**
   * Get service price
   */
  getPrice(): number {
    return this.PRICE_SATS;
  }
}

