// Application constants
export const RELAYS = [
    'wss://nostr.mom',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://nostr.bitcoiner.social',
    'wss://relay.snort.social',
    'wss://relay.damus.io',
    'wss://relay.nostr.band'
];
export const DEFAULT_STYLES = {
    textColor: '#000000',
    bgColor: '#ffffff',
    bgImage: '',
    qrInvert: false,
    qrScreenBlend: false,
    qrMultiplyBlend: false,
    qrShowWebLink: false,
    qrShowNevent: true,
    qrShowNote: false,
    layoutInvert: false,
    hideZapperContent: false,
    showTopZappers: false,
    podium: false,
    zapGrid: false,
    opacity: 1.0,
    textOpacity: 1.0,
    partnerLogo: ''
};
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
};
export const STORAGE_KEYS = {
    PUBLIC_KEY: 'publicKey',
    PRIVATE_KEY: 'privateKey',
    SIGN_IN_METHOD: 'signInMethod',
    STYLE_OPTIONS: 'styleOptions',
    LIGHTNING_CONFIG: 'lightningConfig'
};
export const API_ENDPOINTS = {
    LIGHTNING_ENABLE: '/lightning/enable',
    LIGHTNING_DISABLE: '/lightning/disable',
    LIGHTNING_WEBHOOK: '/lightning/webhook',
    LIGHTNING_DEBUG: '/lightning/debug/sessions'
};
export const ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error. Please check your connection.',
    INVALID_EVENT: 'Invalid event format.',
    PAYMENT_FAILED: 'Payment failed. Please try again.',
    AUTH_REQUIRED: 'Authentication required.',
    INVALID_AMOUNT: 'Invalid amount specified.',
    RELAY_CONNECTION_FAILED: 'Failed to connect to relay.',
    LIGHTNING_DISABLED: 'Lightning payments are disabled.'
};
export const SUCCESS_MESSAGES = {
    PAYMENT_SUCCESS: 'Payment successful!',
    EVENT_PUBLISHED: 'Event published successfully.',
    LIGHTNING_ENABLED: 'Lightning payments enabled.',
    LIGHTNING_DISABLED: 'Lightning payments disabled.',
    STYLES_APPLIED: 'Styles applied successfully.'
};
