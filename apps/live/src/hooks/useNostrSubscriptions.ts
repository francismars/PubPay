/**
 * useNostrSubscriptions Hook
 *
 * Manages all Nostr subscription functionality including:
 * - Live event subscriptions
 * - Live chat subscriptions
 * - Zap subscriptions
 * - Profile subscriptions
 * - Note (kind 1) subscriptions
 */

import { useCallback, useRef } from 'react';
import {
  NostrClient,
  LiveEventService,
  EVENT_KINDS
} from '@pubpay/shared-services';
import {
  Kind0Event,
  Kind1Event,
  Kind9735Event,
  Kind30311Event,
  NostrEvent,
  NostrFilter
} from '@pubpay/shared-types';

// Subscription timeout constants
const SUBSCRIPTION_TIMEOUT = 30000; // 30 seconds
const ZAP_SUBSCRIPTION_TIMEOUT = 15000; // 15 seconds - for empty state timeout
const INITIAL_ZAP_PROCESSING_DELAY = 2000; // 2 seconds - wait for initial batch of zaps
const PROFILE_FETCH_TIMEOUT = 3000; // 3 seconds - wait for profiles to arrive before processing zaps
const KIND1_SUBSCRIPTION_TIMEOUT = 10000; // 10 seconds
const RECONNECT_BASE_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 3;

export interface UseNostrSubscriptionsOptions {
  nostrClient: NostrClient;
  liveEventService: LiveEventService;

  // Callback functions
  onLiveEvent?: (liveEvent: Kind30311Event) => void;
  onLiveChatMessage?: (chatMessage: NostrEvent) => void;
  onLiveEventZap?: (
    zap: Kind9735Event,
    pubkey: string,
    identifier: string
  ) => void;
  onProfileUpdate?: (profile: Kind0Event) => void;
  onZapProfileUpdate?: (profile: Kind0Event) => void;
  onLiveEventHostProfileUpdate?: (profile: Kind0Event) => void;
  onKind1Event?: (kind1: Kind1Event) => void;
  onKind0Event?: (kind0: Kind0Event) => void;
  onZapsLoaded?: (zaps: Kind9735Event[]) => void;
  onNewZap?: (zap: Kind9735Event) => void;

  // Helper functions
  resetZapList?: () => void;
  markInitialZapsLoaded?: () => void;
}

export interface UseNostrSubscriptionsReturn {
  // Live event subscriptions
  subscribeLiveEvent: (
    pubkey: string,
    identifier: string,
    kind: number
  ) => Promise<unknown>;
  subscribeLiveChat: (pubkey: string, identifier: string) => Promise<unknown>;
  subscribeLiveEventZaps: (
    pubkey: string,
    identifier: string
  ) => Promise<unknown>;
  subscribeLiveEventParticipants: (
    liveEvent: Kind30311Event
  ) => Promise<unknown>;

  // Profile subscriptions
  subscribeChatAuthorProfile: (pubkey: string) => Promise<unknown>;
  subscribeLiveEventHostProfile: (hostPubkey: string) => Promise<unknown>;

  // Note subscriptions
  subscribeKind1: (kind1ID: string) => Promise<unknown>;
  subscribeKind0fromKind1: (kind1: Kind1Event) => Promise<unknown>;
  subscribeKind9735fromKind1: (kind1: Kind1Event) => Promise<unknown>;
  subscribeKind0fromKinds9735: (kinds9735: Kind9735Event[]) => unknown;
}

export function useNostrSubscriptions(
  options: UseNostrSubscriptionsOptions
): UseNostrSubscriptionsReturn {
  const {
    nostrClient,
    liveEventService,
    onLiveEvent,
    onLiveChatMessage,
    onLiveEventZap,
    onProfileUpdate,
    onZapProfileUpdate,
    onLiveEventHostProfileUpdate,
    onKind1Event,
    onKind0Event,
    onZapsLoaded,
    onNewZap,
    resetZapList,
    markInitialZapsLoaded
  } = options;

  // Track reconnection attempts
  const reconnectionAttemptsRef = useRef({
    event: 0,
    chat: 0,
    zaps: 0
  });

  // Subscribe to live events (kind 30311)
  const subscribeLiveEvent = useCallback(
    async (pubkey: string, identifier: string, kind: number) => {
      const subscription = nostrClient.subscribeToLiveEvents(
        pubkey,
        identifier,
        (liveEvent: NostrEvent) => {
          if (onLiveEvent) {
            onLiveEvent(liveEvent as Kind30311Event);
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT,
          onclosed: () => {
            // Attempt to reconnect after a delay if we have current event info
            if (
              (window as any).currentLiveEventInfo &&
              reconnectionAttemptsRef.current.event < MAX_RECONNECT_ATTEMPTS
            ) {
              reconnectionAttemptsRef.current.event++;
              setTimeout(() => {
                const eventInfo = (window as any).currentLiveEventInfo;
                if (eventInfo) {
                  subscribeLiveEvent(
                    eventInfo.pubkey,
                    eventInfo.identifier,
                    eventInfo.kind
                  );
                }
              }, RECONNECT_BASE_DELAY);
            }
          }
        }
      );
      return subscription;
    },
    [nostrClient, onLiveEvent]
  );

  // Subscribe to live chat messages (kind 1311)
  const subscribeLiveChat = useCallback(
    async (pubkey: string, identifier: string) => {
      const aTag = liveEventService.generateATag(pubkey, identifier);

      const filter: NostrFilter = {
        kinds: [1311], // Live chat message kind (not in EVENT_KINDS yet)
        '#a': [aTag]
      };

      const subscription = nostrClient.subscribeToEvents(
        [filter],
        (chatMessage: NostrEvent) => {
          if (onLiveChatMessage) {
            onLiveChatMessage(chatMessage);
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT,
          onclosed: () => {
            // Attempt to reconnect after a delay
            if (reconnectionAttemptsRef.current.chat < MAX_RECONNECT_ATTEMPTS) {
              reconnectionAttemptsRef.current.chat++;
              setTimeout(() => {
                subscribeLiveChat(pubkey, identifier);
              }, RECONNECT_BASE_DELAY);
            }
          }
        }
      );
      return subscription;
    },
    [nostrClient, liveEventService, onLiveChatMessage]
  );

  // Subscribe to live event zaps (kind 9735)
  const subscribeLiveEventZaps = useCallback(
    async (pubkey: string, identifier: string) => {
      console.log('🔌 subscribeLiveEventZaps called for:', {
        pubkey: pubkey.slice(0, 8),
        identifier
      });

      // Reset zap list when starting a new live event
      if (resetZapList) {
        resetZapList();
      }

      const aTag = liveEventService.generateATag(pubkey, identifier);

      const filter: NostrFilter = {
        kinds: [EVENT_KINDS.ZAP_RECEIPT],
        '#a': [aTag]
      };

      console.log('🔌 Subscribing to zaps with filter:', filter);

      const subscription = nostrClient.subscribeToEvents(
        [filter],
        (zapReceipt: NostrEvent) => {
          if (onLiveEventZap) {
            onLiveEventZap(zapReceipt as Kind9735Event, pubkey, identifier);
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT,
          oneose: () => {
            // Keep subscription alive for new zaps
            // Mark that initial zaps have been loaded
            if (markInitialZapsLoaded) {
              markInitialZapsLoaded();
            }
            console.log(
              '✅ Initial zaps loaded (oneose), will show notifications for new zaps.'
            );
          },
          onclosed: () => {
            // Attempt to reconnect after a delay
            if (reconnectionAttemptsRef.current.zaps < MAX_RECONNECT_ATTEMPTS) {
              reconnectionAttemptsRef.current.zaps++;
              setTimeout(() => {
                subscribeLiveEventZaps(pubkey, identifier);
              }, RECONNECT_BASE_DELAY);
            }
          }
        }
      );
      return subscription;
    },
    [
      nostrClient,
      liveEventService,
      onLiveEventZap,
      resetZapList,
      markInitialZapsLoaded
    ]
  );

  // Subscribe to live event participants' profiles
  const subscribeLiveEventParticipants = useCallback(
    async (liveEvent: Kind30311Event) => {
      // Extract participant pubkeys using service
      const participants = liveEventService.getParticipants(liveEvent);
      const participantPubkeys = participants
        .map(p => p.pubkey)
        .filter((pubkey: string): pubkey is string => !!pubkey);

      if (participantPubkeys.length > 0) {
        const subscription = nostrClient.subscribeToProfiles(
          participantPubkeys,
          (profile: NostrEvent) => {
            // Store profile for later use
            (window as any).profiles = (window as any).profiles || {};
            (window as any).profiles[profile.pubkey] = profile as Kind0Event;
          },
          {
            timeout: SUBSCRIPTION_TIMEOUT
          }
        );
        return subscription;
      }
    },
    [nostrClient, liveEventService]
  );

  // Subscribe to chat author profile
  const subscribeChatAuthorProfile = useCallback(
    async (pubkey: string) => {
      // Track newest event per pubkey
      const newestProfile = new Map<
        string,
        { event: Kind0Event; timestamp: number }
      >();

      const subscription = nostrClient.subscribeToProfiles(
        [pubkey],
        (profile: NostrEvent) => {
          const kind0Profile = profile as Kind0Event;
          const existing = newestProfile.get(kind0Profile.pubkey);
          // Only process if this is the newest event we've seen
          if (!existing || kind0Profile.created_at > existing.timestamp) {
            newestProfile.set(kind0Profile.pubkey, {
              event: kind0Profile,
              timestamp: kind0Profile.created_at
            });
            if (onZapProfileUpdate) {
              onZapProfileUpdate(kind0Profile);
            }
            if (onProfileUpdate) {
              onProfileUpdate(kind0Profile);
            }
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT
        }
      );
      return subscription;
    },
    [nostrClient, onZapProfileUpdate, onProfileUpdate]
  );

  // Subscribe to live event host profile
  const subscribeLiveEventHostProfile = useCallback(
    async (hostPubkey: string) => {
      // Track newest event per pubkey
      const newestProfile = new Map<
        string,
        { event: Kind0Event; timestamp: number }
      >();

      const subscription = nostrClient.subscribeToProfiles(
        [hostPubkey],
        (profile: NostrEvent) => {
          const kind0Profile = profile as Kind0Event;
          const existing = newestProfile.get(kind0Profile.pubkey);
          // Only process if this is the newest event we've seen
          if (!existing || kind0Profile.created_at > existing.timestamp) {
            newestProfile.set(kind0Profile.pubkey, {
              event: kind0Profile,
              timestamp: kind0Profile.created_at
            });
            if (onLiveEventHostProfileUpdate) {
              onLiveEventHostProfileUpdate(kind0Profile);
            }
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT
        }
      );
      return subscription;
    },
    [nostrClient, onLiveEventHostProfileUpdate]
  );

  // Subscribe to profiles from zap events (must be defined before subscribeKind9735fromKind1)
  const subscribeKind0fromKinds9735 = useCallback(
    (kinds9735: Kind9735Event[]) => {
      const kind9734PKs: string[] = [];
      // Map to track newest event per pubkey (by created_at)
      const kind0fromkind9735Map = new Map<string, Kind0Event>();

      for (const kind9735 of kinds9735) {
        if (kind9735.tags) {
          const description9735 = kind9735.tags.find(
            (tag: string[]) => tag[0] === 'description'
          )?.[1];
          if (description9735) {
            try {
              const kind9734 = JSON.parse(description9735) as {
                pubkey?: string;
              };
              if (kind9734.pubkey) {
                kind9734PKs.push(kind9734.pubkey);
              }
            } catch (error) {
              console.warn(
                'Failed to parse zap description for pubkey extraction:',
                error
              );
              // Skip this zap if we can't parse it
            }
          }
        }
      }

      // Remove duplicates
      const uniquePKs = Array.from(new Set(kind9734PKs));

      if (uniquePKs.length > 0) {
        // Initialize window.profiles if it doesn't exist
        if (!(window as any).profiles) {
          (window as any).profiles = {};
        }

        let profileProcessingTimeoutId: NodeJS.Timeout | null = null;
        const receivedProfiles = new Set<string>();

        const processZapsWithProfiles = () => {
          if (profileProcessingTimeoutId) {
            clearTimeout(profileProcessingTimeoutId);
            profileProcessingTimeoutId = null;
          }
          if (onZapsLoaded) {
            onZapsLoaded(kinds9735);
          }
        };

        const subscription = nostrClient.subscribeToProfiles(
          uniquePKs,
          (kind0: NostrEvent) => {
            const kind0Event = kind0 as Kind0Event;
            const existing = kind0fromkind9735Map.get(kind0Event.pubkey);
            // Only process if this is the newest event we've seen
            if (!existing || kind0Event.created_at > existing.created_at) {
              kind0fromkind9735Map.set(kind0Event.pubkey, kind0Event);
              // Store profile in window.profiles for use in createkinds9735JSON
              (window as any).profiles[kind0Event.pubkey] = kind0Event;
              receivedProfiles.add(kind0Event.pubkey);

              if (onZapProfileUpdate) {
                onZapProfileUpdate(kind0Event);
              }

              // If we've received all profiles, process zaps immediately
              if (receivedProfiles.size >= uniquePKs.length) {
                processZapsWithProfiles();
              } else {
                // Otherwise, set a timeout to process after a short delay
                // This handles cases where some profiles might not be available
                if (profileProcessingTimeoutId) {
                  clearTimeout(profileProcessingTimeoutId);
                }
                profileProcessingTimeoutId = setTimeout(() => {
                  processZapsWithProfiles();
                }, PROFILE_FETCH_TIMEOUT);
              }
            }
          },
          {
            timeout: SUBSCRIPTION_TIMEOUT,
            onclosed: () => {
              // If subscription closes, process zaps with whatever profiles we have
              if (profileProcessingTimeoutId) {
                clearTimeout(profileProcessingTimeoutId);
              }
              processZapsWithProfiles();
            }
          }
        );

        // Fallback: if no profiles arrive after timeout, process zaps anyway
        // This handles cases where profiles might not be available
        setTimeout(() => {
          if (profileProcessingTimeoutId) {
            clearTimeout(profileProcessingTimeoutId);
            processZapsWithProfiles();
          }
        }, PROFILE_FETCH_TIMEOUT);

        return subscription;
      } else {
        // No profiles to fetch, but we still have zaps - process them immediately
        if (onZapsLoaded && kinds9735.length > 0) {
          onZapsLoaded(kinds9735);
        }
      }
    },
    [nostrClient, onZapProfileUpdate, onZapsLoaded]
  );

  // Subscribe to profiles from kind 1 events (must be defined before subscribeKind1)
  const subscribeKind0fromKind1 = useCallback(
    async (kind1: Kind1Event) => {
      const kind0key = kind1.pubkey;

      // Don't subscribe if no valid pubkey
      if (!kind0key || typeof kind0key !== 'string' || kind0key.length !== 64) {
        return;
      }

      // Track newest event per pubkey
      const newestProfile = new Map<
        string,
        { event: Kind0Event; timestamp: number }
      >();

      const subscription = nostrClient.subscribeToProfiles(
        [kind0key],
        (kind0: NostrEvent) => {
          const kind0Event = kind0 as Kind0Event;
          const existing = newestProfile.get(kind0Event.pubkey);
          // Only process if this is the newest event we've seen
          if (!existing || kind0Event.created_at > existing.timestamp) {
            newestProfile.set(kind0Event.pubkey, {
              event: kind0Event,
              timestamp: kind0Event.created_at
            });
            if (onKind0Event) {
              onKind0Event(kind0Event);
            }
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT
        }
      );
      return subscription;
    },
    [nostrClient, onKind0Event]
  );

  // Subscribe to zaps from kind 1 events (must be defined before subscribeKind1)
  const subscribeKind9735fromKind1 = useCallback(
    async (kind1: Kind1Event) => {
      const kinds9735IDs = new Set<string>();
      const kinds9735: Kind9735Event[] = [];
      const kind1id = kind1.id;

      // Don't subscribe if no valid kind1id
      if (!kind1id || typeof kind1id !== 'string' || kind1id.length !== 64) {
        return;
      }

      let isFirstStream = true;
      let initialZapProcessingTimeoutId: NodeJS.Timeout | null = null;

      const zapsContainer = document.getElementById('zaps');

      // Add a timeout for zap subscription (for empty state)
      const zapTimeoutId = setTimeout(() => {
        // Zap subscription timeout - no zaps received after 15 seconds
        if (kinds9735.length === 0 && isFirstStream) {
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
          // Mark initial zaps as loaded (empty state)
          if (markInitialZapsLoaded) {
            markInitialZapsLoaded();
          }
          if (onZapsLoaded) {
            onZapsLoaded([]);
          }
          isFirstStream = false;
        }
      }, ZAP_SUBSCRIPTION_TIMEOUT);

      // Function to process initial zaps
      const processInitialZaps = () => {
        if (isFirstStream) {
          isFirstStream = false;
          // Mark that initial zaps have loaded
          if (markInitialZapsLoaded) {
            markInitialZapsLoaded();
          }
          // Process initial zaps
          if (kinds9735.length === 0) {
            if (onZapsLoaded) {
              onZapsLoaded([]);
            }
          } else {
            subscribeKind0fromKinds9735(kinds9735);
          }
        }
      };

      const subscription = nostrClient.subscribeToZaps(
        kind1id,
        (kind9735: NostrEvent) => {
          const kind9735Event = kind9735 as Kind9735Event;
          if (!kinds9735IDs.has(kind9735Event.id)) {
            kinds9735IDs.add(kind9735Event.id);
            kinds9735.push(kind9735Event);

            if (!isFirstStream) {
              // For new zaps after initial load, trigger notification processing
              if (onNewZap) {
                onNewZap(kind9735Event);
              }
              subscribeKind0fromKinds9735([kind9735Event]);
            } else {
              // For initial zaps, debounce processing to batch them together
              // Clear existing timeout
              if (initialZapProcessingTimeoutId) {
                clearTimeout(initialZapProcessingTimeoutId);
              }
              // Set a new timeout - process after a short delay to batch initial zaps
              initialZapProcessingTimeoutId = setTimeout(() => {
                processInitialZaps();
              }, INITIAL_ZAP_PROCESSING_DELAY);
            }
          }
        },
        {
          timeout: SUBSCRIPTION_TIMEOUT,
          onclosed: () => {
            clearTimeout(zapTimeoutId);
            if (initialZapProcessingTimeoutId) {
              clearTimeout(initialZapProcessingTimeoutId);
            }
            // If subscription closes and we still have initial zaps to process, process them now
            if (isFirstStream && kinds9735.length > 0) {
              processInitialZaps();
            }
          }
        }
      );

      return subscription;
    },
    [
      nostrClient,
      markInitialZapsLoaded,
      onZapsLoaded,
      subscribeKind0fromKinds9735
    ]
  );

  // Subscribe to kind 1 events (notes) - must be defined after subscribeKind0fromKind1 and subscribeKind9735fromKind1
  const subscribeKind1 = useCallback(
    async (kind1ID: string) => {
      // Reset zap list when starting a new note/event
      if (resetZapList) {
        resetZapList();
      }

      // Validate kind1ID format (should be 64-character hex string)
      if (
        !kind1ID ||
        typeof kind1ID !== 'string' ||
        kind1ID.length !== 64 ||
        !/^[0-9a-fA-F]+$/.test(kind1ID)
      ) {
        return;
      }

      const filter: NostrFilter = {
        ids: [kind1ID],
        kinds: [EVENT_KINDS.NOTE]
      };

      const subscription = nostrClient.subscribeToEvents(
        [filter],
        async (kind1: NostrEvent) => {
          const kind1Event = kind1 as Kind1Event;
          if (onKind1Event) {
            await onKind1Event(kind1Event);
          }
          await subscribeKind0fromKind1(kind1Event);
          await subscribeKind9735fromKind1(kind1Event);
        },
        {
          timeout: KIND1_SUBSCRIPTION_TIMEOUT
        }
      );
      return subscription;
    },
    [
      nostrClient,
      resetZapList,
      onKind1Event,
      subscribeKind0fromKind1,
      subscribeKind9735fromKind1
    ]
  );

  return {
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
  };
}
