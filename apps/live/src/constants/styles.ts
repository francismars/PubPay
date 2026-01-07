// Live app specific style constants
// Extends shared DEFAULT_STYLES with live-specific properties

import { DEFAULT_STYLES as SHARED_DEFAULT_STYLES } from '@pubpay/shared-utils';

/**
 * Default styles for the live app
 * Extends shared defaults with live-specific properties
 */
export const DEFAULT_STYLES = {
  ...SHARED_DEFAULT_STYLES,
  // Live-specific additions
  sectionLabels: false, // Default to hiding section labels
  qrOnly: false, // Default to showing full layout
  showFiat: false, // Default to hiding fiat amounts
  showHistoricalPrice: false, // Default to hiding historical prices
  showHistoricalChange: false, // Default to hiding historical change percentage
  fiatOnly: false, // Default to showing sats amounts
  lightning: false,
  selectedCurrency: 'USD' as const
} as const;

