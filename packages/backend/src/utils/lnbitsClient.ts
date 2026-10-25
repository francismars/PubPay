import { Logger } from './logger.js';
import { isValidPaymentId } from './webhookAuth.js';

const logger = new Logger('LnbitsClient');

export interface VerifiedIncomingPayment {
  paid: boolean;
  paymentHash: string;
  amountSats: number;
  pending: boolean;
  raw?: Record<string, unknown>;
}

function lnbitsBaseUrl(): string {
  return (
    process.env['LNBITS_URL']?.trim().replace(/\/+$/, '') ||
    'https://legend.lnbits.com'
  );
}

function lnbitsApiKey(): string {
  return process.env['LNBITS_API_KEY'] || '';
}

/**
 * Confirm an incoming payment with LNBits by payment_hash / checking_id.
 * Never trust webhook body amounts — derive sats from the API response.
 */
export async function verifyIncomingPayment(
  paymentId: string
): Promise<VerifiedIncomingPayment | null> {
  if (!isValidPaymentId(paymentId)) {
    logger.warn('Rejected invalid payment id format');
    return null;
  }

  const apiKey = lnbitsApiKey();
  if (!apiKey) {
    logger.error('LNBITS_API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${lnbitsBaseUrl()}/api/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey },
        signal: AbortSignal.timeout(15_000)
      }
    );

    if (!response.ok) {
      logger.warn('LNBits payment lookup failed', {
        status: response.status,
        paymentId: paymentId.slice(0, 16)
      });
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const paid = data['paid'] === true || data['status'] === 'paid';
    const pending = data['pending'] === true;

    // LNBits amount is typically millisats (can be negative for outgoing)
    let amountSats = 0;
    const amount = data['amount'];
    if (typeof amount === 'number') {
      amountSats = Math.abs(Math.round(amount / 1000));
    } else if (typeof data['amount_msat'] === 'number') {
      amountSats = Math.abs(Math.round((data['amount_msat'] as number) / 1000));
    }

    const paymentHash =
      (typeof data['payment_hash'] === 'string' && data['payment_hash']) ||
      paymentId;

    // Reject outgoing payments (extra_msats / checking_id patterns vary;
    // amount sign in LNBits: negative = outgoing)
    if (typeof amount === 'number' && amount < 0) {
      logger.warn('Rejecting outgoing payment for inbound verify', {
        paymentId: paymentId.slice(0, 16)
      });
      return { paid: false, paymentHash, amountSats: 0, pending: false, raw: data };
    }

    return {
      paid: paid && !pending,
      paymentHash,
      amountSats,
      pending,
      raw: data
    };
  } catch (error) {
    logger.error('Error verifying payment with LNBits:', error);
    return null;
  }
}

/** In-memory dedupe of processed inbound payment hashes (survives process lifetime). */
const processedPaymentHashes = new Set<string>();
const MAX_PROCESSED = 10_000;

export function claimPaymentHash(paymentHash: string): boolean {
  if (processedPaymentHashes.has(paymentHash)) {
    return false;
  }
  if (processedPaymentHashes.size >= MAX_PROCESSED) {
    // Drop oldest-ish by clearing half (Set iteration order is insertion order)
    const iter = processedPaymentHashes.values();
    for (let i = 0; i < MAX_PROCESSED / 2; i++) {
      const next = iter.next();
      if (next.done) break;
      processedPaymentHashes.delete(next.value);
    }
  }
  processedPaymentHashes.add(paymentHash);
  return true;
}

export function maxZapSats(): number {
  const raw = parseInt(process.env['MAX_ZAP_SATS'] || '1000000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1_000_000;
}
