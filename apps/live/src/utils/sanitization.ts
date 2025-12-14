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
      'a', 'br', 'img', 'video', 'div', 'iframe',
      'p', 'span', 'strong', 'em', 'u', 'b', 'i'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class', 'src', 'style',
      'controls', 'frameborder', 'allowfullscreen', 'alt',
      'data-pubkey', 'data-timestamp', 'data-amount', 'data-zap-id', 'data-chat-id'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i,
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

  // Handle relative URLs (starting with /)
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    // Parse the URL
    const parsed = new URL(trimmed);

    // Only allow safe protocols
    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }

    return trimmed;
  } catch {
    // If URL parsing fails, try to add https:// if it looks like a domain
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/.test(trimmed)) {
      try {
        const withProtocol = `https://${trimmed}`;
        const parsed = new URL(withProtocol);
        if (parsed.protocol === 'https:' && allowedProtocols.includes('https:')) {
          return withProtocol;
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
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  return sanitizeUrlInternal(url, ['http:', 'https:']);
}

/**
 * Escape HTML to prevent XSS (for plain text that should be displayed as text)
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
