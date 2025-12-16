// React hook for home functionality integration
import { useEffect, useRef } from 'react';
import { NostrUtil } from '@pubpay/shared-services';
import { AuthService } from '@pubpay/shared-services';
import { Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import { TIMEOUT, LIGHTNING, STORAGE_KEYS, TOAST_DURATION } from '../constants';
import { validateNoteContent, validatePaymentAmount, validatePaymentAmountRange } from '../utils/validation';

// Import npm packages
import { nip19, finalizeEvent, getEventHash, verifyEvent } from 'nostr-tools';

// Re-export PubPayPost for backward compatibility with existing imports
export type { PubPayPost } from '../types/postTypes';

// Import extracted types and utilities
import { useAuth } from './useAuth';
import { usePayments } from './usePayments';
import { useFeedLoader } from './useFeedLoader';
import { useSubscriptions } from './useSubscriptions';
import { useServices } from './useServices';
import { useExternalSigner } from './useExternalSigner';
import { usePostStateWrappers } from './usePostStateWrappers';
import { usePostStoreData, usePostActions } from '../stores/usePostStore';

export const useHomeFunctionality = () => {
  // Use optimized selector hook to get all post state in a single subscription
  // This prevents unnecessary re-renders by using shallow equality
  const {
    posts,
    followingPosts,
    replies,
    activeFeed,
    isLoading,
    isLoadingMore,
    nostrReady,
    paymentErrors
  } = usePostStoreData();

  // Use extracted state wrappers hook
  const {
    setPosts,
    setFollowingPosts,
    setReplies,
    setIsLoading,
    setIsLoadingMore,
    setNostrReady,
    setPaymentErrors
  } = usePostStateWrappers();

  // Get other store actions
  const { setActiveFeed, clearAllPosts: clearPosts } = usePostActions();

  // Use services hook (nostrReady is now managed by store)
  const {
    nostrClientRef,
    zapServiceRef
  } = useServices();

  // Use authentication hook
  const {
    authState,
    checkAuthStatus,
    loadUserProfile,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleContinueWithNsec,
    handleLogout
  } = useAuth({
    nostrClientRef
  });

  const followingPubkeysRef = useRef<string[]>([]);
  const newestPostTimestampRef = useRef<number>(0); // Track newest post time for subscriptions
  const subscriptionRef = useRef<any>(null); // Track the new post subscription

  // Profile cache to prevent duplicate requests
  const profileCacheRef = useRef<Map<string, Kind0Event>>(new Map());
  const pendingProfileRequestsRef = useRef<Set<string>>(new Set());
  // Track lightning addresses being validated to avoid duplicate calls
  const validatingLightningAddressesRef = useRef<Set<string>>(new Set());
  // Track NIP-05 identifiers being validated to avoid duplicate calls
  const validatingNip05sRef = useRef<Set<string>>(new Set());

  // Zap batch processing
  const zapBatchRef = useRef<Kind9735Event[]>([]);
  const zapBatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track zap subscription to avoid recreating it unnecessarily
  const zapSubscriptionRef = useRef<any>(null);
  const subscribedEventIdsRef = useRef<Set<string>>(new Set());

  // Refs for subscription tracking only (not for state - subscriptions use usePostStore.getState() directly)

  // Track pathname changes to reload posts when exiting single note mode
  useEffect(() => {
    const checkAndLoadPosts = () => {
      const pathname = window.location.pathname;
      const isInNotePage = pathname.startsWith('/note/');

      if (isInNotePage) {
        console.log('On note page, skipping global feed load');
        return;
      }

      // Not on note page and no posts loaded - load them
      if (
        posts.length === 0 &&
        activeFeed === 'global' &&
        nostrClientRef.current
      ) {
        console.log('Loading global feed after exiting note page');
        loadPosts('global');
      }
    };

    // Initial check
    const timer = setTimeout(checkAndLoadPosts, TIMEOUT.SHORT_DELAY);

    // Listen for popstate (back/forward buttons and programmatic navigation)
    window.addEventListener('popstate', checkAndLoadPosts);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', checkAndLoadPosts);
    };
  }, [posts.length, activeFeed]);

  // Use external signer hook
  useExternalSigner({
    nostrClientRef,
    zapServiceRef,
    loadUserProfile,
    authState // Pass authState which includes privateKey from local state
  });

  const handleFeedChange = (feed: 'global' | 'following') => {
    // Check auth status from AuthService to ensure it's current
    const isAuthenticated = AuthService.isAuthenticated();
    if (feed === 'following' && !isAuthenticated) {
      handleLogin();
      return;
    }

    // Switch active feed (updates store)
    setActiveFeed(feed);

    // Load the appropriate feed if needed
    if (feed === 'following' && followingPosts.length === 0) {
      loadFollowingPosts();
    } else if (feed === 'global' && posts.length === 0) {
      loadPosts('global');
    }
  };

  const handleQRScanner = () => {
    // QR scanner will be implemented in the component
    console.log('Opening QR scanner...');
  };

  const handleLogin = () => {
    // Open login via UI store
    import('@pubpay/shared-services')
      .then(({ useUIStore }) => {
        useUIStore.getState().openLogin();
      })
      .catch(() => {
        console.warn('UI store not available yet');
      });
  };

  // Use payments hook (after handleLogin is declared)
  const {
    handlePayWithExtension,
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice
  } = usePayments({
    zapServiceRef,
    authState,
    setPaymentErrors,
    onLoginRequired: handleLogin
  });

  // Use feed loader hook
  // Note: posts, followingPosts, activeFeed, isLoadingMore are passed for backward compatibility
  // but useFeedLoader now uses store directly for async-safe access
  const {
    loadPosts,
    loadFollowingPosts,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    validateLightningAddresses,
    validateNip05s,
    loadProfilesBatched
  } = useFeedLoader({
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
  });

  // Get store actions to pass to useSubscriptions
  // Actions are stable references, so we can use them directly from the actions hook
  const { updatePost, updateFollowingPost, updateReply, addPost, addFollowingPost } = usePostActions();

  // Use subscriptions hook - now uses store actions directly
  useSubscriptions({
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
  });

  const handleNewPayNote = () => {
    if (!authState.isLoggedIn) {
      handleLogin();
      return;
    }
    console.log('Opening new pay note form...');
  };

  const handleSignInNsec = () => {
    // This will be handled by the component's nsec input
    console.log('Nsec sign in initiated...');
  };

  // Extend handleLogout to also clear following posts
  const handleLogoutExtended = () => {
    handleLogout();
    setFollowingPosts([]);
    followingPubkeysRef.current = [];
  };


  const handlePostNote = async (
    formData: Record<string, string | undefined>
  ) => {
    if (!authState.isLoggedIn) {
      handleLogin();
      return;
    }

    if (!nostrClientRef.current) {
      console.error('Nostr client not available');
      return;
    }

    try {
      const {
        payNoteContent,
        paymentType,
        zapFixed,
        zapMin,
        zapMax,
        zapGoal,
        zapUses,
        zapPayer,
        overrideLNURL
      } = formData;

      // Validate note content
      if (!payNoteContent || payNoteContent.trim() === '') {
        const { useUIStore } = await import('@pubpay/shared-services');
        useUIStore.getState().openToast('Please enter a payment request description', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      const noteContentValidation = validateNoteContent(payNoteContent);
      if (!noteContentValidation.valid) {
        // Import useUIStore dynamically
        const { useUIStore } = await import('@pubpay/shared-services');
        useUIStore.getState().openToast(noteContentValidation.error || 'Invalid note content', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      // At this point, payNoteContent is guaranteed to be defined and valid
      const validatedContent = payNoteContent;

      // Build tags array
      const tags: string[][] = [['t', 'pubpay']];

      // Add zap amount tags only if payment type is selected and values are provided
      if (paymentType === 'fixed' && zapFixed && zapFixed.trim() !== '') {
        const amountValidation = validatePaymentAmount(zapFixed);
        if (!amountValidation.valid) {
          const { useUIStore } = await import('@pubpay/shared-services');
          useUIStore.getState().openToast(amountValidation.error || 'Invalid amount', 'error', false);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          return;
        }
        const amount = parseInt(zapFixed.trim(), 10);
        const zapMinAmount = amount * LIGHTNING.MILLISATS_PER_SAT; // Convert to millisatoshis
        const zapMaxAmount = amount * LIGHTNING.MILLISATS_PER_SAT;
        tags.push(['zap-min', zapMinAmount.toString()]);
        tags.push(['zap-max', zapMaxAmount.toString()]);
      } else if (paymentType === 'range' && zapMin && zapMin.trim() !== '' && zapMax && zapMax.trim() !== '') {
        const rangeValidation = validatePaymentAmountRange(zapMin, zapMax);
        if (!rangeValidation.valid) {
          const { useUIStore } = await import('@pubpay/shared-services');
          useUIStore.getState().openToast(rangeValidation.error || 'Invalid amount range', 'error', false);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          return;
        }
        const minAmount = parseInt(zapMin.trim(), 10);
        const maxAmount = parseInt(zapMax.trim(), 10);
        const zapMinAmount = minAmount * LIGHTNING.MILLISATS_PER_SAT;
        const zapMaxAmount = maxAmount * LIGHTNING.MILLISATS_PER_SAT;
        tags.push(['zap-min', zapMinAmount.toString()]);
        tags.push(['zap-max', zapMaxAmount.toString()]);
      }
      // If no payment type or no values provided, don't add zap tags (payment is optional)

      // Add zap-goal tag if provided (convert to millisats for consistency)
      if (zapGoal && zapGoal.trim() !== '') {
        const goalValidation = validatePaymentAmount(zapGoal);
        if (!goalValidation.valid) {
          const { useUIStore } = await import('@pubpay/shared-services');
          useUIStore.getState().openToast(goalValidation.error || 'Invalid goal amount', 'error', false);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          return;
        }
        const goalAmount = parseInt(zapGoal.trim(), 10);
        if (goalAmount > 0) {
          const zapGoalAmount = goalAmount * LIGHTNING.MILLISATS_PER_SAT; // Convert to millisatoshis
          tags.push(['zap-goal', zapGoalAmount.toString()]);
        }
      }

      // Add optional tags
      if (zapUses && parseInt(zapUses) > 0) {
        tags.push(['zap-uses', zapUses]);
      }

      if (zapPayer && zapPayer.trim() !== '') {
        const parsed = NostrUtil.parseNpub(zapPayer);
        if (!parsed.ok || !parsed.hex) {
          console.error('Invalid payer npub format');
          return;
        }
        tags.push(['zap-payer', parsed.hex]);
      }

      if (overrideLNURL && overrideLNURL.trim() !== '') {
        tags.push(['zap-lnurl', overrideLNURL]);
      }

      // Add client tag
      tags.push(['client', 'PubPay.me']);

      // Add mention tags only for nostr:npub references (ignore plain @npub)
      const npubMentions = validatedContent.match(
        /nostr:((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi
      );
      if (npubMentions) {
        npubMentions.forEach((mention: string) => {
          try {
            const cleanNpub = mention.replace(/^nostr:/i, '');
            const decoded = nip19.decode(cleanNpub);
            if (decoded.type === 'npub') {
              tags.push(['p', decoded.data, '', 'mention']);
            }
          } catch {
            console.warn('Failed to decode mention:', mention);
          }
        });
      }

      // Create the event (will be signed and get id, pubkey, sig)
      const event: any = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: validatedContent.trim(),
        pubkey: '',
        id: '',
        sig: ''
      };

      // Sign the event based on sign-in method
      let signedEvent;
      if (authState.signInMethod === 'extension') {
        if (!window.nostr) {
          console.error('Nostr extension not available');
          return;
        }
        signedEvent = await window.nostr.signEvent(event);
      } else if (authState.signInMethod === 'nsec') {
        if (!authState.privateKey) {
          console.error('Private key not available');
          return;
        }
        // Decode nsec - nip19.decode returns a union type, cast through unknown for type safety
        const decoded = nip19.decode(authState.privateKey) as unknown as { type: 'nsec'; data: Uint8Array };
        if (decoded.type !== 'nsec') {
          console.error('Invalid nsec format');
          return;
        }
        signedEvent = finalizeEvent(event, decoded.data);
      } else if (authState.signInMethod === 'externalSigner') {
        // For external signer, we need to redirect
        event.pubkey = authState.publicKey!;
        event.id = getEventHash(event);
        const eventString = JSON.stringify(event);
        sessionStorage.setItem(STORAGE_KEYS.SIGN_KIND1, JSON.stringify({ event }));
        window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
        return;
      } else {
        console.error('Invalid sign-in method');
        return;
      }

      // Verify the event
      if (!verifyEvent(signedEvent)) {
        console.error('Invalid signed event');
        return;
      }

      // Publish the event
      await nostrClientRef.current.publishEvent(signedEvent);

      console.log('Event published successfully');

      // The real-time subscription will pick up this post automatically
      // No need to manually add it
    } catch (err) {
      console.error('Failed to post note:', err);
      console.error(
        'Failed to post note:',
        err instanceof Error ? err.message : 'Failed to post note'
      );
    }
  };

  // Calculate reply levels for proper indentation (matches legacy behavior)
  // Uses extracted utility function
  // clearPosts is now from usePostStore

  return {
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    replies,
    isLoadingMore,
    nostrReady,
    authState,
    nostrClient: nostrClientRef.current,
    paymentErrors,
    handleFeedChange,
    handleQRScanner,
    handleLogin,
    handleNewPayNote,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleSignInNsec,
    handleContinueWithNsec,
    handleLogout: handleLogoutExtended,
    handlePayWithExtension,
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    clearPosts,
    loadUserProfile,
    checkAuthStatus
  };
};
