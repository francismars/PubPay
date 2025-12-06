/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// ============================================================================
// Toast & Notification Durations (milliseconds)
// ============================================================================
export const TOAST_DURATION = {
  SHORT: 2000, // 2 seconds - for quick success/info messages
  MEDIUM: 3000, // 3 seconds - for warnings or important info
  LONG: 4000 // 4 seconds - for errors that need more attention
} as const;

// Service worker update notification auto-hide duration
export const SW_UPDATE_NOTIFICATION_DURATION = 10000; // 10 seconds

// ============================================================================
// Timeouts & Delays (milliseconds)
// ============================================================================
export const TIMEOUT = {
  // Payment & Network
  PAYMENT_RESPONSE: 45000, // 45 seconds - max wait for payment response
  BALANCE_REFRESH: 30000, // 30 seconds - balance refresh interval

  // UI Delays
  SHORT_DELAY: 100, // 100ms - small delays for UI updates
  MEDIUM_DELAY: 500, // 500ms - medium delays for async operations
  LONG_DELAY: 1000, // 1 second - longer delays for state synchronization
  PROFILE_LOAD_DELAY: 1000, // 1 second - delay after profile operations

  // Animation & Transitions
  ANIMATION_SHORT: 300, // 300ms - short animations
  ANIMATION_MEDIUM: 600, // 600ms - medium animations (e.g., zap animation)

  // User Interaction
  LONG_PRESS: 500, // 500ms - long press detection threshold
  DEBOUNCE: 200 // 200ms - debounce delay for input handlers
} as const;

// ============================================================================
// Intervals (milliseconds)
// ============================================================================
export const INTERVAL = {
  CLIENT_RELOAD: 1000, // 1 second - NWC client reload check
  BALANCE_REFRESH: 30000, // 30 seconds - balance refresh
  TIME_UPDATE: 60000 // 60 seconds - time display update (e.g., "5m ago")
} as const;

// ============================================================================
// Lightning Network Constants
// ============================================================================
export const LIGHTNING = {
  // Millisats to Sats conversion
  MILLISATS_PER_SAT: 1000,

  // Invoice expiry buffer (seconds)
  INVOICE_EXPIRY_BUFFER: 60 // 1 minute buffer before considering expired
} as const;

// ============================================================================
// Color Constants
// ============================================================================
export const COLORS = {
  // Primary brand colors
  PRIMARY: '#4a75ff', // Primary blue
  PRIMARY_HOVER: '#3d62e0', // Blue hover state
  PRIMARY_ACTIVE: '#3b5bdb', // Blue active state
  PRIMARY_DARK: '#2c4bc7', // Darker blue variant
  PRIMARY_ALT: '#4b90ff', // Alternate blue

  // Error states
  ERROR: '#ef4444', // Red-500
  ERROR_DARK: '#dc2626', // Red-600
  ERROR_ALT: '#dc3545', // Alternative red

  // Success states
  SUCCESS: '#22c55e', // Green-500
  SUCCESS_ALT: '#4CAF50', // Alternative green (used in notifications)

  // Warning/Status colors
  WARNING: '#f59e0b', // Amber/Warning
  WARNING_BG: '#fef3c7', // Warning background
  WARNING_TEXT: '#92400e', // Warning text
  PENDING: '#fbbf24', // Yellow/Pending

  // Text colors
  TEXT_PRIMARY: '#333333', // Dark text
  TEXT_SECONDARY: '#6b7280', // Gray-500
  TEXT_TERTIARY: '#374151', // Gray-700
  TEXT_LIGHT: '#666666', // Light gray text
  TEXT_WHITE: '#ffffff', // White text

  // Background colors
  BG_LIGHT: '#f9fafb', // Light background
  BG_HOVER: '#f0f0f0', // Hover background
  BG_DISABLED: '#9ca3af', // Disabled state gray
  BG_WHITE: '#ffffff', // White background

  // Border colors
  BORDER: '#e5e7eb', // Default border
  BORDER_LIGHT: '#e9ecef', // Light border

  // Additional grays
  GRAY_LIGHT: '#cccccc', // Light gray for disabled states
  GRAY_MEDIUM: '#9ca3af' // Medium gray
} as const;

// ============================================================================
// Z-Index Layers
// ============================================================================
export const Z_INDEX = {
  MODAL: 1000,
  MODAL_OVERLAY: 100001, // NWC modal overlay
  DROPDOWN: 1000,
  TOAST: 10000
} as const;

// ============================================================================
// Retry & Limit Constants
// ============================================================================
export const RETRY = {
  CLIPBOARD_READ_ATTEMPTS: 10, // Number of attempts to read clipboard
  CLIPBOARD_READ_DELAY: 100 // Delay between clipboard read attempts (ms)
} as const;

export const LIMITS = {
  // Nostr query limits
  ZAP_QUERY_LIMIT: 5000,
  POST_QUERY_LIMIT: 100,

  // UI limits
  VISIBLE_TRANSACTIONS: 5 // Initial visible transactions count
} as const;

// ============================================================================
// Time Conversion Constants
// ============================================================================
export const TIME = {
  SECONDS_PER_MINUTE: 60,
  SECONDS_PER_HOUR: 3600,
  SECONDS_PER_DAY: 86400,
  MILLISECONDS_PER_SECOND: 1000,
  MILLISECONDS_PER_MINUTE: 60000,
  MILLISECONDS_PER_HOUR: 3600000,
  MILLISECONDS_PER_DAY: 86400000
} as const;

// ============================================================================
// API & Network Constants
// ============================================================================
export const API = {
  // Default ports (for development)
  BACKEND_PORT: 3002,
  LIVE_APP_PORT: 3001
} as const;

// ============================================================================
// UI Constants
// ============================================================================
export const UI = {
  // Input focus delay (for modals/overlays)
  FOCUS_DELAY: 100, // ms

  // Mention suggestions hide delay
  MENTION_HIDE_DELAY: 300, // ms

  // Tooltip show/hide delays
  TOOLTIP_SHOW_DELAY: 200, // ms
  TOOLTIP_HIDE_DELAY: 2000 // ms
} as const;

// ============================================================================
// Storage Keys
// ============================================================================
export const STORAGE_KEYS = {
  // Relay configuration
  CUSTOM_RELAYS: 'customRelays',

  // UI preferences
  DARK_MODE: 'darkMode',

  // External signer session storage
  SIGN_KIND1: 'SignKind1',
  SIGN_ZAP_EVENT: 'SignZapEvent',
  SIGN_PROFILE_UPDATE: 'SignProfileUpdate',

  // Blossom integration
  BLOSSOM_AUTH: 'BlossomAuth',
  BLOSSOM_UPLOAD_TYPE: 'BlossomUploadType',

  // Authentication
  PRIVATE_KEY: 'privateKey',

  // NWC (Nostr Wallet Connect)
  NWC_ACTIVE_CONNECTION_ID: 'nwcActiveConnectionId',
  NWC_CONNECTIONS: 'nwcConnections',
  NWC_CONNECTION_STRING: 'nwcConnectionString',
  NWC_CAPABILITIES: 'nwcCapabilities',
  NWC_AUTO_PAY: 'nwcAutoPay',
  CLEAR_NWC_ON_LOGOUT: 'clearNwcOnLogout',

  // QR Scanner
  QR_CAMERA_ID: 'qrCameraId',

  // Scanned data (temporary session storage)
  SCANNED_INVOICE: 'scannedInvoice',
  SCANNED_LIGHTNING_ADDRESS: 'scannedLightningAddress'
} as const;

// ============================================================================
// API Paths & Protocols
// ============================================================================
export const API_PATHS = {
  // NIP-05 validation
  NIP05_WELL_KNOWN: '/.well-known/nostr.json',

  // Lightning Address
  LNURLP_WELL_KNOWN: '/.well-known/lnurlp/'
} as const;

export const PROTOCOLS = {
  // Nostr Wallet Connect
  NWC: 'nostrnwc://',

  // WebSocket
  WS: 'ws://',
  WSS: 'wss://',

  // HTTP
  HTTP: 'http://',
  HTTPS: 'https://'
} as const;

export const CONTENT_TYPES = {
  NOSTR_JSON: 'application/nostr+json'
} as const;

// ============================================================================
// Query & Limit Constants
// ============================================================================
export const QUERY_LIMITS = {
  // Default post loading
  DEFAULT_POSTS: 21,

  // Batch processing
  BATCH_SIZE: 100,
  BATCH_MULTIPLIER: 1.5, // 50% buffer for deduplication

  // Profile queries
  PROFILE_QUERY_LIMIT: 500,

  // Transaction queries
  TRANSACTION_LIST_LIMIT: 20
} as const;

// ============================================================================
// UI Dimensions
// ============================================================================
export const DIMENSIONS = {
  // Content widths
  MAX_CONTENT_WIDTH: '800px',

  // Image sizes
  AVATAR_SIZE: '80px',
  BANNER_WIDTH: '200px',
  BANNER_HEIGHT: '80px',
  QR_CODE_WIDTH: '280px',
  QR_CODE_HEIGHT: '280px',

  // Border radius
  RADIUS_CIRCLE: '50%',
  RADIUS_SMALL: '4px',
  RADIUS_MEDIUM: '6px'
} as const;

export const FONT_SIZES = {
  XS: '12px',
  SM: '14px',
  MD: '16px',
  LG: '18px',
  XL: '24px'
} as const;

export const SPACING = {
  XS: '4px',
  SM: '8px',
  MD: '10px',
  LG: '15px',
  XL: '20px',
  XXL: '30px'
} as const;

// ============================================================================
// HTTP Constants
// ============================================================================
export const HTTP = {
  METHODS: {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE'
  },
  STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
  }
} as const;

// ============================================================================
// String Separators
// ============================================================================
export const SEPARATORS = {
  LIGHTNING_ADDRESS: '@', // Used for lightning addresses and NIP-05
  PATH: '/'
} as const;

