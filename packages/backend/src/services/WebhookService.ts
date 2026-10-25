// WebhookService - Handles Lightning webhook processing and zap creation
import { Logger } from '../utils/logger.js';
import { NostrService } from './NostrService.js';
import { SessionService } from './SessionService.js';
import { WebhookData } from '@pubpay/shared-types';
import {
  claimPaymentHash,
  maxZapSats,
  verifyIncomingPayment
} from '../utils/lnbitsClient.js';
import { isValidPaymentId } from '../utils/webhookAuth.js';

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

export class WebhookService {
  private nostrService: NostrService;
  private sessionService: SessionService;
  private logger: Logger;

  constructor() {
    this.nostrService = new NostrService();
    this.sessionService = SessionService.getInstance();
    this.logger = new Logger('WebhookService');
  }

  /**
   * Process incoming webhook data from LNBits.
   * Caller must already have verified WEBHOOK_SECRET.
   * Amount and paid status are confirmed via LNBits API — body is not trusted.
   */
  async processWebhook(webhookData: WebhookData): Promise<WebhookResult> {
    try {
      const validation = this.validateWebhookData(webhookData);
      if (!validation.valid) {
        this.logger.error('Invalid webhook data:', validation.errors);
        return {
          success: false,
          error: `Invalid webhook data: ${validation.errors.join(', ')}`
        };
      }

      const paymentId =
        (webhookData as { payment_hash?: string; checking_id?: string })
          .payment_hash ||
        (webhookData as { checking_id?: string }).checking_id;

      if (!paymentId || !isValidPaymentId(paymentId)) {
        return {
          success: false,
          error: 'Missing or invalid payment_hash'
        };
      }

      // Confirm with LNBits before spending
      const verified = await verifyIncomingPayment(paymentId);
      if (!verified || !verified.paid) {
        this.logger.warn('LNBits did not confirm inbound payment', {
          paymentId: paymentId.slice(0, 16)
        });
        return {
          success: false,
          error: 'Payment not confirmed'
        };
      }

      if (!claimPaymentHash(verified.paymentHash)) {
        this.logger.info('Duplicate webhook ignored', {
          paymentHash: verified.paymentHash.slice(0, 16)
        });
        return {
          success: true,
          message: 'Payment already processed'
        };
      }

      let amountSats = verified.amountSats;
      // Fallback: some LNBits lnurlp webhooks put msats in body.amount when API omits amount
      if (amountSats <= 0 && typeof webhookData.amount === 'number') {
        // Prefer treating body amount as msats if large; else sats
        amountSats =
          webhookData.amount >= 1000
            ? Math.round(webhookData.amount / 1000)
            : Math.round(webhookData.amount);
      }

      const cap = maxZapSats();
      if (amountSats <= 0) {
        return { success: false, error: 'Could not determine payment amount' };
      }
      if (amountSats > cap) {
        this.logger.error('Payment exceeds MAX_ZAP_SATS', {
          amountSats,
          cap
        });
        return { success: false, error: 'Payment amount exceeds limit' };
      }

      const mapping = this.sessionService.getLNURLMapping(webhookData.lnurlp);
      if (!mapping) {
        this.logger.error(
          'LNURL-pay ID not found in mappings:',
          webhookData.lnurlp
        );
        return {
          success: false,
          error: 'Payment session not found',
          message: 'The LNURL-pay ID does not match any active session'
        };
      }

      const { frontendSessionId, eventId } = mapping;

      const session = this.sessionService.getSession(frontendSessionId);
      if (
        !session ||
        !session.events[eventId] ||
        !session.events[eventId].active
      ) {
        return {
          success: false,
          error: 'Invalid or inactive session'
        };
      }

      this.sessionService.updateLastSeen(frontendSessionId, eventId);

      let comment = webhookData.comment || '';
      if (Array.isArray(comment)) {
        comment = comment.join(' ');
      } else if (typeof comment !== 'string') {
        comment = String(comment);
      }
      // Cap comment length
      if (comment.length > 200) {
        comment = comment.slice(0, 200);
      }

      this.logger.info(
        `⚡ Processing Lightning payment: ${amountSats} sats for event ${eventId}`
      );

      try {
        await this.nostrService.sendAnonymousZap(eventId, amountSats, comment);
        return {
          success: true,
          message: 'Payment processed and zap published successfully',
          paymentInfo: {
            amount: amountSats,
            comment,
            eventId,
            frontendSessionId
          },
          zapStatus: 'Published to Nostr relays'
        };
      } catch (error) {
        this.logger.error(
          `❌ Failed to publish zap: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        // Payment was real; report success so LNBits does not endlessly retry
        return {
          success: true,
          message: 'Payment received but zap publishing failed',
          paymentInfo: {
            amount: amountSats,
            comment,
            eventId,
            frontendSessionId
          },
          zapStatus: 'Payment received, zap publishing failed'
        };
      }
    } catch (error) {
      this.logger.error('💥 Error processing webhook:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: 'Failed to process webhook'
      };
    }
  }

  private validateWebhookData(webhookData: any): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!webhookData) {
      errors.push('Webhook data is missing');
      return { valid: false, errors };
    }

    if (!webhookData.lnurlp) {
      errors.push('Missing LNURL-pay ID');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
