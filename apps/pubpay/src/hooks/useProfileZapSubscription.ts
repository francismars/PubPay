import { useEffect, useMemo, useRef } from 'react';
import {
  ensureProfiles,
  getQueryClient
} from '@pubpay/shared-services';
import { nip19 } from 'nostr-tools';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import bolt11 from 'bolt11';
import { genericUserIcon } from '../assets/images';
import { PubPayPost } from './useHomeFunctionality';
import { useProfileActions, useUserPaynotes } from '../stores/useProfileStore';
import { useAbortController } from './useAbortController';
import { safeAsync, isAbortError } from '../utils/asyncHelpers';

interface UseProfileZapSubscriptionOptions {
  nostrClient: any;
  nostrReady: boolean;
}

/**
 * Hook for subscribing to new zaps for profile page posts
 */
export const useProfileZapSubscription = (
  options: UseProfileZapSubscriptionOptions
) => {
  const { nostrClient, nostrReady } = options;

  const { setUserPaynotes } = useProfileActions();
  const userPaynotes = useUserPaynotes();
  const { signal, isAborted } = useAbortController();

  // Subscribe to new zaps for profile page posts
  const paynoteEventIds = useMemo(
    () => userPaynotes.map(post => post.id),
    [userPaynotes]
  );

  // Track previous event IDs to only re-subscribe when the set of posts actually changes
  const previousEventIdsRef = useRef<Set<string>>(new Set());
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!nostrClient || !nostrReady || paynoteEventIds.length === 0) {
      return;
    }

    // Create a Set from current event IDs for comparison
    const currentEventIdsSet = new Set(paynoteEventIds);
    
    // Check if the set of IDs actually changed (not just the array reference)
    const previousSet = previousEventIdsRef.current;
    const idsChanged = 
      currentEventIdsSet.size !== previousSet.size ||
      !Array.from(currentEventIdsSet).every(id => previousSet.has(id));

    // Only re-subscribe if the actual set of post IDs changed
    if (!idsChanged && subscriptionRef.current) {
      // IDs haven't changed, keep existing subscription
      return;
    }

    // Unsubscribe from previous subscription if it exists
    if (subscriptionRef.current) {
      try {
        subscriptionRef.current.unsubscribe();
      } catch (e) {
        console.warn('Error unsubscribing from previous zap subscription:', e);
      }
    }

    // Update the ref with current IDs
    previousEventIdsRef.current = currentEventIdsSet;

    const eventIds = Array.from(currentEventIdsSet);

    console.log('Profile page: subscribing to zaps for', eventIds.length, 'posts');

    subscriptionRef.current = nostrClient.subscribeToEvents(
      [
        {
          kinds: [9735],
          '#e': eventIds
        }
      ],
      async (zapEvent: any) => {
        if (zapEvent.kind !== 9735) return;
        if (isAborted) return;

        const eTag = zapEvent.tags.find((t: any[]) => t[0] === 'e');
        if (!eTag || !eTag[1]) return;

        const postId = eTag[1];
        if (!eventIds.includes(postId)) return;

        // Process the zap
        const bolt11Tag = zapEvent.tags.find((t: any[]) => t[0] === 'bolt11');
        let zapAmount = 0;
        if (bolt11Tag) {
          try {
            const decoded = bolt11.decode(bolt11Tag[1] || '');
            zapAmount = decoded.satoshis || 0;
          } catch {
            zapAmount = 0;
          }
        }

        const descriptionTag = zapEvent.tags.find(
          (t: any[]) => t[0] === 'description'
        );
        let zapPayerPubkey = zapEvent.pubkey;
        let zapContent = '';

        if (descriptionTag) {
          try {
            const zapData = parseZapDescription(
              descriptionTag[1] || undefined
            );
            if (zapData?.pubkey) {
              zapPayerPubkey = zapData.pubkey;
            }
            if (
              zapData &&
              'content' in zapData &&
              typeof zapData.content === 'string'
            ) {
              zapContent = zapData.content;
            }
          } catch {
            // Use zap.pubkey as fallback
          }
        }

        // Load zap payer profile
        let zapPayerProfile = null;
        try {
          if (isAborted) return;
          
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [zapPayerPubkey]
          );
          
          if (isAborted) return;
          
          zapPayerProfile = profileMap.get(zapPayerPubkey);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          console.error('Error loading zap payer profile:', error);
        }

        const zapPayerPicture = zapPayerProfile
          ? (
              safeJson<Record<string, unknown>>(
                zapPayerProfile.content || '{}',
                {}
              ) as any
            ).picture || genericUserIcon
          : genericUserIcon;

        const zapPayerNpub = nip19.npubEncode(zapPayerPubkey);

        if (isAborted) return;

        const processedZap = {
          ...zapEvent,
          zapAmount,
          zapPayerPubkey,
          zapPayerPicture,
          zapPayerNpub,
          content: zapContent
        };

        // Update the post in userPaynotes
        setUserPaynotes(prevPaynotes => {
          if (isAborted) return prevPaynotes;
          const newPaynotes = [...prevPaynotes];
          const postIndex = newPaynotes.findIndex(post => post.id === postId);
          if (postIndex === -1) return newPaynotes;

          const post = newPaynotes[postIndex];
          if (!post) return newPaynotes;

          // Check for duplicates
          const existingZapInState = post.zaps.find(
            (zap: any) => zap.id === zapEvent.id
          );
          if (existingZapInState) {
            return newPaynotes;
          }

          // Check if the new zap is within amount limits for usage counting
          const isWithinLimits = (() => {
            const amount = zapAmount;
            const min = post.zapMin;
            const max = post.zapMax;

            if (min > 0 && max > 0) {
              return amount >= min && amount <= max;
            } else if (min > 0 && max === 0) {
              return amount >= min;
            } else if (min === 0 && max > 0) {
              return amount <= max;
            } else {
              return true;
            }
          })();

          // Add the new zap to the post
          const updatedPost: PubPayPost = {
            ...post,
            zaps: [...post.zaps, processedZap],
            zapAmount: post.zapAmount + zapAmount,
            zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
          };

          newPaynotes[postIndex] = updatedPost;
          console.log('Profile page: updated post with new zap', postId, zapAmount);
          return newPaynotes;
        });
      },
      {
        oneose: () => {
          console.log('Profile page: zap subscription EOS');
        },
        onclosed: () => {
          console.log('Profile page: zap subscription closed');
        }
      }
    );

    return () => {
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        } catch (e) {
          console.warn('Error unsubscribing from profile zap subscription:', e);
        }
      }
    };
  }, [nostrClient, nostrReady, paynoteEventIds.join(','), setUserPaynotes, signal, isAborted]);
};

