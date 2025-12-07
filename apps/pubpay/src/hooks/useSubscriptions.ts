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
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;

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
  setPosts,
  setFollowingPosts,
  setReplies,
  loadProfilesBatched,
  validateLightningAddresses,
  validateNip05s
}: UseSubscriptionsOptions) => {
  // Process zaps in batches to reduce relay load
  const processZapBatch = async (zapEvents: Kind9735Event[]) => {
    if (zapEvents.length === 0) return;

    console.log('Processing zap batch:', zapEvents.length, 'zap events');

    // Extract zap payer pubkeys using utility function
    const zapPayerPubkeys = extractZapPayerPubkeys([], zapEvents);

    // Load all profiles in one batch
    const profiles = await loadProfilesBatched(Array.from(zapPayerPubkeys));

    // Process each zap with cached profile data and update posts
    for (const zapEvent of zapEvents) {
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
      const storeState = usePostStore.getState();
      const currentPosts = storeState.posts;
      const postIndex = currentPosts.findIndex(post => post.id === postId);
      if (postIndex !== -1) {
        const post = currentPosts[postIndex];
        if (post) {
          const existingZapInState = post.zaps.find(zap => zap.id === zapEvent.id);
          if (!existingZapInState) {
            const isWithinLimits = isZapWithinLimits(
              processedZap.zapAmount,
              post.zapMin,
              post.zapMax
            );
            const updatedPost: PubPayPost = {
              ...post,
              zaps: [...post.zaps, processedZap],
              zapAmount: post.zapAmount + processedZap.zapAmount,
              zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
            };
            const newPosts = [...storeState.posts];
            newPosts[postIndex] = updatedPost;
            setPosts(newPosts);
          }
        }
      }

      // Also update following posts if this post exists there
      const currentFollowingPosts = storeState.followingPosts;
      const followingPostIndex = currentFollowingPosts.findIndex(post => post.id === postId);
      if (followingPostIndex !== -1) {
        const post = currentFollowingPosts[followingPostIndex];
        if (post) {
          const existingZapInState = post.zaps.find(zap => zap.id === zapEvent.id);
          if (!existingZapInState) {
            const isWithinLimits = isZapWithinLimits(
              processedZap.zapAmount,
              post.zapMin,
              post.zapMax
            );
            const updatedPost: PubPayPost = {
              ...post,
              zaps: [...post.zaps, processedZap],
              zapAmount: post.zapAmount + processedZap.zapAmount,
              zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
            };
            const newFollowingPosts = [...storeState.followingPosts];
            newFollowingPosts[followingPostIndex] = updatedPost;
            setFollowingPosts(newFollowingPosts);
          }
        }
      }

      // Also update replies if this post exists there
      const currentReplies = storeState.replies;
      const replyIndex = currentReplies.findIndex(reply => reply.id === postId);
      if (replyIndex !== -1) {
        console.log('Zap processed: updating reply at index', replyIndex, 'for postId:', postId);
        const reply = currentReplies[replyIndex];
        if (reply) {
          const existingZapInState = reply.zaps.find(zap => zap.id === zapEvent.id);
          if (!existingZapInState) {
            const isWithinLimits = isZapWithinLimits(
              processedZap.zapAmount,
              reply.zapMin,
              reply.zapMax
            );
            const updatedReply: PubPayPost = {
              ...reply,
              zaps: [...reply.zaps, processedZap],
              zapAmount: reply.zapAmount + processedZap.zapAmount,
              zapUsesCurrent: reply.zapUsesCurrent + (isWithinLimits ? 1 : 0)
            };
            const newReplies = [...storeState.replies];
            newReplies[replyIndex] = updatedReply;
            setReplies(newReplies);
          }
        }
      }
    }
  };

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
        setPosts([newPost, ...currentPosts]);
      }

      // Also add to following posts if we're in following mode
      const currentStoreState = usePostStore.getState();
      if (currentStoreState.activeFeed === 'following') {
        const current = currentStoreState.followingPosts;
        const exists = current.find(post => post.id === noteEvent.id);
        if (!exists) {
          setFollowingPosts([newPost, ...current]);
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

        // Clear existing timeout
        if (zapBatchTimeoutRef.current) {
          clearTimeout(zapBatchTimeoutRef.current);
        }

        // Process batch after 500ms delay (or immediately if batch is large)
        if (zapBatchRef.current.length >= 10) {
          // Process immediately if batch is large
          const batchToProcess = [...zapBatchRef.current];
          zapBatchRef.current = [];
          await processZapBatch(batchToProcess);
        } else {
          // Process after delay
          zapBatchTimeoutRef.current = setTimeout(async () => {
            const batchToProcess = [...zapBatchRef.current];
            zapBatchRef.current = [];
            await processZapBatch(batchToProcess);
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
  useEffect(() => {
    const storeState = usePostStore.getState();
    if (!nostrClientRef.current || storeState.isLoading) {
      return () => {}; // Return empty cleanup function
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
              // note: decoded.data is id; nevent: decoded.data.id
              singlePostEventId =
                (decoded as any).data?.id || (decoded as any).data || null;
              singlePostMode = !!singlePostEventId;
            }
          } catch {}
        }
      }
    } catch {}

    // Determine which posts to subscribe to based on active feed
    const currentStoreState = usePostStore.getState();
    const activeFeed = currentStoreState.activeFeed;
    const currentPosts = activeFeed === 'following' ? currentStoreState.followingPosts : currentStoreState.posts;

    // If in following mode and user follows nobody, don't set up subscription
    if (
      activeFeed === 'following' &&
      followingPubkeysRef.current.length === 0
    ) {
      console.log('Following feed with 0 follows - no subscription needed');
      return () => {}; // Return empty cleanup function
    }

    // Skip subscription if following too many people (relay will reject)
    if (
      activeFeed === 'following' &&
      followingPubkeysRef.current.length > 100
    ) {
      console.log(
        `Following ${followingPubkeysRef.current.length} authors - skipping real-time subscription to avoid relay errors`
      );
      return () => {}; // Return empty cleanup function
    }

    if (currentPosts.length === 0) {
      return () => {}; // Return empty cleanup function
    }

    // Determine the cutoff time: only listen to posts NEWER than our newest post
    const cutoffTime =
      newestPostTimestampRef.current || Math.floor(Date.now() / 1000);

    console.log(
      'Setting up new post subscription since:',
      cutoffTime,
      'for feed:',
      activeFeed
    );

    // Build filter based on active feed
    const filter: any = {
      kinds: [1],
      '#t': ['pubpay'],
      since: cutoffTime + 1 // Only posts created AFTER our newest post
    };

    // If in following mode, only subscribe to posts from followed authors
    if (activeFeed === 'following' && followingPubkeysRef.current.length > 0) {
      filter.authors = [...followingPubkeysRef.current];
      console.log(
        'Filtering by followed authors:',
        followingPubkeysRef.current.length
      );
    }

    // In single-post mode we do NOT subscribe to new posts
    let notesSub: any = null;
    if (!singlePostMode) {
      // Subscribe to new kind 1 events with 'pubpay' tag created after our newest post
      notesSub = nostrClientRef.current.subscribeToEvents(
        [filter],
        async (noteEvent: NostrEvent) => {
          // Type guard to ensure this is a note event
          if (noteEvent.kind !== 1) return;

          console.log('Received new post in real-time:', noteEvent.id);
          // Process and add to feed (duplicate check is inside processNewNote)
          await processNewNote(noteEvent as Kind1Event);
        },
        {
          oneose: () => {
            console.log('New post subscription EOS');
          },
          onclosed: () => {
            console.log('New post subscription closed');
          }
        }
      );
      subscriptionRef.current = notesSub;
    }

    // Subscribe to new zaps for all current posts
    // Only recreate subscription if event IDs have actually changed
    let eventIds: string[] = [];
    if (singlePostMode && singlePostEventId) {
      // In single post mode, include both the main post and all reply IDs
      const currentStoreState = usePostStore.getState();
      const replyIds = currentStoreState.replies.map(reply => reply.id);
      eventIds = [singlePostEventId, ...replyIds];
    } else if (currentPosts.length > 0) {
      eventIds = currentPosts.map(post => post.id);
    }

    // Check if event IDs have changed
    const currentEventIdsSet = new Set(eventIds);
    const eventIdsChanged =
      eventIds.length !== subscribedEventIdsRef.current.size ||
      eventIds.some(id => !subscribedEventIdsRef.current.has(id)) ||
      Array.from(subscribedEventIdsRef.current).some(id => !currentEventIdsSet.has(id));

    // Only create/update subscription if event IDs changed or subscription doesn't exist
    if ((singlePostMode && singlePostEventId) || currentPosts.length > 0) {
      if (!zapSubscriptionRef.current || eventIdsChanged) {
        // Clean up old subscription if it exists
        if (zapSubscriptionRef.current) {
          try {
            zapSubscriptionRef.current.unsubscribe();
          } catch (e) {
            console.warn('Error unsubscribing from old zap subscription:', e);
          }
        }

        // Update tracked event IDs
        subscribedEventIdsRef.current = currentEventIdsSet;

        const currentStoreState = usePostStore.getState();
        console.log('Creating/updating zap subscription with event IDs:', eventIds.length, 'in single post mode:', singlePostMode);
        if (singlePostMode && singlePostEventId) {
          console.log('Single post mode - main post:', singlePostEventId, 'replies:', currentStoreState.replies.length);
        }

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
            // Extra guard in single post mode: ensure zap references our event id or reply IDs
            if (singlePostMode && singlePostEventId) {
              const eTag = zapEvent.tags.find(t => t[0] === 'e');
              if (!eTag || !eTag[1]) {
                console.log('Zap event rejected: no e tag or event ID');
                return;
              }
              // Check if it's for the main post or any reply
              const currentStoreState = usePostStore.getState();
              const replyIds = currentStoreState.replies.map(reply => reply.id);
              if (eTag[1] !== singlePostEventId && !replyIds.includes(eTag[1])) {
                console.log('Zap event rejected: event ID not in main post or replies', eTag[1], 'main:', singlePostEventId, 'replies:', replyIds);
                return;
              }
              console.log('Zap event accepted for single post mode:', eTag[1], 'is main post:', eTag[1] === singlePostEventId, 'is reply:', replyIds.includes(eTag[1]));
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
              await processZapBatch(batchToProcess);
            } else {
              // Process after delay
              zapBatchTimeoutRef.current = setTimeout(async () => {
                const batchToProcess = [...zapBatchRef.current];
                zapBatchRef.current = [];
                await processZapBatch(batchToProcess);
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
    }

    return () => {
      // Clean up existing subscriptions before creating new ones
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from notes subscription:', e);
        }
        subscriptionRef.current = null;
      }
      if (notesSub) {
        try {
          notesSub.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from new notes subscription:', e);
        }
      }
      if (zapSubscriptionRef.current) {
        try {
          zapSubscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from zaps subscription:', e);
        }
        zapSubscriptionRef.current = null;
      }
    };
  }, []); // Empty deps - use store.getState() inside for current values

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
            await processZapBatch(batchToProcess);
          } else {
            zapBatchTimeoutRef.current = setTimeout(async () => {
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              await processZapBatch(batchToProcess);
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

