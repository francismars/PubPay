// Shared utility for determining API base URL
// Use lazy initialization to cache the result after first evaluation
let cachedApiBase: string | null = null;

/**
 * Get the API base URL for backend requests.
 * Uses lazy initialization to cache the result after first evaluation.
 * 
 * Priority:
 * 1. Webpack-injected REACT_APP_BACKEND_URL environment variable
 * 2. window.location.origin (for production via Nginx proxy)
 * 3. http://localhost:3002 (development fallback)
 */
export const getApiBase = (): string => {
  // Return cached value if already computed
  if (cachedApiBase !== null) {
    return cachedApiBase;
  }

  // Check for Webpack-injected environment variable (process.env.REACT_APP_BACKEND_URL)
  // Webpack DefinePlugin injects process.env at build time
  if (typeof process !== 'undefined' && (process as any).env?.REACT_APP_BACKEND_URL) {
    cachedApiBase = (process as any).env.REACT_APP_BACKEND_URL;
    return cachedApiBase;
  }

  // In production, use same origin (Nginx proxies to backend)
  if (typeof window !== 'undefined') {
    // Check if we're in production (HTTPS or production domain)
    const isProduction =
      window.location.protocol === 'https:' ||
      window.location.hostname !== 'localhost';
    if (isProduction) {
      // Use same origin - Nginx will proxy to backend
      cachedApiBase = window.location.origin;
      return cachedApiBase;
    }
  }

  // Development fallback
  cachedApiBase = 'http://localhost:3002';
  return cachedApiBase;
};

