import { useEffect } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { NostrEvent, Kind1Event } from '@pubpay/shared-types';
import { usePostStore } from '../stores/usePostStore';
import { detectSinglePostMode } from '../utils/navigation';

interface UsePostSubscriptionOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  followingPubkeysRef: React.MutableRefObject<string[]>;
  newestPostTimestampRef: React.MutableRefObject<number>;
  subscriptionRef: React.MutableRefObject<any>;
  processNewNote: (noteEvent: Kind1Event) => Promise<void>;
}

/**
 * Hook for subscribing to new posts in real-time
 * Extracted from useSubscriptions for better separation of concerns
 */
export const usePostSubscription = (options: UsePostSubscriptionOptions) => {
  const {
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    subscriptionRef,
    processNewNote
  } = options;

  useEffect(() => {
    let lastPostIds = '';
    let lastActiveFeed = '';
    let lastNostrReady = false;
    let lastIsLoading = false;
    let lastNewestTimestamp = 0;
    let lastSubscriptionSince = 0; // Track the 'since' value we used for the last subscription

    const checkAndUpdateSubscription = () => {
      const storeState = usePostStore.getState();
      if (
        !nostrClientRef.current ||
        storeState.isLoading ||
        !storeState.nostrReady
      ) {
        // Clean up subscription if not ready
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from notes subscription:', e);
          }
        }
        return;
      }

      // Detect single-post mode via URL (?note=...)
      const { singlePostMode, singlePostEventId } = detectSinglePostMode();

      const activeFeed = storeState.activeFeed;
      const currentPosts =
        activeFeed === 'following'
          ? storeState.followingPosts
          : storeState.posts;
      const eventIds = currentPosts.map(post => post.id);
      const postIds = eventIds.join(',');

      // Calculate newest timestamp from actual posts, not the ref (which might be stale)
      let newestTimestamp = 0;
      if (currentPosts.length > 0) {
        // Get the newest post's timestamp from the actual posts array
        newestTimestamp = Math.max(
          ...currentPosts.map(post => post.createdAt)
        );
      } else {
        // If no posts, use the ref or current time
        newestTimestamp =
          newestPostTimestampRef.current || Math.floor(Date.now() / 1000);
      }

      // Calculate the 'since' value we would use for the subscription
      const newSubscriptionSince = newestTimestamp + 1;

      // Only update if something actually changed AND the subscription 'since' value would change significantly
      // Don't recreate subscription if only the timestamp changed by a few seconds (likely just time passing)
      const subscriptionSinceChanged =
        Math.abs(newSubscriptionSince - lastSubscriptionSince) > 5; // Only if changed by more than 5 seconds

      if (
        postIds === lastPostIds &&
        activeFeed === lastActiveFeed &&
        storeState.nostrReady === lastNostrReady &&
        storeState.isLoading === lastIsLoading &&
        !subscriptionSinceChanged &&
        singlePostMode === !!singlePostEventId
      ) {
        return;
      }

      lastPostIds = postIds;
      lastActiveFeed = activeFeed;
      lastNostrReady = storeState.nostrReady;
      lastIsLoading = storeState.isLoading;
      lastNewestTimestamp = newestTimestamp;

      // If in following mode and user follows nobody, don't set up subscription
      if (
        activeFeed === 'following' &&
        followingPubkeysRef.current.length === 0
      ) {
        console.log('Following feed with 0 follows - no subscription needed');
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from notes subscription:', e);
          }
        }
        return;
      }

      // Skip subscription if following too many people (relay will reject)
      if (
        activeFeed === 'following' &&
        followingPubkeysRef.current.length > 100
      ) {
        console.log(
          `Following ${followingPubkeysRef.current.length} authors - skipping real-time subscription to avoid relay errors`
        );
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from notes subscription:', e);
          }
        }
        return;
      }

      if (currentPosts.length === 0) {
        console.log(
          'No posts available yet, skipping new post subscription setup'
        );
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from notes subscription:', e);
          }
        }
        return;
      }

      // Use the subscription 'since' value we calculated earlier
      const subscriptionSince = newSubscriptionSince;

      console.log(
        'Setting up new post subscription since:',
        subscriptionSince,
        'for feed:',
        activeFeed,
        'posts count:',
        currentPosts.length,
        'newest post timestamp:',
        newestTimestamp
      );

      // Build filter based on active feed
      const filter: any = {
        kinds: [1],
        '#t': ['pubpay'],
        since: subscriptionSince
      };

      // Update the last subscription 'since' value
      lastSubscriptionSince = subscriptionSince;

      // If in following mode, only subscribe to posts from followed authors
      if (
        activeFeed === 'following' &&
        followingPubkeysRef.current.length > 0
      ) {
        filter.authors = [...followingPubkeysRef.current];
        console.log(
          'Filtering by followed authors:',
          followingPubkeysRef.current.length
        );
      }

      // In single-post mode we do NOT subscribe to new posts
      if (!singlePostMode) {
        // Only recreate subscription if it doesn't exist or if the 'since' value changed significantly
        const needsNewSubscription =
          !subscriptionRef.current || subscriptionSinceChanged;

        if (needsNewSubscription) {
          // Clean up old subscription if it exists
          if (subscriptionRef.current) {
            try {
              subscriptionRef.current.unsubscribe();
            } catch (e) {
              console.warn(
                'Error unsubscribing from old notes subscription:',
                e
              );
            }
          }

          // Subscribe to new kind 1 events with 'pubpay' tag created after our newest post
          const notesSub = nostrClientRef.current.subscribeToEvents(
            [filter],
            async (noteEvent: NostrEvent) => {
              // Type guard to ensure this is a note event
              if (noteEvent.kind !== 1) return;

              console.log(
                'Received new post in real-time:',
                noteEvent.id,
                'from author:',
                noteEvent.pubkey
              );
              // Process and add to feed (duplicate check is inside processNewNote)
              await processNewNote(noteEvent as Kind1Event);
            },
            {
              oneose: () => {
                console.log('New post subscription EOS');
                // EOS is normal - it just means the relay finished sending initial results
                // The subscription stays active for new events
              },
              onclosed: () => {
                console.log('New post subscription closed');
              }
            }
          );
          subscriptionRef.current = notesSub;
        } else {
          console.log(
            'Skipping subscription recreation - no significant changes'
          );
        }
      } else {
        // In single post mode, clean up subscription
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from notes subscription:', e);
          }
        }
      }
    };

    // Initial check
    checkAndUpdateSubscription();

    // Subscribe to store changes (this doesn't cause re-renders)
    const unsubscribe = usePostStore.subscribe(checkAndUpdateSubscription);

    // Also watch for newestPostTimestampRef changes (we need to poll this since refs don't trigger subscriptions)
    // But only check every 5 seconds to avoid too frequent updates
    const timestampCheckInterval = setInterval(() => {
      const storeState = usePostStore.getState();
      const activeFeed = storeState.activeFeed;
      const currentPosts =
        activeFeed === 'following'
          ? storeState.followingPosts
          : storeState.posts;

      // Calculate newest timestamp from actual posts
      let currentTimestamp = 0;
      if (currentPosts.length > 0) {
        currentTimestamp = Math.max(
          ...currentPosts.map(post => post.createdAt)
        );
      } else {
        currentTimestamp = newestPostTimestampRef.current || 0;
      }

      // Only trigger update if timestamp changed significantly (more than 5 seconds)
      if (
        currentTimestamp > 0 &&
        Math.abs(currentTimestamp - lastNewestTimestamp) > 5
      ) {
        lastNewestTimestamp = currentTimestamp;
        checkAndUpdateSubscription();
      }
    }, 5000); // Check every 5 seconds instead of every second

    return () => {
      unsubscribe();
      clearInterval(timestampCheckInterval);
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        } catch (e) {
          console.warn('Error unsubscribing from notes subscription:', e);
        }
      }
    };
  }, [nostrClientRef, followingPubkeysRef, newestPostTimestampRef, subscriptionRef, processNewNote]);
};

