import { useCallback } from 'react';
import type { PubPayPost } from '../types/postTypes';
import { usePostStore, usePostActions } from '../stores/usePostStore';

/**
 * Hook for wrapping store actions to match React.Dispatch<SetStateAction<T>> signature
 * Extracted from useHomeFunctionality for better separation of concerns
 * 
 * These wrappers allow hooks that expect React setState signatures to work with Zustand store actions
 */
export const usePostStateWrappers = () => {
  const {
    setPosts: setPostsStore,
    setFollowingPosts: setFollowingPostsStore,
    setReplies: setRepliesStore,
    setIsLoading: setIsLoadingStore,
    setIsLoadingMore: setIsLoadingMoreStore,
    setNostrReady: setNostrReadyStore,
    setPaymentError: setPaymentErrorStore
  } = usePostActions();

  // Wrapper functions to match React.Dispatch<SetStateAction<T>> signature
  // Memoized to prevent infinite re-renders
  const setPosts = useCallback(
    (value: React.SetStateAction<PubPayPost[]>) => {
      if (typeof value === 'function') {
        const currentPosts = usePostStore.getState().posts;
        setPostsStore(value(currentPosts));
      } else {
        setPostsStore(value);
      }
    },
    [setPostsStore]
  );

  const setFollowingPosts = useCallback(
    (value: React.SetStateAction<PubPayPost[]>) => {
      if (typeof value === 'function') {
        const currentFollowingPosts = usePostStore.getState().followingPosts;
        setFollowingPostsStore(value(currentFollowingPosts));
      } else {
        setFollowingPostsStore(value);
      }
    },
    [setFollowingPostsStore]
  );

  const setReplies = useCallback(
    (value: React.SetStateAction<PubPayPost[]>) => {
      if (typeof value === 'function') {
        const currentReplies = usePostStore.getState().replies;
        setRepliesStore(value(currentReplies));
      } else {
        setRepliesStore(value);
      }
    },
    [setRepliesStore]
  );

  const setIsLoading = useCallback(
    (value: React.SetStateAction<boolean>) => {
      if (typeof value === 'function') {
        const currentIsLoading = usePostStore.getState().isLoading;
        setIsLoadingStore(value(currentIsLoading));
      } else {
        setIsLoadingStore(value);
      }
    },
    [setIsLoadingStore]
  );

  const setIsLoadingMore = useCallback(
    (value: React.SetStateAction<boolean>) => {
      if (typeof value === 'function') {
        const currentIsLoadingMore = usePostStore.getState().isLoadingMore;
        setIsLoadingMoreStore(value(currentIsLoadingMore));
      } else {
        setIsLoadingMoreStore(value);
      }
    },
    [setIsLoadingMoreStore]
  );

  const setNostrReady = useCallback(
    (value: React.SetStateAction<boolean>) => {
      if (typeof value === 'function') {
        const currentNostrReady = usePostStore.getState().nostrReady;
        setNostrReadyStore(value(currentNostrReady));
      } else {
        setNostrReadyStore(value);
      }
    },
    [setNostrReadyStore]
  );

  const setPaymentErrors = useCallback(
    (value: React.SetStateAction<Map<string, string>>) => {
      if (typeof value === 'function') {
        const currentPaymentErrors = usePostStore.getState().paymentErrors;
        const newErrors = value(currentPaymentErrors);
        // Update store for each error
        newErrors.forEach((error: string, postId: string) => {
          setPaymentErrorStore(postId, error);
        });
        // Remove errors that are no longer in the map
        currentPaymentErrors.forEach((_: string, postId: string) => {
          if (!newErrors.has(postId)) {
            setPaymentErrorStore(postId, null);
          }
        });
      } else {
        // Clear all and set new ones
        const currentPaymentErrors = usePostStore.getState().paymentErrors;
        currentPaymentErrors.forEach((_: string, postId: string) => {
          setPaymentErrorStore(postId, null);
        });
        value.forEach((error: string, postId: string) => {
          setPaymentErrorStore(postId, error);
        });
      }
    },
    [setPaymentErrorStore]
  );

  return {
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    setPaymentErrors
  };
};

