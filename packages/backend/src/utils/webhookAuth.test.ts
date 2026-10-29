import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Request } from 'express';
import {
  appendWebhookSecret,
  buildWebhookHeadersJson,
  buildWebhookUrl,
  getWebhookSecret,
  isValidPaymentId,
  verifyWebhookSecret
} from './webhookAuth.js';

function mockReq(partial: {
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}): Request {
  const headers = partial.headers || {};
  return {
    query: partial.query || {},
    header: (name: string) => {
      const key = Object.keys(headers).find(
        k => k.toLowerCase() === name.toLowerCase()
      );
      return key ? headers[key] : undefined;
    }
  } as unknown as Request;
}

describe('webhookAuth', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env['WEBHOOK_SECRET'] = 'test-secret-value';
    process.env['WEBHOOK_URL'] = 'https://example.com';
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('getWebhookSecret trims env', () => {
    process.env['WEBHOOK_SECRET'] = '  abc  ';
    expect(getWebhookSecret()).toBe('abc');
  });

  it('buildWebhookUrl omits secret by default', () => {
    expect(buildWebhookUrl('/lightning/webhook')).toBe(
      'https://example.com/lightning/webhook'
    );
  });

  it('buildWebhookUrl can append secret for core payments API', () => {
    expect(
      buildWebhookUrl('/nip05/webhook', { includeSecretInQuery: true })
    ).toBe('https://example.com/nip05/webhook?secret=test-secret-value');
  });

  it('appendWebhookSecret encodes query', () => {
    expect(appendWebhookSecret('https://x.test/hook')).toContain(
      'secret=test-secret-value'
    );
  });

  it('buildWebhookHeadersJson sends X-Webhook-Secret', () => {
    expect(JSON.parse(buildWebhookHeadersJson()!)).toEqual({
      'X-Webhook-Secret': 'test-secret-value'
    });
  });

  it('verifyWebhookSecret accepts header', () => {
    const r = verifyWebhookSecret(
      mockReq({ headers: { 'x-webhook-secret': 'test-secret-value' } })
    );
    expect(r.ok).toBe(true);
  });

  it('verifyWebhookSecret accepts query (legacy)', () => {
    const r = verifyWebhookSecret(
      mockReq({ query: { secret: 'test-secret-value' } })
    );
    expect(r.ok).toBe(true);
  });

  it('verifyWebhookSecret rejects wrong secret', () => {
    const r = verifyWebhookSecret(
      mockReq({ headers: { 'x-webhook-secret': 'nope' } })
    );
    expect(r.ok).toBe(false);
  });

  it('verifyWebhookSecret rejects in production when unset', () => {
    delete process.env['WEBHOOK_SECRET'];
    process.env['NODE_ENV'] = 'production';
    const r = verifyWebhookSecret(mockReq({}));
    expect(r.ok).toBe(false);
  });

  it('isValidPaymentId', () => {
    expect(isValidPaymentId('a'.repeat(32))).toBe(true);
    expect(isValidPaymentId('not-hex')).toBe(false);
  });
});
