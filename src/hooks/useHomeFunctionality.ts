// React hook for home functionality integration
import { useEffect, useRef, useState, useCallback } from 'react';
import { NostrClient } from '@/services/nostr/NostrClient';
import { LightningService } from '@/services/lightning/LightningService';
import { AuthService } from '@/services/AuthService';
import { useAppStore } from '@/stores/AppStore';
import { NostrEvent, NostrFilter, Kind1Event, Kind0Event, Kind9735Event } from '@/types/nostr';
import { LightningConfig } from '@/types/lightning';

// Types for PubPay posts
export interface PubPayPost {
  id: string;
  event: Kind1Event;
  author: Kind0Event | null;
  zaps: Kind9735Event[];
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
  const [error, setError] = useState<string | null>(null);
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

  const homeRef = useRef<any>(null);
  const nostrClientRef = useRef<NostrClient | null>(null);
  const lightningServiceRef = useRef<LightningService | null>(null);
  const subscriptionsRef = useRef<Map<string, any>>(new Map());
  const followingPubkeysRef = useRef<string[]>([]);

  // Initialize services
  useEffect(() => {
  const initializeServices = () => {
    try {
      // Check if NostrTools is available
      if (typeof window === 'undefined' || !(window as any).NostrTools) {
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
      setError('Failed to initialize services. Please refresh the page.');
    }
  };

    initializeServices();
  }, []);

  // Load initial posts
  useEffect(() => {
    const loadInitialPosts = () => {
      if (nostrClientRef.current && typeof window !== 'undefined' && (window as any).NostrTools) {
        // Add a small delay to ensure everything is ready
        setTimeout(() => {
          loadPosts('global');
        }, 1000);
      } else {
        // Retry loading posts when client becomes available
        const retryInterval = setInterval(() => {
          if (nostrClientRef.current && typeof window !== 'undefined' && (window as any).NostrTools) {
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
        signInMethod: method as any,
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
    if (typeof window === 'undefined' || !(window as any).NostrTools) {
      console.warn('NostrTools not available yet');
      return;
    }

    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

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

      const kind1Events = await nostrClientRef.current.getEvents(filters) as Kind1Event[];
      
      if (!kind1Events || kind1Events.length === 0) {
        if (loadMore) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
        return;
      }

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

      // Process posts
      const processedPosts = await processPosts(kind1Events, profileEvents, zapEvents);

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
      setError(err instanceof Error ? err.message : 'Failed to load posts');
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const processPosts = async (kind1Events: Kind1Event[], profileEvents: Kind0Event[], zapEvents: Kind9735Event[]): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    for (const event of kind1Events) {
      const author = profileEvents.find(p => p.pubkey === event.pubkey);
      const zaps = zapEvents.filter(z => z.tags.some(tag => tag[0] === 'e' && tag[1] === event.id));
      
      // Extract zap amounts
      const zapAmounts = zaps.map(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            return zapData.amount || 0;
          } catch {
            return 0;
          }
        }
        return 0;
      });
      
      const totalZapAmount = zapAmounts.reduce((sum, amount) => sum + amount, 0);

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
        zaps,
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
      setError('Failed to load following posts');
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

  const handleSignInExtension = async () => {
    try {
      const result = await AuthService.signInWithExtension();
      
      if (result.success && result.publicKey) {
        AuthService.storeAuthData(result.publicKey, result.privateKey || null, 'extension', true);
        
        setAuthState({
          isLoggedIn: true,
          publicKey: result.publicKey,
          privateKey: result.privateKey || null,
          signInMethod: 'extension',
          userProfile: null
        });
        
        await loadUserProfile(result.publicKey);
      } else {
        setError(result.error || 'Extension sign in failed');
      }
    } catch (err) {
      console.error('Extension sign in failed:', err);
      setError('Extension sign in failed');
    }
  };

  const handleSignInExternalSigner = async () => {
    try {
      const result = await AuthService.signInWithExternalSigner(false);
      
      if (!result.success) {
        setError(result.error || 'External signer failed');
      }
      // Note: This will redirect the page, so the component will unmount
    } catch (err) {
      console.error('External signer failed:', err);
      setError('External signer failed');
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
      } else {
        setError(result.error || 'Invalid nsec');
      }
    } catch (err) {
      console.error('Nsec sign in failed:', err);
      setError('Invalid nsec');
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
    if (!authState.isLoggedIn || !(window as any).nostr) {
      setError('Please sign in first');
      return;
    }

    try {
      // This would integrate with the zap functionality
      console.log('Paying with extension:', amount, 'sats for post:', post.id);
    } catch (err) {
      console.error('Payment failed:', err);
      setError('Payment failed');
    }
  };

  const handlePayWithWallet = async (post: PubPayPost, amount: number) => {
    try {
      // This would generate a Lightning invoice
      console.log('Paying with wallet:', amount, 'sats for post:', post.id);
    } catch (err) {
      console.error('Payment failed:', err);
      setError('Payment failed');
    }
  };

  const handleCopyInvoice = async (invoice: string) => {
    try {
      await navigator.clipboard.writeText(invoice);
      console.log('Invoice copied to clipboard');
    } catch (err) {
      console.error('Failed to copy invoice:', err);
      setError('Failed to copy invoice');
    }
  };

  const handlePostNote = async (formData: any) => {
    if (!authState.isLoggedIn) {
      setError('Please sign in first');
      return;
    }

    try {
      // This would create and publish a kind 1 event
      console.log('Posting note:', formData);
    } catch (err) {
      console.error('Failed to post note:', err);
      setError('Failed to post note');
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
    error,
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
    loadMorePosts,
    setError
  };
};
