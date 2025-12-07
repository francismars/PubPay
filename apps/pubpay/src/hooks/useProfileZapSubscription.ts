import { useEffect, useRef } from 'react';
import {
  ensureProfiles,
  getQueryClient
} from '@pubpay/shared-services';
import { nip19 } from 'nostr-tools';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import bolt11 from 'bolt11';
import { genericUserIcon } from '../assets/images';
import { PubPayPost } from './useHomeFunctionality';
import { useProfileActions, useProfileStore } from '../stores/useProfileStore';
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
  const { signal, isAborted } = useAbortController();

  // Track previous event IDs string to only re-subscribe when the set of posts actually changes
  const previousEventIdsStringRef = useRef<string>('');
  const subscriptionRef = useRef<any>(null);
  
  // Track previous relevant state for selective subscription
  const lastRelevantStateRef = useRef<{
    postIdsString: string;
    postCount: number;
  } | null>(null);
  
  // Debounce timeout for store subscription callback
  const subscriptionDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Batch zap updates to reduce state update frequency
  const zapBatchRef = useRef<Array<{ postId: string; zap: any; zapAmount: number }>>([]);
  const zapBatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedZapIdsRef = useRef<Set<string>>(new Set()); // Track processed zap IDs to prevent duplicates

  // Process batched zap updates
  const processZapBatch = () => {
    if (zapBatchRef.current.length === 0) return;
    if (isAborted) {
      zapBatchRef.current = [];
      return;
    }

    const batch = [...zapBatchRef.current];
    zapBatchRef.current = [];

    // Group zaps by post ID
    const zapsByPost = new Map<string, Array<{ zap: any; zapAmount: number }>>();
    for (const { postId, zap, zapAmount } of batch) {
      if (!zapsByPost.has(postId)) {
        zapsByPost.set(postId, []);
      }
      zapsByPost.get(postId)!.push({ zap, zapAmount });
    }

    // Update all posts with their batched zaps
    setUserPaynotes(prevPaynotes => {
      if (isAborted) return prevPaynotes;
      const newPaynotes = [...prevPaynotes];
      let updated = false;

      for (const [postId, zaps] of zapsByPost.entries()) {
        const postIndex = newPaynotes.findIndex(post => post.id === postId);
        if (postIndex === -1) continue;

        const post = newPaynotes[postIndex];
        if (!post) continue;

        // Filter out zaps that already exist in state or have been processed in this session
        const existingZapIds = new Set(post.zaps.map((z: any) => z.id));
        const newZaps = zaps.filter(
          ({ zap }) => 
            !existingZapIds.has(zap.id) && 
            !processedZapIdsRef.current.has(zap.id)
        );
        
        if (newZaps.length === 0) continue;

        // Add new zap IDs to the processed set to prevent duplicate processing
        newZaps.forEach(({ zap }) => processedZapIdsRef.current.add(zap.id));

        // Calculate totals
        let totalZapAmount = 0;
        let totalWithinLimits = 0;

        for (const { zap, zapAmount } of newZaps) {
          totalZapAmount += zapAmount;
          
          // Check if within limits
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
          
          if (isWithinLimits) {
            totalWithinLimits++;
          }
        }

        // Update the post
        newPaynotes[postIndex] = {
          ...post,
          zaps: [...post.zaps, ...newZaps.map(({ zap }) => zap)],
          zapAmount: post.zapAmount + totalZapAmount,
          zapUsesCurrent: post.zapUsesCurrent + totalWithinLimits
        };
        
        updated = true;
        console.log(`Profile page: updated post ${postId} with ${newZaps.length} new zaps`);
      }

      return updated ? newPaynotes : prevPaynotes;
    });
  };

  // Use Zustand subscription with selector to only trigger when post IDs change
  useEffect(() => {
    const checkAndUpdateSubscription = () => {
      if (!nostrClient || !nostrReady) {
        // Clean up subscription if not ready
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from profile zap subscription:', e);
          }
        }
        previousEventIdsStringRef.current = '';
        return;
      }

      // Get current paynotes from store
      const storeState = useProfileStore.getState();
      const userPaynotes = storeState.userPaynotes;

      // Extract post IDs and create a stable sorted string for comparison
      const currentEventIds = userPaynotes.map(post => post.id);
      const currentEventIdsString = [...currentEventIds].sort().join(',');

      // Check if the IDs string actually changed
      if (currentEventIdsString === previousEventIdsStringRef.current && subscriptionRef.current) {
        // IDs haven't changed, keep existing subscription
        // Don't log here to avoid spam - only log when actually re-subscribing
        return;
      }

      // Only log if we're actually going to re-subscribe (not just initial setup)
      if (previousEventIdsStringRef.current !== '') {
        console.log(
          `Profile page: post IDs changed from "${previousEventIdsStringRef.current.substring(0, 50)}..." (${previousEventIdsStringRef.current.split(',').length} posts) to "${currentEventIdsString.substring(0, 50)}..." (${currentEventIdsString.split(',').length} posts)`
        );
      }

      // If no posts, clean up subscription
      if (currentEventIds.length === 0) {
        if (subscriptionRef.current) {
          try {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
          } catch (e) {
            console.warn('Error unsubscribing from profile zap subscription:', e);
          }
        }
        previousEventIdsStringRef.current = '';
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

      // Update the ref with current IDs string
      previousEventIdsStringRef.current = currentEventIdsString;

      const eventIds = currentEventIds;

      // Only log if this is a meaningful change (not just initial setup or same count)
      const previousCount = previousEventIdsStringRef.current.split(',').filter(Boolean).length;
      if (previousCount > 0 && previousCount !== eventIds.length) {
        console.log(
          `Profile page: re-subscribing to zaps - post count changed from ${previousCount} to ${eventIds.length}`
        );
      } else if (previousCount === 0) {
        console.log('Profile page: subscribing to zaps for', eventIds.length, 'posts');
      }

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

        // Check for duplicates early (before processing)
        if (processedZapIdsRef.current.has(zapEvent.id)) {
          return; // Already processed this zap
        }
        
        const processedZap = {
          ...zapEvent,
          zapAmount,
          zapPayerPubkey,
          zapPayerPicture,
          zapPayerNpub,
          content: zapContent
        };

        // Add to batch for processing
        zapBatchRef.current.push({
          postId,
          zap: processedZap,
          zapAmount
        });
        
        // Mark as processed
        processedZapIdsRef.current.add(zapEvent.id);

        // Clear existing timeout
        if (zapBatchTimeoutRef.current) {
          clearTimeout(zapBatchTimeoutRef.current);
        }

        // Process batch immediately if it reaches 10 zaps, otherwise wait 200ms
        if (zapBatchRef.current.length >= 10) {
          processZapBatch();
        } else {
          zapBatchTimeoutRef.current = setTimeout(() => {
            processZapBatch();
          }, 200); // 200ms debounce
        }
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
    };

    // Initial check
    checkAndUpdateSubscription();

    // Subscribe to store changes with manual selector to only trigger when post IDs change
    // This prevents unnecessary calls when only zap data changes
    const selectiveSubscriptionCallback = () => {
      // Clear any pending debounce
      if (subscriptionDebounceTimeoutRef.current) {
        clearTimeout(subscriptionDebounceTimeoutRef.current);
        subscriptionDebounceTimeoutRef.current = null;
      }

      // Debounce the actual check to avoid rapid-fire calls
      subscriptionDebounceTimeoutRef.current = setTimeout(() => {
        subscriptionDebounceTimeoutRef.current = null;
        
        const storeState = useProfileStore.getState();
        const userPaynotes = storeState.userPaynotes;
        const postIds = userPaynotes.map(post => post.id);
        const postIdsString = [...postIds].sort().join(',');
        
        const currentRelevantState = {
          postIdsString,
          postCount: userPaynotes.length
        };

        // Only trigger if relevant state actually changed
        if (
          lastRelevantStateRef.current &&
          lastRelevantStateRef.current.postIdsString === currentRelevantState.postIdsString &&
          lastRelevantStateRef.current.postCount === currentRelevantState.postCount
        ) {
          // Relevant state hasn't changed, skip
          return;
        }

        lastRelevantStateRef.current = currentRelevantState;
        checkAndUpdateSubscription();
      }, 300); // 300ms debounce
    };

    // Subscribe to store changes with selective callback
    // Zustand's basic subscribe fires on every state change, so we filter manually
    const unsubscribe = useProfileStore.subscribe(selectiveSubscriptionCallback);

    return () => {
      unsubscribe();
      if (subscriptionDebounceTimeoutRef.current) {
        clearTimeout(subscriptionDebounceTimeoutRef.current);
        subscriptionDebounceTimeoutRef.current = null;
      }
      if (zapBatchTimeoutRef.current) {
        clearTimeout(zapBatchTimeoutRef.current);
        zapBatchTimeoutRef.current = null;
      }
      // Process any remaining zaps in batch before cleanup
      if (zapBatchRef.current.length > 0) {
        processZapBatch();
      }
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        } catch (e) {
          console.warn('Error unsubscribing from profile zap subscription:', e);
        }
      }
    };
  }, [nostrClient, nostrReady, signal, isAborted]);
};

