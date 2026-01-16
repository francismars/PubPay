/**
 * useLiveFunctionality Hook
 *
 * Main hook for managing live event functionality including:
 * - Nostr event subscriptions (live events, chat, zaps, profiles)
 * - Content rendering (notes, profiles, live events, chat messages)
 * - Video player management
 * - Zap handling and display
 * - Fiat conversion
 * - Style management
 * - QR code generation
 * - Lightning payment integration
 *
 * @param eventId - Optional event ID to load on mount
 * @returns Hook state and functions for managing live functionality
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
import { useQRCode } from './useQRCode';
import { useLightningIntegration } from './useLightningIntegration';
import { useZapHandling } from './useZapHandling';
import { useStyleManagement } from './useStyleManagement';
import { useFiatConversion } from './useFiatConversion';
import { useNostrSubscriptions } from './useNostrSubscriptions';
import { useContentRendering } from './useContentRendering';
import { useVideoPlayer } from './useVideoPlayer';
// Zap handling imports removed - now using useZapHandling hook
import {
  DEFAULT_READ_RELAYS,
  NostrClient,
  EVENT_KINDS,
  extractZapAmount,
  extractZapPayerPubkey,
  extractZapContent,
  ProcessedZap as SharedProcessedZap,
  BitcoinPriceService,
  LiveEventService
} from '@pubpay/shared-services';
import {
  Kind0Event,
  Kind1Event,
  Kind9735Event,
  Kind30311Event,
  NostrEvent,
  NostrFilter
} from '@pubpay/shared-types';
import {
  sanitizeHTML,
  sanitizeImageUrl,
  sanitizeUrl,
  escapeHtml
} from '../utils/sanitization';
import { DEFAULT_STYLES } from '../constants/styles';
import { appLocalStorage } from '../utils/storage';
import {
  validateNoteId,
  stripNostrPrefix,
  parseEventId
} from '../utils/eventIdParser';
import {
  getElementById,
  querySelector,
  querySelectorAll,
  showElement,
  hideElement,
  showError as showErrorHelper,
  hideError as hideErrorHelper,
  showLoadingState as showElementLoadingState,
  hideLoadingState,
  createElement,
  setTextContent,
  appendChild,
  addClass,
  removeClass
} from '../utils/domHelpers';
import {
  handleError,
  handleErrorSilently,
  parsingErrorHandler,
  subscriptionErrorHandler,
  logger,
  ErrorCategory,
  ErrorSeverity
} from '../utils/errorHandling';

// Flag to prevent multiple simultaneous calls to setupNoteLoaderListeners
let setupNoteLoaderListenersInProgress = false;

// Timeout constants
const SUBSCRIPTION_TIMEOUT = 30000; // 30 seconds
const ZAP_SUBSCRIPTION_TIMEOUT = 15000; // 15 seconds
const KIND1_SUBSCRIPTION_TIMEOUT = 10000; // 10 seconds
const PROFILE_FETCH_TIMEOUT = 2000; // 2 seconds
const RECONNECT_BASE_DELAY = 5000; // 5 seconds
const CONTENT_MONITOR_INTERVAL = 10000; // 10 seconds
const MAX_RECONNECT_ATTEMPTS = 3;

// ProcessedZapData is now imported from types/global.d.ts
import type { ProcessedZapData } from '../types/global';

export const useLiveFunctionality = (eventId?: string) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>('Author');
  const [authorImage, setAuthorImage] = useState<string>(
    '/live/images/gradient_color.gif'
  );
  const [authorNip05, setAuthorNip05] = useState<string>('');
  const [authorLud16, setAuthorLud16] = useState<string>('');

  // Track if user wants to see top zappers (even before data is available)
  const [userWantsTopZappers, setUserWantsTopZappers] = useState(false);

  const _liveDisplayRef = useRef<HTMLElement | null>(null);

  // Initialize NostrClient - replaces window.pool
  const nostrClient = useMemo(() => new NostrClient(DEFAULT_READ_RELAYS), []);

  // Initialize BitcoinPriceService
  const bitcoinPriceService = useMemo(() => new BitcoinPriceService(), []);

  // Initialize LiveEventService
  const liveEventService = useMemo(() => new LiveEventService(), []);

  // Initialize Fiat Conversion hook
  const {
    selectedCurrency,
    setSelectedCurrency,
    satsToFiat,
    satsToFiatWithHistorical,
    updateFiatAmounts,
    debouncedUpdateFiatAmounts,
    hideFiatAmounts,
    restoreSatoshiAmounts,
    addMissingTimestamps,
    setHistoricalPriceLoading
  } = useFiatConversion({
    bitcoinPriceService,
    defaultCurrency: 'USD',
    debounceMs: 500
  });

  // Define callback functions that will be used by subscriptions
  // These need to be defined before useNostrSubscriptions
  const displayLiveEventRef = useRef<
    ((liveEvent: Kind30311Event) => void) | null
  >(null);
  const displayLiveChatMessageRef = useRef<
    ((chatMessage: NostrEvent) => void) | null
  >(null);
  const updateProfileRef = useRef<((profile: Kind0Event) => void) | null>(null);
  const updateLiveEventHostProfileRef = useRef<
    ((profile: Kind0Event) => void) | null
  >(null);
  const drawKind1Ref = useRef<((kind1: Kind1Event) => Promise<void>) | null>(
    null
  );
  const drawKind0Ref = useRef<((kind0: Kind0Event) => void) | null>(null);
  const drawKinds9735Ref = useRef<((zaps: ProcessedZapData[]) => void) | null>(
    null
  );

  // Persistent zap list that accumulates over time (like legacy)
  let json9735List: ProcessedZapData[] = [];
  let processedZapIDs = new Set<string>(); // Track processed zap IDs to prevent duplicates

  // Function to reset zap list when starting a new note/event
  const resetZapList = useCallback(() => {
    json9735List = [];
    processedZapIDs = new Set<string>();
    // Reset initial zaps loaded flag for new event
    // initialZapsLoadedRef and pendingZapNotificationsRef are now managed by useZapHandling hook
    // The hook will handle this automatically
  }, []);

  // QR code functionality
  const {
    generateQRCode,
    generateLiveEventQRCodes,
    initializeQRCodePlaceholders,
    initializeQRSwiper
  } = useQRCode();

  // Refs for callbacks that are defined later
  const subscribeChatAuthorProfileRef = useRef<
    ((pubkey: string) => void) | null
  >(null);
  const updateLiveEventZapTotalRef = useRef<(() => void) | null>(null);
  const organizeZapsHierarchicallyRef = useRef<(() => void) | null>(null);
  // Fiat conversion is now handled by useFiatConversion hook
  const cleanupHierarchicalOrganizationRef = useRef<(() => void) | null>(null);
  const updateQRSlideVisibilityRef = useRef<
    ((skipUrlUpdate?: boolean) => void) | null
  >(null);

  // Zap handling functionality
  const {
    zaps,
    totalZaps,
    totalAmount,
    topZappers,
    zapNotification,
    processLiveEventZap,
    calculateTopZappersFromZaps,
    updateProfile: updateZapProfile,
    resetZapperTotals: resetZapperTotalsFromHook,
    markInitialZapsLoaded,
    setZapNotification,
    setZaps,
    storePendingZapNotification
  } = useZapHandling({
    onSubscribeProfile: (pubkey: string) => {
      if (subscribeChatAuthorProfileRef.current) {
        subscribeChatAuthorProfileRef.current(pubkey);
      }
    },
    onUpdateZapTotal: () => {
      if (updateLiveEventZapTotalRef.current) {
        updateLiveEventZapTotalRef.current();
      }
    },
    onOrganizeZaps: () => {
      if (organizeZapsHierarchicallyRef.current) {
        organizeZapsHierarchicallyRef.current();
      }
    },
    onUpdateFiatAmounts: () => {
      debouncedUpdateFiatAmounts();
    }
  });

  // Lightning integration
  // Note: updateBlendMode callback will be set up after it's defined
  const updateBlendModeRef = useRef<(() => void) | null>(null);

  const {
    lightningEnabled,
    initializeLightning,
    handleLightningToggle: handleLightningToggleFromHook
  } = useLightningIntegration({
    eventId,
    onUpdateBlendMode: () => {
      // Call updateBlendMode if it's available
      if (updateBlendModeRef.current) {
        updateBlendModeRef.current();
      }
    }
  });

  // Style management functionality
  const {
    resetToDefaults,
    updateStyleURL,
    applyStylesFromURL,
    copyStyleUrl,
    applyPreset,
    applyAllStyles,
    saveCurrentStylesToLocalStorage,
    updateBlendMode: updateBlendModeFromHook,
    updateBackgroundImage,
    toHexColor,
    hexToRgba
  } = useStyleManagement({
    lightningEnabled,
    onOrganizeZaps: () => {
      if (organizeZapsHierarchicallyRef.current) {
        organizeZapsHierarchicallyRef.current();
      }
    },
    onCleanupHierarchicalOrganization: () => {
      if (cleanupHierarchicalOrganizationRef.current) {
        cleanupHierarchicalOrganizationRef.current();
      }
    },
    onUpdateQRSlideVisibility: (skipUrlUpdate?: boolean) => {
      if (updateQRSlideVisibilityRef.current) {
        updateQRSlideVisibilityRef.current(skipUrlUpdate);
      }
    },
    onInitializeQRCodePlaceholders: (eventIdParam?: string) =>
      initializeQRCodePlaceholders(eventIdParam || eventId)
  });

  // Store updateBlendMode ref so Lightning hook can call it
  useEffect(() => {
    updateBlendModeRef.current = updateBlendModeFromHook;
  }, [updateBlendModeFromHook]);

  // Initialize Nostr Subscriptions hook
  const {
    subscribeLiveEvent,
    subscribeLiveChat,
    subscribeLiveEventZaps,
    subscribeLiveEventParticipants,
    subscribeChatAuthorProfile,
    subscribeLiveEventHostProfile,
    subscribeKind1,
    subscribeKind0fromKind1,
    subscribeKind9735fromKind1,
    subscribeKind0fromKinds9735
  } = useNostrSubscriptions({
    nostrClient,
    liveEventService,
    onLiveEvent: (liveEvent: Kind30311Event) => {
      // Call the function via ref - it will be set when the function is first called
      // For now, we'll call it directly if the ref is set, otherwise we'll queue it
      const callback = displayLiveEventRef.current;
      if (callback) {
        callback(liveEvent);
      } else {
        // If ref not set yet, set it and call immediately
        // This handles the case where the function hasn't been defined yet
        logger.warn(
          'displayLiveEventRef not set yet, event will be lost',
          ErrorCategory.RENDERING
        );
      }
    },
    onLiveChatMessage: (chatMessage: NostrEvent) => {
      const callback = displayLiveChatMessageRef.current;
      if (callback) {
        callback(chatMessage);
      } else {
        logger.warn(
          'displayLiveChatMessageRef not set yet, message will be lost',
          ErrorCategory.RENDERING
        );
      }
    },
    onLiveEventZap: (
      zap: Kind9735Event,
      pubkey: string,
      identifier: string
    ) => {
      processLiveEventZap(zap, pubkey, identifier);
    },
    onProfileUpdate: (profile: Kind0Event) => {
      const callback = updateProfileRef.current;
      if (callback) {
        callback(profile);
      }
    },
    onZapProfileUpdate: (profile: Kind0Event) => {
      updateZapProfile(profile);
      const callback = updateProfileRef.current;
      if (callback) {
        callback(profile);
      }
    },
    onLiveEventHostProfileUpdate: (profile: Kind0Event) => {
      const callback = updateLiveEventHostProfileRef.current;
      if (callback) {
        callback(profile);
      }
    },
    onKind1Event: async (kind1: Kind1Event) => {
      const callback = drawKind1Ref.current;
      if (callback) {
        await callback(kind1);
      } else {
        logger.warn(
          'drawKind1Ref not set yet - function may not be defined',
          ErrorCategory.RENDERING
        );
        setTimeout(async () => {
          if (drawKind1Ref.current) {
            await drawKind1Ref.current(kind1);
          }
        }, 0);
      }
      await subscribeKind0fromKind1(kind1);
      await subscribeKind9735fromKind1(kind1);
    },
    onKind0Event: (kind0: Kind0Event) => {
      const callback = drawKind0Ref.current;
      if (callback) {
        callback(kind0);
      } else {
        // If ref not set yet, try calling the function directly after a delay
        // The function will set its own ref on first call
        setTimeout(() => {
          const retryCallback = drawKind0Ref.current;
          if (retryCallback) {
            retryCallback(kind0);
          } else {
            handleError(
              new Error('drawKind0Ref still not set after timeout'),
              'drawKind0Ref still not set after timeout - function may not be defined',
              ErrorCategory.RENDERING,
              ErrorSeverity.MEDIUM
            );
          }
        }, 100); // Longer timeout to ensure function is defined
      }
    },
    onZapsLoaded: (zaps: Kind9735Event[]) => {
      // When zaps are loaded, process them with profiles
      // Get profiles from window.profiles (set by subscribeKind0fromKinds9735)
      const profiles = window.profiles || {};
      const kind0fromkind9735List: Kind0Event[] = Object.values(
        profiles
      ) as Kind0Event[];

      // Process zaps with profiles using createkinds9735JSON
      if (zaps.length > 0) {
        createkinds9735JSON(zaps, kind0fromkind9735List);
      } else {
        // Show empty state if no zaps
        const zapsContainer = getElementById('zaps');
        if (zapsContainer) {
          hideLoadingState(zapsContainer);

          const emptyStateDiv = createElement('div', {
            className: 'empty-zaps-state',
            innerHTML: `
            <div class="empty-zaps-message">
              Be the first to support
            </div>
          `
          });
          appendChild(zapsContainer, emptyStateDiv);
        }
      }
    },
    onNewZap: (zap: Kind9735Event) => {
      // Process new zap for notification (only for zaps after initial load)
      processNewZapForNotification(zap);
    },
    resetZapList,
    markInitialZapsLoaded
  });

  // Initialize Video Player hook
  const {
    initializeLiveVideoPlayer: initializeLiveVideoPlayerFromHook,
    cleanupLiveVideoPlayer
  } = useVideoPlayer({
    videoElementId: 'live-video',
    errorElementId: 'video-error'
  });

  // Initialize Content Rendering hook
  const {
    drawKind1: drawKind1FromHook,
    drawKind0: drawKind0FromHook,
    displayLiveEvent: displayLiveEventFromHook,
    displayLiveChatMessage: displayLiveChatMessageFromHook,
    processNoteContent: processNoteContentFromHook,
    updateProfile: updateProfileFromHook,
    updateLiveEventHostProfile: updateLiveEventHostProfileFromHook,
    setupLiveEventTwoColumnLayout,
    startContentMonitoring
  } = useContentRendering({
    nostrClient,
    liveEventService,
    setNoteContent,
    setAuthorName,
    setAuthorImage,
    setAuthorNip05,
    setAuthorLud16,
    generateQRCode,
    generateLiveEventQRCodes,
    subscribeLiveEventParticipants,
    subscribeChatAuthorProfile,
    subscribeLiveEventHostProfile,
    updateQRSlideVisibility: (skipUrlUpdate?: boolean) => {
      if (updateQRSlideVisibilityRef.current) {
        updateQRSlideVisibilityRef.current(skipUrlUpdate);
      }
    },
    initializeLiveVideoPlayer: initializeLiveVideoPlayerFromHook
  });

  // Store subscription functions in refs for backward compatibility
  subscribeChatAuthorProfileRef.current = subscribeChatAuthorProfile;

  // Create a ref to store subscribeLiveEventParticipants for use in displayLiveEvent
  const subscribeLiveEventParticipantsRef = useRef<
    ((liveEvent: Kind30311Event) => Promise<unknown>) | null
  >(null);
  subscribeLiveEventParticipantsRef.current = subscribeLiveEventParticipants;

  // CRITICAL: Set callback refs immediately after functions are defined
  // This ensures refs are available when subscriptions trigger, preventing lost events
  // We'll add a useEffect at the end of the component (after all functions are defined)
  // to set all refs immediately

  // Update top zappers display when topZappers changes
  useEffect(() => {
    if (topZappers.length > 0) {
      // Only display if toggle is ON
      const showTopZappersToggle = document.getElementById(
        'showTopZappersToggle'
      ) as HTMLInputElement;
      if (showTopZappersToggle?.checked) {
        displayTopZappers();
      }
    }
  }, [topZappers]);

  // Recalculate top zappers when zaps change
  useEffect(() => {
    if (zaps.length > 0) {
      calculateTopZappersFromZaps(zaps, new Map()); // Pass empty profiles map - profiles are attached to zaps

      // If show top zappers toggle is on OR user previously wanted to see them, display them immediately
      const showTopZappersToggle = document.getElementById(
        'showTopZappersToggle'
      ) as HTMLInputElement;
      if (showTopZappersToggle?.checked || userWantsTopZappers) {
        displayTopZappers();
        // Reset the flag since we've now shown them
        setUserWantsTopZappers(false);
      }
    }
  }, [zaps, userWantsTopZappers]);

  useEffect(() => {
    // IMMEDIATELY hide QR swiper container to prevent flash when no QR codes are toggled
    const qrSwiperContainer = document.querySelector(
      '.qr-swiper'
    ) as HTMLElement;
    if (qrSwiperContainer) {
      qrSwiperContainer.style.display = 'none';
    }

    const initializeLiveFunctionality = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Lightning service
        initializeLightning();

        // NostrClient is already initialized via useMemo hook

        // Initialize portrait swiper
        if (typeof window !== 'undefined' && window.Swiper) {
          new window.Swiper('.portrait-swiper .swiper', {
            // Basic settings
            loop: true,
            autoplay: {
              delay: 4000,
              disableOnInteraction: false
            },

            // Touch/Swipe settings
            touchRatio: 1,
            touchAngle: 45,
            grabCursor: true,

            // Transition settings
            speed: 800,
            effect: 'slide',
            slidesPerView: 1,
            spaceBetween: 0,

            // Responsive breakpoints
            breakpoints: {
              320: {
                slidesPerView: 1,
                spaceBetween: 0
              },
              768: {
                slidesPerView: 1,
                spaceBetween: 0
              },
              1024: {
                slidesPerView: 1,
                spaceBetween: 0
              }
            },

            // Event callbacks
            on: {
              init() {
                // Portrait swiper initialized
              },
              slideChange() {
                // Portrait swiper slide changed
              }
            }
          });
        }

        // QR swiper is initialized by initializeQRSwiper() function

        // Load note content if eventId is provided
        // Only process if eventId exists and is not empty or just 'live'
        if (eventId && eventId.trim() !== '' && eventId.trim() !== 'live') {
          // Legacy-style guard: strip prefix and validate first; if invalid, show error and abort
          try {
            const cleanId = stripNostrPrefix(eventId);
            validateNoteId(cleanId);
          } catch (err) {
            // Legacy-style messages based on prefix
            const cleanId = stripNostrPrefix(eventId);
            let msg =
              err instanceof Error
                ? err.message
                : 'Invalid nostr identifier format. Please check the note ID and try again.';
            if (cleanId.startsWith('naddr1')) {
              msg =
                'Failed to load live event. Please check the identifier and try again.';
            } else if (cleanId.startsWith('nprofile1')) {
              msg =
                'Failed to load profile. Please check the identifier and try again.';
            }

            // Force loader to render first by normalizing URL to root (no identifier)
            try {
              window.history.replaceState({}, '', '/live/');
              // Notify router/listeners about the URL change
              window.dispatchEvent(new PopStateEvent('popstate'));
            } catch {}

            // After the loader mounts, show the error and prefill input
            // Only prefill if cleanId is not empty and not "live"
            if (cleanId && cleanId.trim() !== '' && cleanId.trim() !== 'live') {
              setTimeout(() => {
                showLoadingError(msg);
                // Ensure note loader listeners are attached after redirect
                try {
                  setupNoteLoaderListeners();
                } catch {}
                const input = document.getElementById(
                  'note1LoaderInput'
                ) as HTMLInputElement | null;
                if (input) {
                  input.value = cleanId;
                  input.focus();
                  input.select();
                }
              }, 60);
            } else {
              // Just show error, don't prefill input
              setTimeout(() => {
                showLoadingError(msg);
                try {
                  setupNoteLoaderListeners();
                } catch {}
              }, 60);
            }

            // Do not proceed with loading
            setIsLoading(false);
            return;
          }
          await loadNoteContent(eventId);
        } else {
          // If no eventId, still initialize QR codes with placeholder content
          await initializeQRCodePlaceholders(undefined);
        }

        // Load initial styles and setup event listeners on page load
        setTimeout(() => {
          // Prevent original JavaScript from setting up duplicate event listeners
          window.setupStyleOptions = () => {
            // Original setupStyleOptions disabled - using React hook instead
          };

          // Load initial styles first with a delay to ensure DOM is ready
          setTimeout(() => {
            loadInitialStyles();
          }, 100);

          // Setup style options after styles are loaded to prevent event listeners from overriding
          setTimeout(() => {
            setupStyleOptions();
          }, 200);

          // Setup note loader event listeners with a delay to ensure DOM is ready
          setTimeout(() => {
            if (!eventId) {
              setupNoteLoaderListeners();
            }
          }, 100);

          // After styles are loaded, check if show top zappers should be displayed
          const showTopZappersToggle = document.getElementById(
            'showTopZappersToggle'
          ) as HTMLInputElement;
          if (showTopZappersToggle?.checked) {
            displayTopZappers();
          }
        }, 500);

        setIsLoading(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize live functionality'
        );
        setIsLoading(false);
      }
    };

    if (eventId) {
      initializeLiveFunctionality();
    } else {
      // Even without eventId, we need to setup note loader listeners and initialize Nostr
      // No eventId, setting up note loader only

      // NostrClient is already initialized via useMemo hook

      // Initialize portrait swiper for note loader (with delay to ensure DOM is ready)
      setTimeout(() => {
        if (typeof window !== 'undefined' && (window as any).Swiper) {
          const portraitSwiperElement = document.querySelector(
            '.portrait-swiper .swiper'
          );
          if (portraitSwiperElement) {
            new (window as any).Swiper('.portrait-swiper .swiper', {
              // Basic settings
              loop: true,
              autoplay: {
                delay: 4000,
                disableOnInteraction: false
              },

              // Touch/Swipe settings
              touchRatio: 1,
              touchAngle: 45,
              grabCursor: true,

              // Transition settings
              speed: 800,
              effect: 'slide',
              slidesPerView: 1,
              spaceBetween: 0,

              // Responsive breakpoints
              breakpoints: {
                320: {
                  slidesPerView: 1,
                  spaceBetween: 0
                },
                768: {
                  slidesPerView: 1,
                  spaceBetween: 0
                },
                1024: {
                  slidesPerView: 1,
                  spaceBetween: 0
                }
              }
            });
            // Debug log removed
          } else {
            logger.warn(
              'Portrait swiper element not found',
              ErrorCategory.RENDERING
            );
          }
        }
      }, 200);

      // Setup note loader event listeners when there's no eventId
      setTimeout(() => {
        if (!eventId) {
          setupNoteLoaderListeners();
        }
      }, 300);
    }
  }, [eventId]);

  // Initialize Lightning payment variables
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Initialize Lightning payment variables to avoid conflicts
      (window as any).frontendSessionId = null;
      (window as any).lightningQRSlide = null;
      (window as any).lightningEnabled = false;
      // Expose organizeZapsHierarchically function globally
      (window as any).organizeZapsHierarchically = organizeZapsHierarchically;
      (window as any).cleanupHierarchicalOrganization =
        cleanupHierarchicalOrganization;

      // Note: setupStyleOptions is overridden to prevent conflicts with original JavaScript

      // Expose updateQRSlideVisibility function globally
      (window as any).updateQRSlideVisibility = updateQRSlideVisibility;
    }
  }, []);

  // updatePaymentStatus and createLightningQRSlide are now imported from useLightningIntegration hook

  // initializeQRCodePlaceholders is now imported from useQRCode hook

  // Subscription functions are now provided by useNostrSubscriptions hook

  // Wrapper function that uses the hook implementation
  const displayLiveEvent = (liveEvent: Kind30311Event) => {
    // Set ref immediately when function is called (for first call)
    if (!displayLiveEventRef.current) {
      displayLiveEventRef.current = displayLiveEventFromHook;
    }
    displayLiveEventFromHook(liveEvent);
  };

  // Wrapper function that uses the hook implementation
  const displayLiveChatMessage = (chatMessage: NostrEvent) => {
    // Set ref immediately when function is called (for first call)
    if (!displayLiveChatMessageRef.current) {
      displayLiveChatMessageRef.current = displayLiveChatMessageFromHook;
    }
    displayLiveChatMessageFromHook(chatMessage);
  };

  // processLiveEventZap and displayLiveEventZap are now provided by useZapHandling hook

  // subscribeChatAuthorProfile is now provided by useNostrSubscriptions hook

  const updateLiveEventZapTotal = () => {
    // Debug log removed
    updateLiveEventZapTotalRef.current = updateLiveEventZapTotal;

    const zaps = querySelectorAll<HTMLElement>('.live-event-zap');
    const totalAmount = zaps.reduce((sum, zap) => {
      return sum + parseInt((zap as HTMLElement).dataset.amount || '0');
    }, 0);
    const totalCount = zaps.length;

    const totalValueElement = getElementById('zappedTotalValue');
    const totalCountElement = getElementById('zappedTotalCount');

    if (totalValueElement) {
      setTextContent(totalValueElement, numberWithCommas(totalAmount));
      // Store the original sats amount for fiat conversion
      totalValueElement.dataset.originalSats = numberWithCommas(totalAmount);
    }
    if (totalCountElement) {
      setTextContent(totalCountElement, numberWithCommas(totalCount));
    }

    // Apply fiat conversion to total if enabled
    const showFiatToggle = getElementById<HTMLInputElement>('showFiatToggle');
    if (showFiatToggle && showFiatToggle.checked) {
      // Use setTimeout to ensure DOM is updated before applying fiat conversion
      setTimeout(() => {
        debouncedUpdateFiatAmounts();
      }, 50);
    }
  };

  // addZapToTotals is now provided by useZapHandling hook

  const getDisplayName = (profile: Kind0Event | null) => {
    if (!profile) return 'Anonymous';
    try {
      const profileData = JSON.parse(profile.content || '{}');
      return (
        profileData.display_name ||
        profileData.displayName ||
        profileData.name ||
        'Anonymous'
      );
    } catch {
      return 'Anonymous';
    }
  };

  // updateTopZappers is now provided by useZapHandling hook

  const displayTopZappers = () => {
    // Debug log removed

    const topZappersBar = getElementById('top-zappers-bar');

    if (!topZappersBar) {
      // Debug log removed
      return;
    }

    if (topZappers.length === 0) {
      // Debug log removed
      // Remove the CSS class to hide the bar
      removeClass(document.body, 'show-top-zappers');
      return;
    }

    // Debug log removed
    // Add the CSS class to show the bar (CSS handles the display)
    addClass(document.body, 'show-top-zappers');

    // Update each zapper slot (using the existing DOM structure)
    for (let i = 0; i < 5; i++) {
      const zapperElement = getElementById(`top-zapper-${i + 1}`);
      if (!zapperElement) continue;

      if (i < topZappers.length) {
        const zapper = topZappers[i];
        const avatar = zapperElement.querySelector(
          '.zapper-avatar'
        ) as HTMLImageElement;
        const name = zapperElement.querySelector(
          '.zapper-name'
        ) as HTMLElement | null;
        const total = zapperElement.querySelector(
          '.zapper-total'
        ) as HTMLElement | null;

        // topZappers is ProcessedZap[] from useZapHandling hook
        const zapperData = zapper as SharedProcessedZap;
        const zapperPicture = zapperData.zapPayerPicture || '';
        const zapperName = zapperData.content || 'Anonymous';
        const zapperAmount = zapperData.zapAmount || 0;

        if (avatar) {
          avatar.src =
            sanitizeImageUrl(zapperPicture) ||
            '/live/images/gradient_color.gif';
          avatar.alt = zapperName;
        }
        if (name) setTextContent(name as HTMLElement, zapperName);
        if (total)
          setTextContent(
            total as HTMLElement,
            `${numberWithCommas(zapperAmount)} sats`
          );

        zapperElement.style.opacity = '1';
        zapperElement.style.display = 'flex';
      } else {
        // Hide unused slots
        zapperElement.style.display = 'none';
      }
    }
  };

  const hideTopZappersBar = () => {
    // Remove the CSS class to hide the bar
    removeClass(document.body, 'show-top-zappers');
  };

  // Wrapper function that uses the hook implementation
  const updateProfile = (profile: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!updateProfileRef.current) {
      updateProfileRef.current = updateProfileFromHook;
    }
    updateProfileFromHook(profile);
  };

  // setupLiveEventTwoColumnLayout is now provided by useContentRendering hook

  // subscribeLiveEventHostProfile is now provided by useNostrSubscriptions hook

  // Wrapper function that uses the hook implementation
  const updateLiveEventHostProfile = (profile: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!updateLiveEventHostProfileRef.current) {
      updateLiveEventHostProfileRef.current =
        updateLiveEventHostProfileFromHook;
    }
    updateLiveEventHostProfileFromHook(profile);
  };

  // startContentMonitoring is now provided by useContentRendering hook

  // initializeLiveVideoPlayer and cleanupLiveVideoPlayer are now provided by useVideoPlayer hook

  // generateQRCode, updateQRLinks, updateQRPreviews, and generateLiveEventQRCodes are now imported from useQRCode hook

  const loadNoteContent = async (noteId: string) => {
    try {
      // Re-enable grid toggle for regular notes (not live events)
      enableGridToggle();

      // Reset zapper totals for new content
      resetZapperTotalsFromHook();

      // Strip nostr: protocol prefix if present before validation
      const originalNoteId = noteId;
      noteId = stripNostrPrefix(noteId);

      // Validate and decode the note ID after stripping prefix
      let decoded;
      try {
        decoded = parseEventId(noteId);
        // Clear any previous error message
        hideNoteLoaderError();
      } catch (error) {
        showNoteLoaderError(
          error instanceof Error ? error.message : 'Unknown error'
        );
        return;
      }

      try {
        let kind1ID;

        if (decoded.type === 'nevent') {
          kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
          kind1ID = decoded.data;
        } else if (decoded.type === 'naddr') {
          // Handle live event (naddr1)
          const { identifier, pubkey, kind } = decoded.data;

          // Reset zapper totals for new live event
          resetZapperTotalsFromHook();

          // Show loading animations for live event
          const noteContent = document.querySelector('.note-content');
          const zapsList = document.getElementById('zaps');

          if (noteContent) {
            noteContent.classList.add('loading');
            if (!noteContent.querySelector('.loading-text')) {
              const loadingText = document.createElement('div');
              loadingText.className = 'loading-text';
              loadingText.textContent = 'Loading live event...';
              noteContent.appendChild(loadingText);
            }
          }

          if (zapsList) {
            zapsList.classList.add('loading');
            if (!zapsList.querySelector('.loading-text')) {
              const loadingText = document.createElement('div');
              loadingText.className = 'loading-text';
              loadingText.textContent = 'Loading live activity...';
              zapsList.appendChild(loadingText);
            }
          }

          // Store current live event info for reconnection
          window.currentLiveEventInfo = { pubkey, identifier, kind };

          // Reset reconnection attempts
          window.reconnectionAttempts = { event: 0, chat: 0, zaps: 0 };

          // Subscribe to the live event, chat, and zaps
          subscribeLiveEvent(pubkey, identifier, kind);
          subscribeLiveChat(pubkey, identifier);
          subscribeLiveEventZaps(pubkey, identifier);

          const noteLoaderContainer = document.getElementById(
            'noteLoaderContainer'
          );
          if (noteLoaderContainer) {
            noteLoaderContainer.style.display = 'none';
          }

          return; // Exit early for live events
        } else {
          throw new Error('Invalid nostr identifier format.');
        }

        // Show loading animations
        // Try immediately first (in case DOM is already ready)
        const noteContentImmediate = querySelector('.note-content');
        const zapsListImmediate = getElementById('zaps');
        
        if (noteContentImmediate) {
          showElementLoadingState(noteContentImmediate, 'Loading note content...');
        }
        if (zapsListImmediate) {
          showElementLoadingState(zapsListImmediate, 'Loading zaps...');
        } else {
          // If element doesn't exist yet, use double requestAnimationFrame
          // First RAF: waits for React to commit changes
          // Second RAF: waits for browser to paint (DOM definitely exists)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const noteContent = querySelector('.note-content');
              const zapsList = getElementById('zaps');

              if (noteContent && !noteContentImmediate) {
                showElementLoadingState(noteContent, 'Loading note content...');
              }
              if (zapsList) {
                showElementLoadingState(zapsList, 'Loading zaps...');
              } else {
                // Final fallback: try once more after a brief delay
                setTimeout(() => {
                  const zapsListRetry = getElementById('zaps');
                  if (zapsListRetry) {
                    showElementLoadingState(zapsListRetry, 'Loading zaps...');
                  }
                }, 100);
              }
            });
          });
        }

        subscribeKind1(kind1ID);
        const noteLoaderContainer = getElementById('noteLoaderContainer');
        hideElement(noteLoaderContainer);
      } catch (e) {
        // If decoding fails, try to use the input directly as a note ID

        // Show loading animations
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');

        if (noteContent) {
          noteContent.classList.add('loading');
          if (!noteContent.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading note content...';
            noteContent.appendChild(loadingText);
          }
        }

        if (zapsList) {
          zapsList.classList.add('loading');
          if (!zapsList.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading zaps...';
            zapsList.appendChild(loadingText);
          }
        }

        subscribeKind1(noteId);
        const noteLoaderContainer = getElementById('noteLoaderContainer');
        hideElement(noteLoaderContainer);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load note content'
      );
    }
  };

  // validateNoteId and stripNostrPrefix are now imported from '../utils/eventIdParser'

  const showNoteLoaderError = (message: string) => {
    showErrorHelper('noteLoaderError', message);
  };

  const hideNoteLoaderError = () => {
    hideErrorHelper('noteLoaderError');
  };

  const showLoadingError = (message: string) => {
    showErrorHelper('noteLoaderError', message);

    // Ensure noteLoader is visible and main layout is hidden when there's an error
    const noteLoaderContainer = getElementById('noteLoaderContainer');
    const mainLayout = getElementById('mainLayout');

    showElement(noteLoaderContainer, 'flex');
    hideElement(mainLayout);
  };

  // resetToDefaults is now provided by useStyleManagement hook

  // updateStyleURL, applyStylesFromURL, and copyStyleUrl are now provided by useStyleManagement hook

  // resetZapperTotals wrapper to also hide top zappers bar
  const resetZapperTotals = () => {
    resetZapperTotalsFromHook(); // Call hook's version
    hideTopZappersBar();
  };

  const enableGridToggle = () => {
    // Enable grid toggle functionality
    // Debug log removed
  };

  // subscribeKind1 is now provided by useNostrSubscriptions hook

  // subscribeKind0fromKind1 is now provided by useNostrSubscriptions hook

  const processNewZapForNotification = async (kind9735: Kind9735Event) => {
    try {
      // Use utility functions to extract zap data
      const amount = extractZapAmount(kind9735);
      if (amount === 0) {
        logger.warn('No amount found in zap', ErrorCategory.VALIDATION, {
          zapId: kind9735.id
        });
        return;
      }

      const zapperPubkey = extractZapPayerPubkey(kind9735);
      const zapContent = extractZapContent(kind9735);

      // Store zap data as pending notification - subscribeKind0fromKinds9735 will fetch profile
      // When profile arrives, updateZapProfile will trigger the notification
      storePendingZapNotification({
        id: kind9735.id,
        pubkey: zapperPubkey,
        amount,
        content: zapContent,
        timestamp: kind9735.created_at
      });
    } catch (error) {
      handleError(
        error,
        'Error processing new zap for notification',
        ErrorCategory.SUBSCRIPTION,
        ErrorSeverity.MEDIUM,
        { zapId: kind9735.id }
      );
    }
  };

  // subscribeKind9735fromKind1 is now provided by useNostrSubscriptions hook
  // subscribeKind9735fromKind1 is now provided by useNostrSubscriptions hook

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // subscribeKind0fromKinds9735 is now provided by useNostrSubscriptions hook

  const createkinds9735JSON = async (
    kind9735List: Kind9735Event[],
    kind0fromkind9735List: Kind0Event[]
  ) => {
    // Reset zapper totals for new note
    resetZapperTotalsFromHook();

    // Don't reset json9735List - keep accumulating zaps like legacy
    // const json9735List: any[] = []; // REMOVED - this was causing the issue

    for (const kind9735 of kind9735List) {
      // Skip if we've already processed this zap
      if (processedZapIDs.has(kind9735.id)) {
        continue;
      }

      // Mark this zap as processed
      processedZapIDs.add(kind9735.id);

      // Use utility functions to extract zap data
      const amount9735 = extractZapAmount(kind9735);
      const pubkey9735 = extractZapPayerPubkey(kind9735);
      const kind9735Content = extractZapContent(kind9735);

      if (amount9735 === 0) continue; // Skip if no amount

      const kind1from9735 = kind9735.tags.find(
        (tag: string[]) => tag[0] === 'e'
      )?.[1];
      const kind9735id = nip19.noteEncode(kind9735.id) || kind9735.id;

      let kind0picture = '';
      let kind0npub = '';
      let kind0finalName = '';
      let profileData = null;

      const kind0fromkind9735 = kind0fromkind9735List.find(
        (kind0: Kind0Event) => pubkey9735 === kind0.pubkey
      );
      if (kind0fromkind9735) {
        try {
          const content = JSON.parse(
            kind0fromkind9735.content || '{}'
          ) as Record<string, unknown>;
          const displayName = content.displayName || content.display_name;
          const kind0name = displayName
            ? (displayName as string)
            : (content.name as string);
          kind0finalName =
            kind0name != ''
              ? kind0name
              : (content.name as string) || 'Anonymous';
          kind0picture = (content.picture as string) || '';
          kind0npub = nip19.npubEncode(kind0fromkind9735.pubkey) || '';
          profileData = content;
        } catch (error) {
          handleErrorSilently(
            error,
            'Failed to parse profile content for zapper',
            ErrorCategory.PARSING,
            { pubkey: kind0fromkind9735.pubkey }
          );
          // Use defaults if profile parsing fails
          kind0npub = nip19.npubEncode(kind0fromkind9735.pubkey) || '';
        }
      }

      const json9735 = {
        e: kind1from9735,
        amount: amount9735,
        picture: kind0picture,
        npubPayer: kind0npub,
        pubKey: pubkey9735,
        zapEventID: kind9735id,
        kind9735content: kind9735Content,
        kind1Name: kind0finalName,
        kind0Profile: profileData,
        created_at: kind9735.created_at,
        timestamp: kind9735.created_at,
        id: kind9735.id
      };
      json9735List.push(json9735);
    }

    json9735List.sort((a, b) => b.amount - a.amount);
    drawKinds9735(json9735List);
  };

  const drawKinds9735 = (json9735List: ProcessedZapData[]) => {
    // Set ref immediately when function is called (for first call)
    if (!drawKinds9735Ref.current) {
      drawKinds9735Ref.current = drawKinds9735;
    }
    // Debug log removed

    const zapsContainer = document.getElementById('zaps');
    if (!zapsContainer) return;

    zapsContainer.innerHTML = '';

    // Store zap data globally for timestamp lookup
    window.zaps = json9735List;

    // Hide zaps loading animation
    hideLoadingState(zapsContainer);

    const totalAmountZapped = json9735List.reduce(
      (sum, zaps) => sum + zaps.amount,
      0
    );
    const totalValueElement = document.getElementById('zappedTotalValue');
    const totalCountElement = document.getElementById('zappedTotalCount');

    if (totalValueElement) {
      totalValueElement.innerText = numberWithCommas(totalAmountZapped);
      // Store the original sats amount for fiat conversion
      (totalValueElement as HTMLElement).dataset.originalSats =
        numberWithCommas(totalAmountZapped);
    }
    if (totalCountElement) {
      totalCountElement.innerText = json9735List.length.toString();
    }

    // Update React state - use hook's setters
    // Note: setZaps expects Kind9735Event[], but we have ProcessedZapData[]
    // The React state is managed by useZapHandling hook which processes Kind9735Event[]
    // We keep the processed data in window.zaps for DOM rendering

    // Check if there are no zaps
    if (json9735List.length === 0) {
      const emptyStateDiv = document.createElement('div');
      emptyStateDiv.className = 'empty-zaps-state';
      emptyStateDiv.innerHTML = `
        <div class="empty-zaps-message">
          Be the first to support
        </div>
      `;
      zapsContainer.appendChild(emptyStateDiv);
      return;
    }

    // Sort zaps by amount (highest first)
    const sortedZaps = json9735List.sort((a, b) => b.amount - a.amount);

    for (let i = 0; i < sortedZaps.length; i++) {
      const zap = sortedZaps[i];
      const zapDiv = document.createElement('div');

      // Use the same class structure as the original
      const zapClass = 'zap';
      zapDiv.className = zapClass;

      // Add zap ID for matching with stored data
      if (zap.id) {
        zapDiv.setAttribute('data-zap-id', zap.id);
      }

      // Add timestamp data attribute for historical price lookup
      if (zap.timestamp || zap.created_at) {
        const timestamp = zap.timestamp || zap.created_at;
        zapDiv.setAttribute('data-timestamp', timestamp.toString());
      } else {
      }

      if (!zap.picture) zap.picture = '';
      const profileImage =
        sanitizeImageUrl(zap.picture) || '/live/images/gradient_color.gif';
      const sanitizedZapContent = zap.kind9735content
        ? escapeHtml(zap.kind9735content).replace(/\n/g, '<br>')
        : '';
      const sanitizedZapName = zap.kind1Name
        ? escapeHtml(zap.kind1Name)
        : 'Anonymous';

      zapDiv.innerHTML = `
        <div class="zapperProfile">
          <img class="zapperProfileImg" src="${profileImage}" />
          <div class="zapperInfo">
            <div class="zapperName">
              ${sanitizedZapName}
      </div>
            <div class="zapperMessage">${sanitizedZapContent}</div>
          </div>
        </div>
        <div class="zapperAmount">
          <div class="zapperAmountValue">
            <span class="zapperAmountSats" data-original-sats="${numberWithCommas(zap.amount)}">${numberWithCommas(zap.amount)}</span>
            <span class="zapperAmountLabel">sats</span>
          </div>
        </div>
      `;
      zapsContainer.appendChild(zapDiv);
    }

    // Reorganize zaps hierarchically if grid mode is enabled
    const zapGridToggle = document.getElementById('zapGridToggle');
    if (zapGridToggle && (zapGridToggle as HTMLInputElement).checked) {
      // Ensure the grid-layout class is applied
      zapsContainer.classList.add('grid-layout');
      // Add a small delay to ensure DOM is updated
      setTimeout(() => {
        organizeZapsHierarchically();
      }, 10);
    } else {
      // Remove grid layout class
      zapsContainer.classList.remove('grid-layout');

      // Apply podium classes for list layout
      if (document.body.classList.contains('podium-enabled')) {
        const zaps = Array.from(zapsContainer.querySelectorAll('.zap'));
        const sortedZaps = [...zaps].sort((a, b) => {
          const amountA = parseInt(
            a
              .querySelector('.zapperAmountSats')
              ?.textContent?.replace(/[^\d]/g, '') || '0'
          );
          const amountB = parseInt(
            b
              .querySelector('.zapperAmountSats')
              ?.textContent?.replace(/[^\d]/g, '') || '0'
          );
          return amountB - amountA;
        });

        // Apply podium classes to top 3 zaps

        for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
          const zap = sortedZaps[i];
          if (zap) {
            zap.classList.add(`podium-${i + 1}`);
            // Debug log removed
          }
        }
      }
    }

    // Calculate top zappers directly from the zaps we just processed
    // Pass empty profiles map - profiles are attached to zaps in this context
    calculateTopZappersFromZaps(json9735List, new Map());

    // Update fiat amounts if the toggle is enabled
    const showFiatToggle = document.getElementById(
      'showFiatToggle'
    ) as HTMLInputElement;
    if (showFiatToggle && showFiatToggle.checked) {
      // Use setTimeout to ensure DOM is updated before fetching historical prices
      setTimeout(() => {
        debouncedUpdateFiatAmounts();
      }, 100);
    }
  };

  // calculateTopZappersFromZaps is now provided by useZapHandling hook

  // Get the rank of a single zap based on its amount
  const getSingleZapRank = (zapAmount: number): number | undefined => {
    // Use window.zaps which is populated before the React state
    const existingZaps = window.zaps || [];

    // Get all zap amounts INCLUDING the current zap being evaluated
    const allZapAmounts = [
      ...existingZaps.map((z: ProcessedZapData) => z.amount),
      zapAmount
    ].sort((a, b) => b - a);

    // Get all unique amounts
    const uniqueAmounts = [...new Set(allZapAmounts)];

    // Calculate rank for a single zap

    // Find where this zap amount ranks
    const rank = uniqueAmounts.indexOf(zapAmount);

    if (rank >= 0) {
      // Zap ranks at position
      return rank + 1; // Return 1, 2, 3, 4, etc.
    }

    // Could not determine rank
    return undefined;
  };

  const numberWithCommas = (x: number) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Helper function to cleanup hierarchical organization in a container
  const cleanupHierarchicalOrganizationInContainer = (
    container: HTMLElement
  ) => {
    // Remove all row containers and move zaps back to the main container
    const existingRows = container.querySelectorAll('.zap-row');
    existingRows.forEach(row => {
      // Move all zaps from this row back to the main container
      const zapsInRow = Array.from(row.children);
      zapsInRow.forEach(zap => {
        const zapElement = zap as HTMLElement;
        // Remove row classes and global podium classes from individual zaps
        zapElement.className = zapElement.className.replace(/row-\d+/g, '');
        zapElement.className = zapElement.className.replace(
          /podium-global-\d+/g,
          ''
        );

        // Force row layout by setting inline styles (will override everything)
        zapElement.style.flexDirection = 'row';
        zapElement.style.alignItems = 'center';
        zapElement.style.justifyContent = 'space-between';
        zapElement.style.textAlign = 'left';
        zapElement.style.width = 'auto';

        // Reset nested elements to row layout
        const profile = zapElement.querySelector(
          '.zapperProfile'
        ) as HTMLElement;
        if (profile) {
          profile.style.flexDirection = 'row';
          profile.style.alignItems = 'center';
        }

        const info = zapElement.querySelector('.zapperInfo') as HTMLElement;
        if (info) {
          info.style.flexDirection = 'column';
          info.style.alignItems = 'flex-start';
          info.style.textAlign = 'left';
        }

        const amount = zapElement.querySelector('.zapperAmount') as HTMLElement;
        if (amount) {
          amount.style.flexDirection = 'row';
          amount.style.alignItems = 'baseline';
        }

        // Move zap back to main container
        container.appendChild(zapElement);
      });
      // Remove the empty row container
      row.remove();
    });

    // After cleanup, remove inline styles after a frame to let CSS take over
    setTimeout(() => {
      const allZaps = container.querySelectorAll(
        '.zap, .live-event-zap, .zap-only-item'
      );
      allZaps.forEach(zap => {
        const zapElement = zap as HTMLElement;
        zapElement.style.removeProperty('flex-direction');
        zapElement.style.removeProperty('align-items');
        zapElement.style.removeProperty('justify-content');
        zapElement.style.removeProperty('text-align');
        zapElement.style.removeProperty('width');

        const profile = zapElement.querySelector(
          '.zapperProfile'
        ) as HTMLElement;
        if (profile) {
          profile.style.removeProperty('flex-direction');
          profile.style.removeProperty('align-items');
        }

        const info = zapElement.querySelector('.zapperInfo') as HTMLElement;
        if (info) {
          info.style.removeProperty('flex-direction');
          info.style.removeProperty('align-items');
          info.style.removeProperty('text-align');
        }

        const amount = zapElement.querySelector('.zapperAmount') as HTMLElement;
        if (amount) {
          amount.style.removeProperty('flex-direction');
          amount.style.removeProperty('align-items');
        }
      });
    }, 0);
  };

  const cleanupHierarchicalOrganization = useCallback(() => {
    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;

    // Check if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
      // Only cleanup zaps-only-list (activity-list never has grid layout)
      const zapsOnlyList = document.getElementById('zaps-only-list');

      if (zapsOnlyList) {
        cleanupHierarchicalOrganizationInContainer(zapsOnlyList);
      }
    } else {
      // Regular kind1 note mode - cleanup main zaps list
      cleanupHierarchicalOrganizationInContainer(zapsList);
    }

    // Also ensure .zaps-list elements don't have grid-layout class
    const allZapsLists = document.querySelectorAll('.zaps-list');
    allZapsLists.forEach(list => {
      list.classList.remove('grid-layout');
    });
  }, []);

  // Update ref when cleanupHierarchicalOrganization is defined
  useEffect(() => {
    cleanupHierarchicalOrganizationRef.current =
      cleanupHierarchicalOrganization;
  }, [cleanupHierarchicalOrganization]);

  // Helper function to organize zaps in a container
  const organizeZapsInContainer = (
    container: HTMLElement,
    sortByAmount: boolean = true
  ) => {
    // For activity list, only organize zaps, not chat messages
    const selector = sortByAmount
      ? '.zap, .live-event-zap, .zap-only-item' // zaps-only-list: only zaps
      : '.live-event-zap'; // activity-list: only zaps (not chat messages)

    const zaps = Array.from(container.querySelectorAll(selector));
    if (zaps.length === 0) return;

    // Clear inline styles from all zaps so CSS grid layout can take over
    zaps.forEach(zap => {
      const zapElement = zap as HTMLElement;
      zapElement.style.removeProperty('flex-direction');
      zapElement.style.removeProperty('align-items');
      zapElement.style.removeProperty('justify-content');
      zapElement.style.removeProperty('text-align');
      zapElement.style.removeProperty('width');

      const profile = zapElement.querySelector('.zapperProfile') as HTMLElement;
      if (profile) {
        profile.style.removeProperty('flex-direction');
        profile.style.removeProperty('align-items');
      }

      const info = zapElement.querySelector('.zapperInfo') as HTMLElement;
      if (info) {
        info.style.removeProperty('flex-direction');
        info.style.removeProperty('align-items');
        info.style.removeProperty('text-align');
      }

      const amount = zapElement.querySelector('.zapperAmount') as HTMLElement;
      if (amount) {
        amount.style.removeProperty('flex-direction');
        amount.style.removeProperty('align-items');
      }
    });

    // Clear existing row classes and podium classes
    zaps.forEach(zap => {
      zap.className = zap.className.replace(/row-\d+/g, '');
      zap.className = zap.className.replace(/podium-\d+/g, '');
      zap.className = zap.className.replace(/podium-global-\d+/g, '');
    });

    // Remove existing row containers
    const existingRows = container.querySelectorAll('.zap-row');
    existingRows.forEach(row => row.remove());

    // Sort zaps by amount (highest first) or by timestamp (newest first)
    const sortedZaps = [...zaps].sort((a, b) => {
      if (sortByAmount) {
        // Sort by amount (for zaps-only-list)
        const amountA = parseInt(
          a
            .querySelector('.zapperAmountSats')
            ?.textContent?.replace(/[^\d]/g, '') || '0'
        );
        const amountB = parseInt(
          b
            .querySelector('.zapperAmountSats')
            ?.textContent?.replace(/[^\d]/g, '') || '0'
        );
        return amountB - amountA;
      } else {
        // Sort by timestamp (for activity-list) - newest first
        const timestampA = parseInt(
          (a as HTMLElement).dataset.timestamp || '0'
        );
        const timestampB = parseInt(
          (b as HTMLElement).dataset.timestamp || '0'
        );
        return timestampB - timestampA;
      }
    });

    // Apply podium classes to top 3 zaps (only when sorting by amount)
    if (sortByAmount && document.body.classList.contains('podium-enabled')) {
      // Apply podium classes to top 3 zaps in grid layout
      for (let i = 0; i < Math.min(3, sortedZaps.length); i++) {
        const zap = sortedZaps[i] as HTMLElement;
        if (zap) {
          zap.classList.add(`podium-global-${i + 1}`);
          // Debug log removed
        }
      }
    }

    let currentIndex = 0;
    let rowNumber = 1;
    let zapsPerRow = 1;

    while (currentIndex < zaps.length) {
      // Create row container
      const rowContainer = document.createElement('div');
      rowContainer.className = `zap-row row-${rowNumber}`;

      // Add zaps to this row
      for (let i = 0; i < zapsPerRow && currentIndex < zaps.length; i++) {
        const zap = zaps[currentIndex] as HTMLElement;
        if (zap) {
          zap.classList.add(`row-${rowNumber}`);
          rowContainer.appendChild(zap);
        }
        currentIndex++;
      }

      container.appendChild(rowContainer);

      // Double the zaps per row for next row
      zapsPerRow *= 2;
      rowNumber++;

      // Limit to row-5 for very large numbers
      if (rowNumber > 5) {
        // For remaining zaps, put them in row-5
        while (currentIndex < zaps.length) {
          const zap = zaps[currentIndex] as HTMLElement;
          if (zap) {
            zap.classList.add('row-5');
            rowContainer.appendChild(zap);
          }
          currentIndex++;
        }
        break;
      }
    }
  };

  const organizeZapsHierarchically = () => {
    organizeZapsHierarchicallyRef.current = organizeZapsHierarchically;

    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;

    // Check if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
      // Only organize zaps-only-list in grid layout
      // Activity list stays as chronological list (not affected by grid toggle)
      const zapsOnlyList = document.getElementById('zaps-only-list');

      if (zapsOnlyList) {
        // Sort by amount (highest first) for zaps-only column
        organizeZapsInContainer(zapsOnlyList, true);
      }
    } else {
      // Regular kind1 note mode - organize in main zaps list by amount
      organizeZapsInContainer(zapsList, true);
    }
  };

  // Wrapper function that uses the hook implementation
  const drawKind1 = async (kind1: Kind1Event) => {
    // Set ref immediately when function is called (for first call)
    if (!drawKind1Ref.current) {
      drawKind1Ref.current = drawKind1FromHook;
    }
    await drawKind1FromHook(kind1);
  };

  // Wrapper function that uses the hook implementation
  const drawKind0 = (kind0: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!drawKind0Ref.current) {
      drawKind0Ref.current = drawKind0FromHook;
    }
    drawKind0FromHook(kind0);
  };

  // getMentionUserName and processNoteContent are now provided by useContentRendering hook

  // Helper function to show loading state
  const showLoadingState = (noteContentText: string, zapsText: string) => {
    const noteContent = querySelector('.note-content');
    const zapsList = getElementById('zaps');

    showElementLoadingState(noteContent, noteContentText);
    showElementLoadingState(zapsList, zapsText);
  };

  const handleNoteLoaderSubmit = async () => {
    const inputField = getElementById<HTMLInputElement>('note1LoaderInput');
    const noteId = inputField?.value?.trim();

    // Debug log removed

    if (!noteId) {
      // Debug log removed
      showNoteLoaderError('Please enter a note ID');
      return;
    }

    // Strip nostr: protocol prefix if present
    const originalNoteId = noteId;
    const cleanNoteId = stripNostrPrefix(noteId);

    // Validate and decode the note ID
    let decoded;
    try {
      decoded = parseEventId(cleanNoteId);
      hideNoteLoaderError();
    } catch (error) {
      showNoteLoaderError(
        error instanceof Error ? error.message : 'Invalid note ID'
      );
      return;
    }

    try {
      // Route to appropriate handler

      // Update URL with the identifier under /live/ base path
      const newUrl = `/live/${cleanNoteId}`;
      window.history.pushState({}, '', newUrl);

      // Trigger a custom event to notify the React component
      window.dispatchEvent(
        new CustomEvent('noteLoaderSubmitted', {
          detail: { noteId: cleanNoteId, decoded }
        })
      );

      // Show loading state
      setIsLoading(true);
      setError(null);

      if (decoded.type === 'naddr') {
        // Handle live events
        const { identifier, pubkey, kind } = decoded.data;

        // Show loading animations
        showLoadingState('Loading live event...', 'Loading live activity...');

        // Subscribe to live event, chat, and zaps
        await subscribeLiveEvent(pubkey, identifier, kind);
        await subscribeLiveChat(pubkey, identifier);
        await subscribeLiveEventZaps(pubkey, identifier);
      } else if (decoded.type === 'nprofile') {
        // Handle profiles
        const { pubkey } = decoded.data;

        // Show loading animations
        showLoadingState('Loading profile...', 'Loading profile activity...');

        // Subscribe to profile updates
        if (subscribeChatAuthorProfile) {
          subscribeChatAuthorProfile(pubkey);
        }
      } else if (decoded.type === 'nevent') {
        // Handle note events
        const kind1ID = decoded.data.id;

        // Show loading animations
        showLoadingState('Loading note content...', 'Loading zaps...');

        // Subscribe to kind1 note
        await subscribeKind1(kind1ID);
      } else if (decoded.type === 'note') {
        // Handle direct note IDs
        const kind1ID = decoded.data;

        // Show loading animations
        showLoadingState('Loading note content...', 'Loading zaps...');

        // Subscribe to kind1 note
        await subscribeKind1(kind1ID);
      } else {
        throw new Error(
          'Invalid identifier format. Please enter a valid nostr identifier.'
        );
      }
    } catch (e) {
      showNoteLoaderError(
        'Invalid nostr identifier. Please enter a valid note ID (note1...), event ID (nevent1...), live event (naddr1...), or profile (nprofile1...).'
      );
      setIsLoading(false);
    }
  };

  // Setup note loader event listeners
  const setupNoteLoaderListeners = (retryCount = 0) => {
    // Prevent multiple simultaneous calls
    if (setupNoteLoaderListenersInProgress && retryCount === 0) {
      return;
    }

    if (retryCount === 0) {
      setupNoteLoaderListenersInProgress = true;
    }

    const submitButton = document.getElementById('note1LoaderSubmit');
    const inputField = document.getElementById('note1LoaderInput');

    // Debug log removed

    // Debug log removed
    // Debug log removed
    // Debug log removed

    if (!inputField || !submitButton) {
      // Only retry up to 50 times (5 seconds) and only log warning every 10 retries
      if (retryCount < 50) {
        if (retryCount % 10 === 0) {
        }
        setTimeout(() => setupNoteLoaderListeners(retryCount + 1), 100);
        return;
      } else {
        setupNoteLoaderListenersInProgress = false;
        return;
      }
    }

    if (submitButton) {
      // Remove any existing listeners first
      submitButton.removeEventListener('click', handleNoteLoaderSubmit);

      submitButton.addEventListener('click', e => {
        e.preventDefault();
        handleNoteLoaderSubmit();
      });
      // Debug log removed

      // Debug log removed
    }

    if (inputField) {
      // Add Enter key support for the input field
      inputField.addEventListener('keypress', (e: KeyboardEvent) => {
        // Debug log removed
        if (e.key === 'Enter') {
          // Debug log removed
          e.preventDefault();
          handleNoteLoaderSubmit();
        }
      });

      // Clear error message when user starts typing
      inputField.addEventListener('input', e => {
        // Debug log removed
        hideNoteLoaderError();
      });

      // Debug log removed
    }

    // Reset the flag when function completes successfully
    setupNoteLoaderListenersInProgress = false;
  };

  const handleStyleOptionsToggle = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    }
  };

  const handleStyleOptionsClose = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.classList.remove('show');
      document.body.classList.remove('style-panel-open');
      // Keep display: block for the transition, then hide after transition
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300); // Match the CSS transition duration
    }
  };

  const handleNotificationDismiss = useCallback(() => {
    setZapNotification(null);
  }, []);

  // Apply PubPay preset with all settings
  const applyPubPayPreset = () => {
    // Set text color to white
    const textColorPicker = document.getElementById(
      'textColorPicker'
    ) as HTMLInputElement;
    const textColorValue = document.getElementById(
      'textColorValue'
    ) as HTMLInputElement;
    if (textColorPicker && textColorValue) {
      textColorPicker.value = '#ffffff';
      textColorValue.value = '#ffffff';
    }

    // Set background image to gradient
    const bgImageUrl = document.getElementById(
      'bgImageUrl'
    ) as HTMLInputElement;
    if (bgImageUrl) {
      bgImageUrl.value = '/live/images/gradient_color.gif';
    }
    updateBackgroundImage('/live/images/gradient_color.gif');

    // Set opacity to 0 (fully transparent)
    const opacitySlider = document.getElementById(
      'opacitySlider'
    ) as HTMLInputElement;
    const opacityValue = document.getElementById('opacityValue');
    if (opacitySlider && opacityValue) {
      opacitySlider.value = '0';
      opacityValue.textContent = '0%';
    }

    // Enable QR invert
    const qrInvertToggle = document.getElementById(
      'qrInvertToggle'
    ) as HTMLInputElement;
    if (qrInvertToggle) {
      qrInvertToggle.checked = true;
    }

    // Enable QR screen blend
    const qrScreenBlendToggle = document.getElementById(
      'qrScreenBlendToggle'
    ) as HTMLInputElement;
    if (qrScreenBlendToggle) {
      qrScreenBlendToggle.checked = true;
    }

    // Update preview
    const bgPresetPreview = document.getElementById(
      'bgPresetPreview'
    ) as HTMLImageElement;
    if (bgPresetPreview) {
      bgPresetPreview.src = '/live/images/gradient_color.gif';
      bgPresetPreview.alt = 'PubPay preset preview';
      bgPresetPreview.style.display = 'block';
    }

    // Apply all styles and save
    applyAllStyles();
    updateBlendModeFromHook();
    saveCurrentStylesToLocalStorage();
  };

  // Start live price updates (wrapper for service)
  const startLivePriceUpdates = () => {
    bitcoinPriceService.startPriceUpdates(30000); // 30 seconds
  };

  // Stop live price updates (wrapper for service)
  const stopLivePriceUpdates = () => {
    bitcoinPriceService.stopPriceUpdates();
  };

  // Manual price refresh function (exposed globally for testing)
  const refreshBitcoinPrices = async () => {
    return await bitcoinPriceService.refreshPrices();
  };

  // Fiat conversion is now handled by useFiatConversion hook

  // Recalculate total zaps amount (useful when prices change)
  const recalculateTotalZaps = () => {
    // Get all individual zap amounts from the DOM
    const zapElements = document.querySelectorAll(
      '.zapperAmountSats, .zap-amount-sats'
    );
    let totalSats = 0;

    zapElements.forEach(element => {
      const originalSats = (element as HTMLElement).dataset.originalSats;
      if (originalSats) {
        const satsMatch = originalSats.match(/(\d+(?:,\d{3})*)/);
        if (satsMatch && satsMatch[1]) {
          totalSats += parseInt(satsMatch[1].replace(/,/g, ''));
        }
      }
    });

    // Update the total amount display
    const totalValueElement = document.getElementById('zappedTotalValue');
    if (totalValueElement) {
      totalValueElement.innerText = numberWithCommas(totalSats);
      // Store the original sats amount for fiat conversion
      (totalValueElement as HTMLElement).dataset.originalSats =
        numberWithCommas(totalSats);
    }

    // Total amounts are calculated by the hook automatically
    // No need to manually set totalAmount

    logger.info(
      `Total zaps recalculated: ${numberWithCommas(totalSats)} sats`,
      ErrorCategory.RENDERING
    );
  };

  // Expose functions globally for testing and debugging
  window.refreshBitcoinPrices = refreshBitcoinPrices;
  window.startLivePriceUpdates = startLivePriceUpdates;
  window.stopLivePriceUpdates = stopLivePriceUpdates;
  window.recalculateTotalZaps = recalculateTotalZaps;
  window.updateFiatAmounts = debouncedUpdateFiatAmounts;

  // Style options functionality
  const setupStyleOptions = () => {
    // Debug log removed

    // Start live Bitcoin price updates
    startLivePriceUpdates();

    // Setup color pickers with localStorage saving
    setupColorPicker('textColorPicker', 'textColorValue', 'color');
    setupColorPicker('bgColorPicker', 'bgColorValue', 'backgroundColor');

    // Setup currency selector
    const currencySelector = document.getElementById(
      'currencySelector'
    ) as HTMLSelectElement;
    if (currencySelector) {
      currencySelector.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        if (target) {
          setSelectedCurrency(target.value);
          // Update fiat amounts with new currency if toggle is enabled
          const showFiatToggle = document.getElementById(
            'showFiatToggle'
          ) as HTMLInputElement;
          if (showFiatToggle && showFiatToggle.checked) {
            debouncedUpdateFiatAmounts();
          }
          saveCurrentStylesToLocalStorage();
        }
      });
    }

    // Setup background image functionality
    const bgImagePreset = document.getElementById('bgImagePreset');
    const bgImageUrl = document.getElementById('bgImageUrl');
    const bgPresetPreview = document.getElementById('bgPresetPreview');
    const clearBgImage = document.getElementById('clearBgImage');
    const customUrlGroup = document.getElementById('customUrlGroup');

    if (bgImagePreset) {
      bgImagePreset.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        const selectedValue = target.value;

        if (selectedValue === 'custom') {
          if (customUrlGroup) customUrlGroup.style.display = 'block';
          if (bgImageUrl) (bgImageUrl as HTMLInputElement).focus();
        } else if (selectedValue === 'pubpay-preset') {
          // Apply PubPay preset with all settings
          if (customUrlGroup) customUrlGroup.style.display = 'none';
          applyPubPayPreset();
        } else {
          if (customUrlGroup) customUrlGroup.style.display = 'none';
          if (bgImageUrl) {
            (bgImageUrl as HTMLInputElement).value = selectedValue;
          }
          updateBackgroundImage(selectedValue);
          if (bgPresetPreview) {
            if (selectedValue === '') {
              // No background selected - show white square (container background)
              (bgPresetPreview as HTMLImageElement).src = '';
              (bgPresetPreview as HTMLImageElement).alt = 'No background';
              (bgPresetPreview as HTMLImageElement).style.display = 'none';
            } else {
              // Background selected - show the preview image
              (bgPresetPreview as HTMLImageElement).src = selectedValue;
              (bgPresetPreview as HTMLImageElement).alt = 'Background preview';
              (bgPresetPreview as HTMLImageElement).style.display = 'block';
            }
          }
          saveCurrentStylesToLocalStorage();
        }
      });
    }

    if (bgImageUrl) {
      bgImageUrl.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const url = target.value.trim();
        if (url) {
          const img = new Image();
          img.onload = () => {
            updateBackgroundImage(url);
            if (bgPresetPreview) {
              (bgPresetPreview as HTMLImageElement).src = url;
              (bgPresetPreview as HTMLImageElement).alt = 'Background preview';
            }
            saveCurrentStylesToLocalStorage();
          };
          img.onerror = () => {
            if (bgPresetPreview) {
              (bgPresetPreview as HTMLImageElement).src = '';
              (bgPresetPreview as HTMLImageElement).alt =
                'Failed to load image';
            }
          };
          img.src = url;
        } else {
          updateBackgroundImage('');
          if (bgPresetPreview) {
            (bgPresetPreview as HTMLImageElement).src = '';
            (bgPresetPreview as HTMLImageElement).alt = 'No background';
            (bgPresetPreview as HTMLImageElement).style.display = 'none';
          }
          saveCurrentStylesToLocalStorage();
        }
      });
    }

    if (clearBgImage) {
      clearBgImage.addEventListener('click', () => {
        if (bgImageUrl) (bgImageUrl as HTMLInputElement).value = '';
        if (bgImagePreset) (bgImagePreset as HTMLSelectElement).value = '';
        if (customUrlGroup) customUrlGroup.style.display = 'none';
        updateBackgroundImage('');
        if (bgPresetPreview) {
          (bgPresetPreview as HTMLImageElement).src = '';
          (bgPresetPreview as HTMLImageElement).alt = 'No background';
          (bgPresetPreview as HTMLImageElement).style.display = 'none';
        }
        saveCurrentStylesToLocalStorage();
      });
    }

    // Setup toggles
    setupToggle('layoutInvertToggle', (checked: boolean) => {
      // Debug log removed
      if (checked) {
        document.body.classList.add('flex-direction-invert');
      } else {
        document.body.classList.remove('flex-direction-invert');
      }
      // Debug log removed
    });

    setupToggle('hideZapperContentToggle', (checked: boolean) => {
      // Debug log removed
      if (checked) {
        document.body.classList.add('hide-zapper-content');
      } else {
        document.body.classList.remove('hide-zapper-content');
      }
      // Debug log removed
    });

    setupToggle('showTopZappersToggle', (checked: boolean) => {
      // Debug log removed

      if (checked) {
        // Debug log removed
        document.body.classList.add('show-top-zappers');

        // Check if we have any zap data to work with
        // Debug log removed
        // Debug log removed

        // If we have zaps but no top zappers calculated yet, calculate them
        if (zaps.length > 0 && topZappers.length === 0) {
          // Debug log removed
          calculateTopZappersFromZaps(zaps, new Map());
          // The useEffect will handle displayTopZappers() after state update
        } else if (topZappers.length > 0) {
          // We have top zappers data, display them immediately
          // Debug log removed
          displayTopZappers();
        } else {
          // Debug log removed
          setUserWantsTopZappers(true);
        }
      } else {
        // Debug log removed
        document.body.classList.remove('show-top-zappers');
        hideTopZappersBar();
      }
    });

    setupToggle('podiumToggle', (checked: boolean) => {
      // Debug log removed
      if (checked) {
        document.body.classList.add('podium-enabled');
      } else {
        document.body.classList.remove('podium-enabled');
      }
      // Debug log removed

      // Check if grid layout is active
      const zapGridToggle = document.getElementById(
        'zapGridToggle'
      ) as HTMLInputElement;
      const isGridActive = zapGridToggle?.checked;

      if (isGridActive) {
        // If grid is active, reorganize hierarchically to apply podium classes
        // Debug log removed
        setTimeout(() => {
          organizeZapsHierarchically();
        }, 10);
      } else {
        // If grid is not active, re-render zaps to apply podium styling
        // Note: zaps is Kind9735Event[], but drawKinds9735 expects ProcessedZapData[]
        // The processed zaps are stored in window.zaps
        const processedZaps = window.zaps || [];
        if (processedZaps.length > 0) {
          // Debug log removed
          drawKinds9735(processedZaps);
        }
      }
    });

    setupToggle('zapGridToggle', (checked: boolean) => {
      const zapsList = document.getElementById('zaps');
      if (zapsList) {
        // Check if we're in live event mode (has two-column layout)
        const isLiveEvent = zapsList.classList.contains(
          'live-event-two-column'
        );

        if (isLiveEvent) {
          // Apply grid layout ONLY to zaps-only-list, NOT activity-list
          const zapsOnlyList = document.getElementById('zaps-only-list');

          if (checked) {
            if (zapsOnlyList) {
              zapsOnlyList.classList.add('grid-layout');
              // Force reflow to apply grid-layout class
              void zapsOnlyList.offsetHeight;
            }
            setTimeout(() => {
              organizeZapsHierarchically();
            }, 10);

            // Start periodic re-organization to catch new zaps during load
            if (window.gridPeriodicCheckInterval) {
              clearInterval(window.gridPeriodicCheckInterval);
            }
            window.gridPeriodicCheckInterval = setInterval(() => {
              const gridToggle = document.getElementById(
                'zapGridToggle'
              ) as HTMLInputElement;
              const container = document.getElementById('zaps-only-list');
              if (
                gridToggle &&
                gridToggle.checked &&
                container &&
                container.classList.contains('grid-layout')
              ) {
                // Check if there are zaps outside of .zap-row containers
                const allZaps = container.querySelectorAll(
                  '.zap, .live-event-zap, .zap-only-item'
                );
                const zapsInRows = container.querySelectorAll(
                  '.zap-row .zap, .zap-row .live-event-zap, .zap-row .zap-only-item'
                );

                if (allZaps.length !== zapsInRows.length) {
                  // Some zaps are not in rows, re-organize
                  // Re-organizing grid: found zaps outside rows
                  organizeZapsHierarchically();
                }
              }
            }, 2000); // Check every 2 seconds
          } else {
            // Stop periodic check
            if (window.gridPeriodicCheckInterval) {
              clearInterval(window.gridPeriodicCheckInterval);
              window.gridPeriodicCheckInterval = null;
            }

            // Clean up FIRST (this sets inline styles to force row layout)
            cleanupHierarchicalOrganization();
            // Then remove the class after cleanup
            setTimeout(() => {
              if (zapsOnlyList) {
                zapsOnlyList.classList.remove('grid-layout');
                // Force reflow to ensure styles are recalculated
                void zapsOnlyList.offsetHeight;
              }
              // Also ensure .zaps-list doesn't have grid-layout
              const zapsListElements = document.querySelectorAll('.zaps-list');
              zapsListElements.forEach(list =>
                list.classList.remove('grid-layout')
              );
            }, 10);
          }
        } else {
          // Regular kind1 note mode
          if (checked) {
            zapsList.classList.add('grid-layout');
            // Force reflow to apply grid-layout class
            void zapsList.offsetHeight;
            setTimeout(() => {
              organizeZapsHierarchically();
            }, 10);

            // Start periodic re-organization for kind1 notes too
            if (window.gridPeriodicCheckInterval) {
              clearInterval(window.gridPeriodicCheckInterval);
            }
            window.gridPeriodicCheckInterval = setInterval(() => {
              const gridToggle = document.getElementById(
                'zapGridToggle'
              ) as HTMLInputElement;
              const container = document.getElementById('zaps');
              if (
                gridToggle &&
                gridToggle.checked &&
                container &&
                container.classList.contains('grid-layout')
              ) {
                // Check if there are zaps outside of .zap-row containers
                const allZaps = container.querySelectorAll('.zap');
                const zapsInRows = container.querySelectorAll('.zap-row .zap');

                if (allZaps.length !== zapsInRows.length) {
                  // Some zaps are not in rows, re-organize
                  // Re-organizing grid: found zaps outside rows
                  organizeZapsHierarchically();
                }
              }
            }, 2000); // Check every 2 seconds
          } else {
            // Stop periodic check
            if (window.gridPeriodicCheckInterval) {
              clearInterval(window.gridPeriodicCheckInterval);
              window.gridPeriodicCheckInterval = null;
            }

            // Clean up FIRST (this sets inline styles to force row layout)
            cleanupHierarchicalOrganization();
            // Then remove the class after cleanup
            setTimeout(() => {
              zapsList.classList.remove('grid-layout');
              // Force reflow to ensure styles are recalculated
              void zapsList.offsetHeight;
              // Also ensure .zaps-list doesn't have grid-layout
              const zapsListElements = document.querySelectorAll('.zaps-list');
              zapsListElements.forEach(list =>
                list.classList.remove('grid-layout')
              );
            }, 10);
          }

          // Re-render zaps to apply/remove podium styling based on current state
          // Note: zaps is Kind9735Event[], but drawKinds9735 expects ProcessedZapData[]
          // The processed zaps are stored in window.zaps
          const processedZaps = (window as any).zaps || [];
          if (processedZaps.length > 0) {
            drawKinds9735(processedZaps);
          }
        }
      }
      updateStyleURL();
    });

    setupToggle('qrInvertToggle', () => {
      // Debug log removed
      const qrInvertToggle = document.getElementById(
        'qrInvertToggle'
      ) as HTMLInputElement;
      const qrCodes = [
        document.getElementById('qrCode'),
        document.getElementById('qrCodeNevent'),
        document.getElementById('qrCodeNote')
      ];

      // Debug log removed
      qrCodes.forEach((qrCode, index) => {
        if (qrCode) {
          if (qrInvertToggle?.checked) {
            qrCode.style.filter = 'invert(1)';
          } else {
            qrCode.style.filter = 'none';
          }
          // Debug log removed
        }
      });
    });

    setupToggle('qrScreenBlendToggle', () => {
      const qrScreenBlendToggle = document.getElementById(
        'qrScreenBlendToggle'
      ) as HTMLInputElement;
      const qrMultiplyBlendToggle = document.getElementById(
        'qrMultiplyBlendToggle'
      ) as HTMLInputElement;

      if (qrScreenBlendToggle?.checked) {
        qrMultiplyBlendToggle.checked = false;
      }
      updateBlendModeFromHook();
    });

    setupToggle('qrMultiplyBlendToggle', () => {
      const qrScreenBlendToggle = document.getElementById(
        'qrScreenBlendToggle'
      ) as HTMLInputElement;
      const qrMultiplyBlendToggle = document.getElementById(
        'qrMultiplyBlendToggle'
      ) as HTMLInputElement;

      if (qrMultiplyBlendToggle?.checked) {
        qrScreenBlendToggle.checked = false;
      }
      updateBlendModeFromHook();
    });

    // Setup opacity sliders
    const opacitySlider = document.getElementById(
      'opacitySlider'
    ) as HTMLInputElement;
    const opacityValue = document.getElementById('opacityValue');
    const textOpacitySlider = document.getElementById(
      'textOpacitySlider'
    ) as HTMLInputElement;
    const textOpacityValue = document.getElementById('textOpacityValue');

    if (opacitySlider && opacityValue) {
      // Debug log removed
      opacitySlider.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const value = parseFloat(target.value);
        opacityValue.textContent = `${Math.round(value * 100)}%`;
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    if (textOpacitySlider && textOpacityValue) {
      // Debug log removed
      textOpacitySlider.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const value = parseFloat(target.value);
        textOpacityValue.textContent = `${Math.round(value * 100)}%`;
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    // Setup QR slide visibility toggles
    setupToggle('qrShowWebLinkToggle', () => {
      // Debug log removed
      if (typeof updateQRSlideVisibility === 'function') {
        // Debug log removed
        updateQRSlideVisibility();
      } else {
        // Debug log removed
      }
    });
    setupToggle('qrShowNeventToggle', () => {
      // Debug log removed
      if (typeof updateQRSlideVisibility === 'function') {
        // Debug log removed
        updateQRSlideVisibility();
      } else {
        // Debug log removed
      }
    });
    setupToggle('qrShowNoteToggle', () => {
      // Debug log removed
      if (typeof updateQRSlideVisibility === 'function') {
        // Debug log removed
        updateQRSlideVisibility();
      } else {
        // Debug log removed
      }
    });
    setupToggle('sectionLabelsToggle', (checked: boolean) => {
      const sectionLabels = document.querySelectorAll('.section-label');
      const totalLabels = document.querySelectorAll('.total-label');

      if (checked) {
        // Show section labels, hide total labels
        sectionLabels.forEach(label => {
          (label as HTMLElement).style.display = 'block';
        });
        totalLabels.forEach(label => {
          (label as HTMLElement).style.display = 'none';
        });
        // Remove class to control zaps-header alignment
        document.body.classList.remove('show-total-labels');
      } else {
        // Hide section labels, show total labels
        sectionLabels.forEach(label => {
          (label as HTMLElement).style.display = 'none';
        });
        totalLabels.forEach(label => {
          (label as HTMLElement).style.display = 'inline';
        });
        // Add class to control zaps-header alignment
        document.body.classList.add('show-total-labels');
      }
    });

    setupToggle('qrOnlyToggle', (checked: boolean) => {
      if (checked) {
        document.body.classList.add('qr-only-mode');
      } else {
        document.body.classList.remove('qr-only-mode');
      }
    });

    setupToggle('showFiatToggle', (checked: boolean) => {
      const currencySelectorGroup = document.getElementById(
        'currencySelectorGroup'
      );
      const historicalPriceGroup = document.getElementById(
        'historicalPriceGroup'
      );
      const historicalChangeGroup = document.getElementById(
        'historicalChangeGroup'
      );
      const fiatOnlyGroup = document.getElementById('fiatOnlyGroup');

      if (checked) {
        // Show fiat amounts, currency selector, and historical price toggle
        document.body.classList.add('show-fiat-amounts');
        if (currencySelectorGroup)
          currencySelectorGroup.style.display = 'block';
        if (historicalPriceGroup) historicalPriceGroup.style.display = 'block';
        if (fiatOnlyGroup) fiatOnlyGroup.style.display = 'block';
        debouncedUpdateFiatAmounts();
      } else {
        // Hide fiat amounts, currency selector, and historical price toggle
        document.body.classList.remove('show-fiat-amounts');
        if (currencySelectorGroup) currencySelectorGroup.style.display = 'none';
        if (historicalPriceGroup) historicalPriceGroup.style.display = 'none';
        if (historicalChangeGroup) historicalChangeGroup.style.display = 'none';
        if (fiatOnlyGroup) fiatOnlyGroup.style.display = 'none';
        hideFiatAmounts();
      }
    });

    setupToggle('showHistoricalPriceToggle', (checked: boolean) => {
      const historicalChangeGroup = document.getElementById(
        'historicalChangeGroup'
      );

      if (checked) {
        // Show historical change toggle when historical prices are enabled
        if (historicalChangeGroup)
          historicalChangeGroup.style.display = 'block';
      } else {
        // Hide historical change toggle when historical prices are disabled
        if (historicalChangeGroup) historicalChangeGroup.style.display = 'none';
        // Also uncheck the historical change toggle
        const showHistoricalChangeToggle = document.getElementById(
          'showHistoricalChangeToggle'
        ) as HTMLInputElement;
        if (showHistoricalChangeToggle)
          showHistoricalChangeToggle.checked = false;
      }

      // Update fiat amounts when historical price toggle changes
      const showFiatToggle = document.getElementById(
        'showFiatToggle'
      ) as HTMLInputElement;
      if (showFiatToggle && showFiatToggle.checked) {
        debouncedUpdateFiatAmounts();
      }
      // Save toggle state to localStorage
      saveCurrentStylesToLocalStorage();
    });

    setupToggle('showHistoricalChangeToggle', (checked: boolean) => {
      // Update fiat amounts when historical change toggle changes
      const showFiatToggle = document.getElementById(
        'showFiatToggle'
      ) as HTMLInputElement;
      if (showFiatToggle && showFiatToggle.checked) {
        debouncedUpdateFiatAmounts();
      }
      // Save toggle state to localStorage
      saveCurrentStylesToLocalStorage();
    });

    setupToggle('fiatOnlyToggle', (checked: boolean) => {
      // Update fiat amounts when fiat only toggle changes
      const showFiatToggle = document.getElementById(
        'showFiatToggle'
      ) as HTMLInputElement;
      if (showFiatToggle && showFiatToggle.checked) {
        if (!checked) {
          // If fiat only is being turned off, restore satoshi amounts first
          restoreSatoshiAmounts();
        }
        debouncedUpdateFiatAmounts();
      }
      // Save toggle state to localStorage
      saveCurrentStylesToLocalStorage();
    });

    setupToggle('lightningToggle', async (checked: boolean) => {
      // Skip Lightning calls during preset application
      if (isApplyingPreset) {
        return;
      }

      await handleLightningToggleFromHook(checked, eventId);

      // Update QR slide visibility
      if (typeof updateQRSlideVisibility === 'function') {
        updateQRSlideVisibility();
      }
    });

    // Note: Default values are set in loadInitialStyles() - don't override them here
    // QR slide visibility toggles are loaded and applied in loadInitialStyles()

    // Setup partner logo functionality
    const partnerLogoSelect = document.getElementById(
      'partnerLogoSelect'
    ) as HTMLSelectElement;
    const partnerLogoImg = document.getElementById(
      'partnerLogo'
    ) as HTMLImageElement;
    const partnerLogoUrl = document.getElementById(
      'partnerLogoUrl'
    ) as HTMLInputElement;
    const customPartnerLogoGroup = document.getElementById(
      'customPartnerLogoGroup'
    );
    const partnerLogoPreview = document.getElementById(
      'partnerLogoPreview'
    ) as HTMLImageElement;
    const clearPartnerLogo = document.getElementById('clearPartnerLogo');

    if (partnerLogoSelect) {
      partnerLogoSelect.addEventListener('change', () => {
        if (partnerLogoSelect.value === 'custom') {
          if (customPartnerLogoGroup)
            customPartnerLogoGroup.style.display = 'block';
        } else {
          if (customPartnerLogoGroup)
            customPartnerLogoGroup.style.display = 'none';
          if (partnerLogoUrl) partnerLogoUrl.value = '';
        }
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    if (partnerLogoUrl) {
      partnerLogoUrl.addEventListener('input', () => {
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    if (clearPartnerLogo) {
      clearPartnerLogo.addEventListener('click', () => {
        if (partnerLogoSelect) partnerLogoSelect.value = '';
        if (partnerLogoUrl) partnerLogoUrl.value = '';
        if (customPartnerLogoGroup)
          customPartnerLogoGroup.style.display = 'none';
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    // Apply initial styles
    applyAllStyles();

    // Setup preset buttons
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(button => {
      button.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        const preset = target.getAttribute('data-preset');
        if (preset) {
          applyPreset(preset);
        }
      });
    });

    // Action buttons
    const resetStylesBtn = document.getElementById('resetStyles');
    const copyStyleUrlBtn = document.getElementById('copyStyleUrl');

    if (resetStylesBtn) {
      resetStylesBtn.addEventListener('click', resetToDefaults);
    }

    if (copyStyleUrlBtn) {
      copyStyleUrlBtn.addEventListener('click', copyStyleUrl);
    }
  };

  // Debounce function to limit how often applyAllStyles is called
  let applyStylesTimeout: NodeJS.Timeout | null = null;
  const debouncedApplyAllStyles = () => {
    if (applyStylesTimeout) {
      clearTimeout(applyStylesTimeout);
    }
    applyStylesTimeout = setTimeout(() => {
      applyAllStyles();
    }, 50); // 50ms debounce
  };

  const setupColorPicker = (
    pickerId: string,
    valueId: string,
    targetProperty: string
  ) => {
    const picker = document.getElementById(pickerId) as HTMLInputElement;
    const value = document.getElementById(valueId) as HTMLInputElement;

    if (picker && value) {
      // Debug log removed
      picker.addEventListener('input', () => {
        const color = toHexColor(picker.value);
        value.value = color;
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });

      value.addEventListener('input', () => {
        const color = toHexColor(value.value);
        picker.value = color;
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    } else {
      // Debug log removed
    }
  };

  // Track which toggles have been set up to prevent duplicates
  const setupToggleTracker = new Set<string>();

  // Flag to prevent Lightning calls during preset application
  let isApplyingPreset = false;

  // Fiat conversion is now handled by useFiatConversion hook

  // Expose fiat conversion utilities to window for overlay component
  (window as any).satsToFiat = satsToFiat;
  (window as any).getBitcoinPrices = () => bitcoinPriceService.getPrices();
  (window as any).getSelectedFiatCurrency = () => selectedCurrency;

  const setupToggle = (
    toggleId: string,
    callback: (checked: boolean) => void
  ) => {
    // Prevent duplicate setup
    if (setupToggleTracker.has(toggleId)) {
      return;
    }

    const toggle = document.getElementById(toggleId) as HTMLInputElement;
    if (toggle) {
      // Remove existing event listeners to prevent duplicates
      const newToggle = toggle.cloneNode(true) as HTMLInputElement;
      toggle.parentNode?.replaceChild(newToggle, toggle);

      newToggle.addEventListener('change', () => {
        callback(newToggle.checked);
        saveCurrentStylesToLocalStorage();
      });

      // Mark as set up
      setupToggleTracker.add(toggleId);
    } else {
      handleError(
        new Error(`Toggle element not found: ${toggleId}`),
        `Toggle element not found: ${toggleId}`,
        ErrorCategory.RENDERING,
        ErrorSeverity.LOW,
        { toggleId }
      );
    }
  };

  // toHexColor and hexToRgba are now provided by useStyleManagement hook

  // Load initial styles from localStorage or apply defaults
  const loadInitialStyles = () => {
    // Load initial styles from localStorage or apply defaults

    // Prevent multiple calls during the same session
    if (window.loadInitialStylesCalled) {
      // loadInitialStyles already called, skipping
      return;
    }
    window.loadInitialStylesCalled = true;

    // Check if there are URL parameters first
    const params = new URLSearchParams(window.location.search);
    if (params.toString() !== '') {
      applyStylesFromURL();
      // Ensure QR codes are visible after applying styles from URL
      setTimeout(() => {
        if (updateQRSlideVisibilityRef.current) {
          updateQRSlideVisibilityRef.current(true);
        }
      }, 600);
      return; // URL parameters take precedence, skip localStorage
    }

    // Load saved styles from localStorage if no URL parameters
    const savedStyles = appLocalStorage.getStyleOptions();

    if (savedStyles) {
      const styles = savedStyles;
      // Loading styles from localStorage

      // Debug background image loading
      if (styles.bgImage || styles.backgroundImage) {
        // Debug log removed
      }

      // Apply saved text color
      if (styles.textColor) {
        const textColorPicker = document.getElementById(
          'textColorPicker'
        ) as HTMLInputElement;
        const textColorValue = document.getElementById(
          'textColorValue'
        ) as HTMLInputElement;
        if (textColorPicker) {
          textColorPicker.value = styles.textColor;
          // Applied text color to picker
        }
        if (textColorValue) {
          textColorValue.value = styles.textColor;
          // Applied text color to value input
        }
      }

      // Apply saved background color (check both old and new property names)
      const bgColor = styles.bgColor || styles.backgroundColor;
      if (bgColor) {
        const bgColorPicker = document.getElementById(
          'bgColorPicker'
        ) as HTMLInputElement;
        const bgColorValue = document.getElementById(
          'bgColorValue'
        ) as HTMLInputElement;
        if (bgColorPicker) {
          bgColorPicker.value = bgColor;
        }
        if (bgColorValue) {
          bgColorValue.value = bgColor;
        }
      }

      // Apply saved opacity values
      if (styles.opacity !== undefined) {
        const opacitySlider = document.getElementById(
          'opacitySlider'
        ) as HTMLInputElement;
        const opacityValue = document.getElementById('opacityValue');
        // Debug log removed
        if (opacitySlider) {
          opacitySlider.value = styles.opacity.toString();
          // Debug log removed
        }
        if (opacityValue) {
          opacityValue.textContent = `${Math.round(styles.opacity * 100)}%`;
          // Debug log removed
        }
      }

      if (styles.textOpacity !== undefined) {
        const textOpacitySlider = document.getElementById(
          'textOpacitySlider'
        ) as HTMLInputElement;
        const textOpacityValue = document.getElementById('textOpacityValue');
        // Debug log removed
        if (textOpacitySlider) {
          textOpacitySlider.value = styles.textOpacity.toString();
          // Debug log removed
        }
        if (textOpacityValue) {
          textOpacityValue.textContent = `${Math.round(styles.textOpacity * 100)}%`;
          // Debug log removed
        }
      }

      // Apply saved partner logo
      if (styles.partnerLogo !== undefined) {
        const partnerLogoSelect = document.getElementById(
          'partnerLogoSelect'
        ) as HTMLSelectElement;
        const partnerLogoUrl = document.getElementById(
          'partnerLogoUrl'
        ) as HTMLInputElement;
        const customPartnerLogoGroup = document.getElementById(
          'customPartnerLogoGroup'
        );

        if (partnerLogoSelect) {
          if (styles.partnerLogo) {
            // Check if it's a predefined option
            const matchingOption = Array.from(partnerLogoSelect.options).find(
              option => option.value === styles.partnerLogo
            );
            if (matchingOption) {
              partnerLogoSelect.value = styles.partnerLogo;
              if (customPartnerLogoGroup)
                customPartnerLogoGroup.style.display = 'none';
            } else {
              // It's a custom URL
              partnerLogoSelect.value = 'custom';
              if (customPartnerLogoGroup)
                customPartnerLogoGroup.style.display = 'block';
              if (partnerLogoUrl) partnerLogoUrl.value = styles.partnerLogo;
            }
          } else {
            // No logo
            partnerLogoSelect.value = '';
            if (customPartnerLogoGroup)
              customPartnerLogoGroup.style.display = 'none';
            if (partnerLogoUrl) partnerLogoUrl.value = '';
          }
        }
      }

      // Apply saved currency selection
      if (styles.selectedCurrency) {
        const currencySelector = document.getElementById(
          'currencySelector'
        ) as HTMLSelectElement;
        if (currencySelector) {
          currencySelector.value = styles.selectedCurrency;
          setSelectedCurrency(styles.selectedCurrency);
        }
      }

      // Apply saved background image (check both old and new property names)
      const bgImage = styles.bgImage || styles.backgroundImage;
      if (bgImage !== undefined) {
        const bgImagePreset = document.getElementById(
          'bgImagePreset'
        ) as HTMLSelectElement;
        const bgImageUrl = document.getElementById(
          'bgImageUrl'
        ) as HTMLInputElement;
        const customBgImageGroup =
          document.getElementById('customBgImageGroup');
        const bgPresetPreview = document.getElementById(
          'bgPresetPreview'
        ) as HTMLImageElement;

        if (bgImagePreset) {
          if (bgImage) {
            // Debug log removed
            // Check if it's a predefined option
            const matchingOption = Array.from(bgImagePreset.options).find(
              option => option.value === bgImage
            );
            if (matchingOption) {
              // Debug log removed
              bgImagePreset.value = bgImage;
              if (customBgImageGroup) customBgImageGroup.style.display = 'none';
              // Immediately set the URL value to avoid timing issues
              if (bgImageUrl) {
                bgImageUrl.value = bgImage;
                // Debug log removed
              }
            } else {
              // Debug log removed
              // It's a custom URL
              bgImagePreset.value = 'custom';
              if (customBgImageGroup)
                customBgImageGroup.style.display = 'block';
              if (bgImageUrl) {
                bgImageUrl.value = bgImage;
                // Debug log removed
              }
            }

            // Update background preview image
            if (bgPresetPreview) {
              bgPresetPreview.src = bgImage;
              bgPresetPreview.alt = 'Background preview';
              // Debug log removed
            }
          } else {
            // Debug log removed
            // No background
            bgImagePreset.value = '';
            if (customBgImageGroup) customBgImageGroup.style.display = 'none';
            if (bgImageUrl) bgImageUrl.value = '';

            // Clear background preview image
            if (bgPresetPreview) {
              bgPresetPreview.src = '';
              bgPresetPreview.alt = 'No background';
              bgPresetPreview.style.display = 'none';
              // Debug log removed
            }
          }
        }
      }

      // Apply saved toggles
      const toggleIds = [
        'layoutInvertToggle',
        'hideZapperContentToggle',
        'showTopZappersToggle',
        'podiumToggle',
        'zapGridToggle',
        'sectionLabelsToggle',
        'qrOnlyToggle',
        'showFiatToggle',
        'showHistoricalPriceToggle',
        'showHistoricalChangeToggle',
        'fiatOnlyToggle',
        'qrInvertToggle',
        'qrScreenBlendToggle',
        'qrMultiplyBlendToggle',
        'qrShowWebLinkToggle',
        'qrShowNeventToggle',
        'qrShowNoteToggle',
        'lightningToggle'
      ];

      // Map localStorage property names to toggle IDs
      const propertyToToggleMap: { [key: string]: string } = {
        qrShowWebLink: 'qrShowWebLinkToggle',
        qrShowNevent: 'qrShowNeventToggle',
        qrShowNote: 'qrShowNoteToggle',
        qrInvert: 'qrInvertToggle',
        qrScreenBlend: 'qrScreenBlendToggle',
        qrMultiplyBlend: 'qrMultiplyBlendToggle',
        layoutInvert: 'layoutInvertToggle',
        hideZapperContent: 'hideZapperContentToggle',
        showTopZappers: 'showTopZappersToggle',
        podium: 'podiumToggle',
        zapGrid: 'zapGridToggle',
        sectionLabels: 'sectionLabelsToggle',
        qrOnly: 'qrOnlyToggle',
        showFiat: 'showFiatToggle',
        showHistoricalPrice: 'showHistoricalPriceToggle',
        showHistoricalChange: 'showHistoricalChangeToggle',
        fiatOnly: 'fiatOnlyToggle',
        lightning: 'lightningToggle'
      };

      toggleIds.forEach(toggleId => {
        const toggle = document.getElementById(toggleId) as HTMLInputElement;
        // Find the corresponding property name in localStorage
        const propertyName = Object.keys(propertyToToggleMap).find(
          key => propertyToToggleMap[key] === toggleId
        );
        if (toggle && propertyName) {
          // If property is undefined, use default value
          // For sectionLabels, default is false (hidden)
          const defaultValue =
            propertyName === 'sectionLabels'
              ? false
              : propertyName === 'qrShowWebLink'
                ? true
                : propertyName === 'qrShowNevent'
                  ? true
                  : propertyName === 'qrShowNote'
                    ? true
                    : false;
          const value =
            styles[propertyName] !== undefined
              ? styles[propertyName]
              : defaultValue;
          // Debug log removed
          toggle.checked = value;
          // Manually trigger the toggle callback to apply the visual effects
          const toggleCallbacks = {
            layoutInvertToggle: (checked: boolean) => {
              if (checked) {
                document.body.classList.add('flex-direction-invert');
              } else {
                document.body.classList.remove('flex-direction-invert');
              }
            },
            hideZapperContentToggle: (checked: boolean) => {
              if (checked) {
                document.body.classList.add('hide-zapper-content');
              } else {
                document.body.classList.remove('hide-zapper-content');
              }
            },
            showTopZappersToggle: (checked: boolean) => {
              if (checked) {
                // Debug log removed
                document.body.classList.add('show-top-zappers');
                // Don't call displayTopZappers here - it will be called by the useEffect when topZappers data is ready
              } else {
                // Debug log removed
                document.body.classList.remove('show-top-zappers');
                const topZappersBar =
                  document.getElementById('top-zappers-bar');
                if (topZappersBar) {
                  topZappersBar.style.display = 'none';
                }
              }
            },
            podiumToggle: (checked: boolean) => {
              if (checked) {
                document.body.classList.add('podium-enabled');
              } else {
                document.body.classList.remove('podium-enabled');
              }
            },
            zapGridToggle: (checked: boolean) => {
              const zapsList = document.getElementById('zaps');
              if (zapsList) {
                // Check if we're in live event mode (has two-column layout)
                const isLiveEvent = zapsList.classList.contains(
                  'live-event-two-column'
                );

                if (isLiveEvent) {
                  // Apply grid layout ONLY to zaps-only-list, NOT activity-list
                  const zapsOnlyList =
                    document.getElementById('zaps-only-list');

                  if (checked) {
                    if (zapsOnlyList) {
                      zapsOnlyList.classList.add('grid-layout');
                      // Force reflow
                      void zapsOnlyList.offsetHeight;
                    }
                    // Organize zaps after a brief delay to ensure DOM is ready
                    setTimeout(() => {
                      organizeZapsHierarchically();
                    }, 100);
                  } else {
                    // Clean up FIRST (this sets inline styles to force row layout)
                    cleanupHierarchicalOrganization();
                    // Then remove the class after cleanup
                    setTimeout(() => {
                      if (zapsOnlyList) {
                        zapsOnlyList.classList.remove('grid-layout');
                        // Force reflow
                        void zapsOnlyList.offsetHeight;
                      }
                      // Also ensure .zaps-list doesn't have grid-layout
                      const zapsListElements =
                        document.querySelectorAll('.zaps-list');
                      zapsListElements.forEach(list =>
                        list.classList.remove('grid-layout')
                      );
                    }, 10);
                  }
                } else {
                  // Regular kind1 note mode
                  if (checked) {
                    zapsList.classList.add('grid-layout');
                    // Force reflow
                    void zapsList.offsetHeight;
                    // Organize zaps after a brief delay to ensure DOM is ready
                    setTimeout(() => {
                      organizeZapsHierarchically();
                    }, 100);
                  } else {
                    // Clean up FIRST (this sets inline styles to force row layout)
                    cleanupHierarchicalOrganization();
                    // Then remove the class after cleanup
                    setTimeout(() => {
                      zapsList.classList.remove('grid-layout');
                      // Force reflow
                      void zapsList.offsetHeight;
                      // Also ensure .zaps-list doesn't have grid-layout
                      const zapsListElements =
                        document.querySelectorAll('.zaps-list');
                      zapsListElements.forEach(list =>
                        list.classList.remove('grid-layout')
                      );
                    }, 10);
                  }
                }
              }
            },
            sectionLabelsToggle: (checked: boolean) => {
              const sectionLabels = document.querySelectorAll('.section-label');
              const totalLabels = document.querySelectorAll('.total-label');

              if (checked) {
                // Show section labels, hide total labels
                sectionLabels.forEach(label => {
                  (label as HTMLElement).style.display = 'block';
                });
                totalLabels.forEach(label => {
                  (label as HTMLElement).style.display = 'none';
                });
                // Remove class to control zaps-header alignment
                document.body.classList.remove('show-total-labels');
              } else {
                // Hide section labels, show total labels
                sectionLabels.forEach(label => {
                  (label as HTMLElement).style.display = 'none';
                });
                totalLabels.forEach(label => {
                  (label as HTMLElement).style.display = 'inline';
                });
                // Add class to control zaps-header alignment
                document.body.classList.add('show-total-labels');
              }
            },
            qrOnlyToggle: (checked: boolean) => {
              if (checked) {
                document.body.classList.add('qr-only-mode');
              } else {
                document.body.classList.remove('qr-only-mode');
              }
            },
            showFiatToggle: (checked: boolean) => {
              const currencySelectorGroup = document.getElementById(
                'currencySelectorGroup'
              );
              const historicalPriceGroup = document.getElementById(
                'historicalPriceGroup'
              );
              const historicalChangeGroup = document.getElementById(
                'historicalChangeGroup'
              );
              const fiatOnlyGroup = document.getElementById('fiatOnlyGroup');

              if (checked) {
                // Show fiat amounts, currency selector, and historical price toggle
                document.body.classList.add('show-fiat-amounts');
                if (currencySelectorGroup)
                  currencySelectorGroup.style.display = 'block';
                if (historicalPriceGroup)
                  historicalPriceGroup.style.display = 'block';
                if (fiatOnlyGroup) fiatOnlyGroup.style.display = 'block';
                debouncedUpdateFiatAmounts();
              } else {
                // Hide fiat amounts, currency selector, and historical price toggle
                document.body.classList.remove('show-fiat-amounts');
                if (currencySelectorGroup)
                  currencySelectorGroup.style.display = 'none';
                if (historicalPriceGroup)
                  historicalPriceGroup.style.display = 'none';
                if (historicalChangeGroup)
                  historicalChangeGroup.style.display = 'none';
                if (fiatOnlyGroup) fiatOnlyGroup.style.display = 'none';
                hideFiatAmounts();
              }
            },
            showHistoricalPriceToggle: (checked: boolean) => {
              const historicalChangeGroup = document.getElementById(
                'historicalChangeGroup'
              );

              if (checked) {
                // Show historical change toggle when historical prices are enabled
                if (historicalChangeGroup)
                  historicalChangeGroup.style.display = 'block';
              } else {
                // Hide historical change toggle when historical prices are disabled
                if (historicalChangeGroup)
                  historicalChangeGroup.style.display = 'none';
                // Also uncheck the historical change toggle
                const showHistoricalChangeToggle = document.getElementById(
                  'showHistoricalChangeToggle'
                ) as HTMLInputElement;
                if (showHistoricalChangeToggle)
                  showHistoricalChangeToggle.checked = false;
              }

              // Update fiat amounts when historical price toggle changes
              const showFiatToggle = document.getElementById(
                'showFiatToggle'
              ) as HTMLInputElement;
              if (showFiatToggle && showFiatToggle.checked) {
                debouncedUpdateFiatAmounts();
              }
            },
            showHistoricalChangeToggle: (checked: boolean) => {
              // Update fiat amounts when historical change toggle changes
              const showFiatToggle = document.getElementById(
                'showFiatToggle'
              ) as HTMLInputElement;
              if (showFiatToggle && showFiatToggle.checked) {
                debouncedUpdateFiatAmounts();
              }
            },
            fiatOnlyToggle: (checked: boolean) => {
              // Update fiat amounts when fiat only toggle changes
              const showFiatToggle = document.getElementById(
                'showFiatToggle'
              ) as HTMLInputElement;
              if (showFiatToggle && showFiatToggle.checked) {
                if (!checked) {
                  // If fiat only is being turned off, restore satoshi amounts first
                  restoreSatoshiAmounts();
                }
                debouncedUpdateFiatAmounts();
              }
            },
            qrInvertToggle: (checked: boolean) => {
              const qrCodes = [
                document.getElementById('qrCode'),
                document.getElementById('qrCodeNevent'),
                document.getElementById('qrCodeNote')
              ];

              qrCodes.forEach((qrCode, index) => {
                if (qrCode) {
                  if (checked) {
                    qrCode.style.filter = 'invert(1)';
                  } else {
                    qrCode.style.filter = 'none';
                  }
                  // Debug log removed
                }
              });
            },
            qrScreenBlendToggle: (checked: boolean) => {
              // Debug log removed
              // Call updateBlendMode to apply the correct CSS classes
              updateBlendModeFromHook();
            },
            qrMultiplyBlendToggle: (checked: boolean) => {
              // Debug log removed
              // Call updateBlendMode to apply the correct CSS classes
              updateBlendModeFromHook();
            },
            qrShowWebLinkToggle: (checked: boolean) => {
              // Debug log removed
              // Don't call updateQRSlideVisibility here - will be called at end of loadInitialStyles
            },
            qrShowNeventToggle: (checked: boolean) => {
              // Debug log removed
              // Don't call updateQRSlideVisibility here - will be called at end of loadInitialStyles
            },
            qrShowNoteToggle: (checked: boolean) => {
              // Debug log removed
              // Don't call updateQRSlideVisibility here - will be called at end of loadInitialStyles
            },
            lightningToggle: async (checked: boolean) => {
              const lightningToggle = document.getElementById(
                'lightningToggle'
              ) as HTMLInputElement;
              if (lightningToggle) {
                lightningToggle.checked = checked;
                await handleLightningToggleFromHook(checked, eventId);
              }
            }
          };

          const callback =
            toggleCallbacks[toggleId as keyof typeof toggleCallbacks];
          if (callback) {
            // Debug log removed
            // Use the value we set (which includes default if undefined)
            callback(value);
          }
        }
      });
    } else {
      // Debug log removed
      // Apply default styles when no saved styles exist
      const textColorPicker = document.getElementById(
        'textColorPicker'
      ) as HTMLInputElement;
      const textColorValue = document.getElementById(
        'textColorValue'
      ) as HTMLInputElement;
      const bgColorPicker = document.getElementById(
        'bgColorPicker'
      ) as HTMLInputElement;
      const bgColorValue = document.getElementById(
        'bgColorValue'
      ) as HTMLInputElement;
      const opacitySlider = document.getElementById(
        'opacitySlider'
      ) as HTMLInputElement;
      const opacityValue = document.getElementById('opacityValue');
      const textOpacitySlider = document.getElementById(
        'textOpacitySlider'
      ) as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');

      // Set default values
      const defaultTextColor = '#000000';
      const defaultBgColor = '#ffffff';
      const defaultOpacity = 1.0;
      const defaultTextOpacity = 1.0;

      if (textColorPicker) textColorPicker.value = defaultTextColor;
      if (textColorValue) textColorValue.value = defaultTextColor;
      if (bgColorPicker) bgColorPicker.value = defaultBgColor;
      if (bgColorValue) bgColorValue.value = defaultBgColor;
      if (opacitySlider) opacitySlider.value = defaultOpacity.toString();
      if (opacityValue)
        opacityValue.textContent = `${Math.round(defaultOpacity * 100)}%`;
      if (textOpacitySlider)
        textOpacitySlider.value = defaultTextOpacity.toString();
      if (textOpacityValue)
        textOpacityValue.textContent = `${Math.round(defaultTextOpacity * 100)}%`;

      // Set default toggle states
      const sectionLabelsToggle = document.getElementById(
        'sectionLabelsToggle'
      ) as HTMLInputElement;
      if (sectionLabelsToggle) {
        // Default state: section labels hidden (toggle should be OFF)
        // First hide the labels immediately to prevent flash
        const sectionLabels = document.querySelectorAll('.section-label');
        const totalLabels = document.querySelectorAll('.total-label');
        sectionLabels.forEach(label => {
          (label as HTMLElement).style.display = 'none';
        });
        totalLabels.forEach(label => {
          (label as HTMLElement).style.display = 'inline';
        });
        document.body.classList.add('show-total-labels');
        // Then set the toggle state
        sectionLabelsToggle.checked = false;
      }

      // Set default QR slide visibility - ensure at least one is enabled
      const qrShowNeventToggle = document.getElementById(
        'qrShowNeventToggle'
      ) as HTMLInputElement;
      const qrShowWebLinkToggle = document.getElementById(
        'qrShowWebLinkToggle'
      ) as HTMLInputElement;
      const qrShowNoteToggle = document.getElementById(
        'qrShowNoteToggle'
      ) as HTMLInputElement;

      // Check if any QR toggle is already enabled
      const hasAnyEnabled =
        qrShowWebLinkToggle?.checked ||
        qrShowNeventToggle?.checked ||
        qrShowNoteToggle?.checked;

      // If none are enabled, enable nevent by default
      if (!hasAnyEnabled && qrShowNeventToggle) {
        qrShowNeventToggle.checked = true;
      }
    }

    // Apply all styles after loading (with small delay to ensure DOM is ready)
    setTimeout(() => {
      applyAllStyles();

      // Update QR slide visibility after all styles and toggles are loaded
      setTimeout(() => {
        if (updateQRSlideVisibilityRef.current) {
          // Debug log removed
          updateQRSlideVisibilityRef.current(true); // Skip URL update during initialization
        }
      }, 200); // Additional delay to ensure all toggles are set

      // Ensure QR codes are initialized if they don't exist
      setTimeout(async () => {
        const qrCode = document.getElementById('qrCode');
        if (!qrCode || !qrCode.innerHTML || qrCode.innerHTML.trim() === '') {
          // QR codes not initialized, initialize them now
          // Use eventId from URL if available
          await initializeQRCodePlaceholders(eventId);
          // Update visibility after initialization (with delay to ensure QR codes are rendered)
          setTimeout(() => {
            if (updateQRSlideVisibilityRef.current) {
              updateQRSlideVisibilityRef.current(true);
            }
          }, 400);
        }
      }, 300);
    }, 100);
  };

  // saveCurrentStylesToLocalStorage is now provided by useStyleManagement hook

  // applyAllStyles is now provided by useStyleManagement hook

  const applyColor = (property: string, color: string) => {
    const mainLayout = document.querySelector('.main-layout') as HTMLElement;
    const liveElement = document.querySelector('.live') as HTMLElement;

    if (property === 'color') {
      // For text color, use CSS custom property for consistent inheritance
      if (mainLayout) {
        mainLayout.style.setProperty('--text-color', color);
      }

      // Apply color to specific elements that need hardcoded color overrides
      const hardcodedElements = mainLayout?.querySelectorAll(`
        .zaps-header-left h2,
        .total-label,
        .total-sats,
        .total-amount,
        .zapperName,
        .zapperMessage,
        .zapperAmount,
        .zapperAmountSats,
        .zapperAmountLabel
      `);

      if (hardcodedElements) {
        hardcodedElements.forEach(element => {
          (element as HTMLElement).style.color = color;
        });
      }
    } else if (property === 'backgroundColor') {
      // For background color, update the main-layout with current opacity
      const opacitySlider = document.getElementById(
        'opacitySlider'
      ) as HTMLInputElement;
      const currentOpacity = opacitySlider
        ? parseFloat(opacitySlider.value)
        : 1.0;
      const rgbaColor = hexToRgba(color, currentOpacity);

      if (mainLayout) {
        mainLayout.style.backgroundColor = rgbaColor;
      }
    } else {
      // For other properties, update the live element
      if (liveElement) {
        liveElement.style.setProperty(`--${property}`, color);
      }
    }
  };

  // updateBackgroundImage is now provided by useStyleManagement hook

  // updateBlendMode is now provided by useStyleManagement hook (updateBlendModeFromHook)

  // applyPreset is now provided by useStyleManagement hook

  // QR slide visibility functionality with complex swiper management

  // QR slide visibility functionality with complex swiper management
  let qrVisibilityUpdateTimeout: NodeJS.Timeout | null = null;

  const updateQRSlideVisibility = useCallback((skipURLUpdate = false) => {
    // Clear any existing timeout to debounce rapid calls
    if (qrVisibilityUpdateTimeout) {
      clearTimeout(qrVisibilityUpdateTimeout);
    }

    // For user interactions (not skipURLUpdate), add a small debounce
    if (!skipURLUpdate) {
      qrVisibilityUpdateTimeout = setTimeout(() => {
        updateQRSlideVisibilityImmediate(skipURLUpdate);
      }, 150);
      return;
    }

    // For initialization calls (skipURLUpdate = true), execute immediately
    updateQRSlideVisibilityImmediate(skipURLUpdate);
  }, []);

  // Update ref when updateQRSlideVisibility is defined
  useEffect(() => {
    updateQRSlideVisibilityRef.current = updateQRSlideVisibility;
  }, [updateQRSlideVisibility]);

  const updateQRSlideVisibilityImmediate = (skipURLUpdate = false) => {
    // Debug log removed

    // Get toggle states
    const webLinkToggle = document.getElementById(
      'qrShowWebLinkToggle'
    ) as HTMLInputElement;
    const neventToggle = document.getElementById(
      'qrShowNeventToggle'
    ) as HTMLInputElement;
    const noteToggle = document.getElementById(
      'qrShowNoteToggle'
    ) as HTMLInputElement;
    const lightningToggle = document.getElementById(
      'lightningToggle'
    ) as HTMLInputElement;

    const showWebLink = webLinkToggle?.checked ?? false;
    const showNevent = neventToggle?.checked ?? true;
    const showNote = noteToggle?.checked ?? false;
    const showLightning = lightningToggle?.checked ?? false;

    // Update QR slide visibility based on toggle states

    // Debug log removed

    // Get all existing slides using the same selectors as original
    let webLinkSlide = document.querySelector(
      '.swiper-slide:has(#qrCode)'
    ) as HTMLElement;
    let neventSlide = document.querySelector(
      '.swiper-slide:has(#qrCodeNevent)'
    ) as HTMLElement;
    const noteSlide = document.querySelector(
      '.swiper-slide:has(#qrCodeNote)'
    ) as HTMLElement;
    const lightningSlide = document.getElementById(
      'lightningQRSlide'
    ) as HTMLElement;

    // Fallback: if :has() doesn't work, find slides manually
    if (!webLinkSlide) {
      const qrCode = document.getElementById('qrCode');
      if (qrCode) {
        webLinkSlide = qrCode.closest('.swiper-slide') as HTMLElement;
      }
    }

    if (!neventSlide) {
      const qrCodeNevent = document.getElementById('qrCodeNevent');
      if (qrCodeNevent) {
        neventSlide = qrCodeNevent.closest('.swiper-slide') as HTMLElement;
      }
    }

    // Debug: Log slide detection
    // Detect visible QR slides and update visibility

    // Create or get hidden slides container
    let hiddenSlidesContainer = document.getElementById(
      'hiddenSlidesContainer'
    );
    if (!hiddenSlidesContainer) {
      hiddenSlidesContainer = document.createElement('div');
      hiddenSlidesContainer.id = 'hiddenSlidesContainer';
      hiddenSlidesContainer.style.display = 'none';
      document.body.appendChild(hiddenSlidesContainer);
    }

    const swiperWrapper = document.querySelector(
      '.qr-swiper .swiper-wrapper'
    ) as HTMLElement;

    // If swiper wrapper doesn't exist (e.g., on note loader page), return early
    if (!swiperWrapper) {
      // Debug log removed
      return;
    }

    // Define slide order for proper positioning
    const slideOrder = [
      { slide: webLinkSlide, show: showWebLink, name: 'webLink' },
      { slide: neventSlide, show: showNevent, name: 'nevent' },
      { slide: noteSlide, show: showNote, name: 'note' },
      { slide: lightningSlide, show: showLightning, name: 'lightning' }
    ];

    // Process slides in order to maintain proper sequence
    slideOrder.forEach((slideInfo, index) => {
      const { slide, show, name } = slideInfo;

      if (!slide) return;

      if (show) {
        // Move to swiper wrapper if not already there
        if (!swiperWrapper.contains(slide)) {
          // Find the correct position to insert
          let inserted = false;
          const existingSlides = Array.from(swiperWrapper.children);

          // Insert before the first slide that comes after this one in slideOrder
          for (let i = index + 1; i < slideOrder.length; i++) {
            const nextSlide = slideOrder[i].slide;
            if (nextSlide && existingSlides.includes(nextSlide)) {
              swiperWrapper.insertBefore(slide, nextSlide);
              inserted = true;
              break;
            }
          }

          // If no slide found after, append to end
          if (!inserted) {
            swiperWrapper.appendChild(slide);
          }
        }
        slide.style.display = 'block';
        // Slide is visible
      } else {
        // Move to hidden container
        if (swiperWrapper.contains(slide)) {
          hiddenSlidesContainer.appendChild(slide);
          // Slide is hidden
        }
      }
    });

    // Count visible slides (those in the swiper wrapper)
    const visibleSlides = Array.from(swiperWrapper.children).filter(slide =>
      slide.classList.contains('swiper-slide')
    );

    // Show QR swiper if there are visible slides
    const qrSwiper = document.querySelector('.qr-swiper') as HTMLElement;
    if (qrSwiper && visibleSlides.length > 0) {
      qrSwiper.style.display = 'block';
    } else if (qrSwiper && visibleSlides.length === 0) {
      qrSwiper.style.display = 'none';
      // QR swiper hidden (no visible slides)
    }

    // Debug log removed
    // Debug log removed
    // Debug log removed

    // Show/hide swiper container
    const qrSwiperContainer = document.querySelector(
      '.qr-swiper'
    ) as HTMLElement;
    if (qrSwiperContainer && visibleSlides.length > 0) {
      qrSwiperContainer.style.display = 'block';

      // Update swiper if it exists
      if ((window as any).qrSwiper) {
        try {
          (window as any).qrSwiper.update();

          // Update swiper behavior based on visible slides
          if (visibleSlides.length === 1) {
            (window as any).qrSwiper.allowTouchMove = false;
            if (
              (window as any).qrSwiper.autoplay &&
              (window as any).qrSwiper.autoplay.stop
            ) {
              (window as any).qrSwiper.autoplay.stop();
            }
            // Progress tracking is now handled by useQRCode hook
          } else if (visibleSlides.length > 1) {
            (window as any).qrSwiper.allowTouchMove = true;
            // Update autoplay delay to 10 seconds
            if ((window as any).qrSwiper.autoplay) {
              (window as any).qrSwiper.autoplay.params.delay = 10000;
              if ((window as any).qrSwiper.autoplay.start) {
                (window as any).qrSwiper.autoplay.start();
              }
            }
            // Progress tracking is handled by swiper event handlers
          }
        } catch (error) {
          // Debug log removed
          // If update fails, reinitialize swiper
          initializeQRSwiper();
        }
      } else {
        // Initialize swiper if it doesn't exist
        initializeQRSwiper();
      }
    } else if (qrSwiperContainer) {
      qrSwiperContainer.style.display = 'none';
    }

    // Update URL if not skipping
    if (!skipURLUpdate) {
      // updateStyleURL(); // This would be called if we had URL updating
    }
  };

  // Initialize QR swiper with proper configuration
  // initializeQRSwiper and progress tracking functions are now imported from useQRCode hook

  // Top zappers management functions

  // CRITICAL FIX: Set callback refs immediately after all functions are defined
  // This ensures refs are available when subscriptions trigger, preventing lost events
  // We use useEffect to set refs after the component has rendered and all functions are defined
  useEffect(() => {
    // Set all callback refs - functions are now defined (const declarations are available after definition)
    // This runs after the component has rendered, so all functions are defined
    if (typeof displayLiveEvent !== 'undefined') {
      displayLiveEventRef.current = displayLiveEvent;
    }
    if (typeof displayLiveChatMessage !== 'undefined') {
      displayLiveChatMessageRef.current = displayLiveChatMessage;
    }
    if (typeof updateProfile !== 'undefined') {
      updateProfileRef.current = updateProfile;
    }
    if (typeof updateLiveEventHostProfile !== 'undefined') {
      updateLiveEventHostProfileRef.current = updateLiveEventHostProfile;
    }
    if (typeof drawKind1 !== 'undefined') {
      drawKind1Ref.current = drawKind1;
    }
    if (typeof drawKind0 !== 'undefined') {
      drawKind0Ref.current = drawKind0;
    }
    if (typeof drawKinds9735 !== 'undefined') {
      drawKinds9735Ref.current = drawKinds9735;
    }
  }, [
    displayLiveEvent,
    displayLiveChatMessage,
    updateProfile,
    updateLiveEventHostProfile,
    drawKind1,
    drawKind0,
    drawKinds9735
  ]);

  // Cleanup function
  const cleanup = () => {
    if (applyStylesTimeout) {
      clearTimeout(applyStylesTimeout);
      applyStylesTimeout = null;
    }
  };

  return {
    isLoading,
    error,
    noteContent,
    authorName,
    authorImage,
    authorNip05,
    authorLud16,
    zaps,
    totalZaps,
    totalAmount,
    handleNoteLoaderSubmit,
    handleStyleOptionsToggle,
    handleStyleOptionsClose,
    showLoadingError,
    resetToDefaults,
    copyStyleUrl,
    applyStylesFromURL,
    cleanup,
    zapNotification,
    handleNotificationDismiss
  };
};
