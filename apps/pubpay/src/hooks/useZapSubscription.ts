import { useEffect, useRef } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { NostrEvent, Kind9735Event } from '@pubpay/shared-types';
import { usePostStore } from '../stores/usePostStore';
import { detectSinglePostMode } from '../utils/navigation';
import { createZapBatchProcessor } from '../utils/zapProcessing';

interface UseZapSubscriptionOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  zapSubscriptionRef: React.MutableRefObject<any>;
  zapBatchRef: React.MutableRefObject<Kind9735Event[]>;
  zapBatchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  subscribedEventIdsRef: React.MutableRefObject<Set<string>>;
  processZapBatch: (zapEvents: Kind9735Event[]) => Promise<void>;
}

/**
 * Helper function to update zap subscription with a new event ID
 * Used when a new post is added to the feed
 */
export const createUpdateZapSubscriptionForNewPost = (
  options: UseZapSubscriptionOptions
) => {
  const {
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch
  } = options;

  const processZapBatchRef = { current: processZapBatch };

  return (newEventId: string) => {
    const storeState = usePostStore.getState();
    if (
      !nostrClientRef.current ||
      storeState.isLoading ||
      !storeState.nostrReady
    ) {
      return;
    }

    // Check if we're in single post mode - if so, skip (handled by different effect)
    const { singlePostMode } = detectSinglePostMode();
    if (singlePostMode) {
      // We're in single post mode, skip updating here
      return;
    }

    // Check if event ID is already subscribed
    if (subscribedEventIdsRef.current.has(newEventId)) {
      console.log('Event ID already in zap subscription:', newEventId);
      return;
    }

    // Get current posts from store (avoid duplicate storeState declaration)
    const currentStoreState = usePostStore.getState();
    const activeFeed = currentStoreState.activeFeed;
    const currentPosts =
      activeFeed === 'following'
        ? currentStoreState.followingPosts
        : currentStoreState.posts;

    // Build new event IDs list including the new post
    const eventIds = currentPosts.map(post => post.id);

    // Make sure the new event ID is included
    if (!eventIds.includes(newEventId)) {
      eventIds.push(newEventId);
    }

    // Update tracked event IDs
    subscribedEventIdsRef.current = new Set(eventIds);

    // Clean up old subscription if it exists
    if (zapSubscriptionRef.current) {
      try {
        zapSubscriptionRef.current.unsubscribe();
      } catch (e) {
        console.warn('Error unsubscribing from old zap subscription:', e);
      }
    }

    console.log(
      'Updating zap subscription to include new post:',
      newEventId,
      'total event IDs:',
      eventIds.length
    );

    // Create batch processor using utility
    const zapBatchProcessor = createZapBatchProcessor(
      zapBatchRef,
      zapBatchTimeoutRef,
      processZapBatchRef
    );

    // Create new subscription with updated event IDs
    zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
      [
        {
          kinds: [9735],
          '#e': eventIds
        }
      ],
      async (zapEvent: NostrEvent) => {
        // Type guard to ensure this is a zap event
        if (zapEvent.kind !== 9735) return;
        await zapBatchProcessor(zapEvent as Kind9735Event);
      },
      {
        oneose: () => {
          console.log('Zap subscription EOS');
        },
        onclosed: () => {
          console.log('Zap subscription closed');
        }
      }
    );
  };
};

/**
 * Hook for subscribing to zap events
 * Extracted from useSubscriptions for better separation of concerns
 * Handles both main feed and single post mode subscriptions
 */
export const useZapSubscription = (options: UseZapSubscriptionOptions) => {
  const {
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch
  } = options;

  // Store the function in ref so it's stable across renders
  const processZapBatchRef = useRef<((zapEvents: Kind9735Event[]) => Promise<void>) | null>(null);
  processZapBatchRef.current = processZapBatch;

  // Watch for posts changes and update zap subscription when posts are first loaded
  // Use Zustand's subscribe API to avoid causing re-renders
  useEffect(() => {
    let lastPostIds = '';
    let lastActiveFeed = '';
    let lastNostrReady = false;
    let lastIsLoading = false;

    const checkAndUpdateSubscription = () => {
      const storeState = usePostStore.getState();
      if (
        !nostrClientRef.current ||
        storeState.isLoading ||
        !storeState.nostrReady
      ) {
        return;
      }

      const activeFeed = storeState.activeFeed;
      const currentPosts =
        activeFeed === 'following'
          ? storeState.followingPosts
          : storeState.posts;
      const eventIds = currentPosts.map(post => post.id);
      const postIds = eventIds.join(',');

      // Only update if something actually changed
      if (
        postIds === lastPostIds &&
        activeFeed === lastActiveFeed &&
        storeState.nostrReady === lastNostrReady &&
        storeState.isLoading === lastIsLoading
      ) {
        return;
      }

      lastPostIds = postIds;
      lastActiveFeed = activeFeed;
      lastNostrReady = storeState.nostrReady;
      lastIsLoading = storeState.isLoading;

      const currentEventIdsSet = new Set(eventIds);
      const eventIdsChanged =
        eventIds.length !== subscribedEventIdsRef.current.size ||
        eventIds.some(id => !subscribedEventIdsRef.current.has(id)) ||
        Array.from(subscribedEventIdsRef.current).some(
          id => !currentEventIdsSet.has(id)
        );

      // Only create/update subscription if we have posts and event IDs changed
      if (currentPosts.length > 0 && eventIdsChanged) {
        console.log(
          'Posts changed, updating zap subscription - event IDs:',
          eventIds.length
        );

        // Clean up old subscription
        if (zapSubscriptionRef.current) {
          try {
            zapSubscriptionRef.current.unsubscribe();
          } catch (e) {
            console.warn(
              'Error unsubscribing from old zap subscription:',
              e
            );
          }
        }

        // Update tracked event IDs
        subscribedEventIdsRef.current = currentEventIdsSet;

        // Create batch processor using utility
        const zapBatchProcessor = createZapBatchProcessor(
          zapBatchRef,
          zapBatchTimeoutRef,
          processZapBatchRef
        );

        // Create new subscription
        zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
          [
            {
              kinds: [9735],
              '#e': eventIds
            }
          ],
          async (zapEvent: NostrEvent) => {
            console.log(
              'Zap event received:',
              zapEvent.id,
              'kind:',
              zapEvent.kind
            );
            // Type guard to ensure this is a zap event
            if (zapEvent.kind !== 9735) {
              console.log(
                'Zap event rejected: wrong kind',
                zapEvent.kind
              );
              return;
            }
            await zapBatchProcessor(zapEvent as Kind9735Event);
          },
          {
            oneose: () => {
              console.log('Zap subscription EOS');
            },
            onclosed: () => {
              console.log('Zap subscription closed');
            }
          }
        );
      }
    };

    // Initial check
    checkAndUpdateSubscription();

    // Subscribe to store changes (this doesn't cause re-renders)
    const unsubscribe = usePostStore.subscribe(checkAndUpdateSubscription);

    return () => {
      unsubscribe();
    };
  }, [
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch
  ]);

  // Update zap subscription when replies change in single post mode
  useEffect(() => {
    const storeState = usePostStore.getState();
    if (
      !nostrClientRef.current ||
      storeState.isLoading ||
      !storeState.nostrReady
    ) {
      return;
    }

    // Check if we're in single post mode
    const { singlePostMode, singlePostEventId } = detectSinglePostMode();

    // Only update if in single post mode
    if (!singlePostMode || !singlePostEventId) {
      return;
    }

    // Get current reply IDs
    const currentStoreState = usePostStore.getState();
    const replyIds = currentStoreState.replies.map(reply => reply.id);
    const eventIds = [singlePostEventId, ...replyIds];
    const currentEventIdsSet = new Set(eventIds);

    // Check if event IDs have changed
    const eventIdsChanged =
      eventIds.length !== subscribedEventIdsRef.current.size ||
      eventIds.some(id => !subscribedEventIdsRef.current.has(id)) ||
      Array.from(subscribedEventIdsRef.current).some(
        id => !currentEventIdsSet.has(id)
      );

    // Only update if event IDs changed (or subscription doesn't exist yet)
    if (eventIdsChanged || !zapSubscriptionRef.current) {
      // Clean up old subscription
      if (zapSubscriptionRef.current) {
        try {
          zapSubscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn(
            'Error unsubscribing from old zap subscription:',
            e
          );
        }
      }

      // Update tracked event IDs
      subscribedEventIdsRef.current = currentEventIdsSet;

      console.log(
        'Updating zap subscription for replies - event IDs:',
        eventIds.length,
        'main post:',
        singlePostEventId,
        'replies:',
        currentStoreState.replies.length
      );

      // Create batch processor using utility
      const zapBatchProcessor = createZapBatchProcessor(
        zapBatchRef,
        zapBatchTimeoutRef,
        processZapBatchRef
      );

      // Create new subscription
      zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
        [
          {
            kinds: [9735],
            '#e': eventIds
          }
        ],
        async (zapEvent: NostrEvent) => {
          if (zapEvent.kind !== 9735) return;
          const eTag = zapEvent.tags.find(t => t[0] === 'e');
          if (!eTag || !eTag[1]) {
            console.log(
              'Zap event rejected (separate useEffect): no e tag or event ID'
            );
            return;
          }
          // Get current reply IDs from store (always use latest)
          const latestStoreState = usePostStore.getState();
          const currentReplyIds = latestStoreState.replies.map(
            reply => reply.id
          );
          if (
            eTag[1] !== singlePostEventId &&
            !currentReplyIds.includes(eTag[1])
          ) {
            console.log(
              'Zap event rejected (separate useEffect): event ID not in main post or replies',
              eTag[1],
              'main:',
              singlePostEventId,
              'replies:',
              currentReplyIds
            );
            return;
          }
          console.log(
            'Zap event accepted (separate useEffect):',
            eTag[1],
            'is main post:',
            eTag[1] === singlePostEventId,
            'is reply:',
            currentReplyIds.includes(eTag[1])
          );
          await zapBatchProcessor(zapEvent as Kind9735Event);
        },
        {
          oneose: () => {
            console.log('Zap subscription EOS');
          },
          onclosed: () => {
            console.log('Zap subscription closed');
          }
        }
      );
    }
  }, [
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch
  ]);
};

