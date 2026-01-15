/* eslint-disable no-unused-vars, no-empty */
// React hook for live functionality integration
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { nip19 } from 'nostr-tools';
// QRious is now imported in useQRCode hook
const bolt11 = require('bolt11') as any;
import { useQRCode } from './useQRCode';
import { useLightningIntegration } from './useLightningIntegration';
import { useZapHandling } from './useZapHandling';
import { useStyleManagement } from './useStyleManagement';
import { useFiatConversion } from './useFiatConversion';
import { useNostrSubscriptions } from './useNostrSubscriptions';
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
import { sanitizeHTML, sanitizeImageUrl, sanitizeUrl, escapeHtml } from '../utils/sanitization';
import { DEFAULT_STYLES } from '../constants/styles';
import { appLocalStorage } from '../utils/storage';
import { validateNoteId, stripNostrPrefix, parseEventId } from '../utils/eventIdParser';

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

// Interface for processed zap data
interface ProcessedZapData {
  e?: string;
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

  const _liveDisplayRef = useRef<any>(null);

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
  const displayLiveEventRef = useRef<((liveEvent: Kind30311Event) => void) | null>(null);
  const displayLiveChatMessageRef = useRef<((chatMessage: NostrEvent) => void) | null>(null);
  const updateProfileRef = useRef<((profile: Kind0Event) => void) | null>(null);
  const updateLiveEventHostProfileRef = useRef<((profile: Kind0Event) => void) | null>(null);
  const drawKind1Ref = useRef<((kind1: Kind1Event) => Promise<void>) | null>(null);
  const drawKind0Ref = useRef<((kind0: Kind0Event) => void) | null>(null);
  const drawKinds9735Ref = useRef<((zaps: ProcessedZapData[]) => void) | null>(null);

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
  const subscribeChatAuthorProfileRef = useRef<((pubkey: string) => void) | null>(null);
  const updateLiveEventZapTotalRef = useRef<(() => void) | null>(null);
  const organizeZapsHierarchicallyRef = useRef<(() => void) | null>(null);
  // Fiat conversion is now handled by useFiatConversion hook
  const cleanupHierarchicalOrganizationRef = useRef<(() => void) | null>(null);
  const updateQRSlideVisibilityRef = useRef<((skipUrlUpdate?: boolean) => void) | null>(null);

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
    onInitializeQRCodePlaceholders: (eventIdParam?: string) => initializeQRCodePlaceholders(eventIdParam || eventId)
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
        console.warn('displayLiveEventRef not set yet, event will be lost');
      }
    },
    onLiveChatMessage: (chatMessage: NostrEvent) => {
      const callback = displayLiveChatMessageRef.current;
      if (callback) {
        callback(chatMessage);
      } else {
        console.warn('displayLiveChatMessageRef not set yet, message will be lost');
      }
    },
    onLiveEventZap: (zap: Kind9735Event, pubkey: string, identifier: string) => {
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
        console.warn('drawKind1Ref not set yet - function may not be defined');
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
            console.error('drawKind0Ref still not set after timeout - function may not be defined');
          }
        }, 100); // Longer timeout to ensure function is defined
      }
    },
    onZapsLoaded: (zaps: Kind9735Event[]) => {
      // When zaps are loaded, process them with profiles
      // Get profiles from window.profiles (set by subscribeKind0fromKinds9735)
      const profiles = (window as any).profiles || {};
      const kind0fromkind9735List: Kind0Event[] = Object.values(profiles) as Kind0Event[];
      
      // Process zaps with profiles using createkinds9735JSON
      if (zaps.length > 0) {
        createkinds9735JSON(zaps, kind0fromkind9735List);
      } else {
        // Show empty state if no zaps
        const zapsContainer = document.getElementById('zaps');
        if (zapsContainer) {
          zapsContainer.classList.remove('loading');
          const loadingText = zapsContainer.querySelector('.loading-text');
          if (loadingText) loadingText.remove();
          
          const emptyStateDiv = document.createElement('div');
          emptyStateDiv.className = 'empty-zaps-state';
          emptyStateDiv.innerHTML = `
            <div class="empty-zaps-message">
              Be the first to support
            </div>
          `;
          zapsContainer.appendChild(emptyStateDiv);
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

  // Store subscription functions in refs for backward compatibility
  subscribeChatAuthorProfileRef.current = subscribeChatAuthorProfile;
  
  // Create a ref to store subscribeLiveEventParticipants for use in displayLiveEvent
  const subscribeLiveEventParticipantsRef = useRef<((liveEvent: Kind30311Event) => Promise<unknown>) | null>(null);
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
        if (typeof window !== 'undefined' && (window as any).Swiper) {
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
          (window as any).setupStyleOptions = () => {
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
            console.warn('Portrait swiper element not found');
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

  const displayLiveEvent = (liveEvent: Kind30311Event) => {
    // Set ref immediately when function is called (for first call)
    if (!displayLiveEventRef.current) {
      displayLiveEventRef.current = displayLiveEvent;
    }
    console.log('📺 Displaying live event:', liveEvent);
    
    // Subscribe to participants' profiles
    if (subscribeLiveEventParticipantsRef.current) {
      subscribeLiveEventParticipantsRef.current(liveEvent);
    }

    // Check if this live event is already displayed to avoid clearing content
    if (
      (window as any).currentLiveEvent &&
      (window as any).currentLiveEvent.id === liveEvent.id
    ) {
      console.log('📺 Live event already displayed, skipping...');
      return;
    }

    // Store event info globally at the beginning to prevent duplicate calls
    (window as any).currentLiveEvent = liveEvent;
    (window as any).currentEventType = 'live-event';

    // Add livestream class to body for livestream events
    document.body.classList.add('livestream');

    // Hide note content loading animation
    const noteContent = document.querySelector('.note-content');
    if (noteContent) {
      noteContent.classList.remove('loading');
      const loadingText = noteContent.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Set up two-column layout for live events
    setupLiveEventTwoColumnLayout();

    // Extract event information using LiveEventService
    const metadata = liveEventService.extractMetadata(liveEvent);
    const {
      title,
      summary,
      status,
      streaming,
      recording,
      starts,
      ends,
      currentParticipants,
      totalParticipants,
      participants
    } = metadata;

    console.log('📺 Streaming URL found:', streaming);

    // Format timestamps using service (inline for template strings)
    const formatTime = liveEventService.formatTimestamp.bind(liveEventService);

    // Check if live event content already exists to avoid rebuilding video
    const existingLiveContent = noteContent?.querySelector(
      '.live-event-content'
    );
    const existingVideo = noteContent?.querySelector('#live-video');

    if (!existingLiveContent) {
      // Only set innerHTML if content doesn't exist yet
      if (noteContent) {
        noteContent.innerHTML = `
            ${
              streaming
                ? `
                <div class="live-event-video">
                    <div id="live-video-player" class="video-player-container">
                        <video id="live-video" controls autoplay muted playsinline class="live-video">
                            Your browser does not support the video tag.
                        </video>
                        <div class="video-error" id="video-error" style="display: none;">
                            <p>Unable to load video stream</p>
                            ${(() => {
                              const sanitized = sanitizeUrl(streaming);
                              return sanitized ? `<a href="${sanitized}" target="_blank" class="streaming-link" rel="noopener noreferrer">
                                📺 Watch in External Player
                            </a>` : '<span>Streaming URL unavailable</span>';
                            })()}
                  </div>
                    </div>
                </div>
            `
                : ''
            }

            <div class="live-event-content">
                ${summary ? `<p class="live-event-summary">${summary}</p>` : ''}
          
                <div class="live-event-status">
                    <span class="status-indicator status-${status}">
                        ${status === 'live' ? '🔴 LIVE' : status === 'planned' ? '📅 PLANNED' : status === 'ended' ? '✅ ENDED' : status.toUpperCase()}
              </span>
                </div>
                
                ${
                  starts
                    ? `<div class="live-event-time">
                    <strong>Starts:</strong> ${formatTime(starts)}
          </div>`
                    : ''
                }

                ${
                  ends
                    ? `<div class="live-event-time">
                    <strong>Ends:</strong> ${formatTime(ends)}
          </div>`
                    : ''
                }

                <div class="live-event-participants">
                    <div class="participants-count">
                        <strong>Participants:</strong> ${currentParticipants}/${totalParticipants}
              </div>
                    ${
                      participants.length > 0
                        ? `
                        <div class="participants-list">
                            ${participants
                              .slice(0, 10)
                              .map(
                                (p: { pubkey: string; role?: string }) => `
                                <div class="participant" data-pubkey="${p.pubkey}">
                                    <span class="participant-role">${p.role || 'Participant'}</span>: 
                                    <span class="participant-pubkey">${p.pubkey.slice(0, 8)}...</span>
                                </div>
                            `
                              )
                              .join('')}
                      ${participants.length > 10 ? `<div class="participants-more">... and ${participants.length - 10} more</div>` : ''}
                  </div>
                    `
                        : ''
                    }
</div>
                
                ${
                  recording
                    ? `
                    <div class="live-event-actions">
                        ${(() => {
                          const sanitized = sanitizeUrl(recording);
                          return sanitized ? `<a href="${sanitized}" target="_blank" class="recording-link" rel="noopener noreferrer">
                            🎥 Watch Recording
                        </a>` : '<span>Recording URL unavailable</span>';
                        })()}
              </div>
                `
                    : ''
                }
</div>
        `;
      }
    } else {
      // Content exists, just update dynamic parts without touching video
      const statusElement = noteContent?.querySelector(
        '.live-event-status .status-indicator'
      );
      const participantsCountElement = noteContent?.querySelector(
        '.participants-count'
      );

      if (statusElement) {
        statusElement.className = `status-indicator status-${status}`;
        statusElement.textContent =
          status === 'live'
            ? '🔴 LIVE'
            : status === 'planned'
              ? '📅 PLANNED'
              : status === 'ended'
                ? '✅ ENDED'
                : status.toUpperCase();
      }

      if (participantsCountElement) {
        participantsCountElement.innerHTML = `<strong>Participants:</strong> ${currentParticipants}/${totalParticipants}`;
      }
    }

    // Update author info with event title and fetch host profile
    const authorNameElement = document.getElementById('authorName');
    if (authorNameElement) {
      authorNameElement.innerText = title;
    }

    // Get host pubkey using service
    const hostPubkey = liveEventService.getHostPubkey(liveEvent);

    // Subscribe to host profile to get their image
    subscribeLiveEventHostProfile(hostPubkey);

    // Generate QR codes for the live event (with small delay to ensure DOM is ready)
    setTimeout(() => {
      // Ensure at least one QR toggle is enabled before generating QR codes
      const qrShowNeventToggle = document.getElementById('qrShowNeventToggle') as HTMLInputElement;
      if (qrShowNeventToggle && !qrShowNeventToggle.checked) {
        // Check if any QR toggle is enabled
        const qrShowWebLinkToggle = document.getElementById('qrShowWebLinkToggle') as HTMLInputElement;
        const qrShowNoteToggle = document.getElementById('qrShowNoteToggle') as HTMLInputElement;
        const hasAnyEnabled = (qrShowWebLinkToggle?.checked) || (qrShowNoteToggle?.checked);

        // If none are enabled, enable nevent by default
        if (!hasAnyEnabled) {
          qrShowNeventToggle.checked = true;
        }
}

      generateLiveEventQRCodes(liveEvent);
      // Update QR slide visibility after generating QR codes
      setTimeout(() => {
        if (updateQRSlideVisibilityRef.current) {
          updateQRSlideVisibilityRef.current(true);
        }
}, 300);
    }, 100);

    // Enable Lightning payments if previously enabled
    if ((window as any).lightningEnabled) {
      setTimeout(() => {
        if ((window as any).enableLightningPayments) {
          (window as any).enableLightningPayments();
        }
}, 150);
    }

    // Clean up any existing video player before initializing new one
    if ((window as any).cleanupLiveVideoPlayer) {
      (window as any).cleanupLiveVideoPlayer();
    }

    // Initialize video player if streaming URL is available
    if (streaming) {
      setTimeout(() => {
        initializeLiveVideoPlayer(streaming);
      }, 200);
    }

    // Start monitoring content to detect if it disappears
    startContentMonitoring();
  };

  const displayLiveChatMessage = (chatMessage: NostrEvent) => {
    // Set ref immediately when function is called (for first call)
    if (!displayLiveChatMessageRef.current) {
      displayLiveChatMessageRef.current = displayLiveChatMessage;
    }
    // Debug log removed

    // Check if this chat message is already displayed to prevent duplicates
    const existingMessage = document.querySelector(
      `[data-chat-id="${chatMessage.id}"]`
    );
    if (existingMessage) {
      // Debug log removed
      return;
    }

    const zapsContainer = document.getElementById('zaps');

    // Hide loading animation on first message
    if (zapsContainer) {
      zapsContainer.classList.remove('loading');
      const loadingText = zapsContainer.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Use activity column for live events, main container for regular notes
    const targetContainer =
      document.getElementById('activity-list') || zapsContainer;

    // Create chat message element
    const chatDiv = document.createElement('div');
    chatDiv.className = 'live-chat-message';
    chatDiv.dataset.pubkey = chatMessage.pubkey;
    chatDiv.dataset.timestamp = chatMessage.created_at.toString();
    chatDiv.dataset.chatId = chatMessage.id;

    const timeStr = new Date(chatMessage.created_at * 1000).toLocaleString();

    // Sanitize chat message content to prevent XSS
    const sanitizedContent = escapeHtml(chatMessage.content).replace(/\n/g, '<br>');

    chatDiv.innerHTML = `
        <div class="chat-message-header">
            <img class="chat-author-img" src="/live/images/gradient_color.gif" data-pubkey="${chatMessage.pubkey}" />
            <div class="chat-message-info">
                <div class="chat-author-name" data-pubkey="${chatMessage.pubkey}">
                    ${chatMessage.pubkey.slice(0, 8)}...
                </div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
        </div>
        <div class="chat-message-content">
            ${sanitizedContent}
  </div>
    `;

    // Subscribe to chat author's profile if we don't have it
    subscribeChatAuthorProfile(chatMessage.pubkey);

    // Insert message in reverse chronological order (newest first, at top)
    if (targetContainer) {
      const existingMessages = Array.from(
        targetContainer.querySelectorAll('.live-chat-message, .live-event-zap')
      );
      const insertPosition = existingMessages.findIndex(
        (msg: Element) => parseInt((msg as HTMLElement).dataset.timestamp || '0') < chatMessage.created_at
      );

      if (insertPosition === -1) {
        // Add to end (oldest messages at bottom)
        targetContainer.appendChild(chatDiv);
      } else {
        // Insert before the found position (newer messages towards top)
        const targetItem = existingMessages[insertPosition];
        if (targetItem) {
          targetContainer.insertBefore(chatDiv, targetItem);
        } else {
          targetContainer.appendChild(chatDiv);
        }
}
    }
  };

  // processLiveEventZap and displayLiveEventZap are now provided by useZapHandling hook

  // subscribeChatAuthorProfile is now provided by useNostrSubscriptions hook

  const updateLiveEventZapTotal = () => {
    // Debug log removed
    updateLiveEventZapTotalRef.current = updateLiveEventZapTotal;

    const zaps = Array.from(document.querySelectorAll('.live-event-zap'));
    const totalAmount = zaps.reduce((sum, zap) => {
      return sum + parseInt((zap as HTMLElement).dataset.amount || '0');
    }, 0);
    const totalCount = zaps.length;

    const totalValueElement = document.getElementById('zappedTotalValue');
    const totalCountElement = document.getElementById('zappedTotalCount');

    if (totalValueElement) {
      totalValueElement.innerText = numberWithCommas(totalAmount);
      // Store the original sats amount for fiat conversion
      (totalValueElement as HTMLElement).dataset.originalSats =
        numberWithCommas(totalAmount);
    }
    if (totalCountElement) {
      totalCountElement.innerText = numberWithCommas(totalCount);
    }

    // Apply fiat conversion to total if enabled
    const showFiatToggle = document.getElementById(
      'showFiatToggle'
    ) as HTMLInputElement;
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
        profileData.display_name || profileData.displayName || profileData.name || 'Anonymous'
      );
    } catch {
      return 'Anonymous';
    }
  };

  // updateTopZappers is now provided by useZapHandling hook

  const displayTopZappers = () => {
    // Debug log removed

    const topZappersBar = document.getElementById('top-zappers-bar');

    if (!topZappersBar) {
      // Debug log removed
      return;
    }

    if (topZappers.length === 0) {
      // Debug log removed
      // Remove the CSS class to hide the bar
      document.body.classList.remove('show-top-zappers');
      return;
    }

    // Debug log removed
    // Add the CSS class to show the bar (CSS handles the display)
    document.body.classList.add('show-top-zappers');

    // Update each zapper slot (using the existing DOM structure)
    for (let i = 0; i < 5; i++) {
      const zapperElement = document.getElementById(`top-zapper-${i + 1}`);
      if (!zapperElement) continue;

      if (i < topZappers.length) {
        const zapper = topZappers[i];
        const avatar = zapperElement.querySelector(
          '.zapper-avatar'
        ) as HTMLImageElement;
        const name = zapperElement.querySelector('.zapper-name');
        const total = zapperElement.querySelector('.zapper-total');

        // topZappers is ProcessedZap[] from useZapHandling hook
        const zapperData = zapper as SharedProcessedZap;
        const zapperPicture = zapperData.zapPayerPicture || '';
        const zapperName = zapperData.content || 'Anonymous';
        const zapperAmount = zapperData.zapAmount || 0;
        
        if (avatar) avatar.src = sanitizeImageUrl(zapperPicture) || '/live/images/gradient_color.gif';
        if (avatar) avatar.alt = zapperName;
        if (name) name.textContent = zapperName;
        if (total)
          total.textContent = `${numberWithCommas(zapperAmount)} sats`;

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
    document.body.classList.remove('show-top-zappers');
  };

  const updateProfile = (profile: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!updateProfileRef.current) {
      updateProfileRef.current = updateProfile;
    }
    let profileData: Record<string, unknown> = {};
    try {
      profileData = JSON.parse(profile.content || '{}') as Record<string, unknown>;
    } catch (error) {
      console.warn('Failed to parse profile content:', error);
      profileData = {};
    }
    const name =
      (profileData.display_name as string) ||
      (profileData.displayName as string) ||
      (profileData.name as string) ||
      `${profile.pubkey.slice(0, 8)}...`;
    const picture = sanitizeImageUrl((profileData.picture as string) || '') || '/live/images/gradient_color.gif';

    // Update chat messages from this author (zaps are handled by useZapHandling hook)
    const authorElements = document.querySelectorAll(
      `.chat-author-img[data-pubkey="${profile.pubkey}"], .chat-author-name[data-pubkey="${profile.pubkey}"]`
    );
    authorElements.forEach(element => {
      if (element.classList.contains('chat-author-img')) {
        (element as HTMLImageElement).src = picture;
      } else if (element.classList.contains('chat-author-name')) {
        element.textContent = name;
      }
    });
  };

  const setupLiveEventTwoColumnLayout = () => {
    // Debug log removed

    const zapsContainer = document.getElementById('zaps');
    if (!zapsContainer) return;

    // Check if layout is already set up to avoid clearing existing content
    if (
      zapsContainer.classList.contains('live-event-two-column') &&
      zapsContainer.querySelector('.live-event-columns')
    ) {
      return;
    }

    // Preserve the existing zaps header and add two-column structure below it
    const existingZapsHeader = zapsContainer.querySelector('.zaps-header');
    const existingZapsList = zapsContainer.querySelector('.zaps-list');

    // Clear existing content but preserve the header
    zapsContainer.innerHTML = '';

    // Add back the zaps header if it exists
    if (existingZapsHeader) {
      zapsContainer.appendChild(existingZapsHeader);
    }

    // Add the two-column structure
    const twoColumnDiv = document.createElement('div');
    twoColumnDiv.className = 'live-event-columns';
    twoColumnDiv.innerHTML = `
        <div class="live-event-zaps-only">
            <div id="zaps-only-list" class="zaps-only-list"></div>
        </div>
        <div class="live-event-activity">
            <div id="activity-list" class="activity-list"></div>
        </div>
    `;

    zapsContainer.appendChild(twoColumnDiv);

    // Add the two-column class to the container
    zapsContainer.classList.add('live-event-two-column');
  };

  // subscribeLiveEventHostProfile is now provided by useNostrSubscriptions hook

  const updateLiveEventHostProfile = (profile: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!updateLiveEventHostProfileRef.current) {
      updateLiveEventHostProfileRef.current = updateLiveEventHostProfile;
    }
    // Debug log removed

    let profileData: Record<string, unknown> = {};
    try {
      profileData = JSON.parse(profile.content || '{}') as Record<string, unknown>;
    } catch (error) {
      console.warn('Failed to parse live event host profile:', error);
      profileData = {};
    }
    const picture = sanitizeImageUrl((profileData.picture as string) || '') || '/live/images/gradient_color.gif';
    const nip05 = (profileData.nip05 as string) || '';
    const lud16 = (profileData.lud16 as string) || '';

    // Update the author profile image
    const authorImg = document.getElementById(
      'authorNameProfileImg'
    ) as HTMLImageElement;
    if (authorImg) {
      authorImg.src = picture;
    }

    // Update state with profile metadata
    setAuthorImage(picture);
    setAuthorNip05(nip05);
    setAuthorLud16(lud16);
  };

  const startContentMonitoring = () => {
    // Debug log removed

    // Clear any existing monitoring
    if ((window as any).contentMonitorInterval) {
      clearInterval((window as any).contentMonitorInterval);
    }

    // Clear any existing price update interval
    if ((window as any).bitcoinPriceUpdateInterval) {
      clearInterval((window as any).bitcoinPriceUpdateInterval);
    }

    (window as any).contentMonitorInterval = setInterval(() => {
      const noteContent = document.querySelector('.note-content');
      const zapsContainer = document.getElementById('zaps');
      const liveEventContent = noteContent?.querySelector(
        '.live-event-content'
      );
      const twoColumnLayout = zapsContainer?.querySelector(
        '.live-event-columns'
      );

      if ((window as any).currentEventType === 'live-event') {
        if (!liveEventContent) {
          // Try to restore if we have the current live event info
          if (
            (window as any).currentLiveEvent &&
            (window as any).currentLiveEventInfo
          ) {
            // Debug log removed
            displayLiveEvent((window as any).currentLiveEvent);
          }
}

        if (
          !twoColumnLayout &&
          zapsContainer &&
          !zapsContainer.classList.contains('loading')
        ) {
          setupLiveEventTwoColumnLayout();
        }
}
    }, CONTENT_MONITOR_INTERVAL); // Check every 10 seconds
  };

  const initializeLiveVideoPlayer = (streamingUrl: string) => {
    console.log('🎥 Initializing video player with URL:', streamingUrl);

    const video = document.getElementById('live-video') as HTMLVideoElement;
    const videoError = document.getElementById('video-error');

    if (!video) {
      console.error('❌ Video element not found!');
      return;
    }
    console.log('✅ Video element found:', video);

    // Store player state for recovery
    let lastVolume = video.volume || 0.8;
    let wasMuted = video.muted || false;
    let wasPlaying = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let hlsInstance: any = null;

    // Preserve volume and mute state
    const preserveAudioState = () => {
      if (!wasMuted && video.muted) {
        video.muted = false;
      }
if (lastVolume > 0 && video.volume !== lastVolume) {
        video.volume = lastVolume;
      }
    };

    // Save current audio state
    const saveAudioState = () => {
      lastVolume = video.volume;
      wasMuted = video.muted;
      wasPlaying = !video.paused;
    };

    // Show error function
    const showError = () => {
      if (video) video.style.display = 'none';
      if (videoError) videoError.style.display = 'block';
    };

    // Hide error function
    const hideError = () => {
      if (video) video.style.display = 'block';
      if (videoError) videoError.style.display = 'none';
    };

    // Reconnect function
    const attemptReconnect = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error('❌ Max reconnection attempts reached');
        showError();
        return;
      }

      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), SUBSCRIPTION_TIMEOUT);
      console.log(
        `🔄 Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in ${delay}ms`
      );

      setTimeout(() => {
        initializeStream();
      }, delay);
    };

    // Initialize stream function
    const initializeStream = () => {
      console.log('🎥 Initializing stream...');

      // Handle different streaming formats
      if (streamingUrl.includes('.m3u8') || streamingUrl.includes('hls')) {
        // HLS stream - try to use HLS.js if available
        if (
          typeof (window as any).Hls !== 'undefined' &&
          (window as any).Hls.isSupported()
        ) {
          console.log('🎥 Using HLS.js for HLS stream');
          hlsInstance = new (window as any).Hls({
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 5
          });

          hlsInstance.loadSource(streamingUrl);
          hlsInstance.attachMedia(video);

          hlsInstance.on((window as any).Hls.Events.MANIFEST_PARSED, () => {
            console.log('✅ HLS manifest parsed');
            reconnectAttempts = 0;
            hideError();
            video
              .play()
              .then(() => {
                preserveAudioState();
              })
              .catch(e => {
                preserveAudioState();
              });
          });

          hlsInstance.on(
            (window as any).Hls.Events.ERROR,
            (_event: unknown, data: unknown) => {
              console.error('❌ HLS error:', data);
              const errorData = data as { fatal?: boolean; type?: string; details?: string };
              if (errorData.fatal) {
                attemptReconnect();
              }
}
    );
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari)
          console.log('🎥 Using native HLS support');
          video.src = streamingUrl;
          video
            .play()
            .then(() => {
              console.log('✅ Native HLS stream started');
              reconnectAttempts = 0;
              hideError();
              preserveAudioState();
            })
            .catch(e => {
              console.error('❌ Native HLS play failed:', e);
              preserveAudioState();
              attemptReconnect();
            });
        } else {
          console.error('❌ HLS not supported');
          showError();
        }
} else {
        // Regular video formats (MP4, WebM, etc.)
        console.log('🎥 Using regular video format');
        video.src = streamingUrl;
        video
          .play()
          .then(() => {
            console.log('✅ Regular video stream started');
            reconnectAttempts = 0;
            hideError();
            preserveAudioState();
          })
          .catch(e => {
            console.error('❌ Regular video play failed:', e);
            preserveAudioState();
            attemptReconnect();
          });
      }
    };

    // Enhanced video event handlers
    video.addEventListener('error', e => {
      console.error('❌ Video error:', e);
      saveAudioState();
      attemptReconnect();
    });

    video.addEventListener('loadstart', () => {
      console.log('🎥 Video load started');
    });

    video.addEventListener('canplay', () => {
      console.log('✅ Video can play');
      hideError();
      preserveAudioState();
    });

    video.addEventListener('play', () => {
      wasPlaying = true;
      preserveAudioState();
    });

    video.addEventListener('pause', () => {
      wasPlaying = false;
      saveAudioState();
    });

    video.addEventListener('volumechange', () => {
      saveAudioState();
    });

    video.addEventListener('stalled', () => {
      saveAudioState();
      setTimeout(() => {
        if (video.readyState < 3 && wasPlaying) {
          attemptReconnect();
        }
}, 5000);
    });

    video.addEventListener('waiting', () => {
      saveAudioState();
    });

    // Start initial stream
    initializeStream();
  };

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
          (window as any).currentLiveEventInfo = { pubkey, identifier, kind };

          // Reset reconnection attempts
          (window as any).reconnectionAttempts = { event: 0, chat: 0, zaps: 0 };

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
        const noteContent = document.querySelector('.note-content');
        const zapsList = document.getElementById('zaps');

        if (noteContent) {
          noteContent.classList.add('loading');
          // Add loading text if not already present
          if (!noteContent.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading note content...';
            noteContent.appendChild(loadingText);
          }
}

        if (zapsList) {
          zapsList.classList.add('loading');
          // Add loading text if not already present
          if (!zapsList.querySelector('.loading-text')) {
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = 'Loading zaps...';
            zapsList.appendChild(loadingText);
          }
}

        subscribeKind1(kind1ID);
        const noteLoaderContainer = document.getElementById(
          'noteLoaderContainer'
        );
        if (noteLoaderContainer) {
          noteLoaderContainer.style.display = 'none';
        }
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
        const noteLoaderContainer = document.getElementById(
          'noteLoaderContainer'
        );
        if (noteLoaderContainer) {
          noteLoaderContainer.style.display = 'none';
        }
}
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load note content'
      );
    }
  };

  // validateNoteId and stripNostrPrefix are now imported from '../utils/eventIdParser'

  const showNoteLoaderError = (message: string) => {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  };

  const hideNoteLoaderError = () => {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
      errorElement.style.display = 'none';
    }
  };

  const showLoadingError = (message: string) => {
    const errorElement = document.getElementById('noteLoaderError');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }

    // Ensure noteLoader is visible and main layout is hidden when there's an error
    const noteLoaderContainer = document.getElementById('noteLoaderContainer');
    const mainLayout = document.getElementById('mainLayout');

    if (noteLoaderContainer) {
      noteLoaderContainer.style.display = 'flex';
    }

    if (mainLayout) {
      mainLayout.style.display = 'none';
    }
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
        console.log('⚠️ No amount found in zap');
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
      console.error('❌ Error processing new zap for notification:', error);
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
          const content = JSON.parse(kind0fromkind9735.content || '{}') as Record<string, unknown>;
          const displayName = content.displayName || content.display_name;
          const kind0name = displayName ? (displayName as string) : (content.name as string);
          kind0finalName = kind0name != '' ? kind0name : (content.name as string) || 'Anonymous';
          kind0picture = (content.picture as string) || '';
          kind0npub = nip19.npubEncode(kind0fromkind9735.pubkey) || '';
          profileData = content;
        } catch (error) {
          console.warn('Failed to parse profile content for zapper:', error);
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
    (window as any).zaps = json9735List;

    // Hide zaps loading animation
    zapsContainer.classList.remove('loading');
    const loadingText = zapsContainer.querySelector('.loading-text');
    if (loadingText) loadingText.remove();

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
      const profileImage = sanitizeImageUrl(zap.picture) || '/live/images/gradient_color.gif';
      const sanitizedZapContent = zap.kind9735content ? escapeHtml(zap.kind9735content).replace(/\n/g, '<br>') : '';
      const sanitizedZapName = zap.kind1Name ? escapeHtml(zap.kind1Name) : 'Anonymous';

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

        console.log(
          'Applying podium classes in list layout. Top 3 zaps:',
          sortedZaps.slice(0, 3).map(zap => ({
            amount: zap.querySelector('.zapperAmountSats')?.textContent,
            name: zap.querySelector('.zapperName')?.textContent
          }))
        );

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
    const existingZaps = (window as any).zaps || [];

    // Get all zap amounts INCLUDING the current zap being evaluated
    const allZapAmounts = [
      ...existingZaps.map((z: ProcessedZapData) => z.amount),
      zapAmount
    ].sort((a, b) => b - a);

    // Get all unique amounts
    const uniqueAmounts = [...new Set(allZapAmounts)];

    console.log('🏆 getSingleZapRank:', {
      zapAmount,
      totalZaps: existingZaps.length,
      allAmounts: allZapAmounts,
      uniqueAmounts: uniqueAmounts.slice(0, 5) // Show top 5 for debugging
    });

    // Find where this zap amount ranks
    const rank = uniqueAmounts.indexOf(zapAmount);

    if (rank >= 0) {
      console.log('🏆 Zap ranks at position:', rank + 1);
      return rank + 1; // Return 1, 2, 3, 4, etc.
    }

    console.log('🏆 Could not determine rank');
    return undefined;
  };

  const numberWithCommas = (x: number) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Helper function to cleanup hierarchical organization in a container
  const cleanupHierarchicalOrganizationInContainer = (container: HTMLElement) => {
    // Remove all row containers and move zaps back to the main container
    const existingRows = container.querySelectorAll('.zap-row');
    existingRows.forEach(row => {
      // Move all zaps from this row back to the main container
      const zapsInRow = Array.from(row.children);
      zapsInRow.forEach(zap => {
        const zapElement = zap as HTMLElement;
        // Remove row classes and global podium classes from individual zaps
        zapElement.className = zapElement.className.replace(/row-\d+/g, '');
        zapElement.className = zapElement.className.replace(/podium-global-\d+/g, '');

        // Force row layout by setting inline styles (will override everything)
        zapElement.style.flexDirection = 'row';
        zapElement.style.alignItems = 'center';
        zapElement.style.justifyContent = 'space-between';
        zapElement.style.textAlign = 'left';
        zapElement.style.width = 'auto';

        // Reset nested elements to row layout
        const profile = zapElement.querySelector('.zapperProfile') as HTMLElement;
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
      const allZaps = container.querySelectorAll('.zap, .live-event-zap, .zap-only-item');
      allZaps.forEach(zap => {
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
    cleanupHierarchicalOrganizationRef.current = cleanupHierarchicalOrganization;
  }, [cleanupHierarchicalOrganization]);

  // Helper function to organize zaps in a container
  const organizeZapsInContainer = (container: HTMLElement, sortByAmount: boolean = true) => {
    // For activity list, only organize zaps, not chat messages
    const selector = sortByAmount
      ? '.zap, .live-event-zap, .zap-only-item'  // zaps-only-list: only zaps
      : '.live-event-zap';  // activity-list: only zaps (not chat messages)
    
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
        const timestampA = parseInt((a as HTMLElement).dataset.timestamp || '0');
        const timestampB = parseInt((b as HTMLElement).dataset.timestamp || '0');
        return timestampB - timestampA;
      }
    });

    // Apply podium classes to top 3 zaps (only when sorting by amount)
    if (sortByAmount && document.body.classList.contains('podium-enabled')) {
      console.log(
        'Applying podium classes in grid layout. Top 3 zaps:',
        sortedZaps.slice(0, 3).map(zap => ({
          amount: zap.querySelector('.zapperAmountSats')?.textContent,
          name: zap.querySelector('.zapperName')?.textContent
        }))
      );
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

  const drawKind1 = async (kind1: Kind1Event) => {
    // Set ref immediately when function is called (for first call)
    if (!drawKind1Ref.current) {
      drawKind1Ref.current = drawKind1;
    }
    // Debug log removed

    // Store note ID globally for QR regeneration
    (window as any).currentNoteId = kind1.id;

    // Set event type to regular note and remove livestream class
    (window as any).currentEventType = 'note';
    document.body.classList.remove('livestream');

    const noteContent = document.getElementById('noteContent');
    // Debug log removed

    // Process content for both images and nostr mentions
    const processedContent = await processNoteContent(kind1.content);
    
    if (noteContent) {
      // Debug log removed
      noteContent.innerHTML = processedContent;

      // Hide note content loading animation
      noteContent.classList.remove('loading');
      const loadingText = noteContent.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Update React state with processed content (not raw)
    setNoteContent(processedContent);

    // Update Lightning state now that we have an event ID
    if ((window as any).lightningEnabled) {
      // Debug log removed
      setTimeout(() => {
        if ((window as any).enableLightningPayments) {
          (window as any).enableLightningPayments();
        }
}, 100);
    }

    // Generate multiple QR code formats
    const noteId = kind1.id;
    const neventId = nip19.neventEncode({ id: noteId, relays: [] });
    const note1Id = nip19.noteEncode(noteId);
    const njumpUrl = `https://njump.me/${note1Id}`;
    const nostrNevent = `nostr:${neventId}`;
    const nostrNote = `nostr:${note1Id}`;

    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);

    // Generate QR codes for all formats
    const qrcodeContainers = [
      {
        element: document.getElementById('qrCode'),
        value: njumpUrl,
        link: document.getElementById('qrcodeLinkNostr'),
        preview: document.getElementById('qrDataPreview1')
      },
      {
        element: document.getElementById('qrCodeNevent'),
        value: nostrNevent,
        link: document.getElementById('qrcodeNeventLink'),
        preview: document.getElementById('qrDataPreview2')
      },
      {
        element: document.getElementById('qrCodeNote'),
        value: nostrNote,
        link: document.getElementById('qrcodeNoteLink'),
        preview: document.getElementById('qrDataPreview3')
      }
    ];

    qrcodeContainers.forEach(({ element, value, link, preview }) => {
      if (element) {
        generateQRCode(element.id, value, qrSize);

        // Set link href
        if (link) (link as HTMLAnchorElement).href = value;

        // Set data preview (uppercase, max 60 chars)
        if (preview) {
          const truncate = (text: string, maxLength: number = 60) => {
            return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
          };
          preview.textContent = truncate(value.toUpperCase());
        }
}
    });

    // Initialize swiper if not already initialized
    if (!(window as any).qrSwiper) {
      (window as any).qrSwiper = new (window as any).Swiper('.qr-swiper', {
        slidesPerView: 1,
        spaceBetween: 0,
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
          dynamicBullets: false
        },
        loop: false, // Disable loop to avoid warnings when slides are dynamically hidden
        autoplay: {
          delay: 10000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true
        },
        autoHeight: false, // Use fixed height to avoid layout issues
        height: 250,
        watchOverflow: true, // Handle case where all slides might be hidden
        observer: true, // Watch for DOM changes
        observeParents: true
      });
    }

    // QR visibility will be handled by loadInitialStyles() after all styles are loaded
  };

  const drawKind0 = (kind0: Kind0Event) => {
    // Set ref immediately when function is called (for first call)
    if (!drawKind0Ref.current) {
      drawKind0Ref.current = drawKind0;
    }
    // Debug log removed

    try {
      const profile = JSON.parse(kind0.content) as Record<string, unknown>;
      setAuthorName((profile.name || profile.display_name || 'Anonymous') as string);
      setAuthorImage(sanitizeImageUrl((profile.picture as string) || '') || '/live/images/gradient_color.gif');
      setAuthorNip05((profile.nip05 as string) || '');
      setAuthorLud16((profile.lud16 as string) || '');
    } catch (e) {
      // Ignore parsing errors
    }
  };

  // Helper to get display name for npub/nprofile
  const getMentionUserName = useCallback(async (identifier: string): Promise<string> => {
    try {
      let pubkey: string;
      
      // Decode npub/nprofile to get pubkey
      const decoded = nip19.decode(identifier);
      if (decoded.type === 'npub') {
        pubkey = decoded.data;
      } else if (decoded.type === 'nprofile') {
        pubkey = decoded.data.pubkey;
      } else {
        // Not a user identifier, return shortened version
        return identifier.length > 35
          ? `${identifier.substr(0, 4)}...${identifier.substr(identifier.length - 4)}`
          : identifier;
      }

      // Check if profile is already cached
      const profiles = (window as any).profiles || {};
      let profile = profiles[pubkey];
      
      // If not cached, fetch it
      if (!profile && nostrClient) {
        try {
          profile = await new Promise<Kind0Event | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), PROFILE_FETCH_TIMEOUT);
            
            const subscription = nostrClient.subscribeToProfiles(
              [pubkey],
              (event: NostrEvent) => {
                const kind0Event = event as Kind0Event;
                clearTimeout(timeout);
                // Keep the newest profile event (highest created_at)
                const existing = profiles[pubkey];
                if (!existing || kind0Event.created_at > existing.created_at) {
                  profiles[pubkey] = kind0Event;
                }
                subscription.unsubscribe();
                resolve(profiles[pubkey]);
              },
              {
                timeout: PROFILE_FETCH_TIMEOUT
              }
            );

            // Handle oneose separately - set a timeout to resolve if no profile found
            setTimeout(() => {
              clearTimeout(timeout);
              subscription.unsubscribe();
              resolve(null);
            }, PROFILE_FETCH_TIMEOUT);
          });
        } catch (e) {
          console.error('Error fetching profile:', e);
        }
      }

      // Parse profile and get display name
      if (profile && profile.content) {
        try {
          const profileData = JSON.parse(profile.content);
          const displayName = profileData.display_name || profileData.displayName || profileData.name;
          if (displayName) {
            return displayName;
          }
} catch (e) {
          console.error('Error parsing profile data:', e);
        }
}

      // Fallback to shortened identifier
      return identifier.length > 35
        ? `${identifier.substr(0, 4)}...${identifier.substr(identifier.length - 4)}`
        : identifier;
    } catch (error) {
      console.error('Error getting mention username:', error);
      return identifier.length > 35
        ? `${identifier.substr(0, 4)}...${identifier.substr(identifier.length - 4)}`
        : identifier;
    }
  }, [nostrClient, liveEventService]);

  const processNoteContent = async (content: string): Promise<string> => {
    if (!content) return '';
    
    let processed = content;
    
    // First, process media URLs BEFORE escaping HTML
    // This prevents URLs from being broken by HTML escaping
    
    // Handle video URLs (mp4, webm, ogg, mov)
    processed = processed.replace(
      /(https?:\/\/[^\s<>]+)\.(mp4|webm|ogg|mov)/gi,
      (match) => {
        const sanitizedUrl = sanitizeUrl(match);
        if (!sanitizedUrl) return escapeHtml(match); // Escape if URL is invalid
        return `<div class="video-container" style="position: relative; width: 100%; max-width: 600px; margin: 12px 0;">
          <video src="${sanitizedUrl}" controls style="width: 100%; border-radius: 8px; background: #000;">
            Your browser does not support the video tag.
          </video>
        </div>`;
      }
    );
    
    // Handle image URLs (jpg, jpeg, png, gif, webp)
    processed = processed.replace(
      /(https?:\/\/[^\s<>]+)\.(jpg|jpeg|png|gif|webp)/gi,
      (match) => {
        const sanitizedUrl = sanitizeImageUrl(match);
        if (!sanitizedUrl) return escapeHtml(match); // Escape if URL is invalid
        return `<div class="image-container" style="margin: 12px 0;">
          <img src="${sanitizedUrl}" style="max-width: 100%; border-radius: 8px;" alt="Image" />
        </div>`;
      }
    );
    
    // Process mentions in order: bare npub/note first (before adding any HTML), then prefixed versions
    // Match paynote's logic - fetch usernames asynchronously
    // Use a Map to track which positions have been processed to avoid double-processing
    
    const processedRanges: Array<{start: number, end: number, replacement: string}> = [];
    
    // First, handle bare npub/nprofile mentions (process before other formats to avoid conflicts)
    const bareNpubMatches = Array.from(processed.matchAll(/\b((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})\b/gi));
    
    for (const matchObj of bareNpubMatches) {
      const match = matchObj[0];
      const offset = matchObj.index || 0;
      
      // Check if it's preceded by nostr: or @
      const prefix = processed.substring(Math.max(0, offset - 7), offset);
      if (prefix.endsWith('nostr:') || prefix.endsWith('@')) {
        continue; // Skip this one, it will be processed with its prefix
      }

      const displayName = await getMentionUserName(match);
      const replacement = `<a href="/profile/${match}" class="nostrMention" target="_blank">${displayName}</a>`;
      processedRanges.push({
        start: offset,
        end: offset + match.length,
        replacement: replacement
      });
    }
    
    // Handle bare note/nevent/naddr mentions (no username fetching needed)
    const bareNoteMatches = Array.from(processed.matchAll(/\b((note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})\b/gi));
    
    for (const matchObj of bareNoteMatches) {
      const match = matchObj[0];
      const offset = matchObj.index || 0;
      
      // Check if it's preceded by nostr: or @
      const prefix = processed.substring(Math.max(0, offset - 7), offset);
      if (prefix.endsWith('nostr:') || prefix.endsWith('@')) {
        continue; // Skip this one, it will be processed with its prefix
      }

      const clean = String(match);
      const shortId =
        clean.length > 35
          ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
          : clean;
      
      let linkPath = '';
      if (clean.startsWith('note') || clean.startsWith('nevent')) {
        linkPath = `/note/${clean}`;
      } else if (clean.startsWith('naddr')) {
        linkPath = `/live/${clean}`;
      }

      const replacement = `<a href="${linkPath}" class="nostrMention" target="_blank">${shortId}</a>`;
      processedRanges.push({
        start: offset,
        end: offset + match.length,
        replacement: replacement
      });
    }
    
    // Apply replacements in reverse order to maintain correct positions
    processedRanges.sort((a, b) => b.start - a.start);
    for (const range of processedRanges) {
      processed = processed.substring(0, range.start) + range.replacement + processed.substring(range.end);
    }
    
    // Handle nostr:npub/nprofile mentions
    const nostrNpubMatches = processed.match(/nostr:((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi);
    
    if (nostrNpubMatches) {
      const replacements = await Promise.all(
        nostrNpubMatches.map(async match => {
          const cleanMatch = match.replace(/^nostr:/i, '');
          const displayName = await getMentionUserName(cleanMatch);
          return {
            match,
            replacement: `<a href="/profile/${cleanMatch}" class="nostrMention" target="_blank">${displayName}</a>`
          };
        })
      );
      
      replacements.forEach(({ match, replacement }) => {
        processed = processed.replace(match, replacement);
      });
    }
    
    // Handle nostr:note/nevent/naddr mentions (no username fetching)
    processed = processed.replace(
      /nostr:((note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi,
      (_m, identifier) => {
        const clean = String(identifier);
        const shortId =
          clean.length > 35
            ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
            : clean;
        
        let linkPath = '';
        if (clean.startsWith('note') || clean.startsWith('nevent')) {
          linkPath = `/note/${clean}`;
        } else if (clean.startsWith('naddr')) {
          linkPath = `/live/${clean}`;
        }

        return `<a href="${linkPath}" class="nostrMention" target="_blank">${shortId}</a>`;
      }
    );
    
    // Handle @npub/@nprofile mentions
    const atNpubMatches = processed.match(/@((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi);
    
    if (atNpubMatches) {
      const replacements = await Promise.all(
        atNpubMatches.map(async match => {
          const cleanMatch = match.replace(/^@/i, '');
          const displayName = await getMentionUserName(cleanMatch);
          return {
            match,
            replacement: `<a href="/profile/${cleanMatch}" class="nostrMention" target="_blank">${displayName}</a>`
          };
        })
      );
      
      replacements.forEach(({ match, replacement }) => {
        processed = processed.replace(match, replacement);
      });
    }
    
    // Handle @note/@nevent/@naddr mentions (no username fetching)
    processed = processed.replace(
      /@((note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi,
      (_m, identifier) => {
        const clean = String(identifier);
        const shortId =
          clean.length > 35
            ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
            : clean;
        
        let linkPath = '';
        if (clean.startsWith('note') || clean.startsWith('nevent')) {
          linkPath = `/note/${clean}`;
        } else if (clean.startsWith('naddr')) {
          linkPath = `/live/${clean}`;
        }

        return `<a href="${linkPath}" class="nostrMention" target="_blank">${shortId}</a>`;
      }
    );
    
    // Process regular URLs (but skip if already processed as video/image)
    processed = processed.replace(
      /(?:^|\s)(https?:\/\/[^\s<>]+)/g,
      (match, url) => {
        // Skip if this URL was already processed as video or image
        if (processed.includes(`src="${url}"`)) {
          return match;
        }
const sanitizedUrl = sanitizeUrl(url);
        if (!sanitizedUrl) return match; // Skip if URL is invalid
        const leadingSpace = match.startsWith(' ') ? ' ' : '';
        return `${leadingSpace}<a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
      }
    );
    
    // Convert line breaks to <br>
    processed = processed.replace(/\n/g, '<br>');
    
    // Sanitize the final HTML before returning
    return sanitizeHTML(processed);
  };


  // Helper function to show loading state
  const showLoadingState = (noteContentText: string, zapsText: string) => {
    const noteContent = document.querySelector('.note-content');
    const zapsList = document.getElementById('zaps');

    if (noteContent) {
      noteContent.classList.add('loading');
      if (!noteContent.querySelector('.loading-text')) {
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.textContent = noteContentText;
        noteContent.appendChild(loadingText);
      }
    }

    if (zapsList) {
      zapsList.classList.add('loading');
      if (!zapsList.querySelector('.loading-text')) {
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.textContent = zapsText;
        zapsList.appendChild(loadingText);
      }
    }
  };

  const handleNoteLoaderSubmit = async () => {
    const inputField = document.getElementById(
      'note1LoaderInput'
    ) as HTMLInputElement;
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

    console.log(
      `💰 Total zaps recalculated: ${numberWithCommas(totalSats)} sats`
    );
  };

  // Expose functions globally for testing and debugging
  (window as any).refreshBitcoinPrices = refreshBitcoinPrices;
  (window as any).startLivePriceUpdates = startLivePriceUpdates;
  (window as any).stopLivePriceUpdates = stopLivePriceUpdates;
  (window as any).recalculateTotalZaps = recalculateTotalZaps;
  (window as any).updateFiatAmounts = debouncedUpdateFiatAmounts;

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
        const processedZaps = (window as any).zaps || [];
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
            if ((window as any).gridPeriodicCheckInterval) {
              clearInterval((window as any).gridPeriodicCheckInterval);
            }
(window as any).gridPeriodicCheckInterval = setInterval(() => {
              const gridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
              const container = document.getElementById('zaps-only-list');
              if (gridToggle && gridToggle.checked && container && container.classList.contains('grid-layout')) {
                // Check if there are zaps outside of .zap-row containers
                const allZaps = container.querySelectorAll('.zap, .live-event-zap, .zap-only-item');
                const zapsInRows = container.querySelectorAll('.zap-row .zap, .zap-row .live-event-zap, .zap-row .zap-only-item');
                
                if (allZaps.length !== zapsInRows.length) {
                  // Some zaps are not in rows, re-organize
                  console.log('Re-organizing grid: found zaps outside rows', allZaps.length, 'total vs', zapsInRows.length, 'in rows');
                  organizeZapsHierarchically();
                }
}
}, 2000); // Check every 2 seconds
          } else {
            // Stop periodic check
            if ((window as any).gridPeriodicCheckInterval) {
              clearInterval((window as any).gridPeriodicCheckInterval);
              (window as any).gridPeriodicCheckInterval = null;
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
              zapsListElements.forEach(list => list.classList.remove('grid-layout'));
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
            if ((window as any).gridPeriodicCheckInterval) {
              clearInterval((window as any).gridPeriodicCheckInterval);
            }
(window as any).gridPeriodicCheckInterval = setInterval(() => {
              const gridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
              const container = document.getElementById('zaps');
              if (gridToggle && gridToggle.checked && container && container.classList.contains('grid-layout')) {
                // Check if there are zaps outside of .zap-row containers
                const allZaps = container.querySelectorAll('.zap');
                const zapsInRows = container.querySelectorAll('.zap-row .zap');
                
                if (allZaps.length !== zapsInRows.length) {
                  // Some zaps are not in rows, re-organize
                  console.log('Re-organizing grid: found zaps outside rows', allZaps.length, 'total vs', zapsInRows.length, 'in rows');
                  organizeZapsHierarchically();
                }
}
}, 2000); // Check every 2 seconds
          } else {
            // Stop periodic check
            if ((window as any).gridPeriodicCheckInterval) {
              clearInterval((window as any).gridPeriodicCheckInterval);
              (window as any).gridPeriodicCheckInterval = null;
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
              zapsListElements.forEach(list => list.classList.remove('grid-layout'));
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
      button.addEventListener('click', (e: any) => {
        const preset = e.target.getAttribute('data-preset');
        applyPreset(preset);
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
      console.error(`Toggle element not found: ${toggleId}`);
    }
  };

  // toHexColor and hexToRgba are now provided by useStyleManagement hook

  // Load initial styles from localStorage or apply defaults
  const loadInitialStyles = () => {
    console.log('🔍 loadInitialStyles called, stack trace:', new Error().stack);

    // Prevent multiple calls during the same session
    if ((window as any).loadInitialStylesCalled) {
      console.log('❌ loadInitialStyles already called, skipping...');
      return;
    }
    (window as any).loadInitialStylesCalled = true;

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

        // Console log all settings from localStorage
        console.log('Loading from localStorage:', {
          textColor: styles.textColor,
          bgColor: styles.bgColor,
          qrInvert: styles.qrInvert,
          qrScreenBlend: styles.qrScreenBlend,
          qrMultiplyBlend: styles.qrMultiplyBlend,
          qrShowWebLink: styles.qrShowWebLink,
          qrShowNevent: styles.qrShowNevent,
          qrShowNote: styles.qrShowNote
        });

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
            console.log('Applied text color to picker:', styles.textColor);
          }
  if (textColorValue) {
            textColorValue.value = styles.textColor;
            console.log('Applied text color to value input:', styles.textColor);
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
                if (customBgImageGroup)
                  customBgImageGroup.style.display = 'none';
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
            const defaultValue = propertyName === 'sectionLabels' ? false : 
                                propertyName === 'qrShowWebLink' ? true :
                                propertyName === 'qrShowNevent' ? true :
                                propertyName === 'qrShowNote' ? true : false;
            const value = styles[propertyName] !== undefined ? styles[propertyName] : defaultValue;
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
                    const zapsOnlyList = document.getElementById('zaps-only-list');
                    
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
                        const zapsListElements = document.querySelectorAll('.zaps-list');
                        zapsListElements.forEach(list => list.classList.remove('grid-layout'));
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
                        const zapsListElements = document.querySelectorAll('.zaps-list');
                        zapsListElements.forEach(list => list.classList.remove('grid-layout'));
                      }, 10);
                    }
  }
    }
},
              sectionLabelsToggle: (checked: boolean) => {
                const sectionLabels =
                  document.querySelectorAll('.section-label');
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
      const hasAnyEnabled = (qrShowWebLinkToggle?.checked) || 
                           (qrShowNeventToggle?.checked) || 
                           (qrShowNoteToggle?.checked);
      
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

    console.log('🔍 Toggle states:', {
      webLinkToggle: !!webLinkToggle,
      webLinkChecked: webLinkToggle?.checked,
      neventToggle: !!neventToggle,
      neventChecked: neventToggle?.checked,
      noteToggle: !!noteToggle,
      noteChecked: noteToggle?.checked,
      lightningToggle: !!lightningToggle,
      lightningChecked: lightningToggle?.checked,
      showLightning
    });

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
    console.log('QR Slide Detection:', {
      webLinkSlide: !!webLinkSlide,
      neventSlide: !!neventSlide,
      noteSlide: !!noteSlide,
      lightningSlide: !!lightningSlide,
      showWebLink,
      showNevent,
      showNote,
      showLightning
    });

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
        console.log(`✅ ${name} slide visible`);
      } else {
        // Move to hidden container
        if (swiperWrapper.contains(slide)) {
          hiddenSlidesContainer.appendChild(slide);
          console.log(`👁️ ${name} slide hidden`);
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
      console.log('❌ QR swiper hidden (no visible slides)');
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
