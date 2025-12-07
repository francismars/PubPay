import { NostrClient } from '@pubpay/shared-services';
import { Kind0Event } from '@pubpay/shared-types';
import type { PubPayPost } from '../types/postTypes';
import type { AuthState } from '@pubpay/shared-services';
import { useProfileLoader } from './useProfileLoader';
import { usePostProcessor } from './usePostProcessor';
import { useZapLoader } from './useZapLoader';
import { usePostValidator } from './usePostValidator';
import { usePostFetcher } from './usePostFetcher';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter names in function types are for documentation
interface UseFeedLoaderOptions {
  // Store actions (direct store actions, not React setters)
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsLoadingMore: (isLoadingMore: boolean) => void;
  setNostrReady: (ready: boolean) => void;
  // Refs (only for non-state tracking)
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  followingPubkeysRef: React.MutableRefObject<string[]>;
  newestPostTimestampRef: React.MutableRefObject<number>;
  profileCacheRef: React.MutableRefObject<Map<string, Kind0Event>>;
  pendingProfileRequestsRef: React.MutableRefObject<Set<string>>;
  validatingLightningAddressesRef: React.MutableRefObject<Set<string>>;
  validatingNip05sRef: React.MutableRefObject<Set<string>>;
  // Auth state (for loadFollowingPosts)
  authState: AuthState;
}

/**
 * Main hook for loading and managing feed posts
 * Composed from smaller, focused hooks for better maintainability
 *
 * This hook orchestrates:
 * - Profile loading (useProfileLoader)
 * - Post processing (usePostProcessor)
 * - Zap loading (useZapLoader)
 * - Post validation (usePostValidator)
 * - Post fetching (usePostFetcher)
 */
export const useFeedLoader = (options: UseFeedLoaderOptions) => {
  const {
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    profileCacheRef,
    pendingProfileRequestsRef,
    validatingLightningAddressesRef,
    validatingNip05sRef,
    authState
  } = options;

  // Initialize sub-hooks
  const profileLoader = useProfileLoader({
    nostrClientRef,
    profileCacheRef,
    pendingProfileRequestsRef
  });

  const postProcessor = usePostProcessor({
    loadProfilesBatched: profileLoader.loadProfilesBatched,
    newestPostTimestampRef
  });

  const zapLoader = useZapLoader({
    loadProfilesBatched: profileLoader.loadProfilesBatched,
    setPosts,
    setFollowingPosts,
    setReplies
  });

  const postValidator = usePostValidator({
    setPosts,
    setFollowingPosts,
    setReplies,
    validatingLightningAddressesRef,
    validatingNip05sRef
  });

  const postFetcher = usePostFetcher({
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    processPostsBasic: postProcessor.processPostsBasic,
    processPostsBasicSync: postProcessor.processPostsBasicSync,
    processPosts: postProcessor.processPosts,
    loadZapsForPosts: zapLoader.loadZapsForPosts,
    validateLightningAddresses: postValidator.validateLightningAddresses,
    validateNip05s: postValidator.validateNip05s,
    authState
  });

  // Return all functions for backward compatibility
  return {
    // Post fetching functions
    loadPosts: postFetcher.loadPosts,
    loadFollowingPosts: postFetcher.loadFollowingPosts,
    loadMorePosts: postFetcher.loadMorePosts,
    loadSingleNote: postFetcher.loadSingleNote,
    loadReplies: postFetcher.loadReplies,

    // Zap loading
    loadZapsForPosts: zapLoader.loadZapsForPosts,

    // Validation
    validateLightningAddresses: postValidator.validateLightningAddresses,
    validateNip05s: postValidator.validateNip05s,

    // Post processing
    processPosts: postProcessor.processPosts,
    processPostsBasicLocal: postProcessor.processPostsBasic,
    processPostsBasicSyncLocal: postProcessor.processPostsBasicSync,

    // Profile loading
    loadProfilesBatched: profileLoader.loadProfilesBatched
  };
};
