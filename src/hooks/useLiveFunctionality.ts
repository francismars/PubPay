// React hook for live functionality integration
import { useCallback, useEffect, useRef, useState } from 'react';
import { UseLightning } from './useLightning';

// Flag to prevent multiple simultaneous calls to setupNoteLoaderListeners
let setupNoteLoaderListenersInProgress = false;

// Default style values
const DEFAULT_STYLES = {
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
  showTopZappers: false,  // Default to hidden
  podium: false,
  zapGrid: false,
  lightning: false,
  opacity: 1.0,
  textOpacity: 1.0,
  partnerLogo: ''
};

export const useLiveFunctionality = (eventId?: string) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>('Author');
  const [authorImage, setAuthorImage] = useState<string>('/images/gradient_color.gif');
  const [zaps, setZaps] = useState<any[]>([]);
  const [totalZaps, setTotalZaps] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  // Top zappers state
  const [topZappers, setTopZappers] = useState<any[]>([]);

  // Track if user wants to see top zappers (even before data is available)
  const [userWantsTopZappers, setUserWantsTopZappers] = useState(false);

  // Lightning service
  const lightningService = useRef<UseLightning | null>(null);
  const [lightningEnabled, setLightningEnabled] = useState(false);
  const [lightningLNURL, setLightningLNURL] = useState<string>('');

  const liveDisplayRef = useRef<any>(null);

  // Update top zappers display when topZappers changes
  useEffect(() => {
    if (topZappers.length > 0) {
      // Only display if toggle is ON
      const showTopZappersToggle = document.getElementById('showTopZappersToggle') as HTMLInputElement;
      if (showTopZappersToggle?.checked) {
        displayTopZappers();
      }
    }
  }, [topZappers]);

  // Recalculate top zappers when zaps change
  useEffect(() => {
    if (zaps.length > 0) {
      calculateTopZappersFromZaps(zaps);

      // If show top zappers toggle is on OR user previously wanted to see them, display them immediately
      const showTopZappersToggle = document.getElementById('showTopZappersToggle') as HTMLInputElement;
      if (showTopZappersToggle?.checked || userWantsTopZappers) {
        displayTopZappers();
        // Reset the flag since we've now shown them
        setUserWantsTopZappers(false);
      }
    }
  }, [zaps, userWantsTopZappers]);

  useEffect(() => {
    // IMMEDIATELY hide QR swiper container to prevent flash when no QR codes are toggled
    const qrSwiperContainer = document.querySelector('.qr-swiper') as HTMLElement;
    if (qrSwiperContainer) {
      qrSwiperContainer.style.display = 'none';
    }

    const initializeLiveFunctionality = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Lightning service
        lightningService.current = new UseLightning({ eventId });

        // Initialize Nostr pool and relays first
        if ((window as any).NostrTools && !(window as any).pool) {
          (window as any).pool = new (window as any).NostrTools.SimplePool();
          (window as any).relays = [
            'wss://relay.damus.io',
            'wss://relay.snort.social',
            'wss://nos.lol',
            'wss://relay.nostr.band'
          ];
        }

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
              init () {
                // Portrait swiper initialized
              },
              slideChange () {
                // Portrait swiper slide changed
              }
            }
          });
        }

        // QR swiper is initialized by initializeQRSwiper() function

        // Load note content if eventId is provided
        if (eventId) {
          await loadNoteContent(eventId);
        } else {
          // If no eventId, still initialize QR codes with placeholder content
          await initializeQRCodePlaceholders();
        }

        // Load initial styles and setup event listeners on page load
        setTimeout(() => {
          loadInitialStyles();

          // Prevent original JavaScript from setting up duplicate event listeners
          (window as any).setupStyleOptions = () => {
            // Original setupStyleOptions disabled - using React hook instead
          };

          setupStyleOptions();

          // Setup note loader event listeners with a delay to ensure DOM is ready
          setTimeout(() => {
            setupNoteLoaderListeners();
          }, 100);

          // After styles are loaded, check if show top zappers should be displayed
          const showTopZappersToggle = document.getElementById('showTopZappersToggle') as HTMLInputElement;
          if (showTopZappersToggle?.checked) {
            displayTopZappers();
          }
        }, 500);

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize live functionality');
        setIsLoading(false);
      }
    };

    if (eventId) {
      initializeLiveFunctionality();
    } else {
      // Even without eventId, we need to setup note loader listeners and initialize Nostr
      // No eventId, setting up note loader only

      // Initialize Nostr pool and relays for note loader
      if ((window as any).NostrTools && !(window as any).pool) {
        (window as any).pool = new (window as any).NostrTools.SimplePool();
        (window as any).relays = [
          'wss://relay.damus.io',
          'wss://relay.snort.social',
          'wss://nos.lol',
          'wss://relay.primal.net',
          'wss://relay.nostr.band'
        ];
        // Nostr pool and relays initialized for note loader
      }

      // Initialize portrait swiper for note loader (with delay to ensure DOM is ready)
      setTimeout(() => {
        if (typeof window !== 'undefined' && (window as any).Swiper) {
          const portraitSwiperElement = document.querySelector('.portrait-swiper .swiper');
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
        setupNoteLoaderListeners();
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
      (window as any).cleanupHierarchicalOrganization = cleanupHierarchicalOrganization;

      // Note: setupStyleOptions is overridden to prevent conflicts with original JavaScript

      // Expose updateQRSlideVisibility function globally
      (window as any).updateQRSlideVisibility = updateQRSlideVisibility;
    }
  }, []);

  // Create Lightning QR slide
  const createLightningQRSlide = (lnurl: string) => {
    // Debug log removed
    // Debug log removed

    // Check if Lightning QR slide already exists
    let lightningSlide = document.getElementById('lightningQRSlide');
    if (lightningSlide) {
      // Debug log removed
      // Update existing QR code
      const qrElement = lightningSlide.querySelector('#qrCodeLightning');
      if (qrElement && (window as any).QRious) {
        qrElement.innerHTML = '';
        new (window as any).QRious({
          element: qrElement,
          size: 200,
          value: lnurl
        });
        // Debug log removed
      } else {
        console.error('❌ QR element not found or QRious not available');
      }
      return;
    }

    // Create new Lightning QR slide
    // Debug log removed
    lightningSlide = document.createElement('div');
    lightningSlide.id = 'lightningQRSlide';
    lightningSlide.className = 'swiper-slide';

    lightningSlide.innerHTML = `
      <div class="qr-container">
        <div class="qr-code" id="qrCodeLightning"></div>
        <div class="qr-label">Lightning Payment</div>
      </div>
    `;

    // Add to swiper wrapper
    const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
    // Debug log removed
    if (swiperWrapper) {
      swiperWrapper.appendChild(lightningSlide);
      // Debug log removed
    } else {
      console.error('❌ Swiper wrapper not found');
      return;
    }

    // Generate QR code
    if ((window as any).QRious) {
      // Debug log removed
      new (window as any).QRious({
        element: document.getElementById('qrCodeLightning'),
        size: 200,
        value: lnurl
      });
      // Debug log removed
    } else {
      console.error('❌ QRious library not available');
    }

    // Store reference globally
    (window as any).lightningQRSlide = lightningSlide;
    // Debug log removed
  };

  // Initialize QR code placeholders for when no eventId is provided
  const initializeQRCodePlaceholders = async () => {
    // Debug log removed

    // Generate placeholder QR codes
    const placeholderNoteId = 'placeholder-note-id';
    const neventId = (window as any).NostrTools?.nip19?.neventEncode({ id: placeholderNoteId, relays: [] }) || 'placeholder-nevent';
    const note1Id = (window as any).NostrTools?.nip19?.noteEncode(placeholderNoteId) || 'placeholder-note';
    const njumpUrl = `https://njump.me/${  note1Id}`;
    const nostrNevent = `nostr:${  neventId}`;
    const nostrNote = `nostr:${  note1Id}`;

    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);

    // Generate QR codes for all formats
    const qrcodeContainers = [
      { element: document.getElementById('qrCode'), value: njumpUrl, link: document.getElementById('qrcodeLinkNostr'), preview: document.getElementById('qrDataPreview1') },
      { element: document.getElementById('qrCodeNevent'), value: nostrNevent, link: document.getElementById('qrcodeNeventLink'), preview: document.getElementById('qrDataPreview2') },
      { element: document.getElementById('qrCodeNote'), value: nostrNote, link: document.getElementById('qrcodeNoteLink'), preview: document.getElementById('qrDataPreview3') }
    ];

    qrcodeContainers.forEach(({ element, value, link, preview }) => {
      if (element && (window as any).QRious) {
        element.innerHTML = '';
        new (window as any).QRious({
          element,
          size: qrSize,
          value
        });

        if (link) {
          (link as HTMLAnchorElement).href = value;
        }

        if (preview) {
          preview.textContent = value;
        }
      }
    });

    // QR swiper is initialized by initializeQRSwiper() function

    // Debug log removed
  };

  // Live Event subscription functions
  const subscribeLiveEvent = async (pubkey: string, identifier: string, kind: number) => {
    // Debug log removed

    const filter = {
      authors: [pubkey],
      kinds: [30311], // Live Event kind
      '#d': [identifier]
    };

    // Add timeout to prevent subscription from closing prematurely
    const timeoutId = setTimeout(() => {
      // Live event subscription timeout - keeping subscription alive
      // Debug log removed
    }, 30000); // Increased timeout to 30 seconds

    const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
      onevent(liveEvent: any) {
        clearTimeout(timeoutId);
        displayLiveEvent(liveEvent);
        // Also subscribe to participants' profiles
        subscribeLiveEventParticipants(liveEvent);
      },
      oneose() {
        clearTimeout(timeoutId);
        // Don't close the subscription, keep it alive for updates
        // Debug log removed
      },
      onclosed() {
        clearTimeout(timeoutId);
        // Attempt to reconnect after a delay if we have current event info
        if ((window as any).currentLiveEventInfo && (window as any).reconnectionAttempts.event < 3) {
          (window as any).reconnectionAttempts.event++;
          setTimeout(() => {
            subscribeLiveEvent((window as any).currentLiveEventInfo.pubkey, (window as any).currentLiveEventInfo.identifier, (window as any).currentLiveEventInfo.kind);
          }, 5000 * (window as any).reconnectionAttempts.event);
        }
      }
    });
  };

  const subscribeLiveChat = async (pubkey: string, identifier: string) => {
    // Debug log removed

    const aTag = `30311:${pubkey}:${identifier}`;
    const filter = {
      kinds: [1311], // Live Chat Message kind
      '#a': [aTag]
    };

    const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
      onevent(chatMessage: any) {
        displayLiveChatMessage(chatMessage);
      },
      oneose() {
        // Debug log removed
      },
      onclosed() {
        // Attempt to reconnect after a delay if we have current event info
        if ((window as any).currentLiveEventInfo && (window as any).reconnectionAttempts.chat < 3) {
          (window as any).reconnectionAttempts.chat++;
          setTimeout(() => {
            subscribeLiveChat((window as any).currentLiveEventInfo.pubkey, (window as any).currentLiveEventInfo.identifier);
          }, 5000 * (window as any).reconnectionAttempts.chat);
        }
      }
    });
  };

  const subscribeLiveEventZaps = async (pubkey: string, identifier: string) => {
    // Debug log removed

    const aTag = `30311:${pubkey}:${identifier}`;

    const filter = {
      kinds: [9735], // Zap receipt kind
      '#a': [aTag]
    };

    const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
      onevent(zapReceipt: any) {
        processLiveEventZap(zapReceipt, pubkey, identifier);
      },
      oneose() {
        // Debug log removed
        // Keep subscription alive for new zaps
      },
      onclosed() {
        // Debug log removed
        // Attempt to reconnect after a delay
        setTimeout(() => {
          // Debug log removed
          subscribeLiveEventZaps(pubkey, identifier);
        }, 5000);
      }
    });
  };

  const subscribeLiveEventParticipants = async (liveEvent: any) => {
    // Debug log removed

    // Extract participant pubkeys from the live event
    const participantPubkeys = liveEvent.tags
      .filter((tag: any) => tag[0] === 'p')
      .map((tag: any) => tag[1]);

    if (participantPubkeys.length > 0) {
      const filter = {
        kinds: [0], // Profile kind
        authors: participantPubkeys
      };

      const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
        onevent(profile: any) {
          // Store profile for later use
          (window as any).profiles = (window as any).profiles || {};
          (window as any).profiles[profile.pubkey] = profile;
        },
        oneose() {
          // Debug log removed
        }
      });
    }
  };

  const displayLiveEvent = (liveEvent: any) => {
    // Debug log removed

    // Check if this live event is already displayed to avoid clearing content
    if ((window as any).currentLiveEvent && (window as any).currentLiveEvent.id === liveEvent.id) {
      return;
    }

    // Store event info globally at the beginning to prevent duplicate calls
    (window as any).currentLiveEvent = liveEvent;
    (window as any).currentEventType = 'live-event';

    // Hide note content loading animation
    const noteContent = document.querySelector('.note-content');
    if (noteContent) {
      noteContent.classList.remove('loading');
      const loadingText = noteContent.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Set up two-column layout for live events
    setupLiveEventTwoColumnLayout();

    // Extract event information from tags
    const title = liveEvent.tags.find((tag: any) => tag[0] === 'title')?.[1] || 'Live Event';
    const summary = liveEvent.tags.find((tag: any) => tag[0] === 'summary')?.[1] || '';
    const status = liveEvent.tags.find((tag: any) => tag[0] === 'status')?.[1] || 'unknown';
    const streaming = liveEvent.tags.find((tag: any) => tag[0] === 'streaming')?.[1];
    const recording = liveEvent.tags.find((tag: any) => tag[0] === 'recording')?.[1];
    const starts = liveEvent.tags.find((tag: any) => tag[0] === 'starts')?.[1];
    const ends = liveEvent.tags.find((tag: any) => tag[0] === 'ends')?.[1];
    const currentParticipants = liveEvent.tags.find((tag: any) => tag[0] === 'current_participants')?.[1] || '0';
    const totalParticipants = liveEvent.tags.find((tag: any) => tag[0] === 'total_participants')?.[1] || '0';
    const participants = liveEvent.tags.filter((tag: any) => tag[0] === 'p');

    // Format timestamps
    const formatTime = (timestamp: string) => {
      if (!timestamp) return '';
      const date = new Date(parseInt(timestamp) * 1000);
      return date.toLocaleString();
    };

    // Check if live event content already exists to avoid rebuilding video
    const existingLiveContent = noteContent?.querySelector('.live-event-content');
    const existingVideo = noteContent?.querySelector('#live-video');

    if (!existingLiveContent) {
      // Only set innerHTML if content doesn't exist yet
      if (noteContent) {
        noteContent.innerHTML = `
            ${streaming ? `
                <div class="live-event-video">
                    <div id="live-video-player" class="video-player-container">
                        <video id="live-video" controls autoplay muted playsinline class="live-video">
                            <source src="${streaming}" type="application/x-mpegURL">
                            <source src="${streaming}" type="video/mp4">
                            Your browser does not support the video tag.
                        </video>
                        <div class="video-error" id="video-error" style="display: none;">
                            <p>Unable to load video stream</p>
                            <a href="${streaming}" target="_blank" class="streaming-link">
                                📺 Watch in External Player
                            </a>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="live-event-content">
                ${summary ? `<p class="live-event-summary">${summary}</p>` : ''}
                
                <div class="live-event-status">
                    <span class="status-indicator status-${status}">
                        ${status === 'live' ? '🔴 LIVE' : status === 'planned' ? '📅 PLANNED' : status === 'ended' ? '✅ ENDED' : status.toUpperCase()}
                    </span>
                </div>
                
                ${starts ? `<div class="live-event-time">
                    <strong>Starts:</strong> ${formatTime(starts)}
                </div>` : ''}
                
                ${ends ? `<div class="live-event-time">
                    <strong>Ends:</strong> ${formatTime(ends)}
                </div>` : ''}
                
                <div class="live-event-participants">
                    <div class="participants-count">
                        <strong>Participants:</strong> ${currentParticipants}/${totalParticipants}
                    </div>
                    ${participants.length > 0 ? `
                        <div class="participants-list">
                            ${participants.slice(0, 10).map((p: any) => `
                                <div class="participant" data-pubkey="${p[1]}">
                                    <span class="participant-role">${p[3] || 'Participant'}</span>: 
                                    <span class="participant-pubkey">${p[1].slice(0,8)}...</span>
                                </div>
                            `).join('')}
                            ${participants.length > 10 ? `<div class="participants-more">... and ${participants.length - 10} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>
                
                ${recording ? `
                    <div class="live-event-actions">
                        <a href="${recording}" target="_blank" class="recording-link">
                            🎥 Watch Recording
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
      }
    } else {
      // Content exists, just update dynamic parts without touching video
      const statusElement = noteContent?.querySelector('.live-event-status .status-indicator');
      const participantsCountElement = noteContent?.querySelector('.participants-count');

      if (statusElement) {
        statusElement.className = `status-indicator status-${status}`;
        statusElement.textContent = status === 'live' ? '🔴 LIVE' : status === 'planned' ? '📅 PLANNED' : status === 'ended' ? '✅ ENDED' : status.toUpperCase();
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

    // Find the actual host from participants (look for "Host" role in p tags)
    const hostParticipant = participants.find((p: any) => p[3] && p[3].toLowerCase() === 'host');
    const hostPubkey = hostParticipant ? hostParticipant[1] : liveEvent.pubkey;

    // Subscribe to host profile to get their image
    subscribeLiveEventHostProfile(hostPubkey);

    // Generate QR codes for the live event (with small delay to ensure DOM is ready)
    setTimeout(() => {
      generateLiveEventQRCodes(liveEvent);
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

  const displayLiveChatMessage = (chatMessage: any) => {
    // Debug log removed

    // Check if this chat message is already displayed to prevent duplicates
    const existingMessage = document.querySelector(`[data-chat-id="${chatMessage.id}"]`);
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
    const targetContainer = document.getElementById('activity-list') || zapsContainer;

    // Create chat message element
    const chatDiv = document.createElement('div');
    chatDiv.className = 'live-chat-message';
    chatDiv.dataset.pubkey = chatMessage.pubkey;
    chatDiv.dataset.timestamp = chatMessage.created_at;
    chatDiv.dataset.chatId = chatMessage.id;

    const timeStr = new Date(chatMessage.created_at * 1000).toLocaleString();

    chatDiv.innerHTML = `
        <div class="chat-message-header">
            <img class="chat-author-img" src="/images/gradient_color.gif" data-pubkey="${chatMessage.pubkey}" />
            <div class="chat-message-info">
                <div class="chat-author-name" data-pubkey="${chatMessage.pubkey}">
                    ${chatMessage.pubkey.slice(0,8)}...
                </div>
                <div class="chat-message-time">${timeStr}</div>
            </div>
        </div>
        <div class="chat-message-content">
            ${chatMessage.content}
        </div>
    `;

    // Subscribe to chat author's profile if we don't have it
    subscribeChatAuthorProfile(chatMessage.pubkey);

    // Insert message in reverse chronological order (newest first, at top)
    if (targetContainer) {
      const existingMessages = Array.from(targetContainer.querySelectorAll('.live-chat-message, .live-event-zap'));
      const insertPosition = existingMessages.findIndex((msg: any) =>
        parseInt(msg.dataset.timestamp) < chatMessage.created_at
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


  const processLiveEventZap = async (zapReceipt: any, eventPubkey: string, eventIdentifier: string) => {
    // Debug log removed

    try {
      // Extract zap information from the receipt
      const description9735 = zapReceipt.tags.find((tag: any) => tag[0] === 'description')?.[1];
      if (!description9735) {
        return;
      }

      let zapRequest;
      try {
        zapRequest = JSON.parse(description9735);
      } catch (parseError) {
        return;
      }
      const bolt11 = zapReceipt.tags.find((tag: any) => tag[0] === 'bolt11')[1];
      const amount = (window as any).lightningPayReq.decode(bolt11).satoshis;
      const zapperPubkey = zapRequest.pubkey;
      const zapContent = zapRequest.content || '';

      // Create zap display object similar to regular notes
      const zapData = {
        id: zapReceipt.id,
        amount,
        content: zapContent,
        pubkey: zapperPubkey,
        timestamp: zapReceipt.created_at,
        bolt11,
        zapEventID: (window as any).NostrTools.nip19.noteEncode(zapReceipt.id)
      };

      // Subscribe to zapper's profile if we don't have it
      subscribeChatAuthorProfile(zapperPubkey);

      // Add to zapper totals accounting (profile will be updated when it arrives)
      addZapToTotals(zapperPubkey, amount);

      // Display the zap
      displayLiveEventZap(zapData);

    } catch (error) {
      console.error('Error processing live event zap:', error);
    }
  };

  const displayLiveEventZap = (zapData: any) => {
    // Debug log removed

    // Check if this zap is already displayed to prevent duplicates
    const existingZap = document.querySelector(`[data-zap-id="${zapData.id}"]`);
    if (existingZap) {
      // Debug log removed
      return;
    }

    const zapsContainer = document.getElementById('zaps');

    // Hide loading animation on first zap
    if (zapsContainer) {
      zapsContainer.classList.remove('loading');
      const loadingText = zapsContainer.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Get target containers - use columns for live events, main container for regular notes
    const activityContainer = document.getElementById('activity-list') || zapsContainer;
    const zapsOnlyContainer = document.getElementById('zaps-only-list');

    // Create zap element with chat-style layout for activity column
    const zapDiv = document.createElement('div');
    zapDiv.className = 'live-event-zap';
    zapDiv.dataset.pubkey = zapData.pubkey;
    zapDiv.dataset.timestamp = zapData.timestamp;
    zapDiv.dataset.amount = zapData.amount;
    zapDiv.dataset.zapId = zapData.id;

    const timeStr = new Date(zapData.timestamp * 1000).toLocaleString();

    zapDiv.innerHTML = `
        <div class="zap-header">
            <img class="zap-author-img" src="/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
            <div class="zap-info">
                <div class="zap-author-name" data-pubkey="${zapData.pubkey}">
                    ${zapData.pubkey.slice(0,8)}...
                </div>
                <div class="zap-time">${timeStr}</div>
            </div>
            <div class="zap-amount">
                <span class="zap-amount-sats">${numberWithCommas(zapData.amount)}</span>
                <span class="zap-amount-label">sats</span>
            </div>
        </div>
        ${zapData.content ? `
            <div class="zap-content">
                ${zapData.content}
            </div>
        ` : ''}
    `;

    // Insert zap in activity column (mixed with chat messages)
    if (activityContainer) {
      const existingActivityItems = Array.from(activityContainer.querySelectorAll('.live-chat-message, .live-event-zap'));
      const activityInsertPosition = existingActivityItems.findIndex((item: any) =>
        parseInt(item.dataset.timestamp) < zapData.timestamp
      );

      if (activityInsertPosition === -1) {
        // Add to end (oldest items at bottom)
        activityContainer.appendChild(zapDiv);
      } else {
        // Insert before the found position (newer items towards top)
        const targetItem = existingActivityItems[activityInsertPosition];
        if (targetItem) {
          activityContainer.insertBefore(zapDiv, targetItem);
        } else {
          activityContainer.appendChild(zapDiv);
        }
      }
    }

    // Also add to zaps-only column if it exists (for live events) - sorted by amount (highest first)
    // Use classic layout for left column
    if (zapsOnlyContainer) {
      const zapOnlyDiv = document.createElement('div');
      zapOnlyDiv.className = 'zap live-event-zap zap-only-item';
      zapOnlyDiv.dataset.pubkey = zapData.pubkey;
      zapOnlyDiv.dataset.timestamp = zapData.timestamp;
      zapOnlyDiv.dataset.amount = zapData.amount;
      zapOnlyDiv.dataset.zapId = zapData.id;

      // Classic zap layout for left column
      zapOnlyDiv.innerHTML = `
            <div class="zapperProfile">
                <img class="zapperProfileImg" src="/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
                <div class="zapperInfo">
                    <div class="zapperName" data-pubkey="${zapData.pubkey}">
                        ${zapData.pubkey.slice(0,8)}...
                    </div>
                    <div class="zapperMessage">${zapData.content || ''}</div>
                </div>
            </div>
            <div class="zapperAmount">
                <span class="zapperAmountSats">${numberWithCommas(zapData.amount)}</span>
                <span class="zapperAmountLabel">sats</span>
            </div>
        `;

      const existingZapItems = Array.from(zapsOnlyContainer.querySelectorAll('.live-event-zap'));
      const zapInsertPosition = existingZapItems.findIndex((item: any) =>
        parseInt(item.dataset.amount || 0) < zapData.amount
      );

      if (zapInsertPosition === -1) {
        // Add to end (lowest amounts at bottom)
        zapsOnlyContainer.appendChild(zapOnlyDiv);
      } else {
        // Insert before the found position (higher amounts towards top)
        const targetItem = existingZapItems[zapInsertPosition];
        if (targetItem) {
          zapsOnlyContainer.insertBefore(zapOnlyDiv, targetItem);
        } else {
          zapsOnlyContainer.appendChild(zapOnlyDiv);
        }
      }
    }

    // Update total zapped amount
    updateLiveEventZapTotal();
  };

  const subscribeChatAuthorProfile = async (pubkey: string) => {
    // Debug log removed

    const filter = {
      kinds: [0], // Profile kind
      authors: [pubkey]
    };

    const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
      onevent(profile: any) {
        updateProfile(profile);
      },
      oneose() {
        // Debug log removed
      },
      onclosed() {
        // Debug log removed
      }
    });
  };

  const updateLiveEventZapTotal = () => {
    // Debug log removed

    const zaps = Array.from(document.querySelectorAll('.live-event-zap'));
    const totalAmount = zaps.reduce((sum, zap) => {
      return sum + parseInt((zap as HTMLElement).dataset.amount || '0');
    }, 0);
    const totalCount = zaps.length;

    const totalValueElement = document.getElementById('zappedTotalValue');
    const totalCountElement = document.getElementById('zappedTotalCount');

    if (totalValueElement) {
      totalValueElement.innerText = numberWithCommas(totalAmount);
    }
    if (totalCountElement) {
      totalCountElement.innerText = numberWithCommas(totalCount);
    }
  };

  const addZapToTotals = (pubkey: string, amount: number, profile: any = null) => {
    // Debug log removed

    // Initialize zapperTotals if it doesn't exist
    if (!(window as any).zapperTotals) {
      (window as any).zapperTotals = new Map();
    }

    const zapperTotals = (window as any).zapperTotals;

    if (zapperTotals.has(pubkey)) {
      const existing = zapperTotals.get(pubkey);
      existing.amount += amount;
      if (profile) {
        existing.profile = profile;
        existing.name = getDisplayName(profile);
        existing.picture = profile.picture || '/images/gradient_color.gif';
      }
    } else {
      zapperTotals.set(pubkey, {
        amount,
        profile,
        name: profile ? getDisplayName(profile) : 'Anonymous',
        picture: profile ? (profile.picture || '/images/gradient_color.gif') : '/images/gradient_color.gif',
        pubkey
      });
    }

    updateTopZappers();
  };

  const getDisplayName = (profile: any) => {
    if (!profile) return 'Anonymous';
    return profile.display_name || profile.displayName || profile.name || 'Anonymous';
  };

  const updateTopZappers = () => {
    // Debug log removed

    if (!(window as any).zapperTotals) return;

    const zapperTotals = (window as any).zapperTotals;

    // Sort zappers by total amount (highest first) and take top 5
    const topZappers = Array.from(zapperTotals.values())
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 5);

    // Update both window and React state
    (window as any).topZappers = topZappers;
    setTopZappers(topZappers);
    // Don't automatically display - let the useEffect handle it based on toggle state
  };

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
        const avatar = zapperElement.querySelector('.zapper-avatar') as HTMLImageElement;
        const name = zapperElement.querySelector('.zapper-name');
        const total = zapperElement.querySelector('.zapper-total');

        if (avatar) avatar.src = zapper.picture;
        if (avatar) avatar.alt = zapper.name;
        if (name) name.textContent = zapper.name;
        if (total) total.textContent = `${numberWithCommas(zapper.amount)} sats`;

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


  const updateProfile = (profile: any) => {
    // Debug log removed

    const profileData = JSON.parse(profile.content || '{}');
    const name = profileData.display_name || profileData.displayName || profileData.name || `${profile.pubkey.slice(0,8)  }...`;
    const picture = profileData.picture || '/images/gradient_color.gif';

    // Update zapper totals with profile info if this user has zapped
    if ((window as any).zapperTotals && (window as any).zapperTotals.has(profile.pubkey)) {
      const zapperData = (window as any).zapperTotals.get(profile.pubkey);
      zapperData.profile = profileData;
      zapperData.name = name;
      zapperData.picture = picture;
      updateTopZappers(); // Refresh display with updated profile info
    }

    // Update all chat messages and zaps from this author
    const authorElements = document.querySelectorAll(`[data-pubkey="${profile.pubkey}"]`);
    authorElements.forEach(element => {
      if (element.classList.contains('chat-author-img') || element.classList.contains('zap-author-img') || element.classList.contains('zapperProfileImg')) {
        (element as HTMLImageElement).src = picture;
      } else if (element.classList.contains('chat-author-name') || element.classList.contains('zap-author-name') || element.classList.contains('zapperName')) {
        element.textContent = name;
      }
    });
  };

  const setupLiveEventTwoColumnLayout = () => {
    // Debug log removed

    const zapsContainer = document.getElementById('zaps');
    if (!zapsContainer) return;

    // Check if layout is already set up to avoid clearing existing content
    if (zapsContainer.classList.contains('live-event-two-column') &&
        zapsContainer.querySelector('.live-event-columns')) {
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

    // Disable and grey out the grid toggle for live events
    const zapGridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
    if (zapGridToggle) {
      zapGridToggle.disabled = true;

      // Add disabled class to the parent toggle group
      const toggleGroup = zapGridToggle.closest('.toggle-group');
      if (toggleGroup) {
        toggleGroup.classList.add('grid-toggle-disabled');
      }

      // Also add to the label as fallback
      const gridLabel = zapGridToggle.closest('label');
      if (gridLabel) {
        gridLabel.classList.add('grid-toggle-disabled');
      }
    }
  };

  const subscribeLiveEventHostProfile = async (hostPubkey: string) => {
    // Debug log removed

    const filter = {
      kinds: [0], // Profile kind
      authors: [hostPubkey]
    };

    const sub = (window as any).pool.subscribeMany((window as any).relays, [filter], {
      onevent(profile: any) {
        updateLiveEventHostProfile(profile);
      },
      oneose() {
        // Debug log removed
      },
      onclosed() {
        // Debug log removed
      }
    });
  };

  const updateLiveEventHostProfile = (profile: any) => {
    // Debug log removed

    const profileData = JSON.parse(profile.content || '{}');
    const picture = profileData.picture || '/images/gradient_color.gif';

    // Update the author profile image
    const authorImg = document.getElementById('authorNameProfileImg') as HTMLImageElement;
    if (authorImg) {
      authorImg.src = picture;
    }
  };

  const startContentMonitoring = () => {
    // Debug log removed

    // Clear any existing monitoring
    if ((window as any).contentMonitorInterval) {
      clearInterval((window as any).contentMonitorInterval);
    }

    (window as any).contentMonitorInterval = setInterval(() => {
      const noteContent = document.querySelector('.note-content');
      const zapsContainer = document.getElementById('zaps');
      const liveEventContent = noteContent?.querySelector('.live-event-content');
      const twoColumnLayout = zapsContainer?.querySelector('.live-event-columns');

      if ((window as any).currentEventType === 'live-event') {
        if (!liveEventContent) {
          console.warn('Live event content disappeared! Attempting to restore...');
          // Try to restore if we have the current live event info
          if ((window as any).currentLiveEvent && (window as any).currentLiveEventInfo) {
            // Debug log removed
            displayLiveEvent((window as any).currentLiveEvent);
          }
        }

        if (!twoColumnLayout && zapsContainer && !zapsContainer.classList.contains('loading')) {
          console.warn('Two-column layout disappeared! Attempting to restore...');
          setupLiveEventTwoColumnLayout();
        }
      }
    }, 10000); // Check every 10 seconds
  };

  const initializeLiveVideoPlayer = (streamingUrl: string) => {
    // Debug log removed

    const video = document.getElementById('live-video') as HTMLVideoElement;
    if (!video) return;

    // Set up video error handling
    video.addEventListener('error', (e) => {
      console.error('Video error:', e);
      const videoError = document.getElementById('video-error');
      if (videoError) {
        videoError.style.display = 'block';
      }
    });

    // Set up video load handling
    video.addEventListener('loadeddata', () => {
      // Debug log removed
      const videoError = document.getElementById('video-error');
      if (videoError) {
        videoError.style.display = 'none';
      }
    });

    // Set video source
    video.src = streamingUrl;
    video.load();
  };

  const generateQRCode = (elementId: string, value: string, size: number) => {
    const element = document.getElementById(elementId);
    if (element && (window as any).QRious) {
      element.innerHTML = '';
      new (window as any).QRious({
        element,
        size,
        value
      });
    }
  };

  const updateQRLinks = (njumpUrl: string, nostrNaddr: string, naddrId: string) => {
    const qrcodeLinkNostr = document.getElementById('qrcodeLinkNostr') as HTMLAnchorElement;
    const qrcodeNeventLink = document.getElementById('qrcodeNeventLink') as HTMLAnchorElement;
    const qrcodeNoteLink = document.getElementById('qrcodeNoteLink') as HTMLAnchorElement;

    if (qrcodeLinkNostr) qrcodeLinkNostr.href = njumpUrl;
    if (qrcodeNeventLink) qrcodeNeventLink.href = nostrNaddr;
    if (qrcodeNoteLink) qrcodeNoteLink.href = naddrId;
  };

  const updateQRPreviews = (njumpUrl: string, nostrNaddr: string, naddrId: string) => {
    const qrDataPreview1 = document.getElementById('qrDataPreview1');
    const qrDataPreview2 = document.getElementById('qrDataPreview2');
    const qrDataPreview3 = document.getElementById('qrDataPreview3');

    if (qrDataPreview1) qrDataPreview1.textContent = njumpUrl;
    if (qrDataPreview2) qrDataPreview2.textContent = nostrNaddr;
    if (qrDataPreview3) qrDataPreview3.textContent = naddrId;
  };

  const generateLiveEventQRCodes = (liveEvent: any) => {
    // Debug log removed

    const identifier = liveEvent.tags.find((tag: any) => tag[0] === 'd')?.[1];
    const pubkey = liveEvent.pubkey;
    const kind = 30311;

    if (!identifier || !pubkey) return;

    try {
      // Generate naddr
      const naddrId = (window as any).NostrTools.nip19.naddrEncode({
        identifier,
        pubkey,
        kind,
        relays: []
      });

      const njumpUrl = `https://njump.me/${  naddrId}`;
      const nostrNaddr = `nostr:${  naddrId}`;

      // Calculate QR size
      const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);

      // Generate QR codes
      generateQRCode('qrCode', njumpUrl, qrSize);
      generateQRCode('qrCodeNevent', nostrNaddr, qrSize);
      generateQRCode('qrCodeNote', naddrId, qrSize);

      // Update links
      updateQRLinks(njumpUrl, nostrNaddr, naddrId);

      // Update previews
      updateQRPreviews(njumpUrl, nostrNaddr, naddrId);

    } catch (error) {
      console.error('Error generating QR codes for live event:', error);
    }
  };

  const loadNoteContent = async (noteId: string) => {
    try {
      // Re-enable grid toggle for regular notes (not live events)
      enableGridToggle();

      // Reset zapper totals for new content
      resetZapperTotals();

      // Strip nostr: protocol prefix if present before validation
      const originalNoteId = noteId;
      noteId = stripNostrPrefix(noteId);

      // Validate the note ID after stripping prefix
      try {
        validateNoteId(noteId);
        // Clear any previous error message
        hideNoteLoaderError();
      } catch (error) {
        showNoteLoaderError(error instanceof Error ? error.message : 'Unknown error');
        return;
      }

      try {
        const decoded = (window as any).NostrTools.nip19.decode(noteId);
        let kind1ID;

        if (decoded.type === 'nevent') {
          kind1ID = decoded.data.id;
        } else if (decoded.type === 'note') {
          kind1ID = decoded.data;
        } else if (decoded.type === 'naddr') {
          // Handle live event (naddr1)
          const { identifier, pubkey, kind } = decoded.data;

          // Reset zapper totals for new live event
          resetZapperTotals();

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

          const noteLoaderContainer = document.getElementById('noteLoaderContainer');
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
        const noteLoaderContainer = document.getElementById('noteLoaderContainer');
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
        const noteLoaderContainer = document.getElementById('noteLoaderContainer');
        if (noteLoaderContainer) {
          noteLoaderContainer.style.display = 'none';
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load note content');
    }
  };

  const validateNoteId = (noteId: string): boolean => {
    // Check if noteId is empty or just whitespace
    if (!noteId || noteId.trim() === '') {
      throw new Error('Please enter a note ID');
    }

    // Trim whitespace
    noteId = noteId.trim();

    // Check if it's a valid NIP-19 format (starts with note1, nevent1, naddr1, or nprofile1)
    if (!noteId.startsWith('note1') && !noteId.startsWith('nevent1') && !noteId.startsWith('naddr1') && !noteId.startsWith('nprofile1')) {
      throw new Error('Invalid format. Please enter a valid nostr note ID (note1...), event ID (nevent1...), addressable event (naddr1...), or profile (nprofile1...)');
    }

    // Validate Bech32 format according to NIP-19
    try {
      const decoded = (window as any).NostrTools.nip19.decode(noteId);

      // Validate decoded structure
      if (decoded.type === 'note') {
        // For note1: should have a 32-byte hex string
        if (!decoded.data || typeof decoded.data !== 'string' || decoded.data.length !== 64) {
          throw new Error('Invalid note ID format');
        }
      } else if (decoded.type === 'nevent') {
        // For nevent1: should have an id field with 32-byte hex string
        if (!decoded.data || !decoded.data.id || typeof decoded.data.id !== 'string' || decoded.data.id.length !== 64) {
          throw new Error('Invalid event ID format');
        }
      } else if (decoded.type === 'naddr') {
        // For naddr1: should have identifier, pubkey, and kind fields
        if (!decoded.data || !decoded.data.identifier || !decoded.data.pubkey || typeof decoded.data.kind !== 'number') {
          throw new Error('Invalid addressable event format');
        }
        // Validate it's a live event kind
        if (decoded.data.kind !== 30311) {
          throw new Error('Only live events (kind 30311) are supported');
        }
      } else if (decoded.type === 'nprofile') {
        // For nprofile1: should have pubkey field
        if (!decoded.data || !decoded.data.pubkey) {
          throw new Error('Invalid profile format');
        }
      } else {
        throw new Error('Unsupported identifier type');
      }

      return true;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Invalid') || error.message.includes('Unsupported'))) {
        throw new Error('Invalid nostr identifier format. Please check the note ID and try again.');
      }
      throw new Error('Invalid nostr identifier format. Please check the note ID and try again.');
    }
  };

  const stripNostrPrefix = (noteId: string): string => {
    return noteId.replace(/^nostr:/, '');
  };


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

  const resetToDefaults = () => {
    // Clear localStorage to remove saved customizations
    localStorage.removeItem('pubpay-styles');
    // Debug log removed

    // Apply light mode preset
    applyPreset('lightMode');
  };


  // Update style URL - saves styles to localStorage and cleans URL
  const updateStyleURL = () => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;

    // Get current style values
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;

    // Get the actual partner logo URL
    let currentPartnerLogo = '';
    if (partnerLogoSelect) {
      if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
        currentPartnerLogo = partnerLogoUrl.value;
      } else {
        currentPartnerLogo = partnerLogoSelect.value;
      }
    }

    const styles = {
      textColor: toHexColor((mainLayout as HTMLElement).style.getPropertyValue('--text-color') || DEFAULT_STYLES.textColor),
      bgColor: toHexColor((mainLayout as HTMLElement).style.backgroundColor),
      bgImage: (document.getElementById('bgImageUrl') as HTMLInputElement)?.value || '',
      qrInvert: (document.getElementById('qrInvertToggle') as HTMLInputElement)?.checked || false,
      qrScreenBlend: (document.getElementById('qrScreenBlendToggle') as HTMLInputElement)?.checked || false,
      qrMultiplyBlend: (document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement)?.checked || false,
      qrShowWebLink: (document.getElementById('qrShowWebLinkToggle') as HTMLInputElement)?.checked ?? true,
      qrShowNevent: (document.getElementById('qrShowNeventToggle') as HTMLInputElement)?.checked ?? true,
      qrShowNote: (document.getElementById('qrShowNoteToggle') as HTMLInputElement)?.checked ?? true,
      layoutInvert: (document.getElementById('layoutInvertToggle') as HTMLInputElement)?.checked || false,
      hideZapperContent: (document.getElementById('hideZapperContentToggle') as HTMLInputElement)?.checked || false,
      showTopZappers: (document.getElementById('showTopZappersToggle') as HTMLInputElement)?.checked || false,
      podium: (document.getElementById('podiumToggle') as HTMLInputElement)?.checked || false,
      zapGrid: (document.getElementById('zapGridToggle') as HTMLInputElement)?.checked || false,
      lightning: (document.getElementById('lightningToggle') as HTMLInputElement)?.checked || false,
      opacity: parseFloat((document.getElementById('opacitySlider') as HTMLInputElement)?.value || '1'),
      textOpacity: parseFloat((document.getElementById('textOpacitySlider') as HTMLInputElement)?.value || '1'),
      partnerLogo: currentPartnerLogo
    };

    // Store styles in localStorage instead of URL
    localStorage.setItem('pubpay-styles', JSON.stringify(styles));

    // Keep URL clean - no style parameters
    const pathParts = window.location.pathname.split('/');
    const noteId = pathParts[pathParts.length - 1];
    const cleanUrl = noteId && noteId !== 'live' ? `/live/${noteId}` : '/live';

    if (window.location.href !== window.location.origin + cleanUrl) {
      window.history.replaceState({}, '', cleanUrl);
    }
  };

  // Apply styles from URL parameters
  const applyStylesFromURL = () => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;

    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return; // No URL parameters

    // Apply text color
    if (params.has('textColor')) {
      const color = params.get('textColor');
      if (color) {
        (mainLayout as HTMLElement).style.setProperty('--text-color', color);
        const textColorInput = document.getElementById('textColorPicker') as HTMLInputElement;
        if (textColorInput) textColorInput.value = color;
      }
    }

    // Apply background color
    if (params.has('bgColor')) {
      const color = params.get('bgColor');
      if (color) {
        const opacity = params.has('opacity') ? parseFloat(params.get('opacity') || '1') : DEFAULT_STYLES.opacity;
        const rgbaColor = hexToRgba(color, opacity);
        (mainLayout as HTMLElement).style.backgroundColor = rgbaColor;
        const bgColorInput = document.getElementById('bgColorPicker') as HTMLInputElement;
        if (bgColorInput) bgColorInput.value = color;
      }
    }

    // Apply background image
    if (params.has('bgImage')) {
      const imageUrl = params.get('bgImage');
      if (imageUrl) {
        const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
        if (bgImageUrl) {
          bgImageUrl.value = imageUrl;
          updateBackgroundImage(imageUrl);
        }
      }
    }

    // Apply QR code invert
    if (params.has('qrInvert')) {
      const invert = params.get('qrInvert') === 'true';
      const qrInvertToggle = document.getElementById('qrInvertToggle') as HTMLInputElement;
      if (qrInvertToggle) qrInvertToggle.checked = invert;
      const qrCodes = [
        document.getElementById('qrCode'),
        document.getElementById('qrCodeNevent'),
        document.getElementById('qrCodeNote')
      ];

      // Include Lightning QR in invert effect if enabled
      if (lightningEnabled) {
        qrCodes.push(document.getElementById('lightningQRCode'));
      }

      qrCodes.forEach(qrCode => {
        if (qrCode) {
          (qrCode as HTMLElement).style.filter = invert ? 'invert(1)' : 'none';
        }
      });
    }

    // Apply QR code blend modes
    if (params.has('qrScreenBlend')) {
      const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
      if (qrScreenBlendToggle) qrScreenBlendToggle.checked = params.get('qrScreenBlend') === 'true';
    }
    if (params.has('qrMultiplyBlend')) {
      const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;
      if (qrMultiplyBlendToggle) qrMultiplyBlendToggle.checked = params.get('qrMultiplyBlend') === 'true';
    }

    // Update blend mode after setting toggles
    if (params.has('qrScreenBlend') || params.has('qrMultiplyBlend')) {
      updateBlendMode();
    }

    // Apply QR slide visibility
    if (params.has('qrShowWebLink')) {
      const show = params.get('qrShowWebLink') === 'true';
      const toggle = document.getElementById('qrShowWebLinkToggle') as HTMLInputElement;
      if (toggle) toggle.checked = show;
    }
    if (params.has('qrShowNevent')) {
      const show = params.get('qrShowNevent') === 'true';
      const toggle = document.getElementById('qrShowNeventToggle') as HTMLInputElement;
      if (toggle) toggle.checked = show;
    }
    if (params.has('qrShowNote')) {
      const show = params.get('qrShowNote') === 'true';
      const toggle = document.getElementById('qrShowNoteToggle') as HTMLInputElement;
      if (toggle) toggle.checked = show;
    }

    // Apply layout invert
    if (params.has('layoutInvert')) {
      const invert = params.get('layoutInvert') === 'true';
      const layoutInvertToggle = document.getElementById('layoutInvertToggle') as HTMLInputElement;
      if (layoutInvertToggle) layoutInvertToggle.checked = invert;
      document.body.classList.toggle('flex-direction-invert', invert);
    }

    // Apply hide zapper content
    if (params.has('hideZapperContent')) {
      const hide = params.get('hideZapperContent') === 'true';
      const hideZapperContentToggle = document.getElementById('hideZapperContentToggle') as HTMLInputElement;
      if (hideZapperContentToggle) hideZapperContentToggle.checked = hide;
      document.body.classList.toggle('hide-zapper-content', hide);
    }

    // Apply show top zappers
    if (params.has('showTopZappers')) {
      const show = params.get('showTopZappers') === 'true';
      const showTopZappersToggle = document.getElementById('showTopZappersToggle') as HTMLInputElement;
      if (showTopZappersToggle) showTopZappersToggle.checked = show;
      document.body.classList.toggle('show-top-zappers', show);
    }

    // Apply podium
    if (params.has('podium')) {
      const podium = params.get('podium') === 'true';
      const podiumToggle = document.getElementById('podiumToggle') as HTMLInputElement;
      if (podiumToggle) podiumToggle.checked = podium;
      document.body.classList.toggle('podium-enabled', podium);
    }

    // Apply zap grid
    if (params.has('zapGrid')) {
      const zapGrid = params.get('zapGrid') === 'true';
      const zapGridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
      if (zapGridToggle) zapGridToggle.checked = zapGrid;
      const zapsList = document.getElementById('zaps');
      if (zapsList) {
        zapsList.classList.toggle('grid-layout', zapGrid);
        if (zapGrid) {
          organizeZapsHierarchically();
        } else {
          cleanupHierarchicalOrganization();
        }
      }
    }

    // Apply lightning toggle
    if (params.has('lightning')) {
      const lightning = params.get('lightning') === 'true';
      const lightningToggle = document.getElementById('lightningToggle') as HTMLInputElement;
      if (lightningToggle) lightningToggle.checked = lightning;
    }

    // Apply opacity
    if (params.has('opacity')) {
      const opacity = parseFloat(params.get('opacity') || '1');
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const opacityValue = document.getElementById('opacityValue');
      if (opacitySlider) opacitySlider.value = opacity.toString();
      if (opacityValue) opacityValue.textContent = `${Math.round(opacity * 100)  }%`;
    }

    // Apply text opacity
    if (params.has('textOpacity')) {
      const textOpacity = parseFloat(params.get('textOpacity') || '1');
      const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');
      if (textOpacitySlider) textOpacitySlider.value = textOpacity.toString();
      if (textOpacityValue) textOpacityValue.textContent = `${Math.round(textOpacity * 100)  }%`;
    }

    // Apply partner logo from URL
    if (params.has('partnerLogo')) {
      const partnerLogoUrl = decodeURIComponent(params.get('partnerLogo') || '');
      const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
      const partnerLogoImg = document.getElementById('partnerLogo') as HTMLImageElement;
      const partnerLogoUrlInput = document.getElementById('partnerLogoUrl') as HTMLInputElement;
      const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
      const partnerLogoPreview = document.getElementById('partnerLogoPreview') as HTMLImageElement;

      if (partnerLogoUrl) {
        // Check if it's one of the predefined options
        const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === partnerLogoUrl);
        if (matchingOption) {
          // It's a predefined logo
          if (partnerLogoSelect) partnerLogoSelect.value = partnerLogoUrl;
          if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
        } else {
          // It's a custom URL
          if (partnerLogoSelect) partnerLogoSelect.value = 'custom';
          if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
          if (partnerLogoUrlInput) partnerLogoUrlInput.value = partnerLogoUrl;
        }

        // Set the actual logo
        if (partnerLogoImg) {
          partnerLogoImg.src = partnerLogoUrl;
          partnerLogoImg.style.display = 'inline-block';
        }

        // Update preview
        if (partnerLogoPreview) {
          partnerLogoPreview.src = partnerLogoUrl;
          partnerLogoPreview.alt = 'Partner logo preview';
        }
      } else {
        // No logo
        if (partnerLogoSelect) partnerLogoSelect.value = '';
        if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
        if (partnerLogoImg) {
          partnerLogoImg.style.display = 'none';
          partnerLogoImg.src = '';
        }
        if (partnerLogoPreview) {
          partnerLogoPreview.src = '';
          partnerLogoPreview.alt = 'No partner logo';
        }
      }
    }

    // Apply all styles to ensure everything is synchronized
    applyAllStyles();

    // Update QR slide visibility after applying styles from URL
    setTimeout(() => {
      // Check if QR codes exist before updating visibility
      const qrCode = document.getElementById('qrCode');
      const qrCodeNevent = document.getElementById('qrCodeNevent');
      const qrCodeNote = document.getElementById('qrCodeNote');

      console.log('QR code elements check:', {
        qrCode: !!qrCode,
        qrCodeNevent: !!qrCodeNevent,
        qrCodeNote: !!qrCodeNote,
        qrCodeContent: qrCode?.innerHTML,
        qrCodeNeventContent: qrCodeNevent?.innerHTML,
        qrCodeNoteContent: qrCodeNote?.innerHTML
      });

      if (typeof updateQRSlideVisibility === 'function') {
        // Debug log removed
        updateQRSlideVisibility(true); // Skip URL update during initialization
      }
    }, 500); // Longer delay to ensure QR codes are generated first

    // Save styles to localStorage and clean URL (like the original)
    updateStyleURL();
  };

  const copyStyleUrl = () => {
    // Get current styles from localStorage
    const savedStyles = localStorage.getItem('pubpay-styles');
    let urlToCopy = window.location.origin + window.location.pathname;

    if (savedStyles) {
      try {
        const styles = JSON.parse(savedStyles);
        const params = new URLSearchParams();

        // Add style parameters that differ from defaults
        if (styles.textColor && styles.textColor !== DEFAULT_STYLES.textColor) {
          params.set('textColor', styles.textColor);
        }
        if (styles.bgColor && styles.bgColor !== DEFAULT_STYLES.bgColor) {
          params.set('bgColor', styles.bgColor);
        }
        if (styles.bgImage && styles.bgImage !== DEFAULT_STYLES.bgImage) {
          params.set('bgImage', styles.bgImage);
        }
        if (styles.qrInvert !== DEFAULT_STYLES.qrInvert) {
          params.set('qrInvert', styles.qrInvert);
        }
        if (styles.qrScreenBlend !== DEFAULT_STYLES.qrScreenBlend) {
          params.set('qrScreenBlend', styles.qrScreenBlend);
        }
        if (styles.qrMultiplyBlend !== DEFAULT_STYLES.qrMultiplyBlend) {
          params.set('qrMultiplyBlend', styles.qrMultiplyBlend);
        }
        if (styles.qrShowWebLink !== DEFAULT_STYLES.qrShowWebLink) {
          params.set('qrShowWebLink', styles.qrShowWebLink);
        }
        if (styles.qrShowNevent !== DEFAULT_STYLES.qrShowNevent) {
          params.set('qrShowNevent', styles.qrShowNevent);
        }
        if (styles.qrShowNote !== DEFAULT_STYLES.qrShowNote) {
          params.set('qrShowNote', styles.qrShowNote);
        }
        if (styles.layoutInvert !== DEFAULT_STYLES.layoutInvert) {
          params.set('layoutInvert', styles.layoutInvert);
        }
        if (styles.hideZapperContent !== DEFAULT_STYLES.hideZapperContent) {
          params.set('hideZapperContent', styles.hideZapperContent);
        }
        if (styles.showTopZappers !== DEFAULT_STYLES.showTopZappers) {
          params.set('showTopZappers', styles.showTopZappers);
        }
        if (styles.podium !== DEFAULT_STYLES.podium) {
          params.set('podium', styles.podium);
        }
        if (styles.zapGrid !== DEFAULT_STYLES.zapGrid) {
          params.set('zapGrid', styles.zapGrid);
        }
        if (styles.lightning !== DEFAULT_STYLES.lightning) {
          params.set('lightning', styles.lightning);
        }
        if (styles.opacity !== DEFAULT_STYLES.opacity) {
          params.set('opacity', styles.opacity);
        }
        if (styles.textOpacity !== DEFAULT_STYLES.textOpacity) {
          params.set('textOpacity', styles.textOpacity);
        }
        if (styles.partnerLogo && styles.partnerLogo !== DEFAULT_STYLES.partnerLogo) {
          params.set('partnerLogo', encodeURIComponent(styles.partnerLogo));
        }

        // Add parameters to URL if any exist
        if (params.toString()) {
          urlToCopy += `?${  params.toString()}`;
        }
      } catch (e) {
        console.error('Error parsing saved styles:', e);
      }
    }

    navigator.clipboard.writeText(urlToCopy).then(() => {
      // Show feedback
      const btn = document.getElementById('copyStyleUrl');
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy URL:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = urlToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  };

  const resetZapperTotals = () => {
    setTotalZaps(0);
    setTotalAmount(0);
    setZaps([]);
    setTopZappers([]);
    hideTopZappersBar();
  };

  const enableGridToggle = () => {
    // Enable grid toggle functionality
    // Debug log removed
  };

  const subscribeKind1 = async (kind1ID: string) => {
    if (!(window as any).pool || !(window as any).relays) {
      console.error('Nostr pool or relays not available');
      return;
    }

    const pool = (window as any).pool;
    const relays = (window as any).relays;

    const filter = { ids: [kind1ID] };

    // Add a timeout to prevent immediate EOS
    const timeoutId = setTimeout(() => {
      // Debug log removed
    }, 10000);

    pool.subscribeMany(
      [...relays],
      [filter],
      {
        async onevent(kind1: any) {
          clearTimeout(timeoutId);
          // Debug log removed
          await drawKind1(kind1);
          await subscribeKind0fromKind1(kind1);
          await subscribeKind9735fromKind1(kind1);
        },
        oneose() {
          clearTimeout(timeoutId);
        },
        onclosed() {
          clearTimeout(timeoutId);
        }
      }
    );
  };

  const subscribeKind0fromKind1 = async (kind1: any) => {
    if (!(window as any).pool || !(window as any).relays) {
      return;
    }

    const pool = (window as any).pool;
    const relays = (window as any).relays;
    const kind0key = kind1.pubkey;

    const sub = pool.subscribeMany(
      [...relays],
      [{
        kinds: [0],
        authors: [kind0key]
      }],
      {
        onevent(kind0: any) {
          drawKind0(kind0);
        },
        oneose() {
        },
        onclosed() {
        }
      }
    );
  };

  const subscribeKind9735fromKind1 = async (kind1: any) => {
    // Debug log removed
    if (!(window as any).pool || !(window as any).relays) {
      // Debug log removed
      return;
    }

    const pool = (window as any).pool;
    const relays = (window as any).relays;
    const kinds9735IDs = new Set();
    const kinds9735: any[] = [];
    const kind1id = kind1.id;
    let isFirstStream = true;

    const zapsContainer = document.getElementById('zaps');

    // Add a timeout for zap subscription
    const zapTimeoutId = setTimeout(() => {
      // Zap subscription timeout - no zaps received after 15 seconds
      if (kinds9735.length === 0) {
        // No zaps found for this note
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
    }, 15000);

    const sub = pool.subscribeMany(
      [...relays],
      [{
        kinds: [9735],
        '#e': [kind1id]
      }],
      {
        onevent(kind9735: any) {
          // Debug log removed
          clearTimeout(zapTimeoutId);
          if (!(kinds9735IDs.has(kind9735.id))) {
            kinds9735IDs.add(kind9735.id);
            kinds9735.push(kind9735);
            // Debug log removed
            if (!isFirstStream) {
              subscribeKind0fromKinds9735([kind9735]);
            }
          }
        },
        oneose() {
          clearTimeout(zapTimeoutId);
          isFirstStream = false;
          subscribeKind0fromKinds9735(kinds9735);
        },
        onclosed() {
          clearTimeout(zapTimeoutId);
        }
      }
    );
  };

  const subscribeKind0fromKinds9735 = (kinds9735: any[]) => {
    if (!(window as any).pool || !(window as any).relays) {
      return;
    }

    const pool = (window as any).pool;
    const relays = (window as any).relays;
    const kind9734PKs: string[] = [];
    const kind0fromkind9735List: any[] = [];
    const kind0fromkind9735Seen = new Set();

    for (const kind9735 of kinds9735) {
      if (kind9735.tags) {
        const description9735 = kind9735.tags.find((tag: any) => tag[0] === 'description')?.[1];
        if (description9735) {
          const kind9734 = JSON.parse(description9735);
          kind9734PKs.push(kind9734.pubkey);
        }
      }
    }

    const h = pool.subscribeMany(
      [...relays],
      [{
        kinds: [0],
        authors: kind9734PKs
      }],
      {
        onevent(kind0: any) {
          if (!(kind0fromkind9735Seen.has(kind0.pubkey))) {
            kind0fromkind9735Seen.add(kind0.pubkey);
            kind0fromkind9735List.push(kind0);
          }
        },
        async         oneose() {
          // Debug log removed
          createkinds9735JSON(kinds9735, kind0fromkind9735List);
        },
        onclosed() {
        }
      }
    );
  };

  const createkinds9735JSON = async (kind9735List: any[], kind0fromkind9735List: any[]) => {
    // Debug log removed
    // Reset zapper totals for new note
    resetZapperTotals();

    const json9735List: any[] = [];

    for (const kind9735 of kind9735List) {
      const description9735 = JSON.parse(kind9735.tags.find((tag: any) => tag[0] == 'description')?.[1] || '{}');
      const pubkey9735 = description9735.pubkey;
      const bolt119735 = kind9735.tags.find((tag: any) => tag[0] == 'bolt11')?.[1];

      if (!bolt119735) continue;

      const amount9735 = (window as any).lightningPayReq?.decode(bolt119735)?.satoshis || 0;
      const kind1from9735 = kind9735.tags.find((tag: any) => tag[0] == 'e')?.[1];
      const kind9735id = (window as any).NostrTools?.nip19?.noteEncode(kind9735.id) || kind9735.id;
      const kind9735Content = description9735.content || '';
      let kind0picture = '';
      let kind0npub = '';
      let kind0name = '';
      let kind0finalName = '';
      let profileData = null;

      const kind0fromkind9735 = kind0fromkind9735List.find((kind0: any) => pubkey9735 === kind0.pubkey);
      if (kind0fromkind9735) {
        const content = JSON.parse(kind0fromkind9735.content);
        const displayName = content.displayName;
        kind0name = displayName ? content.displayName : content.display_name;
        kind0finalName = kind0name != '' ? kind0name : content.name;
        kind0picture = content.picture;
        kind0npub = (window as any).NostrTools?.nip19?.npubEncode(kind0fromkind9735.pubkey) || '';
        profileData = content;
      }

      const json9735 = {
        'e': kind1from9735,
        'amount': amount9735,
        'picture': kind0picture,
        'npubPayer': kind0npub,
        'pubKey': pubkey9735,
        'zapEventID': kind9735id,
        'kind9735content': kind9735Content,
        'kind1Name': kind0finalName,
        'kind0Profile': profileData
      };
      json9735List.push(json9735);
    }

    json9735List.sort((a, b) => b.amount - a.amount);
    drawKinds9735(json9735List);
  };

  const drawKinds9735 = (json9735List: any[]) => {
    // Debug log removed

    const zapsContainer = document.getElementById('zaps');
    if (!zapsContainer) return;

    zapsContainer.innerHTML = '';

    // Hide zaps loading animation
    zapsContainer.classList.remove('loading');
    const loadingText = zapsContainer.querySelector('.loading-text');
    if (loadingText) loadingText.remove();

    const totalAmountZapped = json9735List.reduce((sum, zaps) => sum + zaps.amount, 0);
    const totalValueElement = document.getElementById('zappedTotalValue');
    const totalCountElement = document.getElementById('zappedTotalCount');

    if (totalValueElement) {
      totalValueElement.innerText = numberWithCommas(totalAmountZapped);
    }
    if (totalCountElement) {
      totalCountElement.innerText = json9735List.length.toString();
    }

    // Update React state
    setTotalAmount(totalAmountZapped);
    setTotalZaps(json9735List.length);
    setZaps(json9735List);

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

      if (!zap.picture) zap.picture = '';
      const profileImage = zap.picture == '' ? '/images/gradient_color.gif' : zap.picture;

      zapDiv.innerHTML = `
        <div class="zapperProfile">
          <img class="zapperProfileImg" src="${profileImage}" />
          <div class="zapperInfo">
            <div class="zapperName">
              ${zap.kind1Name || 'Anonymous'}
            </div>
            <div class="zapperMessage">${zap.kind9735content || ''}</div>
          </div>
        </div>
        <div class="zapperAmount">
          <span class="zapperAmountSats">${numberWithCommas(zap.amount)}</span>
          <span class="zapperAmountLabel">sats</span>
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
          const amountA = parseInt(a.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
          const amountB = parseInt(b.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
          return amountB - amountA;
        });

        console.log('Applying podium classes in list layout. Top 3 zaps:', sortedZaps.slice(0, 3).map(zap => ({
          amount: zap.querySelector('.zapperAmountSats')?.textContent,
          name: zap.querySelector('.zapperName')?.textContent
        })));

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
    calculateTopZappersFromZaps(json9735List);
  };

  const calculateTopZappersFromZaps = (zaps: any[]) => {
    // Debug log removed
    // Debug log removed

    // Group zaps by zapper pubkey and sum amounts
    const zapperTotals = new Map<string, any>();

    for (const zap of zaps) {
      const pubkey = zap.pubKey || zap.pubkey; // Try both possible property names
      const amount = zap.amount;
      const profile = zap.kind0Profile || null;

      // Debug log removed

      if (zapperTotals.has(pubkey)) {
        const existing = zapperTotals.get(pubkey);
        existing.amount += amount;
        // Debug log removed
      } else {
        const zapperData = {
          amount,
          profile,
          name: profile ? getDisplayName(profile) : (zap.kind1Name || 'Anonymous'),
          picture: profile?.picture || zap.picture || '/images/gradient_color.gif'
        };
        zapperTotals.set(pubkey, zapperData);
        // Debug log removed
      }
    }

    // Sort by amount and take top 5
    const topZappers = Array.from(zapperTotals.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Debug log removed
    // Debug log removed
    setTopZappers(topZappers);

    // Also update window object for legacy compatibility
    (window as any).topZappers = topZappers;
  };

  const numberWithCommas = (x: number) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };


  const cleanupHierarchicalOrganization = () => {
    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;

    // Skip if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
      // Debug log removed
      return;
    }

    // Remove all row containers and move zaps back to the main container
    const existingRows = zapsList.querySelectorAll('.zap-row');
    existingRows.forEach(row => {
      // Move all zaps from this row back to the main container
      const zapsInRow = Array.from(row.children);
      zapsInRow.forEach(zap => {
        // Remove row classes and global podium classes from individual zaps
        zap.className = zap.className.replace(/row-\d+/g, '');
        zap.className = zap.className.replace(/podium-global-\d+/g, '');
        // Move zap back to main container
        zapsList.appendChild(zap);
      });
      // Remove the empty row container
      row.remove();
    });
  };

  const organizeZapsHierarchically = () => {
    const zapsList = document.getElementById('zaps');
    if (!zapsList) return;

    // Skip if this is a live event (has two-column layout)
    if (zapsList.classList.contains('live-event-two-column')) {
      // Debug log removed
      return;
    }

    const zaps = Array.from(zapsList.querySelectorAll('.zap'));
    if (zaps.length === 0) return;

    // Clear existing row classes and podium classes
    zaps.forEach(zap => {
      zap.className = zap.className.replace(/row-\d+/g, '');
      zap.className = zap.className.replace(/podium-\d+/g, '');
      zap.className = zap.className.replace(/podium-global-\d+/g, '');
    });

    // Remove existing row containers
    const existingRows = zapsList.querySelectorAll('.zap-row');
    existingRows.forEach(row => row.remove());

    // Sort zaps by amount (highest first) for podium application
    const sortedZaps = [...zaps].sort((a, b) => {
      const amountA = parseInt(a.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
      const amountB = parseInt(b.querySelector('.zapperAmountSats')?.textContent?.replace(/[^\d]/g, '') || '0');
      return amountB - amountA;
    });

    // Apply podium classes to top 3 zaps
    if (document.body.classList.contains('podium-enabled')) {
      console.log('Applying podium classes in grid layout. Top 3 zaps:', sortedZaps.slice(0, 3).map(zap => ({
        amount: zap.querySelector('.zapperAmountSats')?.textContent,
        name: zap.querySelector('.zapperName')?.textContent
      })));
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

      zapsList.appendChild(rowContainer);

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

  const drawKind1 = async (kind1: any) => {
    // Debug log removed

    // Store note ID globally for QR regeneration
    (window as any).currentNoteId = kind1.id;

    const noteContent = document.getElementById('noteContent');
    // Debug log removed

    if (noteContent) {
      // Process content for both images and nostr mentions
      const processedContent = await processNoteContent(kind1.content);
      // Debug log removed
      noteContent.innerHTML = processedContent;

      // Hide note content loading animation
      noteContent.classList.remove('loading');
      const loadingText = noteContent.querySelector('.loading-text');
      if (loadingText) loadingText.remove();
    }

    // Update React state
    setNoteContent(kind1.content);

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
    const neventId = (window as any).NostrTools.nip19.neventEncode({ id: noteId, relays: [] });
    const note1Id = (window as any).NostrTools.nip19.noteEncode(noteId);
    const njumpUrl = `https://njump.me/${  note1Id}`;
    const nostrNevent = `nostr:${  neventId}`;
    const nostrNote = `nostr:${  note1Id}`;

    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);

    // Generate QR codes for all formats
    const qrcodeContainers = [
      { element: document.getElementById('qrCode'), value: njumpUrl, link: document.getElementById('qrcodeLinkNostr'), preview: document.getElementById('qrDataPreview1') },
      { element: document.getElementById('qrCodeNevent'), value: nostrNevent, link: document.getElementById('qrcodeNeventLink'), preview: document.getElementById('qrDataPreview2') },
      { element: document.getElementById('qrCodeNote'), value: nostrNote, link: document.getElementById('qrcodeNoteLink'), preview: document.getElementById('qrDataPreview3') }
    ];

    qrcodeContainers.forEach(({ element, value, link, preview }) => {
      if (element) {
        element.innerHTML = '';
        new (window as any).QRious({
          element,
          size: qrSize,
          value
        });

        // Set link href
        if (link) (link as HTMLAnchorElement).href = value;

        // Set data preview (more characters for web links)
        if (preview) {
          let cleanValue = value;
          let maxLength = 10; // Default for nostr formats

          if (value.startsWith('https://')) {
            cleanValue = value.substring(8); // Remove 'https://'
            maxLength = 20; // Show more for web links
          } else if (value.startsWith('nostr:')) {
            cleanValue = value.substring(6); // Remove 'nostr:'
          }
          // Always add ellipsis to show truncation
          const previewText = `${cleanValue.substring(0, maxLength)  }...`;
          preview.textContent = previewText;
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

  const drawKind0 = (kind0: any) => {
    // Debug log removed

    try {
      const profile = JSON.parse(kind0.content);
      setAuthorName(profile.name || profile.display_name || 'Anonymous');
      setAuthorImage(profile.picture || '/images/gradient_color.gif');
    } catch (e) {
      console.error('Error parsing profile:', e);
    }
  };

  const processNoteContent = async (content: string): Promise<string> => {
    // This is a simplified version - the full implementation would process images and mentions
    return content;
  };

  const loadLiveEvent = async (naddr: string) => {
    try {
      const decoded = (window as any).NostrTools.nip19.decode(naddr);
      if (decoded.type === 'naddr') {
        const { identifier, pubkey, kind } = decoded.data;

        // Load the live event content
        setNoteContent(`Live Event: ${identifier}`);
        setAuthorName('Live Event Author');

        // Subscribe to live event updates
        await subscribeToLiveEvent(pubkey, identifier);
      }
    } catch (err) {
      throw new Error('Failed to load live event');
    }
  };

  const loadProfile = async (nprofile: string) => {
    try {
      const decoded = (window as any).NostrTools.nip19.decode(nprofile);
      if (decoded.type === 'nprofile') {
        const { pubkey } = decoded.data;
        await loadProfileContent(pubkey);
      }
    } catch (err) {
      throw new Error('Failed to load profile');
    }
  };

  const loadNote = async (noteId: string) => {
    try {
      const decoded = (window as any).NostrTools.nip19.decode(noteId);
      if (decoded.type === 'note') {
        const noteId = decoded.data;
        // Load note content
        setNoteContent('Note content will be loaded here');
        setAuthorName('Note Author');
      }
    } catch (err) {
      throw new Error('Failed to load note');
    }
  };

  const loadProfileContent = async (pubkey: string) => {
    try {
      // Load profile information
      setAuthorName('Profile Author');
      setNoteContent('Profile content will be loaded here');

      // Subscribe to profile updates
      await subscribeProfileInfo(pubkey);
    } catch (err) {
      throw new Error('Failed to load profile content');
    }
  };

  const subscribeToLiveEvent = async (pubkey: string, identifier: string) => {
    // This would integrate with the existing Nostr services
    // Debug log removed
  };

  const subscribeProfileInfo = async (pubkey: string) => {
    // This would integrate with the existing Nostr services
    // Debug log removed
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
    const inputField = document.getElementById('note1LoaderInput') as HTMLInputElement;
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

    // Validate the note ID
    try {
      validateNoteId(cleanNoteId);
      hideNoteLoaderError();
    } catch (error) {
      showNoteLoaderError(error instanceof Error ? error.message : 'Invalid note ID');
      return;
    }

    try {
      // Decode and route to appropriate handler
      const decoded = (window as any).NostrTools.nip19.decode(cleanNoteId);

      // Update URL with the identifier using path format
      const newUrl = `/live/${  cleanNoteId}`;
      window.history.pushState({}, '', newUrl);

      // Trigger a custom event to notify the React component
      window.dispatchEvent(new CustomEvent('noteLoaderSubmitted', {
        detail: { noteId: cleanNoteId, decoded }
      }));

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

        // Load profile
        await loadProfileContent(pubkey);

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
        throw new Error('Invalid identifier format. Please enter a valid nostr identifier.');
      }

    } catch (e) {
      console.error('Error loading note content:', e);
      showNoteLoaderError('Invalid nostr identifier. Please enter a valid note ID (note1...), event ID (nevent1...), live event (naddr1...), or profile (nprofile1...).');
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
          console.warn(`Input field or button not found, retrying... (attempt ${retryCount + 1}/50)`);
        }
        setTimeout(() => setupNoteLoaderListeners(retryCount + 1), 100);
        return;
      } else {
        console.error('Input field or button not found after 50 retries, giving up');
        setupNoteLoaderListenersInProgress = false;
        return;
      }
    }

    if (submitButton) {
      // Remove any existing listeners first
      submitButton.removeEventListener('click', handleNoteLoaderSubmit);

      submitButton.addEventListener('click', (e) => {
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
      inputField.addEventListener('input', (e) => {
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

  // Style options functionality
  const setupStyleOptions = () => {
    // Debug log removed

    // Setup color pickers with localStorage saving
    setupColorPicker('textColorPicker', 'textColorValue', 'color');
    setupColorPicker('bgColorPicker', 'bgColorValue', 'backgroundColor');

    // Setup background image functionality
    const bgImagePreset = document.getElementById('bgImagePreset');
    const bgImageUrl = document.getElementById('bgImageUrl');
    const bgPresetPreview = document.getElementById('bgPresetPreview');
    const clearBgImage = document.getElementById('clearBgImage');
    const customUrlGroup = document.getElementById('customUrlGroup');

    if (bgImagePreset) {
      bgImagePreset.addEventListener('change', (e: any) => {
        const selectedValue = e.target.value;
        // Debug log removed
        if (selectedValue === 'custom') {
          if (customUrlGroup) customUrlGroup.style.display = 'block';
          if (bgImageUrl) (bgImageUrl as HTMLInputElement).focus();
        } else {
          if (customUrlGroup) customUrlGroup.style.display = 'none';
          if (bgImageUrl) {
            (bgImageUrl as HTMLInputElement).value = selectedValue;
            // Debug log removed
          }
          updateBackgroundImage(selectedValue);
          if (bgPresetPreview) {
            (bgPresetPreview as HTMLImageElement).src = selectedValue;
            (bgPresetPreview as HTMLImageElement).alt = selectedValue ? 'Background preview' : 'No background';
          }
        }
        saveCurrentStylesToLocalStorage();
      });
    }

    if (bgImageUrl) {
      bgImageUrl.addEventListener('input', (e: any) => {
        const url = e.target.value.trim();
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
              (bgPresetPreview as HTMLImageElement).alt = 'Failed to load image';
            }
          };
          img.src = url;
        } else {
          updateBackgroundImage('');
          if (bgPresetPreview) {
            (bgPresetPreview as HTMLImageElement).src = '';
            (bgPresetPreview as HTMLImageElement).alt = 'No background';
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
          calculateTopZappersFromZaps(zaps);
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
      const zapGridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
      const isGridActive = zapGridToggle?.checked;

      if (isGridActive) {
        // If grid is active, reorganize hierarchically to apply podium classes
        // Debug log removed
        setTimeout(() => {
          organizeZapsHierarchically();
        }, 10);
      } else {
        // If grid is not active, re-render zaps to apply podium styling
        if (zaps.length > 0) {
          // Debug log removed
          drawKinds9735(zaps);
        }
      }
    });

    setupToggle('zapGridToggle', (checked: boolean) => {
      // Debug log removed
      const zapsList = document.getElementById('zaps');
      if (zapsList) {
        // Check if we're in live event mode (has two-column layout)
        const isLiveEvent = zapsList.classList.contains('live-event-two-column');
        if (isLiveEvent) {
          // Debug log removed
          return;
        }

        zapsList.classList.toggle('grid-layout', checked);
        if (checked) {
          // Debug log removed
          organizeZapsHierarchically();
        } else {
          // Debug log removed
          cleanupHierarchicalOrganization();
        }

        // Re-render zaps to apply/remove podium styling based on current state
        if (zaps.length > 0) {
          // Debug log removed
          drawKinds9735(zaps);
        }
      }
    });

    setupToggle('qrInvertToggle', () => {
      // Debug log removed
      const qrInvertToggle = document.getElementById('qrInvertToggle') as HTMLInputElement;
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
      // Debug log removed
      const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
      const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;

      if (qrScreenBlendToggle?.checked) {
        qrMultiplyBlendToggle.checked = false;
      }
      // Debug log removed
      updateBlendMode();
    });

    setupToggle('qrMultiplyBlendToggle', () => {
      // Debug log removed
      const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
      const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;

      if (qrMultiplyBlendToggle?.checked) {
        qrScreenBlendToggle.checked = false;
      }
      // Debug log removed
      updateBlendMode();
    });

    // Setup opacity sliders
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const opacityValue = document.getElementById('opacityValue');
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
    const textOpacityValue = document.getElementById('textOpacityValue');

    if (opacitySlider && opacityValue) {
      // Debug log removed
      opacitySlider.addEventListener('input', (e: any) => {
        const value = parseFloat(e.target.value);
        opacityValue.textContent = `${Math.round(value * 100)  }%`;
        debouncedApplyAllStyles();
        saveCurrentStylesToLocalStorage();
      });
    }

    if (textOpacitySlider && textOpacityValue) {
      // Debug log removed
      textOpacitySlider.addEventListener('input', (e: any) => {
        const value = parseFloat(e.target.value);
        textOpacityValue.textContent = `${Math.round(value * 100)  }%`;
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
    setupToggle('lightningToggle', async () => {
      // Debug log removed
      // Debug log removed
      // Debug log removed

      if (!lightningService.current) {
        console.error('❌ Lightning service not initialized');
        return;
      }

      try {
        if (lightningEnabled) {
          // Disable Lightning payments
          // Debug log removed
          const success = await lightningService.current.disableLightning(eventId);
          // Debug log removed
          if (success) {
            setLightningEnabled(false);
            setLightningLNURL('');
            // Debug log removed
          } else {
            console.error('❌ Failed to disable Lightning payments');
          }
        } else {
          // Enable Lightning payments
          // Debug log removed
          // Debug log removed
          const success = await lightningService.current.enableLightning(eventId);
          // Debug log removed
          console.log('Lightning service state after enable:', {
            enabled: lightningService.current.enabled,
            lnurl: lightningService.current.currentLnurl,
            loading: lightningService.current.loading,
            error: lightningService.current.lastError
          });

          if (success) {
            setLightningEnabled(true);
            const lnurl = lightningService.current.currentLnurl || '';
            setLightningLNURL(lnurl);
            // Debug log removed

            // Create Lightning QR slide if it doesn't exist
            if (lnurl) {
              // Debug log removed
              createLightningQRSlide(lnurl);
            } else {
              console.error('❌ No LNURL received from Lightning service');
            }
          } else {
            console.error('❌ Failed to enable Lightning payments');
            console.error('Error from service:', lightningService.current.lastError);
          }
        }

        // Update QR slide visibility
        if (typeof updateQRSlideVisibility === 'function') {
          // Debug log removed
          updateQRSlideVisibility();
        } else {
          // Debug log removed
        }
      } catch (error) {
        console.error('❌ Error toggling Lightning payments:', error);
      }
    });

    // Note: Default values are set in loadInitialStyles() - don't override them here
    // QR slide visibility toggles are loaded and applied in loadInitialStyles()

    // Setup partner logo functionality
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoImg = document.getElementById('partnerLogo') as HTMLImageElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
    const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
    const partnerLogoPreview = document.getElementById('partnerLogoPreview') as HTMLImageElement;
    const clearPartnerLogo = document.getElementById('clearPartnerLogo');

    if (partnerLogoSelect) {
      partnerLogoSelect.addEventListener('change', () => {
        if (partnerLogoSelect.value === 'custom') {
          if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
        } else {
          if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
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
        if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
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

  const setupColorPicker = (pickerId: string, valueId: string, targetProperty: string) => {
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

  const setupToggle = (toggleId: string, callback: (checked: boolean) => void) => {
    const toggle = document.getElementById(toggleId) as HTMLInputElement;
    if (toggle) {
      // Debug log removed
      toggle.addEventListener('change', () => {
        // Debug log removed
        callback(toggle.checked);
        saveCurrentStylesToLocalStorage();
      });
    } else {
      // Debug log removed
    }
  };

  const toHexColor = (color: string): string => {
    // If it's already a hex color, return it
    if (color.startsWith('#')) {
      return color;
    }

    // If it's an rgb/rgba color, convert to hex
    if (color.startsWith('rgb')) {
      const values = color.match(/\d+/g);
      if (values && values.length >= 3) {
        const r = parseInt(values[0] || '0');
        const g = parseInt(values[1] || '0');
        const b = parseInt(values[2] || '0');
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }

    // If we can't convert, return the default color
    return '#000000';
  };

  const hexToRgba = (hex: string, opacity: number): string => {
    // Remove the # if present
    hex = hex.replace('#', '');

    // Parse the hex color
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  // Load initial styles from localStorage or apply defaults
  const loadInitialStyles = () => {
    // Debug log removed

    // Check if there are URL parameters first
    const params = new URLSearchParams(window.location.search);
    if (params.toString() !== '') {
      // Debug log removed
      applyStylesFromURL();
      return; // URL parameters take precedence, skip localStorage
    }

    // Load saved styles from localStorage if no URL parameters
    const savedStyles = localStorage.getItem('pubpay-styles');
    // Debug log removed

    if (savedStyles) {
      try {
        const styles = JSON.parse(savedStyles);
        // Debug log removed
        // Debug background image loading
        if (styles.bgImage || styles.backgroundImage) {
          // Debug log removed
        }

        // Apply saved text color
        if (styles.textColor) {
          const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement;
          const textColorValue = document.getElementById('textColorValue') as HTMLInputElement;
          if (textColorPicker) {
            textColorPicker.value = styles.textColor;
          }
          if (textColorValue) {
            textColorValue.value = styles.textColor;
          }
        }

        // Apply saved background color (check both old and new property names)
        const bgColor = styles.bgColor || styles.backgroundColor;
        if (bgColor) {
          const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
          const bgColorValue = document.getElementById('bgColorValue') as HTMLInputElement;
          if (bgColorPicker) {
            bgColorPicker.value = bgColor;
          }
          if (bgColorValue) {
            bgColorValue.value = bgColor;
          }
        }

        // Apply saved opacity values
        if (styles.opacity !== undefined) {
          const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
          const opacityValue = document.getElementById('opacityValue');
          // Debug log removed
          if (opacitySlider) {
            opacitySlider.value = styles.opacity.toString();
            // Debug log removed
          }
          if (opacityValue) {
            opacityValue.textContent = `${Math.round(styles.opacity * 100)  }%`;
            // Debug log removed
          }
        }

        if (styles.textOpacity !== undefined) {
          const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
          const textOpacityValue = document.getElementById('textOpacityValue');
          // Debug log removed
          if (textOpacitySlider) {
            textOpacitySlider.value = styles.textOpacity.toString();
            // Debug log removed
          }
          if (textOpacityValue) {
            textOpacityValue.textContent = `${Math.round(styles.textOpacity * 100)  }%`;
            // Debug log removed
          }
        }

        // Apply saved partner logo
        if (styles.partnerLogo !== undefined) {
          const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
          const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
          const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');

          if (partnerLogoSelect) {
            if (styles.partnerLogo) {
              // Check if it's a predefined option
              const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === styles.partnerLogo);
              if (matchingOption) {
                partnerLogoSelect.value = styles.partnerLogo;
                if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
              } else {
                // It's a custom URL
                partnerLogoSelect.value = 'custom';
                if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
                if (partnerLogoUrl) partnerLogoUrl.value = styles.partnerLogo;
              }
            } else {
              // No logo
              partnerLogoSelect.value = '';
              if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
              if (partnerLogoUrl) partnerLogoUrl.value = '';
            }
          }
        }

        // Apply saved background image (check both old and new property names)
        const bgImage = styles.bgImage || styles.backgroundImage;
        if (bgImage !== undefined) {
          const bgImagePreset = document.getElementById('bgImagePreset') as HTMLSelectElement;
          const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
          const customBgImageGroup = document.getElementById('customBgImageGroup');
          const bgPresetPreview = document.getElementById('bgPresetPreview') as HTMLImageElement;

          if (bgImagePreset) {
            if (bgImage) {
              // Debug log removed
              // Check if it's a predefined option
              const matchingOption = Array.from(bgImagePreset.options).find(option => option.value === bgImage);
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
                if (customBgImageGroup) customBgImageGroup.style.display = 'block';
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
          'qrShowWebLink': 'qrShowWebLinkToggle',
          'qrShowNevent': 'qrShowNeventToggle',
          'qrShowNote': 'qrShowNoteToggle',
          'qrInvert': 'qrInvertToggle',
          'qrScreenBlend': 'qrScreenBlendToggle',
          'qrMultiplyBlend': 'qrMultiplyBlendToggle',
          'layoutInvert': 'layoutInvertToggle',
          'hideZapperContent': 'hideZapperContentToggle',
          'showTopZappers': 'showTopZappersToggle',
          'podium': 'podiumToggle',
          'zapGrid': 'zapGridToggle',
          'lightning': 'lightningToggle'
        };

        toggleIds.forEach(toggleId => {
          const toggle = document.getElementById(toggleId) as HTMLInputElement;
          // Find the corresponding property name in localStorage
          const propertyName = Object.keys(propertyToToggleMap).find(key => propertyToToggleMap[key] === toggleId);
          if (toggle && propertyName && styles[propertyName] !== undefined) {
            // Debug log removed
            toggle.checked = styles[propertyName];
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
                  const topZappersBar = document.getElementById('top-zappers-bar');
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
                  if (checked) {
                    zapsList.classList.add('grid-layout');
                  } else {
                    zapsList.classList.remove('grid-layout');
                  }
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
                updateBlendMode();
              },
              qrMultiplyBlendToggle: (checked: boolean) => {
                // Debug log removed
                // Call updateBlendMode to apply the correct CSS classes
                updateBlendMode();
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
              lightningToggle: (checked: boolean) => {
                // Debug log removed
                // Don't call updateQRSlideVisibility here - will be called at end of loadInitialStyles
              }
            };

            const callback = toggleCallbacks[toggleId as keyof typeof toggleCallbacks];
            if (callback) {
              // Debug log removed
              callback(styles[propertyName]);
            }
          }
        });
      } catch (error) {
        console.error('Error loading saved styles:', error);
      }
    } else {
      // Debug log removed
      // Apply default styles when no saved styles exist
      const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement;
      const textColorValue = document.getElementById('textColorValue') as HTMLInputElement;
      const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
      const bgColorValue = document.getElementById('bgColorValue') as HTMLInputElement;
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const opacityValue = document.getElementById('opacityValue');
      const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');

      // Set default values
      const defaultTextColor = '#ffffff';
      const defaultBgColor = '#000000';
      const defaultOpacity = 1.0;
      const defaultTextOpacity = 1.0;

      if (textColorPicker) textColorPicker.value = defaultTextColor;
      if (textColorValue) textColorValue.value = defaultTextColor;
      if (bgColorPicker) bgColorPicker.value = defaultBgColor;
      if (bgColorValue) bgColorValue.value = defaultBgColor;
      if (opacitySlider) opacitySlider.value = defaultOpacity.toString();
      if (opacityValue) opacityValue.textContent = `${Math.round(defaultOpacity * 100)  }%`;
      if (textOpacitySlider) textOpacitySlider.value = defaultTextOpacity.toString();
      if (textOpacityValue) textOpacityValue.textContent = `${Math.round(defaultTextOpacity * 100)  }%`;
    }

    // Apply all styles after loading (with small delay to ensure DOM is ready)
    setTimeout(() => {
      applyAllStyles();

      // Detect and mark active preset
      detectActivePreset();

      // Update QR slide visibility after all styles and toggles are loaded
      setTimeout(() => {
        if (typeof updateQRSlideVisibility === 'function') {
          // Debug log removed
          updateQRSlideVisibility(true); // Skip URL update during initialization
        }
      }, 200); // Additional delay to ensure all toggles are set
    }, 100);
  };

  // Detect which preset is currently active based on current styles
  const detectActivePreset = () => {
    // Debug log removed

    const textColorElement = document.getElementById('textColorValue') as HTMLInputElement;
    const bgColorElement = document.getElementById('bgColorValue') as HTMLInputElement;
    const bgImageElement = document.getElementById('bgImageUrl') as HTMLInputElement;
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;

    if (!textColorElement || !bgColorElement) {
      // Debug log removed
      return;
    }

    const currentTextColor = textColorElement.value;
    const currentBgColor = bgColorElement.value;
    const currentBgImage = bgImageElement?.value || '';
    const currentTextOpacity = parseFloat(textOpacitySlider?.value || '1');
    const currentOpacity = parseFloat(opacitySlider?.value || '1');
    const currentPartnerLogo = partnerLogoSelect?.value === 'custom' ? partnerLogoUrl?.value || '' : partnerLogoSelect?.value || '';

    // Get current toggle states
    const toggleIds = [
      'layoutInvertToggle', 'hideZapperContentToggle', 'showTopZappersToggle',
      'podiumToggle', 'zapGridToggle', 'qrInvertToggle', 'qrScreenBlendToggle',
      'qrMultiplyBlendToggle', 'qrShowWebLinkToggle', 'qrShowNeventToggle',
      'qrShowNoteToggle', 'lightningToggle'
    ];

    const currentToggles: { [key: string]: boolean } = {};
    toggleIds.forEach(toggleId => {
      const toggle = document.getElementById(toggleId) as HTMLInputElement;
      if (toggle) {
        currentToggles[toggleId] = toggle.checked;
      }
    });

    // Debug log removed

    // Define all presets for comparison
    const presets: { [key: string]: any } = {
      lightMode: {
        textColor: '#000000',
        bgColor: '#ffffff',
        bgImage: '',
        textOpacity: 1.0,
        opacity: 1.0,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      darkMode: {
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '',
        textOpacity: 1.0,
        opacity: 1.0,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      cosmic: {
        textColor: '#ffffff',
        bgColor: '#0a0a1a',
        bgImage: '/images/bitcoin-space.gif',
        textOpacity: 1.0,
        opacity: 0.4,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: true,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      vibrant: {
        textColor: '#ffd700',
        bgColor: '#2d1b69',
        bgImage: '/images/nostr-ostriches.gif',
        textOpacity: 1.0,
        opacity: 0.6,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      electric: {
        textColor: '#00ffff',
        bgColor: '#000033',
        bgImage: '/images/send-zaps.gif',
        textOpacity: 1.0,
        opacity: 0.7,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      warm: {
        textColor: '#8B4513',
        bgColor: '#FFE4B5',
        bgImage: '',
        textOpacity: 1.0,
        opacity: 0.9,
        partnerLogo: '',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      adopting: {
        textColor: '#ffffff',
        bgColor: '#FF6B35',
        bgImage: '',
        textOpacity: 1.0,
        opacity: 0.9,
        partnerLogo: 'https://adoptingbitcoin.org/images/AB-logo.svg',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      },
      bitcoinConf: {
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '/images/sky.jpg',
        textOpacity: 1.0,
        opacity: 0.7,
        partnerLogo: 'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg',
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        lightning: false
      }
    };

    // Find matching preset
    for (const [presetName, presetData] of Object.entries(presets)) {
      // Check basic properties
      const basicMatch = presetData.textColor === currentTextColor &&
                        presetData.bgColor === currentBgColor &&
                        presetData.bgImage === currentBgImage &&
                        Math.abs(presetData.textOpacity - currentTextOpacity) < 0.01 &&
                        Math.abs(presetData.opacity - currentOpacity) < 0.01 &&
                        presetData.partnerLogo === currentPartnerLogo;

      // Check toggle states
      let togglesMatch = true;
      for (const toggleId of toggleIds) {
        const presetPropertyName = toggleId.replace('Toggle', '');
        if (presetData[presetPropertyName] !== currentToggles[toggleId]) {
          togglesMatch = false;
          break;
        }
      }

      if (basicMatch && togglesMatch) {
        // Debug log removed

        // Update active preset button
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-preset="${presetName}"]`);
        if (activeBtn) {
          activeBtn.classList.add('active');
          // Debug log removed
        }
        return;
      }
    }

    // Debug log removed
    // Clear all active preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
  };

  // Save current styles to localStorage
  const saveCurrentStylesToLocalStorage = () => {
    const textColorElement = document.getElementById('textColorValue') as HTMLInputElement;
    const bgColorElement = document.getElementById('bgColorValue') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
    const bgImagePreset = document.getElementById('bgImagePreset') as HTMLSelectElement;
    const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;

    if (textColorElement && bgColorElement && opacitySlider && textOpacitySlider) {
      let currentPartnerLogo = '';
      if (partnerLogoSelect) {
        if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
          currentPartnerLogo = partnerLogoUrl.value;
        } else {
          currentPartnerLogo = partnerLogoSelect.value;
        }
      }

      let currentBackgroundImage = '';
      if (bgImagePreset) {
        if (bgImagePreset.value === 'custom' && bgImageUrl) {
          currentBackgroundImage = bgImageUrl.value;
        } else {
          currentBackgroundImage = bgImagePreset.value;
        }
      }

      // Get all toggle states using consistent property names
      const toggleMapping = [
        { toggleId: 'layoutInvertToggle', propertyName: 'layoutInvert' },
        { toggleId: 'hideZapperContentToggle', propertyName: 'hideZapperContent' },
        { toggleId: 'showTopZappersToggle', propertyName: 'showTopZappers' },
        { toggleId: 'podiumToggle', propertyName: 'podium' },
        { toggleId: 'zapGridToggle', propertyName: 'zapGrid' },
        { toggleId: 'qrInvertToggle', propertyName: 'qrInvert' },
        { toggleId: 'qrScreenBlendToggle', propertyName: 'qrScreenBlend' },
        { toggleId: 'qrMultiplyBlendToggle', propertyName: 'qrMultiplyBlend' },
        { toggleId: 'qrShowWebLinkToggle', propertyName: 'qrShowWebLink' },
        { toggleId: 'qrShowNeventToggle', propertyName: 'qrShowNevent' },
        { toggleId: 'qrShowNoteToggle', propertyName: 'qrShowNote' },
        { toggleId: 'lightningToggle', propertyName: 'lightning' }
      ];

      const toggleStates: { [key: string]: boolean } = {};
      toggleMapping.forEach(({ toggleId, propertyName }) => {
        const toggle = document.getElementById(toggleId) as HTMLInputElement;
        if (toggle) {
          toggleStates[propertyName] = toggle.checked;
        }
      });

      const styles = {
        textColor: textColorElement.value,
        bgColor: bgColorElement.value,
        textOpacity: parseFloat(textOpacitySlider.value),
        opacity: parseFloat(opacitySlider.value),
        partnerLogo: currentPartnerLogo,
        bgImage: currentBackgroundImage,
        ...toggleStates
      };

      localStorage.setItem('pubpay-styles', JSON.stringify(styles));
      // Debug log removed
    }
  };

  const applyAllStyles = () => {
    // Debug log removed

    const textColorElement = document.getElementById('textColorValue') as HTMLInputElement;
    const bgColorElement = document.getElementById('bgColorValue') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;

    // Debug log removed

    if (!textColorElement || !bgColorElement || !opacitySlider || !textOpacitySlider) {
      console.error('Style input elements not found:', { textColorElement, bgColorElement, opacitySlider, textOpacitySlider });
      return;
    }

    const textColor = textColorElement.value;
    const bgColor = bgColorElement.value;
    const opacity = parseFloat(opacitySlider.value);
    const textOpacity = parseFloat(textOpacitySlider.value);

    // Debug log removed
    // Debug log removed
    // Debug log removed

    const mainLayout = document.querySelector('.main-layout') as HTMLElement;

    if (mainLayout) {
      // Apply text color with opacity
      const rgbaTextColor = hexToRgba(textColor, textOpacity);
      mainLayout.style.setProperty('--text-color', rgbaTextColor);

      // Apply color to specific elements that need hardcoded color overrides
      const hardcodedElements = mainLayout.querySelectorAll(`
        .zaps-header-left h2,
        .total-label,
        .total-sats,
        .total-amount,
        .zapperName,
        .zapperMessage,
        .zapperAmount,
        .zapperAmountSats,
        .zapperAmountLabel,
        .authorName,
        .noteContent,
        .qr-slide-title,
        .qr-slide-label,
        .zap-author-name,
        .zap-message,
        .zap-amount,
        .zap-amount-sats,
        .zap-amount-label,
        .zapperProfile .zapperName,
        .zapperProfile .zapperMessage,
        .zapperProfile .zapperAmount,
        .zapperProfile .zapperAmountSats,
        .zapperProfile .zapperAmountLabel
      `);

      hardcodedElements.forEach(element => {
        (element as HTMLElement).style.color = rgbaTextColor;
      });

      // Apply to additional text elements that might be missed
      const additionalTextElements = mainLayout.querySelectorAll(`
        .zap .zapperName,
        .zap .zapperMessage,
        .zap .zapperAmount,
        .zap .zapperAmountSats,
        .zap .zapperAmountLabel,
        .zapperProfile .zapperName,
        .zapperProfile .zapperMessage,
        .zapperProfile .zapperAmount,
        .zapperProfile .zapperAmountSats,
        .zapperProfile .zapperAmountLabel
      `);

      additionalTextElements.forEach(element => {
        (element as HTMLElement).style.color = rgbaTextColor;
      });

      // Apply background color with opacity
      const rgbaColor = hexToRgba(bgColor, opacity);
      mainLayout.style.backgroundColor = rgbaColor;

      // Apply background image
      const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
      // Debug log removed
      if (bgImageUrl && bgImageUrl.value) {
        // Debug log removed
        updateBackgroundImage(bgImageUrl.value);
      } else {
        // Debug log removed
        updateBackgroundImage('');
      }

      // Apply partner logo
      const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
      const partnerLogoImg = document.getElementById('partnerLogo') as HTMLImageElement;
      const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
      const partnerLogoPreview = document.getElementById('partnerLogoPreview') as HTMLImageElement;

      if (partnerLogoSelect && partnerLogoImg) {
        let currentPartnerLogo = '';
        if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
          currentPartnerLogo = partnerLogoUrl.value;
        } else {
          currentPartnerLogo = partnerLogoSelect.value;
        }

        if (currentPartnerLogo) {
          partnerLogoImg.src = currentPartnerLogo;
          partnerLogoImg.style.display = 'inline-block';

          if (partnerLogoPreview) {
            partnerLogoPreview.src = currentPartnerLogo;
            partnerLogoPreview.alt = 'Partner logo preview';
          }
        } else {
          partnerLogoImg.style.display = 'none';
          partnerLogoImg.src = '';

          if (partnerLogoPreview) {
            partnerLogoPreview.src = '';
            partnerLogoPreview.alt = 'No partner logo';
          }
        }
      }
    }
  };

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
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const currentOpacity = opacitySlider ? parseFloat(opacitySlider.value) : 1.0;
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

  const updateBackgroundImage = (url: string) => {
    // Debug log removed
    const liveZapOverlay = document.querySelector('.liveZapOverlay') as HTMLElement;
    if (liveZapOverlay) {
      if (url) {
        // Debug log removed
        liveZapOverlay.style.backgroundImage = `url(${url})`;
        liveZapOverlay.style.backgroundSize = 'cover';
        liveZapOverlay.style.backgroundPosition = 'center';
        liveZapOverlay.style.backgroundRepeat = 'no-repeat';
        // Debug log removed
      } else {
        // Debug log removed
        liveZapOverlay.style.backgroundImage = '';
      }
    } else {
      // Debug log removed
    }
  };

  const updateBlendMode = () => {
    // Debug log removed
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;

    // Debug log removed

    if (qrScreenBlendToggle?.checked) {
      qrMultiplyBlendToggle.checked = false;
      document.body.classList.add('qr-blend-active');
      document.body.classList.remove('qr-multiply-active');
      // Debug log removed
    } else if (qrMultiplyBlendToggle?.checked) {
      qrScreenBlendToggle.checked = false;
      document.body.classList.add('qr-blend-active');
      document.body.classList.add('qr-multiply-active');
      // Debug log removed
    } else {
      document.body.classList.remove('qr-blend-active');
      document.body.classList.remove('qr-multiply-active');
      // Debug log removed
    }

    // Debug log removed
  };

  const applyPreset = (preset: string) => {
    const presets: { [key: string]: any } = {
      lightMode: {
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
      },
      darkMode: {
        textColor: '#ffffff',
        bgColor: '#000000',
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
      },
      cosmic: {
        textColor: '#ffffff',
        bgColor: '#0a0a1a',
        bgImage: '/images/bitcoin-space.gif',
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: true,
        zapGrid: false,
        opacity: 0.4,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      vibrant: {
        textColor: '#ffd700',
        bgColor: '#2d1b69',
        bgImage: '/images/nostr-ostriches.gif',
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
        opacity: 0.6,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      electric: {
        textColor: '#00ffff',
        bgColor: '#000033',
        bgImage: '/images/send-zaps.gif',
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      warm: {
        textColor: '#ff8c42',
        bgColor: '#2c1810',
        bgImage: '/images/bitcoin-sunset.gif',
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
        opacity: 0.8,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      adopting: {
        textColor: '#eedb5f',
        bgColor: '#05051f',
        bgImage: '/images/adopting.webp',
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
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo: 'https://adoptingbitcoin.org/images/AB-logo.svg'
      },
      bitcoinConf: {
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '/images/sky.jpg',
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
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo: 'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg'
      }
    };

    const presetData = presets[preset];
    if (presetData) {
      const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement;
      const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
      const textColorValue = document.getElementById('textColorValue') as HTMLInputElement;
      const bgColorValue = document.getElementById('bgColorValue') as HTMLInputElement;
      const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');
      const opacityValue = document.getElementById('opacityValue');

      if (textColorPicker) textColorPicker.value = presetData.textColor;
      if (textColorValue) textColorValue.value = presetData.textColor;
      if (bgColorPicker) bgColorPicker.value = presetData.bgColor;
      if (bgColorValue) bgColorValue.value = presetData.bgColor;
      if (textOpacitySlider) textOpacitySlider.value = presetData.textOpacity.toString();
      if (opacitySlider) opacitySlider.value = presetData.opacity.toString();
      if (textOpacityValue) textOpacityValue.textContent = `${Math.round(presetData.textOpacity * 100)}%`;
      if (opacityValue) opacityValue.textContent = `${Math.round(presetData.opacity * 100)}%`;

      // Update background image
      const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
      const bgImagePreset = document.getElementById('bgImagePreset') as HTMLSelectElement;
      const bgPresetPreview = document.getElementById('bgPresetPreview') as HTMLImageElement;
      const customUrlGroup = document.getElementById('customUrlGroup');

      if (bgImageUrl) bgImageUrl.value = presetData.bgImage;
      if (bgImagePreset) {
        if (presetData.bgImage === '') {
          bgImagePreset.value = '';
        } else {
          const matchingOption = Array.from(bgImagePreset.options).find(option => option.value === presetData.bgImage);
          if (matchingOption) {
            bgImagePreset.value = presetData.bgImage;
          } else {
            bgImagePreset.value = 'custom';
          }
        }
      }

      // Update background preview image
      if (bgPresetPreview) {
        bgPresetPreview.src = presetData.bgImage;
        bgPresetPreview.alt = presetData.bgImage ? 'Background preview' : 'No background';
      }

      // Show/hide custom URL group based on preset selection
      if (customUrlGroup) {
        customUrlGroup.style.display = bgImagePreset?.value === 'custom' ? 'block' : 'none';
      }

      // Update toggles - process zapGridToggle before podiumToggle to ensure correct state
      const toggleIds = [
        'qrInvertToggle', 'qrScreenBlendToggle', 'qrMultiplyBlendToggle',
        'qrShowWebLinkToggle', 'qrShowNeventToggle', 'qrShowNoteToggle',
        'layoutInvertToggle', 'hideZapperContentToggle', 'showTopZappersToggle',
        'zapGridToggle', 'podiumToggle', 'lightningToggle'
      ];

      toggleIds.forEach(toggleId => {
        const toggle = document.getElementById(toggleId) as HTMLInputElement;
        if (toggle) {
          const propertyName = toggleId.replace('Toggle', '');
          // If preset defines this property, use its value; otherwise, set to false (untoggle)
          const value = presetData[propertyName] !== undefined ? presetData[propertyName] : false;
          toggle.checked = value;
          // Debug log removed

          // Trigger the toggle callback to apply visual effects
          const event = new Event('change', { bubbles: true });
          toggle.dispatchEvent(event);
        }
      });

      // Apply all styles to trigger visual effects
      applyAllStyles();

      // Update QR slide visibility after toggles are set
      setTimeout(() => {
        if (typeof updateQRSlideVisibility === 'function') {
          // Debug log removed
          updateQRSlideVisibility();
        }
      }, 100); // Small delay to ensure toggles are properly set

      applyColor('color', presetData.textColor);
      applyColor('backgroundColor', presetData.bgColor);

      // Apply partner logo if present
      if (presetData.partnerLogo !== undefined) {
        const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
        const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
        const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');

        if (partnerLogoSelect) {
          if (presetData.partnerLogo) {
            // Check if it's a predefined option
            const matchingOption = Array.from(partnerLogoSelect.options).find(option => option.value === presetData.partnerLogo);
            if (matchingOption) {
              partnerLogoSelect.value = presetData.partnerLogo;
              if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
            } else {
              // It's a custom URL
              partnerLogoSelect.value = 'custom';
              if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'block';
              if (partnerLogoUrl) partnerLogoUrl.value = presetData.partnerLogo;
            }
          } else {
            // No logo
            partnerLogoSelect.value = '';
            if (customPartnerLogoGroup) customPartnerLogoGroup.style.display = 'none';
            if (partnerLogoUrl) partnerLogoUrl.value = '';
          }
        }
      }

      // Apply the styles
      applyAllStyles();

      // Update active preset button
      document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.querySelector(`[data-preset="${preset}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      // Save preset to localStorage
      const styles = {
        textColor: presetData.textColor,
        bgColor: presetData.bgColor,
        bgImage: presetData.bgImage,
        qrInvert: presetData.qrInvert,
        qrScreenBlend: presetData.qrScreenBlend,
        qrMultiplyBlend: presetData.qrMultiplyBlend,
        qrShowWebLink: presetData.qrShowWebLink,
        qrShowNevent: presetData.qrShowNevent,
        qrShowNote: presetData.qrShowNote,
        layoutInvert: presetData.layoutInvert,
        hideZapperContent: presetData.hideZapperContent,
        showTopZappers: presetData.showTopZappers,
        podium: presetData.podium,
        zapGrid: presetData.zapGrid,
        textOpacity: presetData.textOpacity,
        opacity: presetData.opacity,
        partnerLogo: presetData.partnerLogo || ''
      };
      localStorage.setItem('pubpay-styles', JSON.stringify(styles));
      // Debug log removed
    }
  };

  // QR slide visibility functionality with complex swiper management
  let qrVisibilityUpdateTimeout: NodeJS.Timeout | null = null;

  const updateQRSlideVisibility = (skipURLUpdate = false) => {
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
  };

  const updateQRSlideVisibilityImmediate = (skipURLUpdate = false) => {
    // Debug log removed

    // Get toggle states
    const webLinkToggle = document.getElementById('qrShowWebLinkToggle') as HTMLInputElement;
    const neventToggle = document.getElementById('qrShowNeventToggle') as HTMLInputElement;
    const noteToggle = document.getElementById('qrShowNoteToggle') as HTMLInputElement;
    const lightningToggle = document.getElementById('lightningToggle') as HTMLInputElement;

    const showWebLink = webLinkToggle?.checked ?? false;
    const showNevent = neventToggle?.checked ?? true;
    const showNote = noteToggle?.checked ?? false;
    const showLightning = lightningToggle?.checked ?? false;

    // Debug log removed

    // Get all existing slides using the same selectors as original
    const webLinkSlide = document.querySelector('.swiper-slide:has(#qrCode)') as HTMLElement;
    let neventSlide = document.querySelector('.swiper-slide:has(#qrCodeNevent)') as HTMLElement;
    const noteSlide = document.querySelector('.swiper-slide:has(#qrCodeNote)') as HTMLElement;
    const lightningSlide = document.getElementById('lightningQRSlide') as HTMLElement;

    // Fallback: if :has() doesn't work, find the slide containing qrCodeNevent manually
    if (!neventSlide) {
      const qrCodeNevent = document.getElementById('qrCodeNevent');
      if (qrCodeNevent) {
        neventSlide = qrCodeNevent.closest('.swiper-slide') as HTMLElement;
        // Debug log removed
      }
    }

    // Debug log removed

    // Create or get hidden slides container
    let hiddenSlidesContainer = document.getElementById('hiddenSlidesContainer');
    if (!hiddenSlidesContainer) {
      hiddenSlidesContainer = document.createElement('div');
      hiddenSlidesContainer.id = 'hiddenSlidesContainer';
      hiddenSlidesContainer.style.display = 'none';
      document.body.appendChild(hiddenSlidesContainer);
    }

    const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper') as HTMLElement;

    // If swiper wrapper doesn't exist (e.g., on note loader page), return early
    if (!swiperWrapper) {
      // Debug log removed
      return;
    }

    // Show/hide slides based on settings by moving them between containers
    if (webLinkSlide) {
      if (showWebLink) {
        // Move to swiper wrapper if not already there
        if (!swiperWrapper.contains(webLinkSlide)) {
          swiperWrapper.appendChild(webLinkSlide);
        }
        webLinkSlide.style.display = 'block';
      } else {
        // Move to hidden container
        hiddenSlidesContainer.appendChild(webLinkSlide);
      }
    }

    if (neventSlide) {
      if (showNevent) {
        // Move to swiper wrapper if not already there
        if (!swiperWrapper.contains(neventSlide)) {
          swiperWrapper.appendChild(neventSlide);
        }
        neventSlide.style.display = 'block';
      } else {
        // Move to hidden container
        hiddenSlidesContainer.appendChild(neventSlide);
      }
    }

    if (noteSlide) {
      if (showNote) {
        // Move to swiper wrapper if not already there
        if (!swiperWrapper.contains(noteSlide)) {
          swiperWrapper.appendChild(noteSlide);
        }
        noteSlide.style.display = 'block';
      } else {
        // Move to hidden container
        hiddenSlidesContainer.appendChild(noteSlide);
      }
    }

    if (lightningSlide) {
      if (showLightning) {
        // Move to swiper wrapper if not already there
        if (!swiperWrapper.contains(lightningSlide)) {
          swiperWrapper.appendChild(lightningSlide);
        }
        lightningSlide.style.display = 'block';
      } else {
        // Move to hidden container
        hiddenSlidesContainer.appendChild(lightningSlide);
      }
    }

    // Count visible slides (those in the swiper wrapper)
    const visibleSlides = Array.from(swiperWrapper.children).filter(slide =>
      slide.classList.contains('swiper-slide')
    );

    // Debug log removed
    // Debug log removed
    // Debug log removed

    // Show/hide swiper container
    const qrSwiperContainer = document.querySelector('.qr-swiper') as HTMLElement;
    if (qrSwiperContainer && visibleSlides.length > 0) {
      qrSwiperContainer.style.display = 'block';

      // Update swiper if it exists
      if ((window as any).qrSwiper) {
        try {
          (window as any).qrSwiper.update();

          // Update swiper behavior based on visible slides
          if (visibleSlides.length === 1) {
            (window as any).qrSwiper.allowTouchMove = false;
            if ((window as any).qrSwiper.autoplay && (window as any).qrSwiper.autoplay.stop) {
              (window as any).qrSwiper.autoplay.stop();
            }
            // Clear progress tracking for single slide
            if (progressInterval) {
              clearInterval(progressInterval);
            }
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
  const initializeQRSwiper = () => {
    // Debug log removed

    // Destroy existing swiper
    if ((window as any).qrSwiper) {
      (window as any).qrSwiper.destroy(true, true);
      (window as any).qrSwiper = null;
    }

    const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
    if (!swiperWrapper) return;

    // Count visible slides
    const visibleSlides = Array.from(swiperWrapper.children).filter(slide =>
      slide.classList.contains('swiper-slide')
    );

    if (visibleSlides.length === 0) {
      // Debug log removed
      const qrSwiperContainer = document.querySelector('.qr-swiper') as HTMLElement;
      if (qrSwiperContainer) {
        qrSwiperContainer.style.display = 'none';
      }
      return;
    }

    // Initialize Swiper with proper configuration
    try {
      (window as any).qrSwiper = new (window as any).Swiper('.qr-swiper', {
        loop: visibleSlides.length > 1,
        autoplay: visibleSlides.length > 1 ? {
          delay: 10000,
          disableOnInteraction: false
        } : false,
        allowTouchMove: visibleSlides.length > 1,
        pagination: {
          el: '.swiper-pagination',
          clickable: true
        },
        on: {
          init() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Reset all progress bars
            swiperEl.querySelectorAll('.swiper-pagination-bullet').forEach((bullet: HTMLElement) => {
              bullet.classList.remove('progress-animating');
              bullet.style.setProperty('--progress', '0%');
            });

            // Reset paused progress for initial slide
            pausedProgress = 0;
            progressPauseTime = null;
            // Debug log removed

            // Start animation for active slide immediately
            const activeBullet = swiperEl.querySelector('.swiper-pagination-bullet-active');
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          slideChange() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Reset all progress bars
            swiperEl.querySelectorAll('.swiper-pagination-bullet').forEach((bullet: HTMLElement) => {
              bullet.style.setProperty('--progress', '0%');
              bullet.classList.remove('progress-animating');
            });

            // Reset paused progress for new slide
            pausedProgress = 0;
            progressPauseTime = null;
            // Debug log removed

            // Start progress tracking for new slide immediately
            const activeBullet = swiperEl.querySelector('.swiper-pagination-bullet-active');
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          autoplayStart() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Remove paused class and resume progress animation
            swiperEl.classList.remove('swiper-paused');
            const activeBullet = swiperEl.querySelector('.swiper-pagination-bullet-active');
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          autoplayStop() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Add paused class to pause progress animation
            swiperEl.classList.add('swiper-paused');
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
          }
        }
      });

      // Setup progress bar events after swiper is initialized
      setupProgressBarEvents();

      // Progress tracking is now handled by swiper event handlers

      // Debug log removed
    } catch (error) {
      console.error('Failed to initialize QR Swiper:', error);
    }
  };

  // Progress bar tracking system
  let progressStartTime: number | null = null;
  let progressPauseTime: number | null = null;
  let progressInterval: NodeJS.Timeout | null = null;
  let pausedProgress: number = 0;

  const startProgressTracking = () => {
    // Debug log removed

    // Clear any existing interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    const qrSwiper = (window as any).qrSwiper;
    if (!qrSwiper?.el) {
      // Debug log removed
      return;
    }

    const activeBullet = qrSwiper.el.querySelector('.swiper-pagination-bullet-active');
    if (!activeBullet) {
      // Debug log removed
      return;
    }

    // Only start if the bullet has the progress-animating class
    if (!activeBullet.classList.contains('progress-animating')) {
      // Debug log removed
      return;
    }

    // Reset progress to 0
    activeBullet.style.setProperty('--progress', '0%');

    progressStartTime = Date.now();
    pausedProgress = 0; // Reset paused progress for new slide
    const autoplayDelay = qrSwiper.params?.autoplay?.delay || 10000;

    // Debug log removed

    progressInterval = setInterval(() => {
      const elapsed = Date.now() - (progressStartTime || 0);
      const progress = Math.min((elapsed / autoplayDelay) * 100, 100);

      // Set CSS custom property for progress
      activeBullet.style.setProperty('--progress', `${progress}%`);

      if (progress >= 100) {
        // Debug log removed
        clearInterval(progressInterval!);
        progressInterval = null;
      }
    }, 16); // ~60fps for smooth animation
  };

  const resumeProgressTracking = () => {
    // Debug log removed

    // Clear any existing interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    const qrSwiper = (window as any).qrSwiper;
    if (!qrSwiper?.el) {
      // Debug log removed
      return;
    }

    const activeBullet = qrSwiper.el.querySelector('.swiper-pagination-bullet-active');
    if (!activeBullet) {
      // Debug log removed
      return;
    }

    // Only start if the bullet has the progress-animating class
    if (!activeBullet.classList.contains('progress-animating')) {
      // Debug log removed
      return;
    }

    const autoplayDelay = qrSwiper.params?.autoplay?.delay || 10000;

    // Debug log removed

    // Calculate remaining time based on paused progress
    const remainingTime = (100 - pausedProgress) / 100 * autoplayDelay;
    const resumeTime = Date.now();

    progressInterval = setInterval(() => {
      const elapsed = Date.now() - resumeTime;
      const progress = pausedProgress + (elapsed / remainingTime) * (100 - pausedProgress);
      const finalProgress = Math.min(progress, 100);

      // Set CSS custom property for progress
      activeBullet.style.setProperty('--progress', `${finalProgress}%`);

      if (finalProgress >= 100) {
        // Debug log removed
        clearInterval(progressInterval!);
        progressInterval = null;
      }
    }, 16); // ~60fps for smooth animation
  };

  const setupProgressBarEvents = () => {
    if (!(window as any).qrSwiper?.el) return;

    // Add custom mouse event handlers for progress bar pause/resume
    (window as any).qrSwiper.el.addEventListener('mouseenter', () => {
      // Debug log removed

      // Pause swiper autoplay
      if ((window as any).qrSwiper && (window as any).qrSwiper.autoplay) {
        (window as any).qrSwiper.autoplay.pause();
        // Debug log removed
      }

      // Pause progress animation on hover
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        progressPauseTime = Date.now();

        // Store current progress percentage
        const activeBullet = (window as any).qrSwiper?.el?.querySelector('.swiper-pagination-bullet-active');
        if (activeBullet) {
          const currentProgress = activeBullet.style.getPropertyValue('--progress') || '0%';
          pausedProgress = parseFloat(currentProgress.replace('%', ''));
          // Debug log removed
        }
      }
    });

    (window as any).qrSwiper.el.addEventListener('mouseleave', () => {
      // Debug log removed

      // Debug log removed

      // Resume progress animation on mouse leave
      if (progressPauseTime && progressStartTime && pausedProgress < 100) {
        // Debug log removed
        resumeProgressTracking();

        // Calculate remaining time and manually trigger slide change when progress completes
        const autoplayDelay = (window as any).qrSwiper?.params?.autoplay?.delay || 10000;
        const remainingTime = (100 - pausedProgress) / 100 * autoplayDelay;

        // Debug log removed

        // Set a timeout to trigger slide change when progress completes
        setTimeout(() => {
          if ((window as any).qrSwiper && (window as any).qrSwiper.slideNext) {
            // Debug log removed
            (window as any).qrSwiper.slideNext();
          }
        }, remainingTime);

      } else {
        // Debug log removed

        // If we can't resume progress, just resume normal autoplay
        if ((window as any).qrSwiper && (window as any).qrSwiper.autoplay) {
          (window as any).qrSwiper.autoplay.resume();
          // Debug log removed
        }
      }
    });
  };

  const updateProgressBars = () => {
    // Debug log removed

    // Clear any existing progress tracking
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Reset progress start time
    progressStartTime = null;
    progressPauseTime = null;

    // Start progress tracking for the current slide with a small delay
    // to ensure the swiper has finished its transition
    setTimeout(() => {
      startProgressTracking();
    }, 200);
  };

  // Top zappers management functions


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
    cleanup
  };
};
