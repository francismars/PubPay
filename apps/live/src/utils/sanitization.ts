/**
 * Sanitization utilities for the live app
 * Prevents XSS attacks by sanitizing HTML and validating URLs
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows safe HTML tags and attributes needed for formatting
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a',
      'br',
      'img',
      'video',
      'div',
      'p',
      'span',
      'strong',
      'em',
      'u',
      'b',
      'i'
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'class',
      'src',
      'style',
      'controls',
      'alt',
      'data-pubkey',
      'data-timestamp',
      'data-amount',
      'data-zap-id',
      'data-chat-id'
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false
  });
}

/**
 * Sanitize URL to prevent XSS attacks via javascript: and other dangerous protocols
 * Only allows http, https, and lightning protocols
 */
/**
 * Internal helper to validate and sanitize URLs with configurable allowed protocols
 */
function sanitizeUrlInternal(
  url: string | null | undefined,
  allowedProtocols: string[]
): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // Reject protocol-relative URLs (//host, /\host) - browsers treat them as absolute
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }

  // Handle relative URLs (starting with /). Reject control chars / backslashes
  // that browsers may normalize into a different host.
  if (trimmed.startsWith('/')) {
    // eslint-disable-next-line no-control-regex
    if (/[\\\u0000-\u001f\u007f]/.test(trimmed)) return null;
    return trimmed;
  }

  try {
    // Parse the URL
    const parsed = new URL(trimmed);

    // Only allow safe protocols
    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }

    // Return the normalized href, not the raw input
    return parsed.href;
  } catch {
    // If URL parsing fails, try to add https:// if it looks like a domain
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed)) {
      try {
        const withProtocol = `https://${trimmed}`;
        const parsed = new URL(withProtocol);
        if (
          parsed.protocol === 'https:' &&
          allowedProtocols.includes('https:')
        ) {
          return parsed.href;
        }
      } catch {
        // Invalid even with https://
      }
    }

    return null;
  }
}

export function sanitizeUrl(url: string | null | undefined): string | null {
  return sanitizeUrlInternal(url, ['http:', 'https:', 'lightning:']);
}

/**
 * Sanitize image URL to prevent XSS attacks
 * Only allows http, https protocols (no data: or javascript:)
 */
export function sanitizeImageUrl(
  url: string | null | undefined
): string | null {
  return sanitizeUrlInternal(url, ['http:', 'https:']);
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Escape HTML to prevent XSS (for plain text that should be displayed as text)
 * Escapes & < > " ' so it is safe in both text and quoted-attribute contexts.
 */
export function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[&<>"']/g, ch => HTML_ENTITY_MAP[ch]);
}

/**
 * Escape a value for use inside an HTML attribute (single- or double-quoted).
 */
export function escapeAttr(text: string): string {
  return String(text ?? '').replace(/[&<>"'`]/g, ch =>
    ch === '`' ? '&#96;' : HTML_ENTITY_MAP[ch]
  );
}
