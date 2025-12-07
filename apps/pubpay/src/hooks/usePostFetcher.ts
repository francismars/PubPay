import { useCallback } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { ensurePosts, getQueryClient, loadPostData } from '@pubpay/shared-services';
import { Kind1Event, Kind0Event, Kind9735Event, NostrFilter } from '@pubpay/shared-types';
import type { AuthState } from '@pubpay/shared-services';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { TIMEOUT, QUERY_LIMITS } from '../constants';
import { genericUserIcon } from '../assets/images';
import { calculateReplyLevels, updatePostWithProfileData } from '../utils/postProcessing';
import { usePostStore } from '../stores/usePostStore';
import { useAbortController } from './useAbortController';
import { safeAsync, isAbortError } from '../utils/asyncHelpers';

interface UsePostFetcherOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  followingPubkeysRef: React.MutableRefObject<string[]>;
  newestPostTimestampRef: React.MutableRefObject<number>;
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;
  setIsLoading: (loading: boolean) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setNostrReady: (ready: boolean) => void;
  processPostsBasic: (events: Kind1Event[], profiles: Kind0Event[]) => Promise<PubPayPost[]>;
  processPostsBasicSync: (events: Kind1Event[]) => PubPayPost[];
  processPosts: (events: Kind1Event[], profiles: Kind0Event[], zaps: Kind9735Event[]) => Promise<PubPayPost[]>;
  loadZapsForPosts: (events: Kind1Event[], zaps: Kind9735Event[], feed: FeedType, profiles?: Kind0Event[]) => Promise<void>;
  validateLightningAddresses: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
  validateNip05s: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
  authState: AuthState;
}

/**
 * Hook for fetching posts from Nostr relays
 * Extracted from useFeedLoader for better separation of concerns
 * Contains: loadPosts, loadFollowingPosts, loadMorePosts, loadSingleNote, loadReplies
 */
export const usePostFetcher = (options: UsePostFetcherOptions) => {
  const {
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    processPostsBasic,
    processPostsBasicSync,
    processPosts,
    loadZapsForPosts,
    validateLightningAddresses,
    validateNip05s,
    authState
  } = options;

  // Add AbortController to prevent memory leaks
  const { signal, isAborted } = useAbortController();

  const loadPosts = useCallback(
    async (feed: 'global' | 'following', loadMore = false) => {
      // Check if aborted before starting
      if (isAborted) return;

      if (!nostrClientRef.current) {
        console.warn('NostrClient not available yet');
        return;
      }

      // Check if NostrTools is available
      if (typeof window === 'undefined') {
        console.warn('NostrTools not available yet');
        return;
      }

      try {
        if (loadMore) {
          setIsLoadingMore(true);
        } else {
          setIsLoading(true);
        }

        // Build posts params
        const params: { until?: number; limit?: number; authors?: string[] } = {
          limit: QUERY_LIMITS.DEFAULT_POSTS
        };

        // Add following filter if needed
        if (
          feed === 'following' &&
          followingPubkeysRef.current &&
          followingPubkeysRef.current.length > 0
        ) {
          params.authors = [...followingPubkeysRef.current];
        }

        // Add until filter for loading more posts (older posts)
        if (loadMore) {
          // Get current state from store (for async safety)
          const storeState = usePostStore.getState();
          const currentPosts =
            feed === 'following'
              ? storeState.followingPosts
              : storeState.posts;
          if (currentPosts.length > 0) {
            // Get the oldest post (last in the array since they're sorted newest first)
            const oldestPost = currentPosts[currentPosts.length - 1];
            if (oldestPost) {
              params.until = oldestPost.createdAt;
              console.log(
                'Loading more posts until:',
                oldestPost.createdAt,
                'for post:',
                oldestPost.id
              );
            }
          }
        }
        // Fetch posts via react-query ensure
        // If following too many authors, batch the queries to avoid relay errors
        let kind1Events: Kind1Event[];
        if (
          feed === 'following' &&
          params.authors &&
          params.authors.length > 100
        ) {
          console.log(
            `Batching ${params.authors.length} authors into queries of 100`
          );
          const batchSize = QUERY_LIMITS.BATCH_SIZE;
          const numBatches = Math.ceil(params.authors.length / batchSize);
          // Calculate limit per batch to ensure total doesn't exceed desired limit
          // Add 50% buffer to account for deduplication across batches
          const batchLimit = loadMore
            ? params.limit // For loadMore, use full limit per batch
            : Math.ceil(
                ((params.limit || QUERY_LIMITS.DEFAULT_POSTS) *
                  QUERY_LIMITS.BATCH_MULTIPLIER) /
                  numBatches
              ); // For initial load, distribute limit across batches
          const batches: Kind1Event[] = [];

          for (let i = 0; i < params.authors.length; i += batchSize) {
            const authorBatch = params.authors.slice(i, i + batchSize);
            console.log(
              `Loading batch ${Math.floor(i / batchSize) + 1} of ${numBatches}: ${authorBatch.length} authors (limit: ${batchLimit})`
            );

            try {
              const events = await ensurePosts(
                getQueryClient(),
                nostrClientRef.current!,
                {
                  until: params.until,
                  limit: batchLimit,
                  authors: authorBatch
                }
              );
              batches.push(...events);
            } catch (err) {
              console.warn(`Failed to load batch ${i / batchSize + 1}:`, err);
            }
          }

          // Deduplicate events by ID
          const uniqueEvents = new Map<string, Kind1Event>();
          batches.forEach(event => uniqueEvents.set(event.id, event));
          kind1Events = Array.from(uniqueEvents.values());
        } else {
          // Fetch posts via react-query ensure
          kind1Events = await ensurePosts(
            getQueryClient(),
            nostrClientRef.current!,
            {
              until: params.until,
              limit: params.limit,
              authors: params.authors
            }
          );
        }

        // Deduplicate events by ID (multiple relays may return same events)
        const uniqueEventsMap = new Map<string, Kind1Event>();
        kind1Events.forEach(event => {
          if (!uniqueEventsMap.has(event.id)) {
            uniqueEventsMap.set(event.id, event);
          }
        });
        let deduplicatedEvents = Array.from(uniqueEventsMap.values());

        // Sort by created_at (newest first)
        deduplicatedEvents.sort((a, b) => b.created_at - a.created_at);

        // Apply limit only on initial load (not on loadMore to get all unique posts)
        if (!loadMore) {
          const targetLimit = params.limit || QUERY_LIMITS.DEFAULT_POSTS;
          deduplicatedEvents = deduplicatedEvents.slice(0, targetLimit);

          // Safety check: ensure we never exceed the limit on initial load
          if (deduplicatedEvents.length > targetLimit) {
            console.warn(
              `Posts exceeded limit (${deduplicatedEvents.length} > ${targetLimit}), truncating`
            );
            deduplicatedEvents = deduplicatedEvents.slice(0, targetLimit);
          }
        }

        kind1Events = deduplicatedEvents;

        if (!kind1Events || kind1Events.length === 0) {
          if (loadMore) {
            setIsLoadingMore(false);
          } else {
            setIsLoading(false);
          }
          return;
        }

        // PROGRESSIVE RENDERING: Show posts immediately with minimal data
        // Process posts with empty profiles first (no blocking on profile/zap loading)
        const basicPosts = await processPostsBasic(kind1Events, []);

        // Show posts immediately to user (progressive rendering)
        if (loadMore) {
          const storeState = usePostStore.getState();
          if (feed === 'following') {
            const current = storeState.followingPosts;
            // Filter out duplicates based on post ID
            const existingIds = new Set(current.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
            setFollowingPosts([...current, ...newPosts]);
          } else {
            const current = storeState.posts;
            // Filter out duplicates based on post ID
            const existingIds = new Set(current.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
            setPosts([...current, ...newPosts]);
          }
          setIsLoadingMore(false);
        } else {
          if (feed === 'following') {
            setFollowingPosts(basicPosts);
          } else {
            setPosts(basicPosts);
          }
          setIsLoading(false);
        }

        // Load profiles, zaps, and zap payer profiles in background (non-blocking)
        // These will update the posts progressively when ready
        // FIX: Use safeAsync to prevent memory leaks if component unmounts
        safeAsync(async () => {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            kind1Events,
            { genericUserIcon }
          );

          // Check if aborted before continuing
          if (isAborted) return;

          const zapEvents = postData.zaps;
          const allProfiles = postData.profiles; // Map of all profiles (authors + zap payers)

          // Update posts with profiles (progressive enhancement)
          const storeState = usePostStore.getState();
          if (feed === 'following') {
            const current = storeState.followingPosts;
            setFollowingPosts(
              current.map(post => {
                const event = kind1Events.find(e => e.id === post.id);
                if (!event) return post;

                const author = allProfiles.get(event.pubkey) || null;
                return updatePostWithProfileData(post, event, author);
              })
            );
          } else {
            const current = storeState.posts;
            setPosts(
              current.map(post => {
                const event = kind1Events.find(e => e.id === post.id);
                if (!event) return post;

                const author = allProfiles.get(event.pubkey) || null;
                return updatePostWithProfileData(post, event, author);
              })
            );
          }

          // Check if aborted before continuing
          if (isAborted) return;

          // Load zaps and update posts (progressive enhancement)
          // Make sure zap payer profiles are loaded before processing zaps
          if (zapEvents.length > 0) {
            // loadPostData already loaded all zap payer profiles, so we can use them directly
            // Now load zaps with all profiles available
            await loadZapsForPosts(
              kind1Events,
              zapEvents,
              feed,
              Array.from(allProfiles.values())
            );
          }

          // Check if aborted before setting timeout
          if (isAborted) return;

          // Validate lightning addresses asynchronously (don't block UI)
          // Use a small delay to ensure state has updated
          // Note: Timeout is inside safeAsync, so it will be cancelled if component unmounts
          setTimeout(() => {
            if (isAborted) return;
            const storeState = usePostStore.getState();
            if (feed === 'following') {
              validateLightningAddresses(storeState.followingPosts, feed);
              validateNip05s(storeState.followingPosts, feed);
            } else {
              validateLightningAddresses(storeState.posts, feed);
              validateNip05s(storeState.posts, feed);
            }
          }, TIMEOUT.SHORT_DELAY);

          // Note: We can't easily clean up this timeout if component unmounts,
          // but the validation functions will check isAborted internally
        }, signal);
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (isAbortError(err)) {
          console.log('loadPosts aborted (component unmounted)');
          return;
        }
        console.error('Failed to load posts:', err);
        console.error(
          'Failed to load posts:',
          err instanceof Error ? err.message : 'Failed to load posts'
        );
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [
      nostrClientRef,
      followingPubkeysRef,
      setIsLoading,
      setIsLoadingMore,
      setPosts,
      setFollowingPosts,
      processPostsBasic,
      loadZapsForPosts,
      validateLightningAddresses,
      validateNip05s,
      signal,
      isAborted
    ]
  );

  const loadFollowingPosts = useCallback(async () => {
    if (!authState.isLoggedIn || !nostrClientRef.current) return;

    try {
      // Load kind 3 (contacts) to get following list
      const kind3Events = await nostrClientRef.current.getEvents([
        {
          kinds: [3],
          authors: [authState.publicKey!]
        }
      ]);

      const followingPubkeys: string[] = [];
      for (const event of kind3Events) {
        const pTags = event.tags.filter(tag => tag[0] === 'p');
        followingPubkeys.push(
          ...pTags
            .map(tag => tag[1])
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        );
      }

      followingPubkeysRef.current = followingPubkeys;

      // If user follows nobody, set empty array and don't load posts
      if (followingPubkeys.length === 0) {
        console.log('User follows nobody, setting empty following posts');
        setFollowingPosts([]);
        setIsLoading(false);
        return;
      }

      await loadPosts('following');
    } catch (err) {
      console.error('Failed to load following posts:', err);
      console.error('Failed to load following posts');
    }
  }, [
    authState,
    nostrClientRef,
    followingPubkeysRef,
    setFollowingPosts,
    setIsLoading,
    loadPosts
  ]);

  const loadMorePosts = useCallback(async () => {
    // Get current state from store (for async safety)
    const storeState = usePostStore.getState();
    const currentIsLoadingMore = storeState.isLoadingMore;
    const currentActiveFeed = storeState.activeFeed;
    const currentPosts =
      currentActiveFeed === 'following'
        ? storeState.followingPosts
        : storeState.posts;

    if (currentIsLoadingMore) {
      console.log('Already loading more posts, skipping...');
      return;
    }

    // Check if we have enough posts to load more (like the original)
    if (currentPosts.length < 21) {
      console.log('Not enough posts to load more, skipping...');
      return;
    }

    console.log('Loading more posts...');
    return loadPosts(currentActiveFeed, true);
  }, [loadPosts]);

  // Load replies to a specific note (defined before loadSingleNote since it's used there)
  const loadReplies = useCallback(
    async (parentEventId: string) => {
      // Check if aborted before starting
      if (isAborted) return;

      if (!nostrClientRef.current) return;

      try {
        const replyFilter: NostrFilter = {
          kinds: [1],
          '#e': [parentEventId]
        };

        const cleanFilter = JSON.parse(JSON.stringify(replyFilter));
        const replyEvents = (await nostrClientRef.current.getEvents([
          cleanFilter
        ])) as Kind1Event[];

        if (!replyEvents || replyEvents.length === 0) {
          setReplies([]);
          return;
        }

        // Deduplicate replies by ID
        const uniqueRepliesMap = new Map<string, Kind1Event>();
        replyEvents.forEach(event => {
          if (!uniqueRepliesMap.has(event.id)) {
            uniqueRepliesMap.set(event.id, event);
          }
        });
        const deduplicatedReplies = Array.from(uniqueRepliesMap.values());

        // Sort by created_at (newest first)
        deduplicatedReplies.sort((a, b) => b.created_at - a.created_at);

        console.log('Found replies:', deduplicatedReplies.length);

        // PROGRESSIVE RENDERING: Show replies immediately with minimal data
        const initialReplies = processPostsBasicSync(deduplicatedReplies);
        setReplies(initialReplies);

        // Load profiles, zaps, and zap payer profiles in parallel (non-blocking)
        // FIX: Use safeAsync to prevent memory leaks if component unmounts
        safeAsync(async () => {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            deduplicatedReplies,
            { genericUserIcon }
          );

          // Check if aborted before continuing
          if (isAborted) return;

          const profileMap = postData.profiles;
          const zapEvents = postData.zaps;
          const allProfiles = profileMap; // Already combined in postData.profiles

          // Update replies with profile data (progressive enhancement)
          const currentReplies = usePostStore.getState().replies;
          setReplies(
            currentReplies.map(reply => {
              const event = deduplicatedReplies.find(e => e.id === reply.id);
              if (!event) return reply;

              const author = profileMap.get(event.pubkey);
              return updatePostWithProfileData(reply, event, author);
            })
          );

          // Check if aborted before continuing
          if (isAborted) return;

          // Process and update zaps for replies
          if (zapEvents.length > 0) {
            const processedReplies = await processPosts(
              deduplicatedReplies,
              Array.from(allProfiles.values()),
              zapEvents
            );

            if (processedReplies.length > 0 && !isAborted) {
              setReplies(processedReplies);
            }
          } else {
            // No zaps, just mark as not loading
            if (!isAborted) {
              const current = usePostStore.getState().replies;
              setReplies(
                current.map(reply => ({ ...reply, zapLoading: false }))
              );
            }
          }

          // Check if aborted before continuing
          if (isAborted) return;

          // Validate lightning addresses and NIP-05 asynchronously
          const repliesForValidation = usePostStore.getState().replies;
          validateLightningAddresses(repliesForValidation, 'replies');
          validateNip05s(repliesForValidation, 'replies');

          // Check if aborted before continuing
          if (isAborted) return;

          // Calculate reply levels for proper indentation
          const repliesForLevels = usePostStore.getState().replies;
          const sortedReplies = [...repliesForLevels].sort(
            (a, b) => a.createdAt - b.createdAt
          );
          setReplies(calculateReplyLevels(sortedReplies) as PubPayPost[]);
        }, signal);
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (isAbortError(err)) {
          console.log('loadReplies aborted (component unmounted)');
          return;
        }
        console.error('Failed to load replies:', err);
      }
    },
    [
      nostrClientRef,
      setReplies,
      processPostsBasicSync,
      processPosts,
      validateLightningAddresses,
      validateNip05s,
      signal,
      isAborted
    ]
  );

  // Load single note and its replies
  const loadSingleNote = useCallback(
    async (eventId: string) => {
      // Check if aborted before starting
      if (isAborted) return;

      if (!nostrClientRef.current) {
        console.warn('NostrClient not available yet');
        return;
      }

      // Check if NostrTools is available
      if (typeof window === 'undefined') {
        console.warn('NostrTools not available yet');
        return;
      }

      try {
        setIsLoading(true);

        // Clear existing posts when loading single note
        setPosts([]);
        setReplies([]);

        // Load the specific note
        const filter: NostrFilter = {
          kinds: [1],
          ids: [eventId]
        };

        const cleanFilter = JSON.parse(JSON.stringify(filter));
        const kind1Events = (await nostrClientRef.current.getEvents([
          cleanFilter
        ])) as Kind1Event[];

        if (!kind1Events || kind1Events.length === 0) {
          console.log('Note not found');
          setIsLoading(false);
          return;
        }

        // Deduplicate events by ID (multiple relays may return same events)
        const uniqueEventsMap = new Map<string, Kind1Event>();
        kind1Events.forEach(event => {
          if (!uniqueEventsMap.has(event.id)) {
            uniqueEventsMap.set(event.id, event);
          }
        });
        const deduplicatedEvents = Array.from(uniqueEventsMap.values());

        console.log('Found single note:', deduplicatedEvents[0]);

        const authorPubkey = deduplicatedEvents[0]?.pubkey;
        if (!authorPubkey) {
          console.error('No author pubkey found');
          setIsLoading(false);
          return;
        }

        // PROGRESSIVE RENDERING: Show post immediately with minimal data
        const initialPosts = processPostsBasicSync(deduplicatedEvents);
        setPosts(initialPosts);
        setIsLoading(false);

        // Load profiles, zaps, and zap payer profiles in parallel (non-blocking)
        // FIX: Use safeAsync to prevent memory leaks if component unmounts
        safeAsync(async () => {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            deduplicatedEvents,
            { genericUserIcon }
          );

          // Check if aborted before continuing
          if (isAborted) return;

          const profileMap = postData.profiles;
          const zapEvents = postData.zaps;
          const allProfiles = profileMap; // Already combined in postData.profiles

          // Update post with profile data (progressive enhancement)
          const currentPosts = usePostStore.getState().posts;
          setPosts(
            currentPosts.map(post => {
              const event = deduplicatedEvents.find(e => e.id === post.id);
              if (!event) return post;

              const author = profileMap.get(event.pubkey);
              return updatePostWithProfileData(post, event, author);
            })
          );

          // Check if aborted before continuing
          if (isAborted) return;

          // Process and update zaps
          if (zapEvents.length > 0) {
            const processedPosts = await processPosts(
              deduplicatedEvents,
              Array.from(allProfiles.values()),
              zapEvents
            );

            if (processedPosts.length > 0 && !isAborted) {
              setPosts(processedPosts);
            }
          } else {
            // No zaps, just mark as not loading
            if (!isAborted) {
              const current = usePostStore.getState().posts;
              setPosts(current.map(post => ({ ...post, zapLoading: false })));
            }
          }

          // Check if aborted before continuing
          if (isAborted) return;

          // Validate lightning addresses and NIP-05 asynchronously
          const postsForValidation = usePostStore.getState().posts;
          validateLightningAddresses(postsForValidation, 'global');
          validateNip05s(postsForValidation, 'global');

          // Load replies in background (non-blocking)
          if (!isAborted) {
            loadReplies(eventId).catch(err => {
              if (!isAbortError(err)) {
                console.error('Failed to load replies:', err);
              }
            });
          }
        }, signal);

        // Signal ready after essentials are loaded
        setNostrReady(true);
      } catch (err) {
        // Ignore abort errors (component unmounted)
        if (isAbortError(err)) {
          console.log('loadSingleNote aborted (component unmounted)');
          return;
        }
        console.error('Failed to load single note:', err);
        setIsLoading(false);
      }
    },
    [
      nostrClientRef,
      setIsLoading,
      setPosts,
      setReplies,
      setNostrReady,
      processPostsBasicSync,
      processPosts,
      validateLightningAddresses,
      validateNip05s,
      loadReplies,
      signal,
      isAborted
    ]
  );

  return {
    loadPosts,
    loadFollowingPosts,
    loadMorePosts,
    loadSingleNote,
    loadReplies
  };
};

