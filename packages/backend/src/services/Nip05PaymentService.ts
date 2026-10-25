// NIP-05 Payment Service - Handles LNbits payment integration
import { Logger } from '../utils/logger.js';
import {
  claimPaymentHash,
  verifyIncomingPayment
} from '../utils/lnbitsClient.js';
import { buildWebhookUrl, isValidPaymentId } from '../utils/webhookAuth.js';

export interface PaymentInvoice {
  payment_hash: string;
  payment_request: string; // BOLT11 invoice
  checking_id: string; // LNbits payment ID
}

export interface PaymentStatus {
  paid: boolean;
  payment_hash?: string;
  checking_id?: string;
  amountSats?: number;
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
      this.logger.warn(
        '⚠️  LNBITS_API_KEY not configured - NIP-05 payments will not work'
      );
    }
  }

  /**
   * Create a Lightning invoice for NIP-05 registration
   */
  async createInvoice(
    name: string,
    pubkey: string,
    _webhookUrl?: string,
    fullName?: string
  ): Promise<PaymentInvoice> {
    if (!this.lnbitsApiKey) {
      throw new Error('LNbits API key not configured');
    }

    try {
      const displayName = fullName || name;
      const domain = process.env['NIP05_DOMAIN'] || 'yourdomain.com';
      const webhook = buildWebhookUrl('/nip05/webhook');

      const requestBody = {
        out: false,
        amount: this.PRICE_SATS,
        unit: 'sat',
        memo: `NIP-05 Verification: ${displayName}@${domain}`,
        webhook,
        internal: false
      };

      this.logger.info('Creating BOLT11 invoice:', {
        amount: this.PRICE_SATS,
        memo: requestBody.memo
      });

      const response = await fetch(`${this.lnbitsUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.lnbitsApiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('LNbits API error:', {
          status: response.status
        });
        throw new Error(`Failed to create invoice: ${response.status}`);
      }

      const data = (await response.json()) as any;

      if (!data.payment_hash || !data.payment_request) {
        throw new Error('Invalid response from LNbits API');
      }

      this.logger.info(`✅ Created BOLT11 invoice: ${data.payment_hash}`);

      return {
        payment_hash: data.payment_hash,
        payment_request: data.payment_request,
        checking_id: data.payment_hash
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
    if (!isValidPaymentId(checkingId)) {
      return { paid: false };
    }

    const verified = await verifyIncomingPayment(checkingId);
    if (!verified) {
      return { paid: false };
    }

    return {
      paid: verified.paid,
      payment_hash: verified.paymentHash,
      checking_id: checkingId,
      amountSats: verified.amountSats
    };
  }

  /**
   * Confirm a NIP-05 payment via LNBits API (not the webhook body).
   * Returns verified amount sats or null if invalid.
   */
  async confirmPaidInvoice(paymentId: string): Promise<{
    paymentHash: string;
    amountSats: number;
  } | null> {
    if (!isValidPaymentId(paymentId)) {
      return null;
    }

    const verified = await verifyIncomingPayment(paymentId);
    if (!verified || !verified.paid) {
      return null;
    }

    if (verified.amountSats < this.PRICE_SATS) {
      this.logger.warn('NIP-05 payment below price', {
        amountSats: verified.amountSats,
        required: this.PRICE_SATS
      });
      return null;
    }

    return {
      paymentHash: verified.paymentHash,
      amountSats: verified.amountSats
    };
  }

  /** Claim payment hash for one-time use (registration). */
  claimProof(paymentHash: string): boolean {
    return claimPaymentHash(`nip05:${paymentHash}`);
  }

  getPrice(): number {
    return this.PRICE_SATS;
  }
}
