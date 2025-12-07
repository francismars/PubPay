import { useCallback } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { safeJson } from '@pubpay/shared-utils';
import { Kind1Event, Kind0Event } from '@pubpay/shared-types';
import { TIMEOUT } from '../constants';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { usePostStore } from '../stores/usePostStore';

interface UseNoteProcessorOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  addPost: (post: PubPayPost) => void;
  addFollowingPost: (post: PubPayPost) => void;
  validateLightningAddresses: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
  validateNip05s: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
  updateZapSubscriptionForNewPost?: (newEventId: string) => void;
}

/**
 * Hook for processing new note events and adding them to the feed
 * Extracted from useSubscriptions for better separation of concerns
 */
export const useNoteProcessor = (options: UseNoteProcessorOptions) => {
  const {
    nostrClientRef,
    addPost,
    addFollowingPost,
    validateLightningAddresses,
    validateNip05s,
    updateZapSubscriptionForNewPost
  } = options;

  const processNewNote = useCallback(
    async (noteEvent: Kind1Event) => {
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
          newPost.zapGoal =
            parseInt(zapGoalTag[1]) / 1000 || undefined; // Convert from millisats to sats
        }

        // Set hasZapTags based on whether zap tags exist (zap-min, zap-max, zap-uses, zap-goal)
        newPost.hasZapTags = !!(
          zapMinTag || zapMaxTag || zapUsesTag || zapGoalTag
        );

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
          console.log(
            'Post already exists in state, skipping:',
            noteEvent.id
          );
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
        if (updateZapSubscriptionForNewPost) {
          updateZapSubscriptionForNewPost(noteEvent.id);
        }

        // Trigger validation for lightning addresses and NIP-05 on the new post
        // Use a small delay to ensure the post is in state before validating
        setTimeout(() => {
          const storeState = usePostStore.getState();
          const activeFeed = storeState.activeFeed;
          const postsArray =
            activeFeed === 'following'
              ? storeState.followingPosts
              : storeState.posts;
          const newPostInArray = postsArray.find(p => p.id === noteEvent.id);
          if (newPostInArray) {
            validateLightningAddresses([newPostInArray], activeFeed);
            validateNip05s([newPostInArray], activeFeed);
          }
        }, TIMEOUT.SHORT_DELAY);
      } catch (error) {
        console.error('Error processing new note:', error);
      }
    },
    [
      nostrClientRef,
      addPost,
      addFollowingPost,
      validateLightningAddresses,
      validateNip05s,
      updateZapSubscriptionForNewPost
    ]
  );

  return {
    processNewNote
  };
};

