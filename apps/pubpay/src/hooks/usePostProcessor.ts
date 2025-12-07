import { useCallback } from 'react';
import { Kind1Event, Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import {
  processZaps,
  type ProcessedZap,
  extractPostZapTags,
  calculateIsPayable,
  getZapPayerProfile,
  getAuthorPaymentInfo
} from '@pubpay/shared-services';
import type { PubPayPost } from '../types/postTypes';
import { processPostsBasic, processPostsBasicSync } from '../utils/postProcessing';
import { isZapWithinLimits } from '../utils/zapProcessing';
import { genericUserIcon } from '../assets/images';

interface UsePostProcessorOptions {
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, Kind0Event>>;
  newestPostTimestampRef?: React.MutableRefObject<number>;
}

/**
 * Hook for processing posts from Nostr events
 * Extracted from useFeedLoader for better separation of concerns
 */
export const usePostProcessor = (options: UsePostProcessorOptions) => {
  const { loadProfilesBatched, newestPostTimestampRef } = options;

  // Process posts with basic info only (like legacy drawKind1)
  // Uses extracted utility function
  const processPostsBasicLocal = useCallback(
    async (
      kind1Events: Kind1Event[],
      profileEvents: Kind0Event[]
    ): Promise<PubPayPost[]> => {
      return processPostsBasic(kind1Events, profileEvents, loadProfilesBatched);
    },
    [loadProfilesBatched]
  );

  // Process posts synchronously for immediate display (no async profile/zap loading)
  // Uses extracted utility function
  const processPostsBasicSyncLocal = useCallback(
    (kind1Events: Kind1Event[]): PubPayPost[] => {
      return processPostsBasicSync(kind1Events);
    },
    []
  );

  // Process posts with full data (profiles and zaps)
  const processPosts = useCallback(
    async (
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
        const zapPayerInfo = getZapPayerProfile(
          zapTags.zapPayer,
          profileMap,
          genericUserIcon
        );

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
      if (newestPostTimestampRef && sortedPosts.length > 0) {
        newestPostTimestampRef.current = sortedPosts[0].createdAt;
      }

      return sortedPosts;
    },
    [newestPostTimestampRef]
  );

  return {
    processPostsBasic: processPostsBasicLocal,
    processPostsBasicSync: processPostsBasicSyncLocal,
    processPosts
  };
};

