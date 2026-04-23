/**
 * useZapHandling Hook
 *
 * Manages zap processing, display, and notifications including:
 * - Zap receipt processing (Kind 9735)
 * - Zap display in UI
 * - Top zappers calculation
 * - Zap notifications
 * - Zap totals and statistics
 *
 * @param options - Configuration options for zap handling
 * @returns Zap state and functions for processing and displaying zaps
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import {
  extractZapAmount,
  extractZapPayerPubkey,
  extractZapContent,
  processZaps,
  ProcessedZap
} from '@pubpay/shared-services';
import { Kind9735Event, Kind0Event } from '@pubpay/shared-types';
import { ZapNotification } from '@live/types';
import {
  sanitizeImageUrl,
  sanitizeHTML,
  escapeHtml
} from '../utils/sanitization';
import {
  handleError,
  handleErrorSilently,
  logger,
  ErrorCategory,
  ErrorSeverity
} from '../utils/errorHandling';

export interface UseZapHandlingOptions {
  onSubscribeProfile?: (pubkey: string) => void;
  onUpdateZapTotal?: () => void;
  onOrganizeZaps?: () => void;
  onUpdateFiatAmounts?: () => void;
  genericUserIcon?: string;
}

/**
 * Hook for managing zap processing and display
 */
export function useZapHandling(options: UseZapHandlingOptions = {}) {
  const {
    onSubscribeProfile,
    onUpdateZapTotal,
    onOrganizeZaps,
    onUpdateFiatAmounts,
    genericUserIcon = '/live/images/gradient_color.gif'
  } = options;

  const [zaps, setZaps] = useState<Kind9735Event[]>([]);
  const [totalZaps, setTotalZaps] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [topZappers, setTopZappers] = useState<ProcessedZap[]>([]);
  const [zapNotification, setZapNotification] =
    useState<ZapNotification | null>(null);

  const initialZapsLoadedRef = useRef(false);
  const pendingZapNotificationsRef = useRef<Map<string, ZapNotification>>(
    new Map()
  );
  const zapperTotalsRef = useRef<
    Map<string, { amount: number; profile: Kind0Event | null }>
  >(new Map());
  const profilesRef = useRef<Map<string, Kind0Event>>(new Map());

  /**
   * Format number with commas
   */
  const numberWithCommas = useCallback((x: number): string => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }, []);

  /**
   * Get display name from profile
   */
  const getDisplayName = useCallback((profile: any): string => {
    if (!profile) return 'Anonymous';
    if (typeof profile === 'string') {
      try {
        const parsed = JSON.parse(profile);
        return (
          parsed.display_name ||
          parsed.displayName ||
          parsed.name ||
          'Anonymous'
        );
      } catch {
        return 'Anonymous';
      }
    }
    return (
      profile.display_name || profile.displayName || profile.name || 'Anonymous'
    );
  }, []);

  /**
   * Add zap to totals
   */
  const addZapToTotals = useCallback(
    (pubkey: string, amount: number, profile: any = null) => {
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
          existing.picture =
            sanitizeImageUrl(profile.picture) || genericUserIcon;
        }
      } else {
        zapperTotals.set(pubkey, {
          amount,
          profile,
          name: profile ? getDisplayName(profile) : 'Anonymous',
          picture: profile
            ? sanitizeImageUrl(profile.picture) || genericUserIcon
            : genericUserIcon,
          pubkey
        });
      }

      // Update totals
      let newTotal = 0;
      let newCount = 0;
      zapperTotals.forEach(({ amount }: { amount: number }) => {
        newTotal += amount;
        newCount++;
      });
      setTotalAmount(newTotal);
      setTotalZaps(newCount);

      // Update top zappers
      updateTopZappers();
    },
    [getDisplayName, genericUserIcon]
  );

  /**
   * Update top zappers from zapper totals
   */
  const updateTopZappers = useCallback(() => {
    if (!(window as any).zapperTotals) return;

    const zapperTotals = (window as any).zapperTotals;

    // Sort zappers by total amount (highest first) and take top 5
    const topZappers = Array.from(zapperTotals.values())
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 5);

    // Update both window and React state
    (window as any).topZappers = topZappers;
    setTopZappers(topZappers as any);
  }, []);

  /**
   * Calculate top zappers from zaps array
   * Handles both Kind9735Event[] with separate profiles map, and processed zaps with attached profile data
   */
  const calculateTopZappersFromZaps = useCallback(
    (zaps: any[], profiles?: Map<string, Kind0Event>) => {
      // Check if zaps are proper Kind9735Event objects (have tags array)
      const areKind9735Events = zaps.length > 0 && Array.isArray(zaps[0]?.tags);

      if (areKind9735Events && profiles) {
        // Use shared processZaps function for proper Kind9735Event objects
        const processedZaps = processZaps(
          zaps as Kind9735Event[],
          profiles,
          genericUserIcon
        );

        // Group by pubkey and sum amounts
        const zapperTotals = new Map<
          string,
          { amount: number; zap: ProcessedZap }
        >();

        processedZaps.forEach(zap => {
          const existing = zapperTotals.get(zap.zapPayerPubkey);
          if (existing) {
            existing.amount += zap.zapAmount;
          } else {
            zapperTotals.set(zap.zapPayerPubkey, {
              amount: zap.zapAmount,
              zap
            });
          }
        });

        // Sort by amount and take top 5
        const topZappers = Array.from(zapperTotals.values())
          .map(({ amount, zap }) => ({
            ...zap,
            amount
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

        setTopZappers(topZappers as any);
        (window as any).topZappers = topZappers;
      } else {
        // Handle processed zap objects (already have amount, pubKey, profile data attached)
        const zapperTotals = new Map<string, any>();

        for (const zap of zaps) {
          // Handle different zap formats for processed zap objects
          // These objects already have amount and pubKey properties
          const pubkey = zap.pubKey || zap.pubkey || zap.zapPayerPubkey;
          const amount = zap.amount;
          const profile =
            zap.kind0Profile || (profiles ? profiles.get(pubkey) : null);

          if (!pubkey || !amount) continue;

          if (zapperTotals.has(pubkey)) {
            const existing = zapperTotals.get(pubkey);
            existing.amount += amount;
          } else {
            const zapperData = {
              amount,
              profile,
              pubkey,
              name: profile
                ? getDisplayName(profile)
                : zap.kind1Name || 'Anonymous',
              picture:
                sanitizeImageUrl(profile?.picture || zap.picture) ||
                genericUserIcon
            };
            zapperTotals.set(pubkey, zapperData);
          }
        }

        // Sort by amount and take top 5
        const topZappers = Array.from(zapperTotals.values())
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

        setTopZappers(topZappers as any);
        (window as any).topZappers = topZappers;
      }
    },
    [genericUserIcon, getDisplayName]
  );

  /**
   * Process a live event zap
   */
  const processLiveEventZap = useCallback(
    async (
      zapReceipt: Kind9735Event,
      eventPubkey: string,
      eventIdentifier: string
    ) => {
      logger.info('Processing live event zap', ErrorCategory.SUBSCRIPTION, {
        zapId: zapReceipt.id.slice(0, 8)
      });

      try {
        // Use shared helpers to extract zap information
        const amount = extractZapAmount(zapReceipt);
        if (amount === 0) {
          return; // No amount, skip
        }

        const zapperPubkey = extractZapPayerPubkey(zapReceipt);
        const zapContent = extractZapContent(zapReceipt);

        // Get bolt11 tag for display
        const bolt11Tag = zapReceipt.tags.find(
          (tag: any) => tag[0] === 'bolt11'
        );

        // Create zap display object
        const zapData = {
          id: zapReceipt.id,
          amount,
          content: zapContent,
          pubkey: zapperPubkey,
          timestamp: zapReceipt.created_at,
          bolt11: bolt11Tag?.[1] || '',
          zapEventID: nip19.noteEncode(zapReceipt.id)
        };

        // Subscribe to zapper's profile if callback provided
        if (onSubscribeProfile) {
          onSubscribeProfile(zapperPubkey);
        }

        // Add to zaps list
        setZaps(prev => [...prev, zapReceipt]);

        // Add to zapper totals accounting (profile will be updated when it arrives)
        addZapToTotals(zapperPubkey, amount);

        // Display the zap
        displayLiveEventZap(zapData);
      } catch (error) {
        handleError(
          error,
          'Error processing live event zap',
          ErrorCategory.SUBSCRIPTION,
          ErrorSeverity.MEDIUM,
          { zapId: zapReceipt.id }
        );
      }
    },
    [onSubscribeProfile, addZapToTotals]
  );

  /**
   * Display a live event zap in the UI
   */
  interface ZapDisplayData {
    id: string;
    pubkey: string;
    amount: number;
    content?: string;
    timestamp: number;
    bolt11?: string;
    zapEventID?: string;
  }

  const displayLiveEventZap = useCallback(
    (zapData: ZapDisplayData) => {
      // Check if this zap is already displayed to prevent duplicates
      const existingZap = document.querySelector(
        `[data-zap-id="${zapData.id}"]`
      );
      if (existingZap) {
        return;
      }

      // Trigger notification for new zaps (not initial/historical ones)
      if (initialZapsLoadedRef.current) {
        // Store as pending - subscribeChatAuthorProfile already called in processLiveEventZap
        // When profile arrives, updateProfile will trigger the notification
        // Store minimal zap data - will be converted to ZapNotification when profile arrives
        const pendingData: ZapNotification = {
          id: zapData.id,
          zapperName: '', // Will be filled when profile arrives
          zapperImage: '', // Will be filled when profile arrives
          content: zapData.content || '',
          amount: zapData.amount,
          timestamp: zapData.timestamp,
          pubkey: zapData.pubkey // Store pubkey for profile lookup
        };
        pendingZapNotificationsRef.current.set(zapData.pubkey, pendingData);

        // Show the same overlay animation immediately, then upgrade if/when a profile arrives.
        setZapNotification({
          id: pendingData.id,
          zapperName: 'Anonymous',
          zapperImage: genericUserIcon,
          content: pendingData.content || '',
          amount: pendingData.amount,
          timestamp: pendingData.timestamp,
          pubkey: pendingData.pubkey
        });
      }

      const zapsContainer = document.getElementById('zaps');

      // Hide loading animation on first zap
      if (zapsContainer) {
        zapsContainer.classList.remove('loading');
        const loadingText = zapsContainer.querySelector('.loading-text');
        if (loadingText) loadingText.remove();
      }

      // Get target containers - use columns for live events, main container for regular notes
      const activityContainer =
        document.getElementById('activity-list') || zapsContainer;
      const zapsOnlyContainer = document.getElementById('zaps-only-list');

      // Create zap element with chat-style layout for activity column
      const zapDiv = document.createElement('div');
      zapDiv.className = 'live-event-zap';
      zapDiv.dataset.pubkey = zapData.pubkey;
      zapDiv.dataset.timestamp = zapData.timestamp.toString();
      zapDiv.dataset.amount = zapData.amount.toString();
      zapDiv.dataset.zapId = zapData.id;

      // Add timestamp data attribute for historical price lookup
      if (zapData.timestamp) {
        zapDiv.setAttribute('data-timestamp', zapData.timestamp.toString());
      } else {
        logger.warn(
          'No timestamp found in live event zap data',
          ErrorCategory.VALIDATION,
          {
            zapId: zapData.id
          }
        );
      }

      const timeStr = new Date(zapData.timestamp * 1000).toLocaleString();

      zapDiv.innerHTML = `
        <div class="zap-header">
            <img class="zap-author-img" src="/live/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
            <div class="zap-info">
                <div class="zap-author-name" data-pubkey="${zapData.pubkey}">
                    ${zapData.pubkey.slice(0, 8)}...
                </div>
                <div class="zap-time">${timeStr}</div>
            </div>
            <div class="zap-amount">
                <span class="zap-amount-sats" data-original-sats="${numberWithCommas(zapData.amount)}">${numberWithCommas(zapData.amount)}</span>
                <span class="zap-amount-label">sats</span>
            </div>
        </div>
        ${
          zapData.content
            ? `
            <div class="zap-content">
                ${escapeHtml(zapData.content).replace(/\n/g, '<br>')}
            </div>
        `
            : ''
        }
    `;

      // Insert zap in activity column (mixed with chat messages)
      if (activityContainer) {
        const existingActivityItems = Array.from(
          activityContainer.querySelectorAll(
            '.live-chat-message, .live-event-zap'
          )
        );
        const activityInsertPosition = existingActivityItems.findIndex(
          (item: any) => parseInt(item.dataset.timestamp) < zapData.timestamp
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
      if (zapsOnlyContainer) {
        const zapOnlyDiv = document.createElement('div');
        zapOnlyDiv.className = 'zap live-event-zap zap-only-item';
        zapOnlyDiv.dataset.pubkey = zapData.pubkey;
        zapOnlyDiv.dataset.timestamp = zapData.timestamp.toString();
        zapOnlyDiv.dataset.amount = zapData.amount.toString();
        zapOnlyDiv.dataset.zapId = zapData.id;

        // Add timestamp data attribute for historical price lookup
        if (zapData.timestamp) {
          zapOnlyDiv.setAttribute(
            'data-timestamp',
            zapData.timestamp.toString()
          );
        }

        // Classic zap layout for left column
        zapOnlyDiv.innerHTML = `
            <div class="zapperProfile">
                <img class="zapperProfileImg" src="/live/images/gradient_color.gif" data-pubkey="${zapData.pubkey}" />
                <div class="zapperInfo">
                    <div class="zapperName" data-pubkey="${zapData.pubkey}">
                        ${zapData.pubkey.slice(0, 8)}...
                    </div>
                    <div class="zapperMessage">${zapData.content ? escapeHtml(zapData.content).replace(/\n/g, '<br>') : ''}</div>
                </div>
            </div>
            <div class="zapperAmount">
                <div class="zapperAmountValue">
                  <span class="zapperAmountSats" data-original-sats="${numberWithCommas(zapData.amount)}">${numberWithCommas(zapData.amount)}</span>
                  <span class="zapperAmountLabel">sats</span>
                </div>
            </div>
        `;

        const existingZapItems = Array.from(
          zapsOnlyContainer.querySelectorAll('.live-event-zap')
        );
        const zapInsertPosition = existingZapItems.findIndex(
          (item: any) => parseInt(item.dataset.amount || '0') < zapData.amount
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
      if (onUpdateZapTotal) {
        onUpdateZapTotal();
      }

      // Re-organize grid layout if active (for live events)
      const zapGridToggle = document.getElementById(
        'zapGridToggle'
      ) as HTMLInputElement;
      if (zapGridToggle && zapGridToggle.checked && zapsOnlyContainer) {
        // Check if zaps-only-list has grid-layout class
        const isGridActive =
          zapsOnlyContainer.classList.contains('grid-layout');

        if (isGridActive && onOrganizeZaps) {
          // Debounce the re-organize to avoid excessive calls during rapid zap influx
          if ((window as any).gridReorganizeTimeout) {
            clearTimeout((window as any).gridReorganizeTimeout);
          }
          (window as any).gridReorganizeTimeout = setTimeout(() => {
            if (onOrganizeZaps) {
              onOrganizeZaps();
            }
          }, 300);
        }
      }

      // Apply fiat conversion if enabled
      const showFiatToggle = document.getElementById(
        'showFiatToggle'
      ) as HTMLInputElement;
      if (showFiatToggle && showFiatToggle.checked && onUpdateFiatAmounts) {
        // Use setTimeout to ensure DOM is updated before applying fiat conversion
        setTimeout(() => {
          if (onUpdateFiatAmounts) {
            onUpdateFiatAmounts();
          }
        }, 50);
      }
    },
    [
      numberWithCommas,
      onUpdateZapTotal,
      onOrganizeZaps,
      onUpdateFiatAmounts,
      genericUserIcon
    ]
  );

  /**
   * Update profile in zapper totals
   */
  const updateProfile = useCallback(
    (profile: Kind0Event) => {
      let profileData: any = {};
      try {
        profileData = JSON.parse(profile.content || '{}');
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
        profileData.display_name ||
        profileData.displayName ||
        profileData.name ||
        `${profile.pubkey.slice(0, 8)}...`;
      const picture = sanitizeImageUrl(profileData.picture) || genericUserIcon;

      // Update zapper totals with profile info if this user has zapped
      if (
        (window as any).zapperTotals &&
        (window as any).zapperTotals.has(profile.pubkey)
      ) {
        const zapperData = (window as any).zapperTotals.get(profile.pubkey);
        zapperData.profile = profileData;
        zapperData.name = name;
        zapperData.picture = picture;
        updateTopZappers(); // Refresh display with updated profile info
      }

      // Update profile images in displayed zaps
      document
        .querySelectorAll(`[data-pubkey="${profile.pubkey}"]`)
        .forEach(element => {
          const img = element as HTMLImageElement;
          if (img.tagName === 'IMG') {
            img.src = picture;
            img.alt = name;
          }
        });

      // Update zap author names
      document
        .querySelectorAll(`.zap-author-name[data-pubkey="${profile.pubkey}"]`)
        .forEach(element => {
          element.textContent = name;
        });

      // Update zapper names in zaps-only column
      document
        .querySelectorAll(`.zapperName[data-pubkey="${profile.pubkey}"]`)
        .forEach(element => {
          element.textContent = name;
        });

      // Check for pending zap notifications
      if (pendingZapNotificationsRef.current.has(profile.pubkey)) {
        const zapData = pendingZapNotificationsRef.current.get(profile.pubkey);
        if (zapData) {
          pendingZapNotificationsRef.current.delete(profile.pubkey);

          // Create notification
          const notification: ZapNotification = {
            id: zapData.id,
            zapperName: name,
            zapperImage: picture,
            content: zapData.content || '',
            amount: zapData.amount,
            timestamp: zapData.timestamp
          };

          setZapNotification(notification);
        }
      }
    },
    [genericUserIcon, updateTopZappers]
  );

  /**
   * Reset zapper totals
   */
  const resetZapperTotals = useCallback(() => {
    pendingZapNotificationsRef.current.clear();

    setTotalZaps(0);
    setTotalAmount(0);
    setZaps([]);
    setTopZappers([]);
    zapperTotalsRef.current.clear();
    if ((window as any).zapperTotals) {
      (window as any).zapperTotals.clear();
    }
    if ((window as any).topZappers) {
      (window as any).topZappers = [];
    }
  }, []);

  /**
   * Mark initial zaps as loaded
   */
  const markInitialZapsLoaded = useCallback(() => {
    initialZapsLoadedRef.current = true;
  }, []);

  /**
   * Store pending zap notification (for regular notes, not live events)
   * This is called when a new zap arrives and we're waiting for the profile
   */
  const storePendingZapNotification = useCallback(
    (zapData: {
      id: string;
      pubkey: string;
      amount: number;
      content: string;
      timestamp: number;
    }) => {
      // Only store if initial zaps have loaded (to avoid notifications for historical zaps)
      if (initialZapsLoadedRef.current) {
        const pendingData: ZapNotification = {
          id: zapData.id,
          zapperName: '', // Will be filled when profile arrives
          zapperImage: '', // Will be filled when profile arrives
          content: zapData.content || '',
          amount: zapData.amount,
          timestamp: zapData.timestamp,
          pubkey: zapData.pubkey // Store pubkey for profile lookup
        };
        pendingZapNotificationsRef.current.set(zapData.pubkey, pendingData);

        // Prefer showing a real profile immediately when it's already available on window.profiles.
        // Otherwise show the same overlay animation with an anonymous placeholder, then upgrade
        // when the profile subscription delivers kind 0.
        try {
          const profiles = (window as any).profiles as
            | Record<string, Kind0Event>
            | undefined;
          const kind0 = profiles?.[zapData.pubkey];
          if (kind0?.content) {
            const profileData = JSON.parse(kind0.content || '{}') as any;
            const name =
              profileData.display_name ||
              profileData.displayName ||
              profileData.name ||
              `${zapData.pubkey.slice(0, 8)}...`;
            const picture =
              sanitizeImageUrl(profileData.picture) || genericUserIcon;

            // We already have enough to show a "real" notification; don't leave a stale pending entry.
            pendingZapNotificationsRef.current.delete(zapData.pubkey);
            setZapNotification({
              id: pendingData.id,
              zapperName: name,
              zapperImage: picture,
              content: pendingData.content || '',
              amount: pendingData.amount,
              timestamp: pendingData.timestamp
            });
            return;
          }
        } catch {
          // fall through to anonymous placeholder
        }

        setZapNotification({
          id: pendingData.id,
          zapperName: 'Anonymous',
          zapperImage: genericUserIcon,
          content: pendingData.content || '',
          amount: pendingData.amount,
          timestamp: pendingData.timestamp,
          pubkey: pendingData.pubkey
        });
      }
    },
    [genericUserIcon]
  );

  return {
    zaps,
    totalZaps,
    totalAmount,
    topZappers,
    zapNotification,
    processLiveEventZap,
    displayLiveEventZap,
    addZapToTotals,
    calculateTopZappersFromZaps,
    updateTopZappers,
    updateProfile,
    resetZapperTotals,
    markInitialZapsLoaded,
    setZapNotification,
    setZaps,
    storePendingZapNotification
  };
}
