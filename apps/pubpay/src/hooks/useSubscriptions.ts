import { useEffect, useRef } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { extractZapPayerPubkeys } from '@pubpay/shared-services';
import { useUIStore } from '@pubpay/shared-services';
import { parseZapDescription } from '@pubpay/shared-utils';
import { nip19 } from 'nostr-tools';
import { NostrEvent, Kind1Event, Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import { safeJson } from '@pubpay/shared-utils';
import { TIMEOUT } from '../constants';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { processNewZapWithProfiles, isZapWithinLimits } from '../utils/zapProcessing';
import { usePostStore } from '../stores/usePostStore';

interface UseSubscriptionsOptions {
  // Refs (only for subscription tracking, not state)
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  followingPubkeysRef: React.MutableRefObject<string[]>;
  newestPostTimestampRef: React.MutableRefObject<number>;
  subscriptionRef: React.MutableRefObject<any>;
  zapSubscriptionRef: React.MutableRefObject<any>;
  zapBatchRef: React.MutableRefObject<Kind9735Event[]>;
  zapBatchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  subscribedEventIdsRef: React.MutableRefObject<Set<string>>;

  // Store actions (direct store actions, not React setters)
  updatePost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateFollowingPost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateReply: (replyId: string, updates: Partial<PubPayPost>) => void;
  addPost: (post: PubPayPost) => void;
  addFollowingPost: (post: PubPayPost) => void;

  // Functions from other hooks
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, Kind0Event>>;
  validateLightningAddresses: (posts: PubPayPost[], feed: FeedType) => void;
  validateNip05s: (posts: PubPayPost[], feed: FeedType) => void;
}

export const useSubscriptions = ({
  nostrClientRef,
  followingPubkeysRef,
  newestPostTimestampRef,
  subscriptionRef,
  zapSubscriptionRef,
  zapBatchRef,
  zapBatchTimeoutRef,
  subscribedEventIdsRef,
  updatePost,
  updateFollowingPost,
  updateReply,
  addPost,
  addFollowingPost,
  loadProfilesBatched,
  validateLightningAddresses,
  validateNip05s
}: UseSubscriptionsOptions) => {
  // Process zaps in batches to reduce relay load
  // Use ref to keep function stable across renders
  const processZapBatchRef = useRef<((zapEvents: Kind9735Event[]) => Promise<void>) | null>(null);
  
  const processZapBatch = async (zapEvents: Kind9735Event[]) => {
    if (zapEvents.length === 0) return;

    // Early duplicate detection: filter out zaps that already exist in any post/reply
    const storeState = usePostStore.getState();
    const allPosts = [...storeState.posts, ...storeState.followingPosts, ...storeState.replies];
    const existingZapIds = new Set<string>();
    allPosts.forEach(post => {
      post.zaps.forEach(zap => existingZapIds.add(zap.id));
    });

    // Filter out duplicates before processing
    const newZapEvents = zapEvents.filter(zapEvent => !existingZapIds.has(zapEvent.id));
    
    if (newZapEvents.length === 0) {
      // All zaps are duplicates, skip processing
      return;
    }

    console.log('Processing zap batch:', newZapEvents.length, 'new zaps (filtered from', zapEvents.length, 'total)');

    // Extract zap payer pubkeys using utility function
    const zapPayerPubkeys = extractZapPayerPubkeys([], newZapEvents);

    // Load all profiles in one batch
    const profiles = await loadProfilesBatched(Array.from(zapPayerPubkeys));

    // Process each zap with cached profile data and update posts
    for (const zapEvent of newZapEvents) {
      const processedZap = processNewZapWithProfiles(zapEvent, profiles);
      if (!processedZap) continue;

      // Find which post this zap belongs to
      const eventTag = zapEvent.tags.find(tag => tag[0] === 'e');
      if (!eventTag) continue;

      const postId = eventTag[1];

      // Auto-close invoice overlay via store when matching zap receipt arrives
      try {
        const descriptionTag = zapEvent.tags.find(
          (tag: any) => tag[0] === 'description'
        );
        let zapRequestEventId = '';
        if (descriptionTag) {
          const zapData =
            parseZapDescription(descriptionTag[1] || undefined) || {};
          zapRequestEventId = zapData.id || '';
        }
        if (zapRequestEventId) {
          const { zapRequestId, show } = useUIStore.getState().invoiceOverlay;
          if (show && zapRequestId === zapRequestEventId) {
            useUIStore.getState().closeInvoice();
          }
        }
      } catch {}

      // Update posts with the new zap
      // Note: We already filtered duplicates above, but double-check here as a safety measure
      const currentStoreState = usePostStore.getState();
      const post = currentStoreState.posts.find(p => p.id === postId);
      if (post) {
        const existingZapInState = post.zaps.find(zap => zap.id === zapEvent.id);
        if (!existingZapInState) {
          const isWithinLimits = isZapWithinLimits(
            processedZap.zapAmount,
            post.zapMin,
            post.zapMax
          );
          updatePost(postId, {
            zaps: [...post.zaps, processedZap],
            zapAmount: post.zapAmount + processedZap.zapAmount,
            zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
          });
        }
        // Skip silently if duplicate (already filtered above, but safety check)
      }

      // Also update following posts if this post exists there
      const followingPost = currentStoreState.followingPosts.find(p => p.id === postId);
      if (followingPost) {
        const existingZapInState = followingPost.zaps.find(zap => zap.id === zapEvent.id);
        if (!existingZapInState) {
          const isWithinLimits = isZapWithinLimits(
            processedZap.zapAmount,
            followingPost.zapMin,
            followingPost.zapMax
          );
          updateFollowingPost(postId, {
            zaps: [...followingPost.zaps, processedZap],
            zapAmount: followingPost.zapAmount + processedZap.zapAmount,
            zapUsesCurrent: followingPost.zapUsesCurrent + (isWithinLimits ? 1 : 0)
          });
        }
      }

      // Also update replies if this post exists there
      const reply = currentStoreState.replies.find(r => r.id === postId);
      if (reply) {
        const existingZapInState = reply.zaps.find(zap => zap.id === zapEvent.id);
        if (!existingZapInState) {
          const isWithinLimits = isZapWithinLimits(
            processedZap.zapAmount,
            reply.zapMin,
            reply.zapMax
          );
          updateReply(postId, {
            zaps: [...reply.zaps, processedZap],
            zapAmount: reply.zapAmount + processedZap.zapAmount,
            zapUsesCurrent: reply.zapUsesCurrent + (isWithinLimits ? 1 : 0)
          });
        }
      }
    }
  };

  // Store the function in ref so it's stable across renders
  processZapBatchRef.current = processZapBatch;

  // Process a new note event and add it to the feed
  const processNewNote = async (noteEvent: Kind1Event) => {
    try {
      console.log('Processing new note:', noteEvent.id);

      // Get the author's profile
      const authorProfiles = (await nostrClientRef.current?.getEvents([
        {
          kinds: [0],
          authors: [noteEvent.pubkey]
        }
      ])) as Kind0Event[];

      const author = authorProfiles[0] || {
        kind: 0,
        id: '',
        pubkey: noteEvent.pubkey,
        content: '{}',
        created_at: 0,
        sig: '',
        tags: []
      };

      // Create basic post structure (like processPostsBasic)
      const newPost: PubPayPost = {
        id: noteEvent.id,
        event: noteEvent,
        author,
        createdAt: noteEvent.created_at,
        zapMin: 0,
        zapMax: 0,
        zapUses: 0,
        zapAmount: 0,
        zaps: [],
        zapUsesCurrent: 0,
        zapGoal: undefined,
        isPayable: true,
        hasZapTags: false,
        content: noteEvent.content
      };

      // Extract zap min/max from tags
      const zapMinTag = noteEvent.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = noteEvent.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = noteEvent.tags.find(tag => tag[0] === 'zap-uses');
      const zapGoalTag = noteEvent.tags.find(tag => tag[0] === 'zap-goal');

      if (zapMinTag && zapMinTag[1]) {
        newPost.zapMin = parseInt(zapMinTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapMaxTag && zapMaxTag[1]) {
        newPost.zapMax = parseInt(zapMaxTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapUsesTag && zapUsesTag[1]) {
        newPost.zapUses = parseInt(zapUsesTag[1]) || 0; // Only set if tag exists
      }
      if (zapGoalTag && zapGoalTag[1]) {
        newPost.zapGoal = parseInt(zapGoalTag[1]) / 1000 || undefined; // Convert from millisats to sats
      }

      // Set hasZapTags based on whether zap tags exist (zap-min, zap-max, zap-uses, zap-goal)
      newPost.hasZapTags = !!(zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag);

      // Check author data for lightning address and NIP-05
      try {
        const authorData = author
          ? safeJson<Record<string, any>>(author.content || '{}', {})
          : {};
        const hasLud16 = !!(authorData as any).lud16;
        const hasNip05 = !!(authorData as any).nip05;

        // Mark as validating if we have a lightning address to validate
        if (hasLud16) {
          newPost.lightningValidating = true;
        }
        // Mark as validating if we have a NIP-05 identifier to validate
        if (hasNip05) {
          newPost.nip05Validating = true;
        }
      } catch {
        // Ignore parse errors
      }

      // Add the new post to the beginning of the posts array (most recent first)
      const currentPosts = usePostStore.getState().posts;
      const exists = currentPosts.find(post => post.id === noteEvent.id);
      if (exists) {
        console.log('Post already exists in state, skipping:', noteEvent.id);
      } else {
        console.log('Adding new post to feed:', noteEvent.id);
        addPost(newPost);
      }

      // Also add to following posts if we're in following mode
      const currentStoreState = usePostStore.getState();
      if (currentStoreState.activeFeed === 'following') {
        const current = currentStoreState.followingPosts;
        const exists = current.find(post => post.id === noteEvent.id);
        if (!exists) {
          addFollowingPost(newPost);
        }
      }

      // Update zap subscription to include this new post
      updateZapSubscriptionForNewPost(noteEvent.id);

      // Trigger validation for lightning addresses and NIP-05 on the new post
      // Use a small delay to ensure the post is in state before validating
      setTimeout(() => {
        const storeState = usePostStore.getState();
        const activeFeed = storeState.activeFeed;
        const postsArray = activeFeed === 'following' ? storeState.followingPosts : storeState.posts;
        const newPostInArray = postsArray.find(p => p.id === noteEvent.id);
        if (newPostInArray) {
          validateLightningAddresses([newPostInArray], activeFeed);
          validateNip05s([newPostInArray], activeFeed);
        }
      }, TIMEOUT.SHORT_DELAY);
    } catch (error) {
      console.error('Error processing new note:', error);
    }
  };

  // Helper function to update zap subscription with a new event ID
  const updateZapSubscriptionForNewPost = (newEventId: string) => {
    const storeState = usePostStore.getState();
    if (!nostrClientRef.current || storeState.isLoading || !storeState.nostrReady) {
      return;
    }

    // Check if we're in single post mode - if so, skip (handled by different effect)
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qNote = params.get('note');
        const path = window.location.pathname || '';
        let noteRef: string | null = null;
        if (qNote) noteRef = qNote;
        else if (path.startsWith('/note/'))
          noteRef = path.split('/note/')[1] || null;

        if (noteRef) {
          // We're in single post mode, skip updating here
          return;
        }
      }
    } catch {
      // Continue if error checking for single post mode
    }

    // Check if event ID is already subscribed
    if (subscribedEventIdsRef.current.has(newEventId)) {
      console.log('Event ID already in zap subscription:', newEventId);
      return;
    }

    // Get current posts from store (avoid duplicate storeState declaration)
    const currentStoreState = usePostStore.getState();
    const activeFeed = currentStoreState.activeFeed;
    const currentPosts = activeFeed === 'following' ? currentStoreState.followingPosts : currentStoreState.posts;

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

    console.log('Updating zap subscription to include new post:', newEventId, 'total event IDs:', eventIds.length);

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

            // Add to batch for processing
            zapBatchRef.current.push(zapEvent as Kind9735Event);
            console.log('Zap added to batch, batch size:', zapBatchRef.current.length, 'processZapBatchRef available:', !!processZapBatchRef.current);

            // Clear existing timeout
            if (zapBatchTimeoutRef.current) {
              clearTimeout(zapBatchTimeoutRef.current);
            }

            // Process batch after 500ms delay (or immediately if batch is large)
            if (zapBatchRef.current.length >= 10) {
              // Process immediately if batch is large
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              console.log('Processing zap batch immediately, batch size:', batchToProcess.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
              if (processZapBatchRef.current) {
                await processZapBatchRef.current(batchToProcess);
              } else {
                console.error('processZapBatchRef.current is null!');
              }
            } else {
              // Process after delay
              console.log('Scheduling zap batch processing, current batch size:', zapBatchRef.current.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
              zapBatchTimeoutRef.current = setTimeout(async () => {
                const batchToProcess = [...zapBatchRef.current];
                zapBatchRef.current = [];
                console.log('Processing zap batch after delay, batch size:', batchToProcess.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
                if (processZapBatchRef.current) {
                  await processZapBatchRef.current(batchToProcess);
                } else {
                  console.error('processZapBatchRef.current is null in timeout!');
                }
              }, 500);
            }
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

  // Subscribe to new posts in real-time (only posts created after we started loading)
  // Use Zustand's subscribe API to watch for changes without causing re-renders
  useEffect(() => {
    let lastPostIds = '';
    let lastActiveFeed = '';
    let lastNostrReady = false;
    let lastIsLoading = false;
    let lastNewestTimestamp = 0;
    let lastSubscriptionSince = 0; // Track the 'since' value we used for the last subscription

    const checkAndUpdateSubscription = () => {
      const storeState = usePostStore.getState();
      if (!nostrClientRef.current || storeState.isLoading || !storeState.nostrReady) {
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
      let singlePostMode = false;
      let singlePostEventId: string | null = null;
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const qNote = params.get('note');
          const path = window.location.pathname || '';
          let noteRef: string | null = null;
          if (qNote) noteRef = qNote;
          else if (path.startsWith('/note/'))
            noteRef = path.split('/note/')[1] || null;

          if (noteRef) {
            try {
              const decoded = nip19.decode(noteRef);
              if (decoded.type === 'note' || decoded.type === 'nevent') {
                singlePostEventId =
                  (decoded as any).data?.id || (decoded as any).data || null;
                singlePostMode = !!singlePostEventId;
              }
            } catch {}
          }
        }
      } catch {}

      const activeFeed = storeState.activeFeed;
      const currentPosts = activeFeed === 'following' ? storeState.followingPosts : storeState.posts;
      const eventIds = currentPosts.map(post => post.id);
      const postIds = eventIds.join(',');

      // Calculate newest timestamp from actual posts, not the ref (which might be stale)
      let newestTimestamp = 0;
      if (currentPosts.length > 0) {
        // Get the newest post's timestamp from the actual posts array
        newestTimestamp = Math.max(...currentPosts.map(post => post.createdAt));
      } else {
        // If no posts, use the ref or current time
        newestTimestamp = newestPostTimestampRef.current || Math.floor(Date.now() / 1000);
      }

      // Calculate the 'since' value we would use for the subscription
      const newSubscriptionSince = newestTimestamp + 1;

      // Only update if something actually changed AND the subscription 'since' value would change significantly
      // Don't recreate subscription if only the timestamp changed by a few seconds (likely just time passing)
      const subscriptionSinceChanged = Math.abs(newSubscriptionSince - lastSubscriptionSince) > 5; // Only if changed by more than 5 seconds

      if (postIds === lastPostIds && activeFeed === lastActiveFeed &&
          storeState.nostrReady === lastNostrReady && storeState.isLoading === lastIsLoading &&
          !subscriptionSinceChanged && singlePostMode === (!!singlePostEventId)) {
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
        console.log('No posts available yet, skipping new post subscription setup');
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
      if (activeFeed === 'following' && followingPubkeysRef.current.length > 0) {
        filter.authors = [...followingPubkeysRef.current];
        console.log(
          'Filtering by followed authors:',
          followingPubkeysRef.current.length
        );
      }

      // In single-post mode we do NOT subscribe to new posts
      if (!singlePostMode) {
        // Only recreate subscription if it doesn't exist or if the 'since' value changed significantly
        const needsNewSubscription = !subscriptionRef.current || subscriptionSinceChanged;
        
        if (needsNewSubscription) {
          // Clean up old subscription if it exists
          if (subscriptionRef.current) {
            try {
              subscriptionRef.current.unsubscribe();
            } catch (e) {
              console.warn('Error unsubscribing from old notes subscription:', e);
            }
          }

          // Subscribe to new kind 1 events with 'pubpay' tag created after our newest post
          const notesSub = nostrClientRef.current.subscribeToEvents(
            [filter],
            async (noteEvent: NostrEvent) => {
              // Type guard to ensure this is a note event
              if (noteEvent.kind !== 1) return;

              console.log('Received new post in real-time:', noteEvent.id, 'from author:', noteEvent.pubkey);
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
          console.log('Skipping subscription recreation - no significant changes');
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
      const currentPosts = activeFeed === 'following' ? storeState.followingPosts : storeState.posts;
      
      // Calculate newest timestamp from actual posts
      let currentTimestamp = 0;
      if (currentPosts.length > 0) {
        currentTimestamp = Math.max(...currentPosts.map(post => post.createdAt));
      } else {
        currentTimestamp = newestPostTimestampRef.current || 0;
      }
      
      // Only trigger update if timestamp changed significantly (more than 5 seconds)
      if (currentTimestamp > 0 && Math.abs(currentTimestamp - lastNewestTimestamp) > 5) {
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
  }, []);

  // Watch for posts changes and update zap subscription when posts are first loaded
  // Use Zustand's subscribe API to avoid causing re-renders
  useEffect(() => {
    let lastPostIds = '';
    let lastActiveFeed = '';
    let lastNostrReady = false;
    let lastIsLoading = false;

    const checkAndUpdateSubscription = () => {
      const storeState = usePostStore.getState();
      if (!nostrClientRef.current || storeState.isLoading || !storeState.nostrReady) {
        return;
      }

      const activeFeed = storeState.activeFeed;
      const currentPosts = activeFeed === 'following' ? storeState.followingPosts : storeState.posts;
      const eventIds = currentPosts.map(post => post.id);
      const postIds = eventIds.join(',');
      
      // Only update if something actually changed
      if (postIds === lastPostIds && activeFeed === lastActiveFeed && 
          storeState.nostrReady === lastNostrReady && storeState.isLoading === lastIsLoading) {
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
        Array.from(subscribedEventIdsRef.current).some(id => !currentEventIdsSet.has(id));

      // Only create/update subscription if we have posts and event IDs changed
      if (currentPosts.length > 0 && eventIdsChanged) {
        console.log('Posts changed, updating zap subscription - event IDs:', eventIds.length);
        
        // Clean up old subscription
        if (zapSubscriptionRef.current) {
          try {
            zapSubscriptionRef.current.unsubscribe();
          } catch (e) {
            console.warn('Error unsubscribing from old zap subscription:', e);
          }
        }

        // Update tracked event IDs
        subscribedEventIdsRef.current = currentEventIdsSet;

        // Create new subscription
        zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
          [
            {
              kinds: [9735],
              '#e': eventIds
            }
          ],
          async (zapEvent: NostrEvent) => {
            console.log('Zap event received:', zapEvent.id, 'kind:', zapEvent.kind);
            // Type guard to ensure this is a zap event
            if (zapEvent.kind !== 9735) {
              console.log('Zap event rejected: wrong kind', zapEvent.kind);
              return;
            }

            // Add to batch for processing
            zapBatchRef.current.push(zapEvent as Kind9735Event);

            // Clear existing timeout
            if (zapBatchTimeoutRef.current) {
              clearTimeout(zapBatchTimeoutRef.current);
            }

            // Process batch after 500ms delay (or immediately if batch is large)
            if (zapBatchRef.current.length >= 10) {
              // Process immediately if batch is large
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              console.log('Processing zap batch immediately, batch size:', batchToProcess.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
              if (processZapBatchRef.current) {
                await processZapBatchRef.current(batchToProcess);
              } else {
                console.error('processZapBatchRef.current is null!');
              }
            } else {
              // Process after delay
              console.log('Scheduling zap batch processing, current batch size:', zapBatchRef.current.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
              zapBatchTimeoutRef.current = setTimeout(async () => {
                const batchToProcess = [...zapBatchRef.current];
                zapBatchRef.current = [];
                console.log('Processing zap batch after delay, batch size:', batchToProcess.length, 'processZapBatchRef.current:', !!processZapBatchRef.current);
                if (processZapBatchRef.current) {
                  await processZapBatchRef.current(batchToProcess);
                } else {
                  console.error('processZapBatchRef.current is null in timeout!');
                }
              }, 500);
            }
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
  }, []);

  // Update zap subscription when replies change in single post mode
  useEffect(() => {
    const storeState = usePostStore.getState();
    if (!nostrClientRef.current || storeState.isLoading || !storeState.nostrReady) {
      return;
    }

    // Check if we're in single post mode
    let singlePostMode = false;
    let singlePostEventId: string | null = null;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qNote = params.get('note');
        const path = window.location.pathname || '';
        let noteRef: string | null = null;
        if (qNote) noteRef = qNote;
        else if (path.startsWith('/note/'))
          noteRef = path.split('/note/')[1] || null;

        if (noteRef) {
          try {
            const decoded = nip19.decode(noteRef);
            if (decoded.type === 'note' || decoded.type === 'nevent') {
              singlePostEventId =
                (decoded as any).data?.id || (decoded as any).data || null;
              singlePostMode = !!singlePostEventId;
            }
          } catch {}
        }
      }
    } catch {}

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
      Array.from(subscribedEventIdsRef.current).some(id => !currentEventIdsSet.has(id));

    // Only update if event IDs changed (or subscription doesn't exist yet)
    if (eventIdsChanged || !zapSubscriptionRef.current) {
      // Clean up old subscription
      if (zapSubscriptionRef.current) {
        try {
          zapSubscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from old zap subscription:', e);
        }
      }

      // Update tracked event IDs
      subscribedEventIdsRef.current = currentEventIdsSet;

      console.log('Updating zap subscription for replies - event IDs:', eventIds.length, 'main post:', singlePostEventId, 'replies:', currentStoreState.replies.length);

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
            console.log('Zap event rejected (separate useEffect): no e tag or event ID');
            return;
          }
          // Get current reply IDs from store (always use latest)
          const latestStoreState = usePostStore.getState();
          const currentReplyIds = latestStoreState.replies.map(reply => reply.id);
          if (eTag[1] !== singlePostEventId && !currentReplyIds.includes(eTag[1])) {
            console.log('Zap event rejected (separate useEffect): event ID not in main post or replies', eTag[1], 'main:', singlePostEventId, 'replies:', currentReplyIds);
            return;
          }
          console.log('Zap event accepted (separate useEffect):', eTag[1], 'is main post:', eTag[1] === singlePostEventId, 'is reply:', currentReplyIds.includes(eTag[1]));
          zapBatchRef.current.push(zapEvent as Kind9735Event);

          if (zapBatchTimeoutRef.current) {
            clearTimeout(zapBatchTimeoutRef.current);
          }

          if (zapBatchRef.current.length >= 10) {
            const batchToProcess = [...zapBatchRef.current];
            zapBatchRef.current = [];
            if (processZapBatchRef.current) {
              await processZapBatchRef.current(batchToProcess);
            }
          } else {
            zapBatchTimeoutRef.current = setTimeout(async () => {
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              if (processZapBatchRef.current) {
                await processZapBatchRef.current(batchToProcess);
              }
            }, 500);
          }
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
  }, []); // Empty deps - use store.getState() inside for current values

  return {
    processZapBatch,
    processNewNote,
    updateZapSubscriptionForNewPost
  };
};

