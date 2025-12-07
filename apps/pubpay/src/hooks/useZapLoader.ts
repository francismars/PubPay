import { useCallback } from 'react';
import { Kind1Event, Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import { extractZapPayerPubkeys, type ProcessedZap } from '@pubpay/shared-services';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import { nip19 } from 'nostr-tools';
import * as bolt11 from 'bolt11';
import type { PubPayPost, FeedType } from '../types/postTypes';
import { isZapWithinLimits } from '../utils/zapProcessing';
import { genericUserIcon } from '../assets/images';
import { usePostStore } from '../stores/usePostStore';

interface UseZapLoaderOptions {
  loadProfilesBatched: (pubkeys: string[]) => Promise<Map<string, Kind0Event>>;
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;
}

/**
 * Hook for loading zaps and updating posts with zap data
 * Extracted from useFeedLoader for better separation of concerns
 */
export const useZapLoader = (options: UseZapLoaderOptions) => {
  const { loadProfilesBatched, setPosts, setFollowingPosts, setReplies } = options;

  const loadZapsForPosts = useCallback(
    async (
      kind1Events: Kind1Event[],
      zapEvents: Kind9735Event[],
      feed: FeedType,
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
            const zapPayerPicture =
              zapPayerProfile &&
              zapPayerProfile.content &&
              zapPayerProfile.content !== '{}'
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
        const current = usePostStore.getState().followingPosts;
        setFollowingPosts(updatePostsWithZaps(current));
      } else if (feed === 'replies') {
        const current = usePostStore.getState().replies;
        setReplies(updatePostsWithZaps(current));
      } else {
        const current = usePostStore.getState().posts;
        setPosts(updatePostsWithZaps(current));
      }
    },
    [loadProfilesBatched, setPosts, setFollowingPosts, setReplies]
  );

  return {
    loadZapsForPosts
  };
};

