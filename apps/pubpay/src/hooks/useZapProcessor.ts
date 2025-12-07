import { useCallback } from 'react';
import { extractZapPayerPubkeys } from '@pubpay/shared-services';
import { useUIStore } from '@pubpay/shared-services';
import { parseZapDescription } from '@pubpay/shared-utils';
import { Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import type { PubPayPost } from '../types/postTypes';
import { processNewZapWithProfiles, isZapWithinLimits } from '../utils/zapProcessing';
import { usePostStore } from '../stores/usePostStore';

interface UseZapProcessorOptions {
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, Kind0Event>>;
  updatePost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateFollowingPost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateReply: (replyId: string, updates: Partial<PubPayPost>) => void;
}

/**
 * Hook for processing zap batches and updating posts
 * Extracted from useSubscriptions for better separation of concerns
 */
export const useZapProcessor = (options: UseZapProcessorOptions) => {
  const {
    loadProfilesBatched,
    updatePost,
    updateFollowingPost,
    updateReply
  } = options;

  const processZapBatch = useCallback(
    async (zapEvents: Kind9735Event[]) => {
      if (zapEvents.length === 0) return;

      // Early duplicate detection: filter out zaps that already exist in any post/reply
      const storeState = usePostStore.getState();
      const allPosts = [
        ...storeState.posts,
        ...storeState.followingPosts,
        ...storeState.replies
      ];
      const existingZapIds = new Set<string>();
      allPosts.forEach(post => {
        post.zaps.forEach(zap => existingZapIds.add(zap.id));
      });

      // Filter out duplicates before processing
      const newZapEvents = zapEvents.filter(
        zapEvent => !existingZapIds.has(zapEvent.id)
      );

      if (newZapEvents.length === 0) {
        // All zaps are duplicates, skip processing
        return;
      }

      console.log(
        'Processing zap batch:',
        newZapEvents.length,
        'new zaps (filtered from',
        zapEvents.length,
        'total)'
      );

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
          const existingZapInState = post.zaps.find(
            zap => zap.id === zapEvent.id
          );
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
        const followingPost = currentStoreState.followingPosts.find(
          p => p.id === postId
        );
        if (followingPost) {
          const existingZapInState = followingPost.zaps.find(
            zap => zap.id === zapEvent.id
          );
          if (!existingZapInState) {
            const isWithinLimits = isZapWithinLimits(
              processedZap.zapAmount,
              followingPost.zapMin,
              followingPost.zapMax
            );
            updateFollowingPost(postId, {
              zaps: [...followingPost.zaps, processedZap],
              zapAmount:
                followingPost.zapAmount + processedZap.zapAmount,
              zapUsesCurrent:
                followingPost.zapUsesCurrent + (isWithinLimits ? 1 : 0)
            });
          }
        }

        // Also update replies if this post exists there
        const reply = currentStoreState.replies.find(r => r.id === postId);
        if (reply) {
          const existingZapInState = reply.zaps.find(
            zap => zap.id === zapEvent.id
          );
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
    },
    [loadProfilesBatched, updatePost, updateFollowingPost, updateReply]
  );

  return {
    processZapBatch
  };
};

