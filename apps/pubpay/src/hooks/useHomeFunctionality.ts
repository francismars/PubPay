// React hook for home functionality integration
import { useEffect, useRef, useState } from 'react';
import { NostrUtil } from '@pubpay/shared-services';
import { AuthService } from '@pubpay/shared-services';
import { Kind0Event, Kind9735Event } from '@pubpay/shared-types';
import { TIMEOUT, LIGHTNING, STORAGE_KEYS } from '../constants';

// Import npm packages
import { nip19, finalizeEvent, getEventHash, verifyEvent } from 'nostr-tools';

// Re-export PubPayPost for backward compatibility with existing imports
export type { PubPayPost } from '../types/postTypes';

// Import extracted types and utilities
import type { PubPayPost } from '../types/postTypes';
import { useAuth } from './useAuth';
import { usePayments } from './usePayments';
import { useFeedLoader } from './useFeedLoader';
import { useSubscriptions } from './useSubscriptions';
import { useServices } from './useServices';
import { useExternalSigner } from './useExternalSigner';

export const useHomeFunctionality = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'global' | 'following'>(
    'global'
  );
  const [posts, setPosts] = useState<PubPayPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<PubPayPost[]>([]);
  const [replies, setReplies] = useState<PubPayPost[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Track payment errors per post ID
  const [paymentErrors, setPaymentErrors] = useState<Map<string, string>>(
    new Map()
  );

  // Use services hook
  const {
    nostrReady,
    setNostrReady,
    nostrClientRef,
    zapServiceRef
  } = useServices();

  // Use authentication hook
  const {
    authState,
    setAuthState,
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

  // Use refs to track posts/replies without causing re-renders
  const postsRef = useRef<PubPayPost[]>([]);
  const followingPostsRef = useRef<PubPayPost[]>([]);
  const repliesRef = useRef<PubPayPost[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    followingPostsRef.current = followingPosts;
  }, [followingPosts]);

  useEffect(() => {
    repliesRef.current = replies;
  }, [replies]);

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
    authState,
    setAuthState,
    loadUserProfile
  });

  const handleFeedChange = (feed: 'global' | 'following') => {
    // Check auth status from AuthService to ensure it's current
    const isAuthenticated = AuthService.isAuthenticated();
    if (feed === 'following' && !isAuthenticated) {
      handleLogin();
      return;
    }

    // Switch active feed
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
    posts,
    followingPosts,
    activeFeed,
    isLoadingMore,
    nostrClientRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    postsRef,
    followingPostsRef,
    repliesRef,
    profileCacheRef,
    pendingProfileRequestsRef,
    validatingLightningAddressesRef,
    validatingNip05sRef,
    authState
  });

  // Use subscriptions hook
  useSubscriptions({
    nostrClientRef,
    postsRef,
    followingPostsRef,
    repliesRef,
    followingPubkeysRef,
    newestPostTimestampRef,
    subscriptionRef,
    zapSubscriptionRef,
    zapBatchRef,
    zapBatchTimeoutRef,
    subscribedEventIdsRef,
    activeFeed,
    isLoading,
    nostrReady,
    replies,
    setPosts,
    setFollowingPosts,
    setReplies,
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

      if (!payNoteContent || payNoteContent.trim() === '') {
        console.error('Please enter a payment request description');
        return;
      }

      // Build tags array
      const tags: string[][] = [['t', 'pubpay']];

      // Add zap amount tags only if payment type is selected and values are provided
      if (paymentType === 'fixed' && zapFixed && zapFixed.trim() !== '') {
        const amount = parseInt(zapFixed);
        if (!isNaN(amount) && amount > 0) {
          const zapMinAmount = amount * LIGHTNING.MILLISATS_PER_SAT; // Convert to millisatoshis
          const zapMaxAmount = amount * LIGHTNING.MILLISATS_PER_SAT;
          tags.push(['zap-min', zapMinAmount.toString()]);
          tags.push(['zap-max', zapMaxAmount.toString()]);
        }
      } else if (paymentType === 'range' && zapMin && zapMin.trim() !== '' && zapMax && zapMax.trim() !== '') {
        const minAmount = parseInt(zapMin);
        const maxAmount = parseInt(zapMax);
        if (!isNaN(minAmount) && !isNaN(maxAmount) && minAmount > 0 && maxAmount > 0) {
          if (maxAmount < minAmount) {
          console.error('Maximum amount must be greater than minimum amount');
          return;
        }
          const zapMinAmount = minAmount * LIGHTNING.MILLISATS_PER_SAT;
          const zapMaxAmount = maxAmount * LIGHTNING.MILLISATS_PER_SAT;
      tags.push(['zap-min', zapMinAmount.toString()]);
      tags.push(['zap-max', zapMaxAmount.toString()]);
        }
      }
      // If no payment type or no values provided, don't add zap tags (payment is optional)

      // Add zap-goal tag if provided (convert to millisats for consistency)
      if (zapGoal && parseInt(zapGoal) > 0) {
        const zapGoalAmount = parseInt(zapGoal) * LIGHTNING.MILLISATS_PER_SAT; // Convert to millisatoshis
        tags.push(['zap-goal', zapGoalAmount.toString()]);
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
      const npubMentions = payNoteContent.match(
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
        content: payNoteContent.trim(),
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
        const { data } = nip19.decode(authState.privateKey);
        signedEvent = finalizeEvent(event, data as Uint8Array);
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

  const clearPosts = () => {
    setPosts([]);
    setFollowingPosts([]);
    setReplies([]);
  };

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
