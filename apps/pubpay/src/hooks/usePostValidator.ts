import { useCallback } from 'react';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { extractLightningAddresses, extractNip05s, validateLightningAddress, validateNip05 } from '../utils/validation';
import { usePostStore } from '../stores/usePostStore';

interface UsePostValidatorOptions {
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;
  validatingLightningAddressesRef: React.MutableRefObject<Set<string>>;
  validatingNip05sRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook for validating lightning addresses and NIP-05 identifiers for posts
 * Extracted from useFeedLoader for better separation of concerns
 */
export const usePostValidator = (options: UsePostValidatorOptions) => {
  const {
    setPosts,
    setFollowingPosts,
    setReplies,
    validatingLightningAddressesRef,
    validatingNip05sRef
  } = options;

  const validateLightningAddresses = useCallback(
    async (posts: PubPayPost[], feed: FeedType) => {
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
            // Update all posts with this lightning address
            const updatePost = (post: PubPayPost) => {
              const updated = updatedPosts.find(p => p.id === post.id);
              return updated || post;
            };

            const currentState = usePostStore.getState();
            if (feed === 'following') {
              setFollowingPosts(currentState.followingPosts.map(updatePost));
            } else if (feed === 'replies') {
              setReplies(currentState.replies.map(updatePost));
            } else {
              setPosts(currentState.posts.map(updatePost));
            }
          })
          .finally(() => {
            // Remove from validating set
            validatingLightningAddressesRef.current.delete(lud16);
          });
      }
    },
    [setPosts, setFollowingPosts, setReplies, validatingLightningAddressesRef]
  );

  const validateNip05s = useCallback(
    async (posts: PubPayPost[], feed: FeedType) => {
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

        const storeState = usePostStore.getState();
        if (feed === 'following') {
          setFollowingPosts(storeState.followingPosts.map(setValidating));
        } else if (feed === 'replies') {
          setReplies(storeState.replies.map(setValidating));
        } else {
          setPosts(storeState.posts.map(setValidating));
        }

        // Validate asynchronously (fire and forget) using utility
        validateNip05(nip05, pubkey, postsWithNip05)
          .then(({ updatedPosts }) => {
            // Update all posts with this NIP-05
            const updatePost = (post: PubPayPost) => {
              const updated = updatedPosts.find(p => p.id === post.id);
              return updated || post;
            };

            const currentState = usePostStore.getState();
            if (feed === 'following') {
              setFollowingPosts(currentState.followingPosts.map(updatePost));
            } else if (feed === 'replies') {
              setReplies(currentState.replies.map(updatePost));
            } else {
              setPosts(currentState.posts.map(updatePost));
            }
          })
          .finally(() => {
            // Remove from validating set
            validatingNip05sRef.current.delete(key);
          });
      }
    },
    [setPosts, setFollowingPosts, setReplies, validatingNip05sRef]
  );

  return {
    validateLightningAddresses,
    validateNip05s
  };
};

