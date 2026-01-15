import { useCallback, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { 
  NostrClient,
  LiveEventService
} from '@pubpay/shared-services';
import { 
  Kind0Event,
  Kind1Event,
  Kind30311Event,
  NostrEvent
} from '@pubpay/shared-types';
import { sanitizeHTML, sanitizeImageUrl, sanitizeUrl, escapeHtml } from '../utils/sanitization';
import {
  getElementById,
  querySelector,
  querySelectorAll,
  createElement,
  appendChild,
  setTextContent,
  setInnerHTML,
  showElement,
  hideElement,
  addClass,
  removeClass,
  clearElement,
  hideLoadingState
} from '../utils/domHelpers';
import {
  handleErrorSilently,
  parsingErrorHandler,
  subscriptionErrorHandler,
  logger,
  ErrorCategory
} from '../utils/errorHandling';

// Constants
const PROFILE_FETCH_TIMEOUT = 2000; // 2 seconds
const CONTENT_MONITOR_INTERVAL = 10000; // 10 seconds

interface UseContentRenderingOptions {
  nostrClient: NostrClient;
  liveEventService: LiveEventService;
  setNoteContent: (content: string) => void;
  setAuthorName: (name: string) => void;
  setAuthorImage: (image: string) => void;
  setAuthorNip05: (nip05: string) => void;
  setAuthorLud16: (lud16: string) => void;
  generateQRCode: (elementId: string, value: string, size: number) => void;
  generateLiveEventQRCodes: (liveEvent: Kind30311Event) => void;
  subscribeLiveEventParticipants?: (liveEvent: Kind30311Event) => void;
  subscribeChatAuthorProfile?: (pubkey: string) => void;
  subscribeLiveEventHostProfile?: (pubkey: string) => void;
  updateQRSlideVisibility?: (skipUrlUpdate?: boolean) => void;
  initializeLiveVideoPlayer?: (streamingUrl: string) => void;
}

/**
 * Hook for rendering Nostr content (notes, profiles, live events, chat messages)
 * Handles HTML processing, mention resolution, media embedding, and DOM updates
 */
export const useContentRendering = (options: UseContentRenderingOptions) => {
  const {
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
    updateQRSlideVisibility,
    initializeLiveVideoPlayer
  } = options;

  // Helper to get display name for npub/nprofile mentions
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
        } catch (error) {
          handleErrorSilently(
            error,
            'Error fetching profile for mention',
            ErrorCategory.SUBSCRIPTION,
            { identifier }
          );
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
        } catch (error) {
          handleErrorSilently(
            error,
            'Error parsing profile data for mention',
            ErrorCategory.PARSING,
            { identifier }
          );
        }
      }

      // Fallback to shortened identifier
      return identifier.length > 35
        ? `${identifier.substr(0, 4)}...${identifier.substr(identifier.length - 4)}`
        : identifier;
    } catch (error) {
      handleErrorSilently(
        error,
        'Error getting mention username',
        ErrorCategory.PARSING,
        { identifier }
      );
      return identifier.length > 35
        ? `${identifier.substr(0, 4)}...${identifier.substr(identifier.length - 4)}`
        : identifier;
    }
  }, [nostrClient]);

  /**
   * Processes note content: handles mentions, media URLs, regular URLs, and HTML sanitization
   */
  const processNoteContent = useCallback(async (content: string): Promise<string> => {
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
  }, [getMentionUserName]);

  /**
   * Sets up two-column layout for live events
   */
  const setupLiveEventTwoColumnLayout = useCallback(() => {
    const zapsContainer = getElementById('zaps');
    if (!zapsContainer) return;

    // Check if layout is already set up to avoid clearing existing content
    if (
      zapsContainer.classList.contains('live-event-two-column') &&
      zapsContainer.querySelector('.live-event-columns')
    ) {
      return;
    }

    // Preserve the existing zaps header and add two-column structure below it
    const existingZapsHeader = zapsContainer.querySelector('.zaps-header') as HTMLElement | null;

    // Clear existing content but preserve the header
    clearElement(zapsContainer);

    // Add back the zaps header if it exists
    if (existingZapsHeader) {
      appendChild(zapsContainer, existingZapsHeader);
    }

    // Add the two-column structure
    const twoColumnDiv = createElement('div', {
      className: 'live-event-columns',
      innerHTML: `
        <div class="live-event-zaps-only">
            <div id="zaps-only-list" class="zaps-only-list"></div>
        </div>
        <div class="live-event-activity">
            <div id="activity-list" class="activity-list"></div>
        </div>
    `
    });

    appendChild(zapsContainer, twoColumnDiv);

    // Add the two-column class to the container
    addClass(zapsContainer, 'live-event-two-column');
  }, []);

  /**
   * Starts monitoring content to detect if it disappears and restore it
   */
  const startContentMonitoring = useCallback(() => {
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
            // This will be handled by the parent component
            // We'll need to call displayLiveEvent from the parent
            const displayLiveEventRef = (window as any).displayLiveEventRef;
            if (displayLiveEventRef?.current) {
              displayLiveEventRef.current((window as any).currentLiveEvent);
            }
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
  }, [setupLiveEventTwoColumnLayout]);

  /**
   * Renders a Kind 1 event (note) to the DOM
   */
  const drawKind1 = useCallback(async (kind1: Kind1Event) => {
    // Store note ID globally for QR regeneration
    (window as any).currentNoteId = kind1.id;

    // Set event type to regular note and remove livestream class
    (window as any).currentEventType = 'note';
    document.body.classList.remove('livestream');

    const noteContent = getElementById('noteContent');

    // Process content for both images and nostr mentions
    const processedContent = await processNoteContent(kind1.content);
    
    if (noteContent) {
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
        element: getElementById('qrCode'),
        value: njumpUrl,
        link: getElementById('qrcodeLinkNostr'),
        preview: getElementById('qrDataPreview1')
      },
      {
        element: getElementById('qrCodeNevent'),
        value: nostrNevent,
        link: getElementById('qrcodeNeventLink'),
        preview: getElementById('qrDataPreview2')
      },
      {
        element: getElementById('qrCodeNote'),
        value: nostrNote,
        link: getElementById('qrcodeNoteLink'),
        preview: getElementById('qrDataPreview3')
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
          setTextContent(preview, truncate(value.toUpperCase()));
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
  }, [processNoteContent, generateQRCode, setNoteContent]);

  /**
   * Renders a Kind 0 event (profile) to React state
   */
  const drawKind0 = useCallback((kind0: Kind0Event) => {
    try {
      const profile = JSON.parse(kind0.content) as Record<string, unknown>;
      setAuthorName((profile.name || profile.display_name || 'Anonymous') as string);
      setAuthorImage(sanitizeImageUrl((profile.picture as string) || '') || '/live/images/gradient_color.gif');
      setAuthorNip05((profile.nip05 as string) || '');
      setAuthorLud16((profile.lud16 as string) || '');
    } catch (e) {
      // Ignore parsing errors
    }
  }, [setAuthorName, setAuthorImage, setAuthorNip05, setAuthorLud16]);

  /**
   * Updates profile information in chat messages
   */
  const updateProfile = useCallback((profile: Kind0Event) => {
    let profileData: Record<string, unknown> = {};
    try {
      profileData = JSON.parse(profile.content || '{}') as Record<string, unknown>;
    } catch (error) {
      handleErrorSilently(
        error,
        'Failed to parse profile content',
        ErrorCategory.PARSING,
        { pubkey: profile.pubkey }
      );
      profileData = {};
    }
    const name =
      (profileData.display_name as string) ||
      (profileData.displayName as string) ||
      (profileData.name as string) ||
      `${profile.pubkey.slice(0, 8)}...`;
    const picture = sanitizeImageUrl((profileData.picture as string) || '') || '/live/images/gradient_color.gif';

    // Update chat messages from this author (zaps are handled by useZapHandling hook)
    const authorElements = querySelectorAll<HTMLElement>(
      `.chat-author-img[data-pubkey="${profile.pubkey}"], .chat-author-name[data-pubkey="${profile.pubkey}"]`
    );
    authorElements.forEach(element => {
      if (element.classList.contains('chat-author-img')) {
        (element as HTMLImageElement).src = picture;
      } else if (element.classList.contains('chat-author-name')) {
        element.textContent = name;
      }
    });
  }, []);

  /**
   * Updates live event host profile information
   */
  const updateLiveEventHostProfile = useCallback((profile: Kind0Event) => {
    let profileData: Record<string, unknown> = {};
    try {
      profileData = JSON.parse(profile.content || '{}') as Record<string, unknown>;
    } catch (error) {
      handleErrorSilently(
        error,
        'Failed to parse live event host profile',
        ErrorCategory.PARSING,
        { pubkey: profile.pubkey }
      );
      profileData = {};
    }
    const picture = sanitizeImageUrl((profileData.picture as string) || '') || '/live/images/gradient_color.gif';
    const nip05 = (profileData.nip05 as string) || '';
    const lud16 = (profileData.lud16 as string) || '';

    // Update the author profile image
    const authorImg = getElementById<HTMLImageElement>('authorNameProfileImg');
    if (authorImg) {
      authorImg.src = picture;
    }

    // Update state with profile metadata
    setAuthorImage(picture);
    setAuthorNip05(nip05);
    setAuthorLud16(lud16);
  }, [setAuthorImage, setAuthorNip05, setAuthorLud16]);

  /**
   * Displays a live event (Kind 30311) to the DOM
   */
  const displayLiveEvent = useCallback((liveEvent: Kind30311Event) => {
    logger.info('Displaying live event', ErrorCategory.RENDERING, { eventId: liveEvent.id });
    
    // Subscribe to participants' profiles
    if (subscribeLiveEventParticipants) {
      subscribeLiveEventParticipants(liveEvent);
    }

    // Check if this live event is already displayed to avoid clearing content
    if (
      window.currentLiveEvent &&
      window.currentLiveEvent.id === liveEvent.id
    ) {
      logger.info('Live event already displayed, skipping', ErrorCategory.RENDERING, { eventId: liveEvent.id });
      return;
    }

    // Store event info globally at the beginning to prevent duplicate calls
    window.currentLiveEvent = liveEvent;
    window.currentEventType = 'live-event';

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

    logger.info('Streaming URL found', ErrorCategory.VIDEO, { streamingUrl: streaming });

    // Format timestamps using service (inline for template strings)
    const formatTime = liveEventService.formatTimestamp.bind(liveEventService);

    // Check if live event content already exists to avoid rebuilding video
    const existingLiveContent = noteContent?.querySelector(
      '.live-event-content'
    );

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
    const authorNameElement = getElementById('authorName');
    if (authorNameElement) {
      setTextContent(authorNameElement, title);
    }

    // Get host pubkey using service
    const hostPubkey = liveEventService.getHostPubkey(liveEvent);

    // Subscribe to host profile to get their image
    if (subscribeLiveEventHostProfile) {
      subscribeLiveEventHostProfile(hostPubkey);
    }

    // Generate QR codes for the live event (with small delay to ensure DOM is ready)
    setTimeout(() => {
      // Ensure at least one QR toggle is enabled before generating QR codes
      const qrShowNeventToggle = getElementById<HTMLInputElement>('qrShowNeventToggle');
      if (qrShowNeventToggle && !qrShowNeventToggle.checked) {
        // Check if any QR toggle is enabled
        const qrShowWebLinkToggle = getElementById<HTMLInputElement>('qrShowWebLinkToggle');
        const qrShowNoteToggle = getElementById<HTMLInputElement>('qrShowNoteToggle');
        const hasAnyEnabled = (qrShowWebLinkToggle?.checked) || (qrShowNoteToggle?.checked);

        // If none are enabled, enable nevent by default
        if (!hasAnyEnabled) {
          qrShowNeventToggle.checked = true;
        }
      }

      generateLiveEventQRCodes(liveEvent);
      // Update QR slide visibility after generating QR codes
      setTimeout(() => {
        if (updateQRSlideVisibility) {
          updateQRSlideVisibility(true);
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
    if (streaming && initializeLiveVideoPlayer) {
      setTimeout(() => {
        initializeLiveVideoPlayer(streaming);
      }, 200);
    }

    // Start monitoring content to detect if it disappears
    startContentMonitoring();
  }, [
    liveEventService,
    setupLiveEventTwoColumnLayout,
    generateLiveEventQRCodes,
    subscribeLiveEventParticipants,
    subscribeLiveEventHostProfile,
    updateQRSlideVisibility,
    initializeLiveVideoPlayer,
    startContentMonitoring
  ]);

  /**
   * Displays a live chat message (Kind 1311) to the DOM
   */
  const displayLiveChatMessage = useCallback((chatMessage: NostrEvent) => {
    // Check if this chat message is already displayed to prevent duplicates
    const existingMessage = querySelector(
      `[data-chat-id="${chatMessage.id}"]`
    );
    if (existingMessage) {
      return;
    }

    const zapsContainer = getElementById('zaps');

    // Hide loading animation on first message
    if (zapsContainer) {
      hideLoadingState(zapsContainer);
    }

    // Use activity column for live events, main container for regular notes
    const targetContainer =
      getElementById('activity-list') || zapsContainer;

    // Create chat message element
    const chatDiv = createElement('div', {
      className: 'live-chat-message',
      dataset: {
        pubkey: chatMessage.pubkey,
        timestamp: chatMessage.created_at.toString(),
        chatId: chatMessage.id
      }
    });

    const timeStr = new Date(chatMessage.created_at * 1000).toLocaleString();

    // Sanitize chat message content to prevent XSS
    const sanitizedContent = escapeHtml(chatMessage.content).replace(/\n/g, '<br>');

    setInnerHTML(chatDiv, `
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
    `);

    // Subscribe to chat author's profile if we don't have it
    if (subscribeChatAuthorProfile) {
      subscribeChatAuthorProfile(chatMessage.pubkey);
    }

      // Insert message in reverse chronological order (newest first, at top)
      if (targetContainer) {
        const existingMessages = querySelectorAll<HTMLElement>(
          '.live-chat-message, .live-event-zap'
        ).filter(msg => targetContainer.contains(msg));
        const insertPosition = existingMessages.findIndex(
          (msg) => parseInt(msg.dataset.timestamp || '0') < chatMessage.created_at
        );

        if (insertPosition === -1) {
          // Add to end (oldest messages at bottom)
          appendChild(targetContainer, chatDiv);
        } else {
          // Insert before the found position (newer messages towards top)
          const targetItem = existingMessages[insertPosition];
          if (targetItem && targetItem.parentNode) {
            targetItem.parentNode.insertBefore(chatDiv, targetItem);
          } else {
            appendChild(targetContainer, chatDiv);
          }
        }
      }
  }, [subscribeChatAuthorProfile]);

  return {
    drawKind1,
    drawKind0,
    displayLiveEvent,
    displayLiveChatMessage,
    processNoteContent,
    updateProfile,
    updateLiveEventHostProfile,
    setupLiveEventTwoColumnLayout,
    startContentMonitoring,
    getMentionUserName
  };
};
