// React hook for home functionality integration
import { useEffect, useRef, useState } from 'react';
import { NostrClient } from '@/services/nostr/NostrClient';
import { LightningService } from '@/services/lightning/LightningService';
import { AuthService } from '@/services/AuthService';
import { NostrFilter, Kind1Event, Kind0Event, Kind9735Event } from '@/types/nostr';
import { LightningConfig } from '@/types/lightning';

// Types for processed zaps
interface ProcessedZap extends Kind9735Event {
  zapAmount: number;
  zapPayerPubkey: string;
  zapPayerPicture: string;
  zapPayerNpub: string;
}

// Types for PubPay posts
export interface PubPayPost {
  id: string;
  event: Kind1Event;
  author: Kind0Event | null;
  zaps: ProcessedZap[];
  zapAmount: number;
  zapMin: number;
  zapMax: number;
  zapUses: number;
  zapUsesCurrent: number;
  zapPayer?: string;
  zapLNURL?: string;
  isPayable: boolean;
  createdAt: number;
}

interface AuthState {
  isLoggedIn: boolean;
  publicKey: string | null;
  privateKey: string | null;
  signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
  userProfile: Kind0Event | null;
}

export const useHomeFunctionality = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'global' | 'following'>('global');
  const [posts, setPosts] = useState<PubPayPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<PubPayPost[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    publicKey: null,
    privateKey: null,
    signInMethod: null,
    userProfile: null
  });

  const nostrClientRef = useRef<NostrClient | null>(null);
  const lightningServiceRef = useRef<LightningService | null>(null);
  const followingPubkeysRef = useRef<string[]>([]);

  // Initialize services
  useEffect(() => {
    const initializeServices = () => {
      try {
      // Check if NostrTools is available
        if (typeof window === 'undefined' || !window.NostrTools) {
          console.warn('NostrTools not available, retrying in 1 second...');
          setTimeout(initializeServices, 1000);
          return;
        }

        // Initialize Nostr client
        nostrClientRef.current = new NostrClient();

        // Initialize Lightning service
        const lightningConfig: LightningConfig = {
          enabled: true,
          lnbitsUrl: (typeof process !== 'undefined' && process.env?.REACT_APP_LNBITS_URL) || '',
          apiKey: (typeof process !== 'undefined' && process.env?.REACT_APP_LNBITS_API_KEY) || '',
          webhookUrl: (typeof process !== 'undefined' && process.env?.REACT_APP_WEBHOOK_URL) || ''
        };
        lightningServiceRef.current = new LightningService(lightningConfig);

        console.log('Services initialized');
      } catch (err) {
        console.error('Failed to initialize services:', err);
        console.error('Failed to initialize services. Please refresh the page.');
      }
    };

    initializeServices();
  }, []);

  // Load initial posts
  useEffect(() => {
    const loadInitialPosts = () => {
      if (nostrClientRef.current && typeof window !== 'undefined' && window.NostrTools) {
        // Add a small delay to ensure everything is ready
        setTimeout(() => {
          loadPosts('global');
        }, 1000);
      } else {
        // Retry loading posts when client becomes available
        const retryInterval = setInterval(() => {
          if (nostrClientRef.current && typeof window !== 'undefined' && window.NostrTools) {
            loadPosts('global');
            clearInterval(retryInterval);
          }
        }, 1000);

        // Cleanup interval after 30 seconds
        setTimeout(() => clearInterval(retryInterval), 30000);
      }
    };

    loadInitialPosts();
  }, []);

  // Check authentication status
  useEffect(() => {
    checkAuthStatus();

    // Handle external signer return
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const result = await AuthService.handleExternalSignerReturn();
        if (result.success && result.publicKey) {
          AuthService.storeAuthData(result.publicKey, null, 'externalSigner', false);

          setAuthState({
            isLoggedIn: true,
            publicKey: result.publicKey,
            privateKey: null,
            signInMethod: 'externalSigner',
            userProfile: null
          });

          await loadUserProfile(result.publicKey);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const checkAuthStatus = () => {
    if (AuthService.isAuthenticated()) {
      const { publicKey, privateKey, method } = AuthService.getStoredAuthData();

      setAuthState({
        isLoggedIn: true,
        publicKey,
        privateKey,
        signInMethod: method as 'extension' | 'nsec' | 'externalSigner',
        userProfile: null
      });

      // Load user profile
      if (nostrClientRef.current && publicKey) {
        loadUserProfile(publicKey);
      }
    }
  };

  const loadUserProfile = async (pubkey: string) => {
    if (!nostrClientRef.current || !pubkey) return;

    try {
      const filter: NostrFilter = {
        kinds: [0],
        authors: [pubkey]
      };

      // Create a clean filter
      const cleanFilter = JSON.parse(JSON.stringify(filter));
      const profileEvents = await nostrClientRef.current.getEvents([cleanFilter]) as Kind0Event[];

      if (profileEvents && profileEvents.length > 0) {
        const profile = profileEvents[0];
        setAuthState(prev => ({
          ...prev,
          userProfile: profile || null
        }));
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const loadPosts = async (feed: 'global' | 'following', loadMore = false) => {
    if (!nostrClientRef.current) {
      console.warn('NostrClient not available yet');
      return;
    }

    // Check if NostrTools is available
    if (typeof window === 'undefined' || !window.NostrTools) {
      console.warn('NostrTools not available yet');
      return;
    }

    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      // Create a clean filter object
      const filter: NostrFilter = {
        kinds: [1],
        '#t': ['pubpay'],
        limit: 21
      };

      // Add following filter if needed
      if (feed === 'following' && followingPubkeysRef.current && followingPubkeysRef.current.length > 0) {
        filter.authors = [...followingPubkeysRef.current]; // Clone the array
      }

      // Add pagination for load more
      if (loadMore) {
        const currentPosts = feed === 'following' ? followingPosts : posts;
        if (currentPosts && currentPosts.length > 0) {
          const oldestPost = currentPosts[currentPosts.length - 1];
          if (oldestPost) {
            filter.until = oldestPost.createdAt;
          }
        }
      }

      // Ensure filter is valid before sending
      if (!filter.kinds || filter.kinds.length === 0) {
        console.warn('Invalid filter: missing kinds');
        return;
      }

      // Create a deep clone of the filter to avoid reference issues
      const cleanFilter = JSON.parse(JSON.stringify(filter));
      const filters = [cleanFilter];

      console.log('Loading posts with filter:', cleanFilter);
      const kind1Events = await nostrClientRef.current.getEvents(filters) as Kind1Event[];

      if (!kind1Events || kind1Events.length === 0) {
        console.log('No kind1 events found');
        if (loadMore) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
        return;
      }

      console.log('Found kind1 events:', kind1Events.length);

      // Get author pubkeys
      const authorPubkeys = [...new Set(kind1Events.map(event => event.pubkey))];

      // Load profiles
      const profileEvents = await nostrClientRef.current.getEvents([{
        kinds: [0],
        authors: authorPubkeys
      }]) as Kind0Event[];

      // Load zaps for these events
      const eventIds = kind1Events.map(event => event.id);
      const zapEvents = await nostrClientRef.current.getEvents([{
        kinds: [9735],
        '#e': eventIds
      }]) as Kind9735Event[];

      // Extract zap payer pubkeys and load their profiles
      const zapPayerPubkeys = new Set<string>();
      zapEvents.forEach(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            if (zapData.pubkey) {
              zapPayerPubkeys.add(zapData.pubkey);
            }
          } catch {
            // Handle parsing error
          }
        }
      });

      // Load zap payer profiles
      const zapPayerProfiles = zapPayerPubkeys.size > 0 ?
        await nostrClientRef.current.getEvents([{
          kinds: [0],
          authors: Array.from(zapPayerPubkeys)
        }]) as Kind0Event[] : [];

      // Combine all profiles
      const allProfiles = [...profileEvents, ...zapPayerProfiles];

      // Process posts
      const processedPosts = await processPosts(kind1Events, allProfiles, zapEvents);

      if (loadMore) {
        if (feed === 'following') {
          setFollowingPosts(prev => [...prev, ...processedPosts]);
        } else {
          setPosts(prev => [...prev, ...processedPosts]);
        }
        setIsLoadingMore(false);
      } else {
        if (feed === 'following') {
          setFollowingPosts(processedPosts);
        } else {
          setPosts(processedPosts);
        }
        setIsLoading(false);
      }

    } catch (err) {
      console.error('Failed to load posts:', err);
      console.error('Failed to load posts:', err instanceof Error ? err.message : 'Failed to load posts');
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const processPosts = async (kind1Events: Kind1Event[], profileEvents: Kind0Event[], zapEvents: Kind9735Event[]): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    for (const event of kind1Events) {
      const author = profileEvents.find(p => p.pubkey === event.pubkey);
      const zaps = zapEvents.filter(z => z.tags.some(tag => tag[0] === 'e' && tag[1] === event.id));

      // Process zaps with proper data extraction
      const processedZaps = zaps.map(zap => {
        // Extract zap amount from bolt11 tag
        const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
        let zapAmount = 0;
        if (bolt11Tag && window.lightningPayReq) {
          try {
            const decoded = window.lightningPayReq.decode(bolt11Tag[1] || '');
            zapAmount = decoded.satoshis || 0;
          } catch {
            zapAmount = 0;
          }
        }

        // Extract zap payer pubkey from description tag
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let zapPayerPubkey = '';
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            zapPayerPubkey = zapData.pubkey || '';
          } catch {
            zapPayerPubkey = '';
          }
        }

        // Find zap payer's profile
        const zapPayerProfile = profileEvents.find(p => p.pubkey === zapPayerPubkey);
        const zapPayerPicture = zapPayerProfile ?
          JSON.parse(zapPayerProfile.content).picture || 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg' :
          'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';

        // Debug logging
        if (zapPayerPubkey) {
          console.log('Zap payer pubkey:', zapPayerPubkey);
          console.log('Found zap payer profile:', !!zapPayerProfile);
          console.log('Zap payer picture:', zapPayerPicture);
        }

        // Create npub for zap payer
        const zapPayerNpub = zapPayerPubkey && window.NostrTools ?
          window.NostrTools.nip19.npubEncode(zapPayerPubkey) : '';

        return {
          ...zap,
          zapAmount,
          zapPayerPubkey,
          zapPayerPicture,
          zapPayerNpub
        };
      });

      const totalZapAmount = processedZaps.reduce((sum, zap) => sum + zap.zapAmount, 0);

      // Extract zap tags
      const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
      const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
      const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');

      const zapMin = zapMinTag ? parseInt(zapMinTag[1] || '0') / 1000 : 0;
      const zapMax = zapMaxTag ? parseInt(zapMaxTag[1] || '0') / 1000 : zapMin;
      const zapUses = zapUsesTag ? parseInt(zapUsesTag[1] || '1') : 1;
      const zapUsesCurrent = zaps.length;
      const zapPayer = zapPayerTag?.[1];
      const zapLNURL = zapLNURLTag?.[1];

      // Check if payable
      const isPayable = !!(author && JSON.parse(author.content).lud16) || !!zapLNURL;

      posts.push({
        id: event.id,
        event,
        author: author || null,
        zaps: processedZaps,
        zapAmount: totalZapAmount,
        zapMin,
        zapMax,
        zapUses,
        zapUsesCurrent,
        zapPayer,
        zapLNURL,
        isPayable,
        createdAt: event.created_at
      });
    }

    // Sort by creation time (newest first)
    return posts.sort((a, b) => b.createdAt - a.createdAt);
  };

  const handleFeedChange = (feed: 'global' | 'following') => {
    setActiveFeed(feed);
    if (feed === 'following' && followingPosts.length === 0) {
      loadFollowingPosts();
    }
  };

  const loadFollowingPosts = async () => {
    if (!authState.isLoggedIn || !nostrClientRef.current) return;

    try {
      // Load kind 3 (contacts) to get following list
      const kind3Events = await nostrClientRef.current.getEvents([{
        kinds: [3],
        authors: [authState.publicKey!]
      }]);

      const followingPubkeys: string[] = [];
      for (const event of kind3Events) {
        const pTags = event.tags.filter(tag => tag[0] === 'p');
        followingPubkeys.push(...pTags.map(tag => tag[1]).filter((pubkey): pubkey is string => Boolean(pubkey)));
      }

      followingPubkeysRef.current = followingPubkeys;
      await loadPosts('following');
    } catch (err) {
      console.error('Failed to load following posts:', err);
      console.error('Failed to load following posts');
    }
  };

  const handleQRScanner = () => {
    // QR scanner will be implemented in the component
    console.log('Opening QR scanner...');
  };

  const handleLogin = () => {
    // Login form will be handled by the component
    console.log('Opening login form...');
  };

  const handleNewPayNote = () => {
    if (!authState.isLoggedIn) {
      handleLogin();
      return;
    }
    console.log('Opening new pay note form...');
  };

  const handleSignInExtension = async (rememberMe: boolean = true) => {
    try {
      const result = await AuthService.signInWithExtension();

      if (result.success && result.publicKey) {
        AuthService.storeAuthData(result.publicKey, result.privateKey || null, 'extension', rememberMe);

        setAuthState({
          isLoggedIn: true,
          publicKey: result.publicKey,
          privateKey: result.privateKey || null,
          signInMethod: 'extension',
          userProfile: null
        });

        await loadUserProfile(result.publicKey);

        return { success: true };
      } else {
        console.error('Extension sign in failed:', result.error || 'Extension sign in failed');
        return { success: false, error: result.error || 'Extension sign in failed' };
      }
    } catch (error) {
      console.error('Extension sign in failed:', error);
      return { success: false, error: 'Extension sign in failed' };
    }
  };

  const handleSignInExternalSigner = async (rememberMe: boolean = true) => {
    try {
      const result = await AuthService.signInWithExternalSigner(rememberMe);

      if (!result.success) {
        console.error('External signer failed:', result.error || 'External signer failed');
        return { success: false, error: result.error || 'External signer failed' };
      }
      // Note: This will redirect the page, so the component will unmount
      return { success: true };
    } catch (error) {
      console.error('External signer failed:', error);
      return { success: false, error: 'External signer failed' };
    }
  };

  const handleSignInNsec = () => {
    // This will be handled by the component's nsec input
    console.log('Nsec sign in initiated...');
  };

  const handleContinueWithNsec = async (nsec: string, rememberMe: boolean) => {
    try {
      const result = await AuthService.signInWithNsec(nsec);

      if (result.success && result.publicKey) {
        AuthService.storeAuthData(result.publicKey, result.privateKey || null, 'nsec', rememberMe);

        setAuthState({
          isLoggedIn: true,
          publicKey: result.publicKey,
          privateKey: result.privateKey || null,
          signInMethod: 'nsec',
          userProfile: null
        });

        await loadUserProfile(result.publicKey);

        // Close the login overlay after successful authentication
        // Note: This will be handled by the component
      } else {
        console.error('Nsec sign in failed:', result.error || 'Invalid nsec');
      }
    } catch (error) {
      console.error('Nsec sign in failed:', error);
      console.error('Invalid nsec');
    }
  };

  const handleLogout = () => {
    AuthService.clearAuthData();

    setAuthState({
      isLoggedIn: false,
      publicKey: null,
      privateKey: null,
      signInMethod: null,
      userProfile: null
    });

    setFollowingPosts([]);
    followingPubkeysRef.current = [];
  };

  const handlePayWithExtension = async (post: PubPayPost, amount: number) => {
    if (!authState.isLoggedIn || !window.nostr) {
      console.error('Please sign in first');
      return;
    }

    try {
      // This would integrate with the zap functionality
      console.log('Paying with extension:', amount, 'sats for post:', post.id);
    } catch (err) {
      console.error('Payment failed:', err);
      console.error('Payment failed');
    }
  };

  const handlePayWithWallet = async (post: PubPayPost, amount: number) => {
    try {
      // This would generate a Lightning invoice
      console.log('Paying with wallet:', amount, 'sats for post:', post.id);
    } catch (err) {
      console.error('Payment failed:', err);
      console.error('Payment failed');
    }
  };

  const handleCopyInvoice = async (invoice: string) => {
    try {
      await navigator.clipboard.writeText(invoice);
      console.log('Invoice copied to clipboard');
    } catch (err) {
      console.error('Failed to copy invoice:', err);
      console.error('Failed to copy invoice');
    }
  };

  const handlePostNote = async (formData: Record<string, string | undefined>) => {
    if (!authState.isLoggedIn) {
      console.error('Please sign in first');
      return;
    }

    if (!nostrClientRef.current) {
      console.error('Nostr client not available');
      return;
    }

    try {
      const { payNoteContent, paymentType, zapFixed, zapMin, zapMax, zapUses, zapPayer, overrideLNURL } = formData;

      if (!payNoteContent || payNoteContent.trim() === '') {
        console.error('Please enter a payment request description');
        return;
      }

      // Build tags array
      const tags: string[][] = [['t', 'pubpay']];

      // Add zap amount tags
      let zapMinAmount, zapMaxAmount;
      if (paymentType === 'fixed') {
        const amount = parseInt(zapFixed ?? '1') || 1;
        zapMinAmount = amount * 1000; // Convert to millisatoshis
        zapMaxAmount = amount * 1000;
      } else if (paymentType === 'range') {
        zapMinAmount = (parseInt(zapMin ?? '1') || 1) * 1000;
        zapMaxAmount = (parseInt(zapMax ?? '1000000') || 1000000) * 1000;

        if (zapMaxAmount < zapMinAmount) {
          console.error('Maximum amount must be greater than minimum amount');
          return;
        }
      } else {
        console.error('Please select a payment type');
        return;
      }

      tags.push(['zap-min', zapMinAmount.toString()]);
      tags.push(['zap-max', zapMaxAmount.toString()]);

      // Add optional tags
      if (zapUses && parseInt(zapUses) > 0) {
        tags.push(['zap-uses', zapUses]);
      }

      if (zapPayer && zapPayer.trim() !== '') {
        try {
          const decoded = window.NostrTools.nip19.decode(zapPayer);
          if (decoded.type === 'npub') {
            tags.push(['zap-payer', decoded.data]);
          } else {
            console.error('Invalid payer npub format');
            return;
          }
        } catch {
          console.error('Invalid payer npub format');
          return;
        }
      }

      if (overrideLNURL && overrideLNURL.trim() !== '') {
        tags.push(['zap-lnurl', overrideLNURL]);
      }

      // Add client tag
      tags.push(['client', 'PubPay.me']);

      // Add mention tags if content has npubs
      const npubMentions = payNoteContent.match(/(nostr:|@)?((npub)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi);
      if (npubMentions) {
        npubMentions.forEach((mention: string) => {
          try {
            const cleanNpub = mention.replace(/nostr:|@/g, '');
            const decoded = window.NostrTools.nip19.decode(cleanNpub);
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
        const { data } = window.NostrTools.nip19.decode(authState.privateKey);
        signedEvent = window.NostrTools.finalizeEvent(event, data);
      } else if (authState.signInMethod === 'externalSigner') {
        // For external signer, we need to redirect
        event.pubkey = authState.publicKey!;
        event.id = window.NostrTools.getEventHash(event);
        const eventString = JSON.stringify(event);
        sessionStorage.setItem('SignKind1', JSON.stringify({ event }));
        window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
        return;
      } else {
        console.error('Invalid sign-in method');
        return;
      }

      // Verify the event
      if (!window.NostrTools.verifyEvent(signedEvent)) {
        console.error('Invalid signed event');
        return;
      }

      // Publish the event
      await nostrClientRef.current.publishEvent(signedEvent);

      console.log('Event published successfully');

      // Reload posts to show the new one
      await loadPosts(activeFeed);

    } catch (err) {
      console.error('Failed to post note:', err);
      console.error('Failed to post note:', err instanceof Error ? err.message : 'Failed to post note');
    }
  };

  const loadMorePosts = () => {
    if (!isLoadingMore) {
      loadPosts(activeFeed, true);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (nostrClientRef.current) {
          nostrClientRef.current.destroy();
        }
        if (lightningServiceRef.current) {
          lightningServiceRef.current.destroy();
        }
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    };
  }, []);

  return {
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    isLoadingMore,
    authState,
    handleFeedChange,
    handleQRScanner,
    handleLogin,
    handleNewPayNote,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleSignInNsec,
    handleContinueWithNsec,
    handleLogout,
    handlePayWithExtension,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts
  };
};
