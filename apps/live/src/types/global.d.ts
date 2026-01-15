/**
 * Global Type Definitions
 * Extends Window interface and defines types for third-party libraries
 */

import { Kind0Event, Kind30311Event } from '@pubpay/shared-types';

/**
 * Processed zap data structure
 */
export interface ProcessedZapData {
  e?: string;
  p?: string;
  amount: number;
  picture: string;
  npubPayer: string;
  pubKey: string;
  zapEventID: string;
  kind9735content: string;
  kind1Name: string;
  kind0Profile: Record<string, unknown> | null;
  created_at: number;
  timestamp: number;
  id: string;
}

/**
 * Live event info stored in window
 */
export interface LiveEventInfo {
  pubkey: string;
  identifier: string;
  kind: number;
}

/**
 * Reconnection attempts tracking
 */
export interface ReconnectionAttempts {
  event: number;
  chat: number;
  zaps: number;
}

/**
 * Profiles map stored in window
 */
export interface ProfilesMap {
  [pubkey: string]: Kind0Event;
}

/**
 * Swiper.js type definitions (minimal)
 */
export interface SwiperOptions {
  slidesPerView?: number | 'auto';
  spaceBetween?: number;
  loop?: boolean;
  autoplay?: {
    delay?: number;
    disableOnInteraction?: boolean;
  };
  pagination?: {
    el?: string;
    clickable?: boolean;
  };
  navigation?: {
    nextEl?: string;
    prevEl?: string;
  };
  [key: string]: unknown;
}

export interface SwiperInstance {
  slideNext(): void;
  slidePrev(): void;
  slideTo(index: number): void;
  update(): void;
  destroy(): void;
  [key: string]: unknown;
}

export interface SwiperConstructor {
  new (container: string | HTMLElement, options?: SwiperOptions): SwiperInstance;
  isSupported(): boolean;
}

/**
 * HLS.js type definitions (minimal)
 */
export interface HlsConfig {
  enableWorker?: boolean;
  lowLatencyMode?: boolean;
  maxBufferLength?: number;
  maxMaxBufferLength?: number;
  liveSyncDurationCount?: number;
  liveMaxLatencyDurationCount?: number;
  [key: string]: unknown;
}

export interface HlsError {
  fatal?: boolean;
  type?: string;
  details?: string;
  [key: string]: unknown;
}

export interface HlsInstance {
  loadSource(source: string): void;
  attachMedia(media: HTMLVideoElement): void;
  on(event: string, callback: (event: unknown, data: unknown) => void): void;
  destroy(): void;
  [key: string]: unknown;
}

export interface HlsEvents {
  MANIFEST_PARSED: string;
  ERROR: string;
  [key: string]: string;
}

export interface HlsConstructor {
  new (config?: HlsConfig): HlsInstance;
  Events: HlsEvents;
  isSupported(): boolean;
}

/**
 * Extended Window interface with global state
 */
declare global {
  interface Window {
    // Swiper.js
    Swiper?: SwiperConstructor;
    
    // HLS.js
    Hls?: HlsConstructor;
    
    // Global state
    profiles?: ProfilesMap;
    zaps?: ProcessedZapData[];
    currentLiveEvent?: Kind30311Event;
    currentEventType?: 'live-event' | 'note' | 'profile';
    currentLiveEventInfo?: LiveEventInfo;
    reconnectionAttempts?: ReconnectionAttempts;
    
    // Global functions
    setupStyleOptions?: () => void;
    organizeZapsHierarchically?: () => void;
    cleanupHierarchicalOrganization?: () => void;
    updateQRSlideVisibility?: (skipUrlUpdate?: boolean) => void;
    refreshBitcoinPrices?: () => void;
    startLivePriceUpdates?: () => void;
    stopLivePriceUpdates?: () => void;
    recalculateTotalZaps?: () => void;
    updateFiatAmounts?: () => void;
    cleanupLiveVideoPlayer?: () => void;
    
    // Lightning-related
    frontendSessionId?: string | null;
    lightningQRSlide?: string | null;
    lightningEnabled?: boolean;
    
    // Grid organization
    gridPeriodicCheckInterval?: NodeJS.Timeout | null;
  }
}

export {};
