import crypto from 'crypto';
import { Request } from 'express';

/**
 * Shared-secret auth for LNBits webhooks.
 * Secret is appended as ?secret=… when registering webhook URLs with LNBits,
 * and must match WEBHOOK_SECRET on inbound requests.
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

export function buildWebhookUrl(path: string): string | undefined {
  const base = process.env['WEBHOOK_URL']?.trim().replace(/\/+$/, '') || '';
  if (!base) return undefined;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return appendWebhookSecret(`${base}${normalizedPath}`);
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
  const provided = fromQuery || fromHeader;

  if (!provided || !secretsEqual(provided, expected)) {
    return { ok: false, error: 'Invalid webhook secret' };
  }
  return { ok: true };
}

/** Hex payment hashes / checking ids from LNBits */
export function isValidPaymentId(id: string): boolean {
  return /^[0-9a-fA-F]{32,128}$/.test(id);
}
