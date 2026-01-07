// Storage utilities for live app
// Provides typed, error-handled access to localStorage and sessionStorage

import { LocalStorage, SessionStorage } from '@pubpay/shared-services';

// Create singleton instances with app-specific prefixes
export const appLocalStorage = new LocalStorage('pubpay_');
export const appSessionStorage = new SessionStorage('pubpay_session_');

