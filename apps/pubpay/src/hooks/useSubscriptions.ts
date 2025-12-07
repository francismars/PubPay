import { useRef } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { Kind9735Event } from '@pubpay/shared-types';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { useZapProcessor } from './useZapProcessor';
import { useNoteProcessor } from './useNoteProcessor';
import { usePostSubscription } from './usePostSubscription';
import { useZapSubscription, createUpdateZapSubscriptionForNewPost } from './useZapSubscription';

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
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, any>>;
  validateLightningAddresses: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
  validateNip05s: (posts: PubPayPost[], feed: FeedType) => Promise<void>;
}

/**
 * Main hook for managing real-time subscriptions
 * Composed from smaller, focused hooks for better maintainability
 *
 * This hook orchestrates:
 * - Zap processing (useZapProcessor)
 * - Note processing (useNoteProcessor)
 * - Post subscription (usePostSubscription)
 * - Zap subscription (useZapSubscription)
 */
export const useSubscriptions = (options: UseSubscriptionsOptions) => {
  const {
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
  } = options;

  // Initialize sub-hooks
  const zapProcessor = useZapProcessor({
    loadProfilesBatched,
    updatePost,
    updateFollowingPost,
    updateReply
  });

  // Create updateZapSubscriptionForNewPost helper
  const updateZapSubscriptionForNewPost = createUpdateZapSubscriptionForNewPost({
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch: zapProcessor.processZapBatch
  });

  const noteProcessor = useNoteProcessor({
    nostrClientRef,
    addPost,
    addFollowingPost,
    validateLightningAddresses,
    validateNip05s,
    updateZapSubscriptionForNewPost
  });

  // Set up post subscription
  usePostSubscription({
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    subscriptionRef,
    processNewNote: noteProcessor.processNewNote
  });

  // Set up zap subscription
  useZapSubscription({
    nostrClientRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    processZapBatch: zapProcessor.processZapBatch
  });

  // Return functions for backward compatibility
  return {
    processZapBatch: zapProcessor.processZapBatch,
    processNewNote: noteProcessor.processNewNote,
    updateZapSubscriptionForNewPost
  };
};
