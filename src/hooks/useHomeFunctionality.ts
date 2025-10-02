// React hook for home functionality integration
import { useEffect, useRef, useState } from 'react';
import { NostrClient } from '@/services/nostr/NostrClient';
import { LightningService } from '@/services/lightning/LightningService';
import { AuthService } from '@/services/AuthService';
import { ZapService } from '@/services/zap';
import { NostrFilter, NostrEvent, Kind1Event, Kind0Event, Kind9735Event } from '@/types/nostr';
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
  content: string;
  isPayable: boolean;
  zapLNURL?: string;
  createdAt: number;
}

interface AuthState {
  isLoggedIn: boolean;
  publicKey: string | null;
  privateKey: string | null;
  signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
  userProfile: Kind0Event | null;
  displayName: string | null;
}

export const useHomeFunctionality = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'global' | 'following'>('global');
  const [posts, setPosts] = useState<PubPayPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<PubPayPost[]>([]);
  const [replies, setReplies] = useState<PubPayPost[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    publicKey: null,
    privateKey: null,
    signInMethod: null,
    userProfile: null,
    displayName: null
  });

  const nostrClientRef = useRef<NostrClient | null>(null);
  const lightningServiceRef = useRef<LightningService | null>(null);
  const zapServiceRef = useRef<ZapService | null>(null);
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
        
        // Initialize Zap service
        zapServiceRef.current = new ZapService();

        console.log('Services initialized');
      } catch (err) {
        console.error('Failed to initialize services:', err);
        console.error('Failed to initialize services. Please refresh the page.');
      }
    };

    initializeServices();
  }, []);

  // Load initial posts (only if not in single note mode)
  useEffect(() => {
    const loadInitialPosts = () => {
      // Check if we're in single note mode first
      const queryParams = new URLSearchParams(window.location.search);
      const queryNote = queryParams.get("note");
      
      if (queryNote) {
        // Don't load global posts if we're in single note mode
        console.log('Single note mode detected, skipping global feed load');
        return;
      }

      if (nostrClientRef.current && typeof window !== 'undefined' && window.NostrTools) {
        // Add a small delay to ensure everything is ready
        setTimeout(() => {
          loadPosts('global');
        }, 1000);
      } else {
        // Retry loading posts when client becomes available
        const retryInterval = setInterval(() => {
          if (nostrClientRef.current && typeof window !== 'undefined' && window.NostrTools) {
            // Check again for single note mode before loading
            const queryParams = new URLSearchParams(window.location.search);
            const queryNote = queryParams.get("note");
            if (!queryNote) {
            loadPosts('global');
            }
            clearInterval(retryInterval);
          }
        }, 1000);

        // Cleanup interval after 30 seconds
        setTimeout(() => clearInterval(retryInterval), 30000);
      }
    };

    // Add a small delay to ensure HomePage has a chance to set single note mode
    setTimeout(() => {
    loadInitialPosts();
    }, 100);
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
            userProfile: null,
            displayName: null
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
        userProfile: null,
        displayName: null
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
        let displayName = null;
        
        try {
          const profileData = JSON.parse(profile?.content || '{}');
          displayName = profileData.display_name || profileData.displayName || profileData.name || null;
        } catch (error) {
          console.error('Failed to parse profile data:', error);
        }
        
        setAuthState(prev => ({
          ...prev,
          userProfile: profile || null,
          displayName: displayName
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

      // Add until filter for loading more posts (older posts)
      if (loadMore) {
        const currentPosts = feed === 'following' ? followingPosts : posts;
        if (currentPosts.length > 0) {
          // Get the oldest post (last in the array since they're sorted newest first)
          const oldestPost = currentPosts[currentPosts.length - 1];
          if (oldestPost) {
            filter.until = oldestPost.createdAt;
            console.log('Loading more posts until:', oldestPost.createdAt, 'for post:', oldestPost.id);
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
        let hasPubkeyInDescription = false;
        
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            if (zapData.pubkey) {
              zapPayerPubkeys.add(zapData.pubkey);
              hasPubkeyInDescription = true;
            }
          } catch {
            // Handle parsing error
          }
        }
        
        // For anonymous zaps (no pubkey in description), use the zap event's pubkey
        if (!hasPubkeyInDescription) {
          zapPayerPubkeys.add(zap.pubkey);
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

      // Process posts immediately with basic info (like legacy)
      const basicPosts = await processPostsBasic(kind1Events, allProfiles);

      if (loadMore) {
        if (feed === 'following') {
          setFollowingPosts(prev => {
            // Filter out duplicates based on post ID
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(`Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`);
            return [...prev, ...newPosts];
          });
        } else {
          setPosts(prev => {
            // Filter out duplicates based on post ID
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(`Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`);
            return [...prev, ...newPosts];
          });
        }
        setIsLoadingMore(false);
      } else {
        if (feed === 'following') {
          setFollowingPosts(basicPosts);
        } else {
          setPosts(basicPosts);
        }
        setIsLoading(false);
      }

      // Load zaps separately and update posts (like legacy)
      if (zapEvents.length > 0) {
        console.log('Loading zaps separately...');
        await loadZapsForPosts(kind1Events, zapEvents, feed);
      }

    } catch (err) {
      console.error('Failed to load posts:', err);
      console.error('Failed to load posts:', err instanceof Error ? err.message : 'Failed to load posts');
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Process posts with basic info only (like legacy drawKind1)
  const processPostsBasic = async (kind1Events: Kind1Event[], profileEvents: Kind0Event[]): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    for (const event of kind1Events) {
      const author = profileEvents.find(p => p.pubkey === event.pubkey);
      
      // Basic post info (no zaps yet)
      const post: PubPayPost = {
        id: event.id,
        event: event,
        author: author || {
          kind: 0,
          id: '',
          pubkey: event.pubkey,
          content: '{}',
          created_at: 0,
          sig: '',
          tags: []
        },
        createdAt: event.created_at,
        zapMin: 0,
        zapMax: 0,
        zapUses: 0,
        zapAmount: 0,
        zaps: [],
        zapUsesCurrent: 0,
        isPayable: true,
        content: event.content
      };

      // Extract zap min/max from tags
      const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
      
      if (zapMinTag && zapMinTag[1]) {
        post.zapMin = parseInt(zapMinTag[1]) / 1000 || 0;
      }
      if (zapMaxTag && zapMaxTag[1]) {
        post.zapMax = parseInt(zapMaxTag[1]) / 1000 || 0;
      }
      if (zapUsesTag && zapUsesTag[1]) {
        post.zapUses = parseInt(zapUsesTag[1]) || 0;
      }

      posts.push(post);
    }

    // Sort by creation time (newest first) - matches legacy behavior
    return posts.sort((a, b) => b.createdAt - a.createdAt);
  };

  // Load zaps separately and update posts (like legacy subscribeKind9735)
  const loadZapsForPosts = async (kind1Events: Kind1Event[], zapEvents: Kind9735Event[], feed: 'global' | 'following') => {
    const eventIds = kind1Events.map(event => event.id);
    const relevantZaps = zapEvents.filter(zap => 
      zap.tags.some(tag => tag[0] === 'e' && tag[1] && eventIds.includes(tag[1]))
    );

    if (relevantZaps.length === 0) return;

    // Load zap payer profiles
    const zapPayerPubkeys = new Set<string>();
    relevantZaps.forEach(zap => {
      const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
      let hasPubkeyInDescription = false;
      
      if (descriptionTag) {
        try {
          const zapData = JSON.parse(descriptionTag[1] || '{}');
          if (zapData.pubkey) {
            zapPayerPubkeys.add(zapData.pubkey);
            hasPubkeyInDescription = true;
          }
        } catch {
          // Handle parsing error
        }
      }
      
      // For anonymous zaps (no pubkey in description), use the zap event's pubkey
      if (!hasPubkeyInDescription) {
        zapPayerPubkeys.add(zap.pubkey);
      }
    });

    // Load zap payer profiles
    const zapPayerProfiles = zapPayerPubkeys.size > 0 ?
      await nostrClientRef.current?.getEvents([{
        kinds: [0],
        authors: Array.from(zapPayerPubkeys)
      }]) as Kind0Event[] : [];

    // Update posts with zap data
    const updatePostsWithZaps = (currentPosts: PubPayPost[]) => {
      return currentPosts.map(post => {
        const postZaps = relevantZaps.filter(zap => 
          zap.tags.some(tag => tag[0] === 'e' && tag[1] === post.id)
        ).reverse();

        if (postZaps.length === 0) return post;

        // Process zaps for this post
        const processedZaps: ProcessedZap[] = postZaps.map(zap => {
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

          const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
          let zapPayerPubkey = zap.pubkey;
          let isAnonymousZap = false;

          if (descriptionTag) {
            try {
              const zapData = JSON.parse(descriptionTag[1] || '{}');
              if (zapData.pubkey) {
                zapPayerPubkey = zapData.pubkey;
              } else {
                isAnonymousZap = true;
              }
            } catch {
              isAnonymousZap = true;
            }
          } else {
            isAnonymousZap = true;
          }

          const zapPayerProfile = zapPayerProfiles.find(p => p.pubkey === zapPayerPubkey);
          const zapPayerPicture = zapPayerProfile ? 
            JSON.parse(zapPayerProfile.content || '{}').picture || 
            'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg' :
            'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';

          // Generate npub for the zap payer
          const zapPayerNpub = window.NostrTools ? 
            window.NostrTools.nip19.npubEncode(zapPayerPubkey) : 
            zapPayerPubkey;

          return {
            ...zap,
            zapAmount,
            zapPayerPubkey,
            zapPayerPicture,
            zapPayerNpub
          };
        });

        const totalZapAmount = processedZaps.reduce((sum, zap) => sum + zap.zapAmount, 0);
        const zapUsesCurrent = processedZaps.length;

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
      setFollowingPosts(prev => updatePostsWithZaps(prev));
    } else {
      setPosts(prev => updatePostsWithZaps(prev));
    }
  };

  const processPosts = async (kind1Events: Kind1Event[], profileEvents: Kind0Event[], zapEvents: Kind9735Event[]): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    for (const event of kind1Events) {
      const author = profileEvents.find(p => p.pubkey === event.pubkey);
      const zaps = zapEvents.filter(z => z.tags.some(tag => tag[0] === 'e' && tag[1] === event.id)).reverse();

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
        let isAnonymousZap = false;
        
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            zapPayerPubkey = zapData.pubkey || '';
            // Check if this is an anonymous zap (no pubkey in description)
            isAnonymousZap = !zapData.pubkey;
          } catch {
            zapPayerPubkey = '';
            isAnonymousZap = true;
          }
        } else {
          isAnonymousZap = true;
        }

        // For anonymous zaps, use the zap event's pubkey instead
        if (isAnonymousZap) {
          zapPayerPubkey = zap.pubkey;
        }

        // Find zap payer's profile
        const zapPayerProfile = profileEvents.find(p => p.pubkey === zapPayerPubkey);
        
        let zapPayerPicture = 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
        
        if (zapPayerProfile) {
          try {
            const profileData = JSON.parse(zapPayerProfile.content);
            zapPayerPicture = profileData.picture || 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
          } catch {
            // If parsing fails, use default
            zapPayerPicture = 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
          }
        }

        // Debug logging
        console.log('Zap processing:', {
          zapId: zap.id,
          zapPayerPubkey,
          isAnonymousZap,
          foundProfile: !!zapPayerProfile,
          zapPayerPicture,
          profileEventsCount: profileEvents.length,
          availablePubkeys: profileEvents.map(p => p.pubkey).slice(0, 5) // First 5 for debugging
        });

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
        content: event.content,
        isPayable,
        zapPayer,
        zapLNURL,
        createdAt: event.created_at
      });
    }

    // Sort by creation time (newest first)
    return posts.sort((a, b) => b.createdAt - a.createdAt);
  };

  const handleFeedChange = (feed: 'global' | 'following') => {
    if (feed === 'following' && !authState.isLoggedIn) {
      handleLogin();
      return;
    }
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
    // Dispatch custom event to show login form
    const customEvent = new CustomEvent('showLoginForm');
    window.dispatchEvent(customEvent);
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
          userProfile: null,
          displayName: null
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
          userProfile: null,
          displayName: null
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
      userProfile: null,
      displayName: null
    });

    setFollowingPosts([]);
    followingPubkeysRef.current = [];
  };

  const handlePayWithExtension = async (post: PubPayPost, amount: number) => {
    if (!authState.isLoggedIn) {
      handleLogin();
      return;
    }
    
    if (!window.nostr) {
      console.error('Nostr extension not available');
      return;
    }

    if (!zapServiceRef.current) {
      console.error('Zap service not initialized');
      return;
    }

    try {
      console.log('Processing zap payment:', amount, 'sats for post:', post.id);
      
      // Get author data
      if (!post.author) {
        console.error('No author data found');
        return;
      }

      // Get Lightning callback (pass raw author object, not parsed content)
      const callback = await zapServiceRef.current.getInvoiceCallBack(post.event, post.author);
      if (!callback) {
        console.error('Failed to get Lightning callback');
        return;
      }

      // Get user's public key
      const publicKey = authState.publicKey;
      if (!publicKey) {
        console.error('No public key found');
        return;
      }

      // Create zap event
      const zapEventData = await zapServiceRef.current.createZapEvent(
        post.event,
        amount,
        callback.lud16ToZap,
        publicKey
      );
      
      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event
      const success = await zapServiceRef.current.signZapEvent(
        zapEventData.zapEvent,
        callback.callbackToZap,
        zapEventData.amountPay,
        callback.lud16ToZap,
        post.id,
        false // not anonymous
      );

      if (success) {
        console.log('Zap payment initiated successfully');
        // The ZapService will trigger the payment UI via custom event
      } else {
        console.error('Failed to sign and send zap event');
      }
    } catch (err) {
      console.error('Payment failed:', err);
    }
  };

  const handlePayAnonymously = async (post: PubPayPost, amount: number) => {
    if (!zapServiceRef.current) {
      console.error('Zap service not initialized');
      return;
    }

    try {
      console.log('Processing anonymous zap payment:', amount, 'sats for post:', post.id);
      
      // Get author data
      if (!post.author) {
        console.error('No author data found');
        return;
      }

      // Get Lightning callback (pass raw author object, not parsed content)
      const callback = await zapServiceRef.current.getInvoiceCallBack(post.event, post.author);
      if (!callback) {
        console.error('Failed to get Lightning callback');
        return;
      }

      // Create zap event (no public key for anonymous)
      const zapEventData = await zapServiceRef.current.createZapEvent(
        post.event,
        amount,
        callback.lud16ToZap,
        null // No public key for anonymous zap
      );
      
      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event (anonymous = true)
      const success = await zapServiceRef.current.signZapEvent(
        zapEventData.zapEvent,
        callback.callbackToZap,
        zapEventData.amountPay,
        callback.lud16ToZap,
        post.id,
        true // anonymous zap
      );

      if (success) {
        console.log('Anonymous zap payment initiated successfully');
        // The ZapService will trigger the payment UI via custom event
      } else {
        console.error('Failed to initiate anonymous zap payment');
      }
    } catch (err) {
      console.error('Anonymous zap payment failed:', err);
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
      handleLogin();
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

      // Reload posts to show the new one (since real-time subscription is disabled)
      await loadPosts(activeFeed);

    } catch (err) {
      console.error('Failed to post note:', err);
      console.error('Failed to post note:', err instanceof Error ? err.message : 'Failed to post note');
    }
  };

  const loadMorePosts = async () => {
    if (isLoadingMore) {
      console.log('Already loading more posts, skipping...');
      return;
    }

    // Check if we have enough posts to load more (like the original)
    const currentPosts = activeFeed === 'following' ? followingPosts : posts;
    if (currentPosts.length < 21) {
      console.log('Not enough posts to load more, skipping...');
      return;
    }

    console.log('Loading more posts...');
    return loadPosts(activeFeed, true);
  };

  // Load single note and its replies
  const loadSingleNote = async (eventId: string) => {
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
      setIsLoading(true);
      
      // Clear existing posts when loading single note
      setPosts([]);
      setReplies([]);

      // Load the specific note
      const filter: NostrFilter = {
        kinds: [1],
        ids: [eventId]
      };

      const cleanFilter = JSON.parse(JSON.stringify(filter));
      const kind1Events = await nostrClientRef.current.getEvents([cleanFilter]) as Kind1Event[];

      if (!kind1Events || kind1Events.length === 0) {
        console.log('Note not found');
        setIsLoading(false);
        return;
      }

      console.log('Found single note:', kind1Events[0]);

      // Get author profile
      const authorPubkey = kind1Events[0]?.pubkey;
      if (!authorPubkey) {
        console.error('No author pubkey found');
        setIsLoading(false);
        return;
      }
      const profileEvents = await nostrClientRef.current.getEvents([{
        kinds: [0],
        authors: [authorPubkey]
      }]) as Kind0Event[];

      // Load zaps for this event
      const zapEvents = await nostrClientRef.current.getEvents([{
        kinds: [9735],
        '#e': [eventId]
      }]) as Kind9735Event[];

      // Extract zap payer pubkeys and load their profiles
      const zapPayerPubkeys = new Set<string>();
      zapEvents.forEach(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let hasPubkeyInDescription = false;
        
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            if (zapData.pubkey) {
              zapPayerPubkeys.add(zapData.pubkey);
              hasPubkeyInDescription = true;
            }
          } catch {
            // Handle parsing error
          }
        }
        
        // For anonymous zaps (no pubkey in description), use the zap event's pubkey
        if (!hasPubkeyInDescription) {
          zapPayerPubkeys.add(zap.pubkey);
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

      // Process the single note
      const processedPosts = await processPosts(kind1Events, allProfiles, zapEvents);
      
      if (processedPosts.length > 0) {
        setPosts(processedPosts);
      }

      // Load replies to this note
      await loadReplies(eventId);

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load single note:', err);
      setIsLoading(false);
    }
  };

  // Calculate reply levels for proper indentation (matches legacy behavior)
  const calculateReplyLevels = (replies: PubPayPost[]): (PubPayPost & { replyLevel: number })[] => {
    const repliesWithLevels: (PubPayPost & { replyLevel: number })[] = [];
    const replyMap = new Map<string, number>(); // eventId -> level
    
    for (const reply of replies) {
      let level = 0;
      
      // Find the reply tag to get the parent event ID
      const replyTag = reply.event.tags.find(tag => tag[0] === 'e' && tag[3] === 'reply');
      if (replyTag && replyTag[1]) {
        const parentEventId = replyTag[1];
        const parentLevel = replyMap.get(parentEventId);
        if (parentLevel !== undefined) {
          level = parentLevel + 1;
        }
      }
      
      replyMap.set(reply.id, level);
      repliesWithLevels.push({ ...reply, replyLevel: level });
    }
    
    return repliesWithLevels;
  };

  // Load replies to a specific note
  const loadReplies = async (parentEventId: string) => {
    if (!nostrClientRef.current) return;

    try {
      const replyFilter: NostrFilter = {
        kinds: [1],
        '#e': [parentEventId]
      };

      const cleanFilter = JSON.parse(JSON.stringify(replyFilter));
      const replyEvents = await nostrClientRef.current.getEvents([cleanFilter]) as Kind1Event[];

      if (!replyEvents || replyEvents.length === 0) {
        setReplies([]);
        return;
      }

      console.log('Found replies:', replyEvents.length);

      // Get author pubkeys for replies
      const authorPubkeys = [...new Set(replyEvents.map(event => event.pubkey))];

      // Load profiles for reply authors
      const profileEvents = await nostrClientRef.current.getEvents([{
        kinds: [0],
        authors: authorPubkeys
      }]) as Kind0Event[];

      // Load zaps for reply events
      const eventIds = replyEvents.map(event => event.id);
      const zapEvents = await nostrClientRef.current.getEvents([{
        kinds: [9735],
        '#e': eventIds
      }]) as Kind9735Event[];

      // Extract zap payer pubkeys and load their profiles
      const zapPayerPubkeys = new Set<string>();
      zapEvents.forEach(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let hasPubkeyInDescription = false;
        
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            if (zapData.pubkey) {
              zapPayerPubkeys.add(zapData.pubkey);
              hasPubkeyInDescription = true;
            }
          } catch {
            // Handle parsing error
          }
        }
        
        // For anonymous zaps (no pubkey in description), use the zap event's pubkey
        if (!hasPubkeyInDescription) {
          zapPayerPubkeys.add(zap.pubkey);
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

      // Process replies
      const processedReplies = await processPosts(replyEvents, allProfiles, zapEvents);
      
      // Sort replies by creation time (oldest first, like the original)
      const sortedReplies = processedReplies.sort((a, b) => a.createdAt - b.createdAt);
      
      // Calculate reply levels for proper indentation
      const repliesWithLevels = calculateReplyLevels(sortedReplies);
      
      setReplies(repliesWithLevels);
    } catch (err) {
      console.error('Failed to load replies:', err);
    }
  };

  // Subscribe to new zaps in real-time (disable note subscription for now)
  useEffect(() => {
    if (!nostrClientRef.current || isLoading) {
      return () => {}; // Return empty cleanup function
    }

    // Temporarily disable real-time note subscription to fix loading issues
    // The legacy code works fine without real-time note subscriptions
    // Only real-time zap subscriptions are needed
    const notesSub = null; // Disabled for now

    // Subscribe to new zaps for all current posts
    let zapsSub: any = null;
    if (posts.length > 0) {
      const eventIds = posts.map(post => post.id);
      
      zapsSub = nostrClientRef.current.subscribeToEvents([{
        kinds: [9735],
        '#e': eventIds
      }], async (zapEvent: NostrEvent) => {
      // Type guard to ensure this is a zap event
      if (zapEvent.kind !== 9735) return;
      
      console.log('New zap received:', zapEvent);
      
      // Find which post this zap belongs to
      const eventTag = zapEvent.tags.find((tag: any) => tag[0] === 'e');
      if (!eventTag) return;
      
      const postId = eventTag[1];
      const postIndex = posts.findIndex(post => post.id === postId);
      if (postIndex === -1) return;
      
      // Check if this zap already exists to prevent duplicates
      const existingZap = posts[postIndex]?.zaps.find(zap => zap.id === zapEvent.id);
      if (existingZap) {
        console.log('Zap already exists, skipping:', zapEvent.id);
        return;
      }
      
      // Process the new zap
      const processedZap = await processNewZap(zapEvent as Kind9735Event);
      if (!processedZap) return;
      
      // Check if this zap should close the invoice overlay
      const invoiceOverlay = document.getElementById("invoiceOverlay");
      if (invoiceOverlay) {
        const overlayEventID = invoiceOverlay.getAttribute("data-event-id");
        
        // Get the zap request event ID from the description tag (this is what we compare)
        const descriptionTag = zapEvent.tags.find((tag: any) => tag[0] === 'description');
        let zapRequestEventId = '';
        if (descriptionTag) {
          try {
            const zapData = JSON.parse(descriptionTag[1] || '{}');
            zapRequestEventId = zapData.id || '';
          } catch {
            console.log('Failed to parse zap description');
          }
        }
        
        console.log('Checking overlay close:', {
          overlayEventID,
          zapRequestEventId,
          zapEventId: zapEvent.id
        });
        
        if (overlayEventID === zapRequestEventId) {
          // Close the invoice overlay when the zap is detected
          invoiceOverlay.style.display = "none";
          const invoiceQR = document.getElementById("invoiceQR");
          if (invoiceQR) {
            invoiceQR.innerHTML = "";
          }
          console.log("Overlay closed for event:", postId);
        }
      }
      
      // Update the specific post with the new zap
      setPosts(prevPosts => {
        const newPosts = [...prevPosts];
        const post = newPosts[postIndex];
        if (!post) return newPosts;
        
        // Double-check for duplicates in the state update
        const existingZapInState = post.zaps.find(zap => zap.id === zapEvent.id);
        if (existingZapInState) {
          console.log('Zap already exists in state, skipping:', zapEvent.id);
          return newPosts;
        }
        
        // Add the new zap to the post
        const updatedPost: PubPayPost = {
          ...post,
          zaps: [...post.zaps, processedZap],
          zapAmount: post.zapAmount + processedZap.zapAmount,
          zapUsesCurrent: post.zapUsesCurrent + 1
        };
        
        newPosts[postIndex] = updatedPost;
        return newPosts;
      });
    }, {
      oneose: () => {
        console.log('Zap subscription EOS');
      },
      onclosed: () => {
        console.log('Zap subscription closed');
      }
    });
    }

    return () => {
      // notesSub is disabled for now
      if (zapsSub) {
        zapsSub.unsubscribe();
      }
    };
  }, [posts.length, isLoading]); // Re-subscribe when posts change or loading state changes

  // Process a new zap event
  const processNewZap = async (zapEvent: Kind9735Event): Promise<ProcessedZap | null> => {
    try {
      // Extract zap amount from bolt11 tag
      const bolt11Tag = zapEvent.tags.find(tag => tag[0] === 'bolt11');
      let zapAmount = 0;
      if (bolt11Tag && (window as any).lightningPayReq) {
        try {
          const decoded = (window as any).lightningPayReq.decode(bolt11Tag[1]);
          zapAmount = decoded.satoshis || 0;
        } catch {
          zapAmount = 0;
        }
      }

      // Extract zap payer pubkey from description tag
      const descriptionTag = zapEvent.tags.find(tag => tag[0] === 'description');
      let zapPayerPubkey = '';
      let isAnonymousZap = false;
      
      if (descriptionTag) {
        try {
          const zapData = JSON.parse(descriptionTag[1] || '{}');
          zapPayerPubkey = zapData.pubkey || '';
          isAnonymousZap = !zapData.pubkey;
        } catch {
          zapPayerPubkey = '';
          isAnonymousZap = true;
        }
      } else {
        isAnonymousZap = true;
      }

      // For anonymous zaps, use the zap event's pubkey instead
      if (isAnonymousZap) {
        zapPayerPubkey = zapEvent.pubkey;
      }

      // Get zap payer profile
      let zapPayerProfile = null;
      if (zapPayerPubkey) {
        const profileEvents = await nostrClientRef.current!.getEvents([{
          kinds: [0],
          authors: [zapPayerPubkey]
        }]) as Kind0Event[];
        zapPayerProfile = profileEvents[0];
      }

      let zapPayerPicture = 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
      
      if (zapPayerProfile) {
        try {
          const profileData = JSON.parse(zapPayerProfile.content);
          zapPayerPicture = profileData.picture || 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
        } catch {
          // If parsing fails, use default
          zapPayerPicture = 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
        }
      }

      // Create npub for zap payer
      const zapPayerNpub = zapPayerPubkey && window.NostrTools ?
        window.NostrTools.nip19.npubEncode(zapPayerPubkey) : '';

      return {
        ...zapEvent,
        zapAmount,
        zapPayerPubkey,
        zapPayerPicture,
        zapPayerNpub
      };
    } catch (error) {
      console.error('Error processing new zap:', error);
      return null;
    }
  };

  // Process a new note event and add it to the feed
  const processNewNote = async (noteEvent: Kind1Event) => {
    try {
      console.log('Processing new note:', noteEvent.id);
      
      // Get the author's profile
      const authorProfiles = await nostrClientRef.current?.getEvents([{
        kinds: [0],
        authors: [noteEvent.pubkey]
      }]) as Kind0Event[];
      
      const author = authorProfiles[0] || {
        kind: 0, id: '', pubkey: noteEvent.pubkey, content: '{}', created_at: 0, sig: '', tags: []
      };
      
      // Create basic post structure (like processPostsBasic)
      const newPost: PubPayPost = {
        id: noteEvent.id,
        event: noteEvent,
        author: author,
        createdAt: noteEvent.created_at,
        zapMin: 0,
        zapMax: 0,
        zapUses: 0,
        zapAmount: 0,
        zaps: [],
        zapUsesCurrent: 0,
        isPayable: true,
        content: noteEvent.content
      };

      // Extract zap min/max from tags
      const zapMinTag = noteEvent.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = noteEvent.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = noteEvent.tags.find(tag => tag[0] === 'zap-uses');
      
      if (zapMinTag && zapMinTag[1]) {
        newPost.zapMin = parseInt(zapMinTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapMaxTag && zapMaxTag[1]) {
        newPost.zapMax = parseInt(zapMaxTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapUsesTag && zapUsesTag[1]) {
        newPost.zapUses = parseInt(zapUsesTag[1]) || 0; // Only set if tag exists
      }

      // Add the new post to the beginning of the posts array (most recent first)
      setPosts(prevPosts => {
        // Check if post already exists to prevent duplicates
        const exists = prevPosts.find(post => post.id === noteEvent.id);
        if (exists) {
          console.log('Post already exists in state, skipping:', noteEvent.id);
          return prevPosts;
        }
        
        console.log('Adding new post to feed:', noteEvent.id);
        return [newPost, ...prevPosts];
      });
      
      // Also add to following posts if we're in following mode
      if (activeFeed === 'following') {
        setFollowingPosts(prevPosts => {
          const exists = prevPosts.find(post => post.id === noteEvent.id);
          if (exists) {
            return prevPosts;
          }
          return [newPost, ...prevPosts];
        });
      }
      
    } catch (error) {
      console.error('Error processing new note:', error);
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
    replies,
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
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts,
    loadSingleNote,
    loadReplies
  };
};
