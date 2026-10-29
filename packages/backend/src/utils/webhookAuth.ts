import crypto from 'crypto';
import { Request } from 'express';

/**
 * Shared-secret auth for LNbits webhooks.
 *
 * Preferred (LNURLp): pass secret via webhook_headers as X-Webhook-Secret
 * so the URL stays clean (avoids nginx/access-log leakage of ?secret=).
 *
 * Fallback (core /api/v1/payments): LNbits only accepts a webhook URL string,
 * so the secret is appended as ?secret=… when includeSecretInQuery is true.
 *
 * Inbound verify accepts either query or X-Webhook-Secret header.
 */
export function getWebhookSecret(): string {
  return (process.env['WEBHOOK_SECRET'] || '').trim();
}

export function appendWebhookSecret(url: string): string {
  const secret = getWebhookSecret();
  if (!secret) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}secret=${encodeURIComponent(secret)}`;
}

/** JSON string for LNURLp `webhook_headers` field. Undefined if no secret. */
export function buildWebhookHeadersJson(): string | undefined {
  const secret = getWebhookSecret();
  if (!secret) return undefined;
  return JSON.stringify({ 'X-Webhook-Secret': secret });
}

/**
 * Build absolute webhook URL under WEBHOOK_URL.
 * @param options.includeSecretInQuery - only for APIs that cannot set custom
 *   headers (LNbits core invoice webhooks). Prefer false + webhook_headers.
 */
export function buildWebhookUrl(
  path: string,
  options: { includeSecretInQuery?: boolean } = {}
): string | undefined {
  const base = process.env['WEBHOOK_URL']?.trim().replace(/\/+$/, '') || '';
  if (!base) return undefined;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalizedPath}`;
  return options.includeSecretInQuery ? appendWebhookSecret(url) : url;
}

function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual on equal-length buffers to avoid leaking length via early return timing
    // when lengths differ; compare against a dummy of same length as a.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Returns true if the request presents a valid WEBHOOK_SECRET.
 * When WEBHOOK_SECRET is unset, rejects in production and warns in development.
 */
export function verifyWebhookSecret(req: Request): {
  ok: boolean;
  error?: string;
} {
  const expected = getWebhookSecret();
  if (!expected) {
    if (process.env['NODE_ENV'] === 'production') {
      return {
        ok: false,
        error: 'WEBHOOK_SECRET is not configured'
      };
    }
    // Dev without secret: allow but callers should still verify payment via API
    return { ok: true };
  }

  const fromQuery =
    typeof req.query?.['secret'] === 'string' ? req.query['secret'] : '';
  const fromHeader = req.header('x-webhook-secret') || '';
  // Prefer header (cleaner logs); fall back to query for legacy links / core invoices
  const provided = fromHeader || fromQuery;

  if (!provided || !secretsEqual(provided, expected)) {
    return { ok: false, error: 'Invalid webhook secret' };
  }
  return { ok: true };
}

/** Hex payment hashes / checking ids from LNBits */
export function isValidPaymentId(id: string): boolean {
  return /^[0-9a-fA-F]{32,128}$/.test(id);
}
