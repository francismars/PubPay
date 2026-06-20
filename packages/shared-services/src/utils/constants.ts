// Application constants

/** Deduplicate relay URL lists while preserving order. */
export function uniqueRelays(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

// Default relays for reading (fetching events)
export const DEFAULT_READ_RELAYS = [
  'wss://nostr.mom',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.damus.io'
];

// Default relays for writing (publishing events)
export const DEFAULT_WRITE_RELAYS = [
  'wss://nostr.mom',
  'wss://relay.primal.net',
  'wss://relay.damus.io'
];

/** PubPay Live: notes, profiles, live events (kind 0/1/30311). */
export const LIVE_CONTENT_RELAYS = uniqueRelays([
  ...DEFAULT_READ_RELAYS,
  'wss://relay.snort.social'
]);

/**
 * PubPay Live: indexers where zap wallets commonly publish kind-9735 receipts.
 * Kept separate from content relays — zaps often land here, not on the author's outbox.
 */
export const LIVE_ZAP_INDEX_RELAYS = [
  'wss://relay.primal.net',
  'wss://premium.primal.net',
  'wss://relay.zapstore.dev',
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.nostr.net',
  'wss://nostr.mom'
];

/** PubPay Live: union used for kind-9735 subscriptions and batch zap fetches. */
export const LIVE_ZAP_RELAYS = uniqueRelays(
  LIVE_CONTENT_RELAYS,
  LIVE_ZAP_INDEX_RELAYS
);

// Legacy constant: union of all default relays (for backward compatibility)
export const RELAYS = [
  ...new Set([...DEFAULT_READ_RELAYS, ...DEFAULT_WRITE_RELAYS])
];

// Re-export DEFAULT_STYLES from shared-utils to avoid duplication
export { DEFAULT_STYLES } from '@pubpay/shared-utils';

export const ZAP_AMOUNTS = {
  MIN: 1,
  MAX: 1000000,
  DEFAULT: 100
};

// Total Bitcoin supply: 21 million BTC = 2,100,000,000,000,000 sats
export const GOAL_MAX = 2100000000000000;

export const EVENT_KINDS = {
  PROFILE: 0,
  NOTE: 1,
  ZAP_RECEIPT: 9735,
  LIVE_EVENT: 30311
} as const;

export const STORAGE_KEYS = {
  PUBLIC_KEY: 'publicKey',
  PRIVATE_KEY: 'privateKey',
  SIGN_IN_METHOD: 'signInMethod',
  STYLE_OPTIONS: 'styleOptions',
  LIGHTNING_CONFIG: 'lightningConfig'
} as const;

export const API_ENDPOINTS = {
  LIGHTNING_ENABLE: '/lightning/enable',
  LIGHTNING_DISABLE: '/lightning/disable',
  LIGHTNING_WEBHOOK: '/lightning/webhook',
  LIGHTNING_DEBUG: '/lightning/debug/sessions'
} as const;

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  INVALID_EVENT: 'Invalid event format.',
  PAYMENT_FAILED: 'Payment failed. Please try again.',
  AUTH_REQUIRED: 'Authentication required.',
  INVALID_AMOUNT: 'Invalid amount specified.',
  RELAY_CONNECTION_FAILED: 'Failed to connect to relay.',
  LIGHTNING_DISABLED: 'Lightning payments are disabled.'
} as const;

export const SUCCESS_MESSAGES = {
  PAYMENT_SUCCESS: 'Payment successful!',
  EVENT_PUBLISHED: 'Event published successfully.',
  LIGHTNING_ENABLED: 'Lightning payments enabled.',
  LIGHTNING_DISABLED: 'Lightning payments disabled.',
  STYLES_APPLIED: 'Styles applied successfully.'
} as const;
