// Shared utility for determining API base URL
// Use lazy initialization to cache the result after first evaluation
import { API, PROTOCOLS } from '../constants';

let cachedApiBase: string | null = null;

/**
 * Get the API base URL for backend requests.
 * Uses lazy initialization to cache the result after first evaluation.
 *
 * Priority:
 * 1. Webpack-injected REACT_APP_API_BASE_URL environment variable
 * 2. Webpack-injected REACT_APP_BACKEND_URL environment variable (fallback)
 * 3. window.location.origin (for production via Nginx proxy)
 * 4. http://localhost:3002 (development fallback)
 */
export const getApiBase = (): string => {
  // Return cached value if already computed
  if (cachedApiBase !== null) {
    return cachedApiBase;
  }

  let result: string;

  // Check for Webpack-injected environment variables (process.env.REACT_APP_*)
  // Webpack DefinePlugin injects process.env at build time
  const envApiBaseUrl =
    typeof process !== 'undefined'
      ? (process as any).env?.REACT_APP_API_BASE_URL
      : undefined;
  const envBackendUrl =
    typeof process !== 'undefined'
      ? (process as any).env?.REACT_APP_BACKEND_URL
      : undefined;

  if (envApiBaseUrl && typeof envApiBaseUrl === 'string') {
    result = envApiBaseUrl;
  } else if (envBackendUrl && typeof envBackendUrl === 'string') {
    result = envBackendUrl;
  } else if (typeof window !== 'undefined') {
    // In production, use same origin (Nginx proxies to backend)
    // Check if we're in production (HTTPS or production domain)
    const isProduction =
      window.location.protocol === 'https:' ||
      window.location.hostname !== 'localhost';
    if (isProduction) {
      // Use same origin - Nginx will proxy to backend
      result = window.location.origin;
    } else {
      // Development fallback
      result = `${PROTOCOLS.HTTP}localhost:${API.BACKEND_PORT}`;
    }
  } else {
    // Fallback when window is not available
    result = `${PROTOCOLS.HTTP}localhost:${API.BACKEND_PORT}`;
  }

  // Normalize to remove trailing slash
  result = result.replace(/\/$/, '');

  // Cache and return
  cachedApiBase = result;
  return result;
};

