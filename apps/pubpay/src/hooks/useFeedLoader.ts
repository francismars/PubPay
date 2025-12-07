import { NostrClient } from '@pubpay/shared-services';
import { ensureProfiles, ensurePosts, getQueryClient, loadPostData } from '@pubpay/shared-services';
import { extractZapPayerPubkeys, processZaps, type ProcessedZap } from '@pubpay/shared-services';
import {
  extractPostZapTags,
  calculateIsPayable,
  getZapPayerProfile,
  getAuthorPaymentInfo
} from '@pubpay/shared-services';
import { Kind1Event, Kind0Event, Kind9735Event, NostrFilter } from '@pubpay/shared-types';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import { nip19 } from 'nostr-tools';
import * as bolt11 from 'bolt11';
import { genericUserIcon } from '../assets/images';
import { TIMEOUT, QUERY_LIMITS } from '../constants';
import type { PubPayPost, FeedType, AuthState } from '../types/postTypes';
import { processPostsBasic, processPostsBasicSync, calculateReplyLevels } from '../utils/postProcessing';
import { isZapWithinLimits } from '../utils/zapProcessing';
import { extractLightningAddresses, extractNip05s, validateLightningAddress, validateNip05 } from '../utils/validation';

interface UseFeedLoaderOptions {
  // State setters
  setPosts: React.Dispatch<React.SetStateAction<PubPayPost[]>>;
  setFollowingPosts: React.Dispatch<React.SetStateAction<PubPayPost[]>>;
  setReplies: React.Dispatch<React.SetStateAction<PubPayPost[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  setNostrReady: React.Dispatch<React.SetStateAction<boolean>>;
  // State values
  posts: PubPayPost[];
  followingPosts: PubPayPost[];
  activeFeed: 'global' | 'following';
  isLoadingMore: boolean;
  // Refs
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  followingPubkeysRef: React.MutableRefObject<string[]>;
  newestPostTimestampRef: React.MutableRefObject<number>;
  postsRef: React.MutableRefObject<PubPayPost[]>;
  followingPostsRef: React.MutableRefObject<PubPayPost[]>;
  repliesRef: React.MutableRefObject<PubPayPost[]>;
  profileCacheRef: React.MutableRefObject<Map<string, Kind0Event>>;
  pendingProfileRequestsRef: React.MutableRefObject<Set<string>>;
  validatingLightningAddressesRef: React.MutableRefObject<Set<string>>;
  validatingNip05sRef: React.MutableRefObject<Set<string>>;
  // Auth state (for loadFollowingPosts)
  authState: AuthState;
}

export const useFeedLoader = (options: UseFeedLoaderOptions) => {
  const {
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    posts,
    followingPosts,
    activeFeed,
    isLoadingMore,
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    postsRef,
    followingPostsRef,
    repliesRef,
    profileCacheRef,
    pendingProfileRequestsRef,
    validatingLightningAddressesRef,
    validatingNip05sRef,
    authState
  } = options;

  // Batched profile loading to prevent duplicate requests
  const loadProfilesBatched = async (
    pubkeys: string[]
  ): Promise<Map<string, Kind0Event>> => {
    const profiles = new Map<string, Kind0Event>();
    const uncachedPubkeys: string[] = [];

    // Check cache first
    for (const pubkey of pubkeys) {
      const cached = profileCacheRef.current.get(pubkey);
      if (cached) {
        profiles.set(pubkey, cached);
      } else if (!pendingProfileRequestsRef.current.has(pubkey)) {
        uncachedPubkeys.push(pubkey);
      }
    }

    // Load uncached profiles in batches
    if (uncachedPubkeys.length > 0 && nostrClientRef.current) {
      // Mark as pending to prevent duplicate requests
      uncachedPubkeys.forEach(pubkey =>
        pendingProfileRequestsRef.current.add(pubkey)
      );

      try {
        // Use ensureProfiles for centralized profile loading
        const profileMap = await ensureProfiles(
          getQueryClient(),
          nostrClientRef.current!,
          uncachedPubkeys
        );
        const profileEvents = Array.from(profileMap.values());

        // Cache the results
        profileEvents.forEach(profile => {
          profileCacheRef.current.set(profile.pubkey, profile);
          profiles.set(profile.pubkey, profile);
        });

        // Remove from pending
        uncachedPubkeys.forEach(pubkey =>
          pendingProfileRequestsRef.current.delete(pubkey)
        );
      } catch (error) {
        console.error('Error loading profiles:', error);
        // Remove from pending on error
        uncachedPubkeys.forEach(pubkey =>
          pendingProfileRequestsRef.current.delete(pubkey)
        );
      }
    }

    return profiles;
  };

  // Process posts with basic info only (like legacy drawKind1)
  // Uses extracted utility function
  const processPostsBasicLocal = async (
    kind1Events: Kind1Event[],
    profileEvents: Kind0Event[]
  ): Promise<PubPayPost[]> => {
    return processPostsBasic(kind1Events, profileEvents, loadProfilesBatched);
  };

  // Process posts synchronously for immediate display (no async profile/zap loading)
  // Uses extracted utility function
  const processPostsBasicSyncLocal = (kind1Events: Kind1Event[]): PubPayPost[] => {
    return processPostsBasicSync(kind1Events);
  };

  // Validate lightning addresses for posts asynchronously
  const validateLightningAddresses = async (
    posts: PubPayPost[],
    feed: FeedType
  ) => {
    // Extract unique lightning addresses from posts using utility
    const lightningAddresses = extractLightningAddresses(posts);

    // Validate each unique lightning address (only once per address)
    for (const [lud16, postsWithAddress] of lightningAddresses.entries()) {
      // Skip if already validating or validated
      if (validatingLightningAddressesRef.current.has(lud16)) {
        continue;
      }

      // Mark as validating
      validatingLightningAddressesRef.current.add(lud16);

      // Validate asynchronously (fire and forget) using utility
      validateLightningAddress(lud16, postsWithAddress)
        .then(({ updatedPosts }) => {
          // Update all posts with this lightning address using functional updates
          const updatePost = (post: PubPayPost) => {
            const updated = updatedPosts.find(p => p.id === post.id);
            return updated || post;
          };

          if (feed === 'following') {
            setFollowingPosts(prev => prev.map(updatePost));
          } else if (feed === 'replies') {
            setReplies(prev => prev.map(updatePost));
          } else {
            setPosts(prev => prev.map(updatePost));
          }
        })
        .finally(() => {
          // Remove from validating set
          validatingLightningAddressesRef.current.delete(lud16);
        });
    }
  };

  const validateNip05s = async (
    posts: PubPayPost[],
    feed: FeedType
  ) => {
    // Extract unique NIP-05 identifiers from posts using utility
    const nip05s = extractNip05s(posts);

    // Validate each unique NIP-05 identifier (only once per identifier:pubkey combo)
    for (const [key, { nip05, pubkey, posts: postsWithNip05 }] of nip05s.entries()) {
      // Skip if already validating
      if (validatingNip05sRef.current.has(key)) {
        continue;
      }

      // Mark as validating
      validatingNip05sRef.current.add(key);

      // Set validating state for all posts with this NIP-05
      const setValidating = (post: PubPayPost) => {
        if (postsWithNip05.some(p => p.id === post.id)) {
          return { ...post, nip05Validating: true };
        }
        return post;
      };

      if (feed === 'following') {
        setFollowingPosts(prev => prev.map(setValidating));
      } else if (feed === 'replies') {
        setReplies(prev => prev.map(setValidating));
      } else {
        setPosts(prev => prev.map(setValidating));
      }

      // Validate asynchronously (fire and forget) using utility
      validateNip05(nip05, pubkey, postsWithNip05)
        .then(({ updatedPosts }) => {
          // Update all posts with this NIP-05 using functional updates
          const updatePost = (post: PubPayPost) => {
            const updated = updatedPosts.find(p => p.id === post.id);
            return updated || post;
          };

          if (feed === 'following') {
            setFollowingPosts(prev => prev.map(updatePost));
          } else if (feed === 'replies') {
            setReplies(prev => prev.map(updatePost));
          } else {
            setPosts(prev => prev.map(updatePost));
          }
        })
        .finally(() => {
          // Remove from validating set
          validatingNip05sRef.current.delete(key);
        });
    }
  };

  // Load zaps separately and update posts (like legacy subscribeKind9735)
  const loadZapsForPosts = async (
    kind1Events: Kind1Event[],
    zapEvents: Kind9735Event[],
    feed: 'global' | 'following',
    existingProfiles: Kind0Event[] = []
  ) => {
    const eventIds = kind1Events.map(event => event.id);
    const relevantZaps = zapEvents.filter(zap =>
      zap.tags.some(
        tag => tag[0] === 'e' && tag[1] && eventIds.includes(tag[1])
      )
    );

    if (relevantZaps.length === 0) return;

    // Extract zap payer pubkeys using utility function
    // Note: We need to pass the posts' events to extract zap-payer tags
    const postEvents = kind1Events;
    const zapPayerPubkeys = extractZapPayerPubkeys(postEvents, relevantZaps);

    // Load zap payer profiles (cached & batched)
    // Use existing profiles if provided, otherwise load them
    let zapPayerProfiles: Kind0Event[] = [];
    if (existingProfiles.length > 0) {
      // Use existing profiles if available
      zapPayerProfiles = existingProfiles.filter(p =>
        Array.from(zapPayerPubkeys).includes(p.pubkey)
      );
      // Load any missing profiles
      const missingPubkeys = Array.from(zapPayerPubkeys).filter(
        (pubkey: string) => !zapPayerProfiles.some(p => p.pubkey === pubkey)
      );
      if (missingPubkeys.length > 0) {
        const additionalProfiles = Array.from(
          (await loadProfilesBatched(missingPubkeys as string[])).values()
        );
        zapPayerProfiles = [...zapPayerProfiles, ...additionalProfiles];
      }
    } else {
      // Load all profiles if none provided
      zapPayerProfiles =
        zapPayerPubkeys.size > 0
          ? Array.from(
              (await loadProfilesBatched(Array.from(zapPayerPubkeys))).values()
            )
          : [];
    }

    // Update posts with zap data
    const updatePostsWithZaps = (currentPosts: PubPayPost[]) => {
      return currentPosts.map(post => {
        // Filter zaps for this post
        let postZaps = relevantZaps.filter(zap =>
          zap.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        );

        // If post has zap-payer tag, only include zaps from that specific payer
        if (post.zapPayer) {
          postZaps = postZaps.filter(zap => {
            const descriptionTag = zap.tags.find(
              tag => tag[0] === 'description'
            );
            if (descriptionTag) {
              try {
                const zapData =
                  parseZapDescription(descriptionTag[1] || undefined) || {};
                // Check if zap is from the specified zap-payer
                return zapData.pubkey === post.zapPayer;
              } catch {
                return false;
              }
            }
            return false;
          });
        }

        postZaps = postZaps.reverse();

        if (postZaps.length === 0) return post;

        // Process zaps for this post
        const processedZaps: ProcessedZap[] = postZaps.map(zap => {
          const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
          let zapAmount = 0;
          if (bolt11Tag) {
            try {
              const decoded = bolt11.decode(bolt11Tag[1] || '');
              zapAmount = decoded.satoshis || 0;
            } catch {
              zapAmount = 0;
            }
          }

          const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
          let zapPayerPubkey = zap.pubkey;
          let zapContent = '';

          if (descriptionTag) {
            try {
              const zapData = parseZapDescription(
                descriptionTag[1] || undefined
              );
              if (zapData?.pubkey) {
                zapPayerPubkey = zapData.pubkey;
              }
              // Extract content from zap description (the zap message/comment)
              if (
                zapData &&
                'content' in zapData &&
                typeof zapData.content === 'string'
              ) {
                zapContent = zapData.content;
              }
            } catch {
              // Fallback to zap.pubkey if description parsing fails
            }
          }

          const zapPayerProfile = zapPayerProfiles.find(
            p => p.pubkey === zapPayerPubkey
          );
          const zapPayerPicture = zapPayerProfile && zapPayerProfile.content && zapPayerProfile.content !== '{}'
            ? (
                safeJson<Record<string, unknown>>(
                  zapPayerProfile.content || '{}',
                  {}
                ) as any
              ).picture || genericUserIcon
            : genericUserIcon;

          // Generate npub for the zap payer
          const zapPayerNpub = nip19.npubEncode(zapPayerPubkey);

          return {
            ...zap,
            zapAmount,
            zapPayerPubkey,
            zapPayerPicture,
            zapPayerNpub,
            content: zapContent
          };
        });

        // Preserve chronological order (oldest first) established by postZaps.reverse() above
        // Do not sort by amount, to keep arrival order stable

        // Filter zaps by amount limits for usage counting (matches legacy behavior)
        const zapsWithinLimits = processedZaps.filter(zap =>
          isZapWithinLimits(zap.zapAmount, post.zapMin, post.zapMax)
        );

        const totalZapAmount = processedZaps.reduce(
          (sum, zap) => sum + zap.zapAmount,
          0
        );
        // Cap uses at declared zapUses so extra in-range payments beyond cap do not count
        const zapUsesCurrent =
          post.zapUses && post.zapUses > 0
            ? Math.min(zapsWithinLimits.length, post.zapUses)
            : zapsWithinLimits.length;

        return {
          ...post,
          zaps: processedZaps,
          zapAmount: totalZapAmount,
          zapUsesCurrent // Only update current count, not the target from note tag
        };
      });
    };

    // Update the appropriate posts array
    if (feed === 'following') {
      setFollowingPosts(prev => updatePostsWithZaps(prev));
    } else {
      setPosts(prev => updatePostsWithZaps(prev));
    }
  };

  const processPosts = async (
    kind1Events: Kind1Event[],
    profileEvents: Kind0Event[],
    zapEvents: Kind9735Event[]
  ): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    // Convert profileEvents array to Map for faster lookup
    const profileMap = new Map<string, Kind0Event>();
    profileEvents.forEach(profile => {
      profileMap.set(profile.pubkey, profile);
    });

    for (const event of kind1Events) {
      const author = profileMap.get(event.pubkey) || null;
      const zaps = zapEvents
        .filter(z => z.tags.some(tag => tag[0] === 'e' && tag[1] === event.id))
        .reverse();

      // Process zaps using utility function
      const processedZaps = processZaps(zaps, profileMap, genericUserIcon);

      const totalZapAmount = processedZaps.reduce(
        (sum: number, zap: ProcessedZap) => sum + zap.zapAmount,
        0
      );

      // Extract zap tags using utility function
      const zapTags = extractPostZapTags(event);

      // Filter zaps by amount limits for usage counting (matches legacy behavior)
      const zapsWithinLimits = processedZaps.filter((zap: ProcessedZap) =>
        isZapWithinLimits(zap.zapAmount, zapTags.zapMin, zapTags.zapMax)
      );

      const zapUsesCurrent = zapsWithinLimits.length;

      // Get zap-payer profile picture and name if zap-payer tag exists
      const zapPayerInfo = getZapPayerProfile(zapTags.zapPayer, profileMap, genericUserIcon);

      // Check if payable and get author payment info
      const authorPaymentInfo = getAuthorPaymentInfo(author);
      const isPayable = calculateIsPayable(author, zapTags);
      const lightningValidating = authorPaymentInfo.hasLud16;
      const nip05Validating = authorPaymentInfo.hasNip05;

      posts.push({
        id: event.id,
        event,
        author: author || null,
        zaps: processedZaps,
        zapAmount: totalZapAmount,
        zapMin: zapTags.zapMin,
        zapMax: zapTags.zapMax,
        zapUses: zapTags.zapUses,
        zapUsesCurrent,
        zapGoal: zapTags.zapGoal,
        content: event.content,
        isPayable,
        hasZapTags: zapTags.hasZapTags,
        zapPayer: zapTags.zapPayer,
        zapPayerPicture: zapPayerInfo.picture,
        zapPayerName: zapPayerInfo.name,
        zapLNURL: zapTags.zapLNURL,
        createdAt: event.created_at,
        lightningValidating,
        nip05Validating
      });
    }

    // Sort by creation time (newest first)
    const sortedPosts = posts.sort((a, b) => b.createdAt - a.createdAt);

    // Update newest post timestamp for subscription management
    if (sortedPosts.length > 0) {
      newestPostTimestampRef.current = sortedPosts[0].createdAt;
    }

    return sortedPosts;
  };

  const loadPosts = async (feed: 'global' | 'following', loadMore = false) => {
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
        const currentPosts = feed === 'following' ? followingPosts : posts;
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
          : Math.ceil((params.limit || QUERY_LIMITS.DEFAULT_POSTS) * QUERY_LIMITS.BATCH_MULTIPLIER / numBatches); // For initial load, distribute limit across batches
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
          console.warn(`Posts exceeded limit (${deduplicatedEvents.length} > ${targetLimit}), truncating`);
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
      const basicPosts = await processPostsBasicLocal(kind1Events, []);

      // Show posts immediately to user (progressive rendering)
      if (loadMore) {
        if (feed === 'following') {
          setFollowingPosts(prev => {
            // Filter out duplicates based on post ID
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
            return [...prev, ...newPosts];
          });
        } else {
          setPosts(prev => {
            // Filter out duplicates based on post ID
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
            return [...prev, ...newPosts];
          });
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
      (async () => {
        try {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            kind1Events,
            { genericUserIcon }
          );

          const zapEvents = postData.zaps;
          const allProfiles = postData.profiles; // Map of all profiles (authors + zap payers)

          // Update posts with profiles (progressive enhancement)
          const updatePostWithProfile = (post: PubPayPost, event: Kind1Event, author: Kind0Event | null): PubPayPost => {
            if (!author || author.content === '{}') {
              // Still loading, keep loading state
              return post;
            }

            // Profile loaded, clear loading state
            const updatedPost = { ...post, author, profileLoading: false };

            // Recalculate isPayable and related fields based on author profile
            try {
              const authorData = safeJson<Record<string, any>>(author.content || '{}', {});
              const hasLud16 = !!(authorData as any).lud16;
              const hasNip05 = !!(authorData as any).nip05;

              // Extract zap tags from event
              const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
              const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
              const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');
              const hasZapTags = !!(zapMinTag || zapMaxTag || event.tags.find(tag => tag[0] === 'zap-uses') || event.tags.find(tag => tag[0] === 'zap-goal'));
              const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

              updatedPost.hasZapTags = hasZapTags;
              updatedPost.isPayable = (hasLud16 || !!(updatedPost as any).zapLNURL) && hasPaymentAmount;

              // Mark as validating if we have a lightning address or NIP-05
              if (hasLud16) {
                updatedPost.lightningValidating = true;
              }
              if (hasNip05) {
                updatedPost.nip05Validating = true;
              }
            } catch {
              // Keep existing values on error
            }

            return updatedPost;
          };

          if (feed === 'following') {
            setFollowingPosts(prev => {
              return prev.map(post => {
                const event = kind1Events.find(e => e.id === post.id);
                if (!event) return post;

                const author = allProfiles.get(event.pubkey) || null;
                return updatePostWithProfile(post, event, author);
              });
            });
          } else {
            setPosts(prev => {
              return prev.map(post => {
                const event = kind1Events.find(e => e.id === post.id);
                if (!event) return post;

                const author = allProfiles.get(event.pubkey) || null;
                return updatePostWithProfile(post, event, author);
              });
            });
          }

          // Load zaps and update posts (progressive enhancement)
          // Make sure zap payer profiles are loaded before processing zaps
          if (zapEvents.length > 0) {
            // loadPostData already loaded all zap payer profiles, so we can use them directly
            // Now load zaps with all profiles available
            await loadZapsForPosts(kind1Events, zapEvents, feed, Array.from(allProfiles.values()));
          }

          // Validate lightning addresses asynchronously (don't block UI)
          // Use a small delay to ensure state has updated
          setTimeout(() => {
            if (feed === 'following') {
              validateLightningAddresses(followingPostsRef.current, feed);
              validateNip05s(followingPostsRef.current, feed);
            } else {
              validateLightningAddresses(postsRef.current, feed);
              validateNip05s(postsRef.current, feed);
            }
          }, TIMEOUT.SHORT_DELAY);
        } catch (err) {
          console.error('Error loading profiles/zaps in background:', err);
          // Don't fail the whole load if background updates fail
        }
      })();
    } catch (err) {
      console.error('Failed to load posts:', err);
      console.error(
        'Failed to load posts:',
        err instanceof Error ? err.message : 'Failed to load posts'
      );
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadFollowingPosts = async () => {
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
  };

  const loadMorePosts = async () => {
    if (isLoadingMore) {
      console.log('Already loading more posts, skipping...');
      return;
    }

    // Check if we have enough posts to load more (like the original)
    const currentPosts = activeFeed === 'following' ? followingPosts : posts;
    if (currentPosts.length < 21) {
      console.log('Not enough posts to load more, skipping...');
      return;
    }

    console.log('Loading more posts...');
    return loadPosts(activeFeed, true);
  };

  // Load single note and its replies
  const loadSingleNote = async (eventId: string) => {
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
      const initialPosts = processPostsBasicSyncLocal(deduplicatedEvents);
      setPosts(initialPosts);
      setIsLoading(false);

      // Load profiles, zaps, and zap payer profiles in parallel (non-blocking)
      (async () => {
        try {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            deduplicatedEvents,
            { genericUserIcon }
          );

          const profileMap = postData.profiles;
          const zapEvents = postData.zaps;
          const allProfiles = profileMap; // Already combined in postData.profiles

          // Update post with profile data (progressive enhancement)
          const updatePostWithProfile = (post: PubPayPost, event: Kind1Event, author: Kind0Event | undefined): PubPayPost => {
            if (!author || author.content === '{}') {
              return post;
            }

            const updatedPost = { ...post, author, profileLoading: false };

            // Recalculate isPayable based on author profile
            try {
              const authorData = safeJson<Record<string, any>>(author.content || '{}', {});
              const hasLud16 = !!(authorData as any).lud16;
              const hasNip05 = !!(authorData as any).nip05;

              const zapMinTag = event.tags.find((tag: any[]) => tag[0] === 'zap-min');
              const zapMaxTag = event.tags.find((tag: any[]) => tag[0] === 'zap-max');
              const zapLNURLTag = event.tags.find((tag: any[]) => tag[0] === 'zap-lnurl');
              const hasZapTags = !!(zapMinTag || zapMaxTag || event.tags.find((tag: any[]) => tag[0] === 'zap-uses') || event.tags.find((tag: any[]) => tag[0] === 'zap-goal'));
              const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

              updatedPost.hasZapTags = hasZapTags;
              updatedPost.isPayable = (hasLud16 || !!(updatedPost as any).zapLNURL) && hasPaymentAmount;

              if (hasLud16) {
                updatedPost.lightningValidating = true;
              }
              if (hasNip05) {
                updatedPost.nip05Validating = true;
              }
            } catch {
              // Keep existing values on error
            }

            return updatedPost;
          };

          setPosts(prev => {
            return prev.map(post => {
              const event = deduplicatedEvents.find(e => e.id === post.id);
              if (!event) return post;

              const author = profileMap.get(event.pubkey);
              return updatePostWithProfile(post, event, author);
            });
          });

          // Process and update zaps
          if (zapEvents.length > 0) {
            const processedPosts = await processPosts(
              deduplicatedEvents,
              Array.from(allProfiles.values()),
              zapEvents
            );

            if (processedPosts.length > 0) {
              setPosts(processedPosts);
            }
          } else {
            // No zaps, just mark as not loading
            setPosts(prev => prev.map(post => ({ ...post, zapLoading: false })));
          }

          // Validate lightning addresses and NIP-05 asynchronously
          setPosts(prev => {
            validateLightningAddresses(prev, 'global');
            validateNip05s(prev, 'global');
            return prev;
          });

          // Load replies in background (non-blocking)
          loadReplies(eventId).catch(err => {
            console.error('Failed to load replies:', err);
          });
        } catch (err) {
          console.error('Error loading profiles/zaps in background:', err);
        }
      })();

      // Signal ready after essentials are loaded
      setNostrReady(true);
    } catch (err) {
      console.error('Failed to load single note:', err);
      setIsLoading(false);
    }
  };

  // Load replies to a specific note
  const loadReplies = async (parentEventId: string) => {
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
      const initialReplies = processPostsBasicSyncLocal(deduplicatedReplies);
      setReplies(initialReplies);

      // Load profiles, zaps, and zap payer profiles in parallel (non-blocking)
      (async () => {
        try {
          // Use unified loadPostData utility to load all related data
          const postData = await loadPostData(
            getQueryClient(),
            nostrClientRef.current!,
            deduplicatedReplies,
            { genericUserIcon }
          );

          const profileMap = postData.profiles;
          const zapEvents = postData.zaps;
          const allProfiles = profileMap; // Already combined in postData.profiles

          // Update replies with profile data (progressive enhancement)
          const updateReplyWithProfile = (reply: PubPayPost, event: Kind1Event, author: Kind0Event | undefined): PubPayPost => {
            if (!author || author.content === '{}') {
              return reply;
            }

            const updatedReply = { ...reply, author, profileLoading: false };

            // Recalculate isPayable based on author profile
            try {
              const authorData = safeJson<Record<string, any>>(author.content || '{}', {});
              const hasLud16 = !!(authorData as any).lud16;
              const hasNip05 = !!(authorData as any).nip05;

              const zapMinTag = event.tags.find((tag: any[]) => tag[0] === 'zap-min');
              const zapMaxTag = event.tags.find((tag: any[]) => tag[0] === 'zap-max');
              const zapLNURLTag = event.tags.find((tag: any[]) => tag[0] === 'zap-lnurl');
              const hasZapTags = !!(zapMinTag || zapMaxTag || event.tags.find((tag: any[]) => tag[0] === 'zap-uses') || event.tags.find((tag: any[]) => tag[0] === 'zap-goal'));
              const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

              updatedReply.hasZapTags = hasZapTags;
              updatedReply.isPayable = (hasLud16 || !!(updatedReply as any).zapLNURL) && hasPaymentAmount;

              if (hasLud16) {
                updatedReply.lightningValidating = true;
              }
              if (hasNip05) {
                updatedReply.nip05Validating = true;
              }
            } catch {
              // Keep existing values on error
            }

            return updatedReply;
          };

          setReplies(prev => {
            return prev.map(reply => {
              const event = deduplicatedReplies.find(e => e.id === reply.id);
              if (!event) return reply;

              const author = profileMap.get(event.pubkey);
              return updateReplyWithProfile(reply, event, author);
            });
          });

          // Process and update zaps for replies
          if (zapEvents.length > 0) {
            const processedReplies = await processPosts(
              deduplicatedReplies,
              Array.from(allProfiles.values()),
              zapEvents
            );

            if (processedReplies.length > 0) {
              setReplies(processedReplies);
            }
          } else {
            // No zaps, just mark as not loading
            setReplies(prev => prev.map(reply => ({ ...reply, zapLoading: false })));
          }

          // Validate lightning addresses and NIP-05 asynchronously
          setReplies(prev => {
            validateLightningAddresses(prev, 'replies');
            validateNip05s(prev, 'replies');
            return prev;
          });

          // Calculate reply levels for proper indentation
          setReplies(prev => {
            const sortedReplies = [...prev].sort((a, b) => a.createdAt - b.createdAt);
            return calculateReplyLevels(sortedReplies) as PubPayPost[];
          });
        } catch (err) {
          console.error('Error loading reply profiles/zaps in background:', err);
        }
      })();
    } catch (err) {
      console.error('Failed to load replies:', err);
    }
  };

  return {
    loadPosts,
    loadFollowingPosts,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    loadZapsForPosts,
    validateLightningAddresses,
    validateNip05s,
    processPosts,
    processPostsBasicLocal,
    processPostsBasicSyncLocal,
    loadProfilesBatched
  };
};

