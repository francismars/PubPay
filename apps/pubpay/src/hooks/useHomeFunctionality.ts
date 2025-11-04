import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
// React hook for home functionality integration
import { useEffect, useRef, useState } from 'react';
import { NostrClient } from '@pubpay/shared-services';
import { ensureProfiles } from '@pubpay/shared-services';
import { ensureZaps } from '@pubpay/shared-services';
import { ensurePosts } from '@pubpay/shared-services';
import { getQueryClient } from '@pubpay/shared-services';
import { LightningService } from '@pubpay/shared-services';
import { FollowService, useUIStore, NostrUtil } from '@pubpay/shared-services';
import { AuthService } from '@pubpay/shared-services';
import { ZapService } from '@pubpay/shared-services';
import { BlossomService } from '@pubpay/shared-services';
import {
  NostrFilter,
  NostrEvent,
  Kind1Event,
  Kind0Event,
  Kind9735Event
} from '@pubpay/shared-types';
import { LightningConfig } from '@pubpay/shared-types';
import { genericUserIcon } from '../assets/images';

// Import npm packages
import { nip19, finalizeEvent, getEventHash, verifyEvent } from 'nostr-tools';
import * as bolt11 from 'bolt11';
import QRCode from 'qrcode';

// Types for processed zaps
interface ProcessedZap extends Kind9735Event {
  zapAmount: number;
  zapPayerPubkey: string;
  zapPayerPicture: string;
  zapPayerNpub: string;
  isNewZap?: boolean; // Flag to indicate if this is a newly detected zap
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
  zapGoal?: number;
  zapPayer?: string;
  zapPayerPicture?: string;
  zapPayerName?: string;
  content: string;
  isPayable: boolean;
  hasZapTags?: boolean;
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
  const [nostrReady, setNostrReady] = useState(false);
  const [activeFeed, setActiveFeed] = useState<'global' | 'following'>(
    'global'
  );
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
  // Track payment errors per post ID
  const [paymentErrors, setPaymentErrors] = useState<Map<string, string>>(
    new Map()
  );

  const nostrClientRef = useRef<NostrClient | null>(null);
  const lightningServiceRef = useRef<LightningService | null>(null);
  const zapServiceRef = useRef<ZapService | null>(null);
  const followingPubkeysRef = useRef<string[]>([]);
  const didLoadInitialRef = useRef<boolean>(false);
  const newestPostTimestampRef = useRef<number>(0); // Track newest post time for subscriptions
  const subscriptionRef = useRef<any>(null); // Track the new post subscription

  // Profile cache to prevent duplicate requests
  const profileCacheRef = useRef<Map<string, Kind0Event>>(new Map());
  const pendingProfileRequestsRef = useRef<Set<string>>(new Set());

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

  // Initialize services (only once)
  useEffect(() => {
    // Prevent duplicate initialization
    if (nostrClientRef.current) {
      return;
    }

    const initializeServices = () => {
      try {
        // Initialize Nostr client with user custom relays if present
        let initialRelays: string[] | undefined = undefined;
        try {
          const savedRelays = localStorage.getItem('customRelays');
          if (savedRelays) {
            const parsed = JSON.parse(savedRelays);
            if (
              Array.isArray(parsed) &&
              parsed.every(r => typeof r === 'string')
            ) {
              initialRelays = parsed;
            }
          }
        } catch {}
        nostrClientRef.current = new NostrClient(initialRelays);

        // Initialize Lightning service
        const lightningConfig: LightningConfig = {
          enabled: true,
          lnbitsUrl:
            (typeof process !== 'undefined' &&
              process.env?.REACT_APP_LNBITS_URL) ||
            '',
          apiKey:
            (typeof process !== 'undefined' &&
              process.env?.REACT_APP_LNBITS_API_KEY) ||
            '',
          webhookUrl:
            (typeof process !== 'undefined' &&
              process.env?.REACT_APP_WEBHOOK_URL) ||
            ''
        };
        lightningServiceRef.current = new LightningService(lightningConfig);

        // Initialize Zap service
        zapServiceRef.current = new ZapService();

        console.log('Services initialized');
        setNostrReady(true);
      } catch (err) {
        console.error('Failed to initialize services:', err);
        console.error(
          'Failed to initialize services. Please refresh the page.'
        );
      }
    };

    initializeServices();

    // Listen for relay updates from Settings and re-init Nostr client
    const handleRelaysUpdated = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as
          | { relays?: string[] }
          | undefined;
        const nextRelays =
          detail && Array.isArray(detail.relays) ? detail.relays : undefined;
        nostrClientRef.current = new NostrClient(nextRelays);
        console.log('Nostr client reinitialized with relays:', nextRelays);
      } catch {}
    };
    window.addEventListener(
      'relaysUpdated',
      handleRelaysUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        'relaysUpdated',
        handleRelaysUpdated as EventListener
      );
    };
  }, []);

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
    const timer = setTimeout(checkAndLoadPosts, 100);

    // Listen for popstate (back/forward buttons and programmatic navigation)
    window.addEventListener('popstate', checkAndLoadPosts);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', checkAndLoadPosts);
    };
  }, [posts.length, activeFeed]);

  // Check authentication status
  useEffect(() => {
    checkAuthStatus();

    // Handle external signer return
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // First, process sign-in return (npub from clipboard)
        const result = await AuthService.handleExternalSignerReturn();
        if (result.success && result.publicKey) {
          AuthService.storeAuthData(result.publicKey, null, 'externalSigner');

          setAuthState({
            isLoggedIn: true,
            publicKey: result.publicKey,
            privateKey: null,
            signInMethod: 'externalSigner',
            userProfile: null,
            displayName: null
          });

          await loadUserProfile(result.publicKey);
          // Load follow suggestions after login via external signer
          try {
            const suggestions = await FollowService.getFollowSuggestions(
              nostrClientRef.current,
              result.publicKey
            );
            useUIStore.getState().setFollowSuggestions(suggestions);
          } catch {}
        }

        // Then, handle pending external-signer operations that require signature
        try {
          // Ensure page has focus to allow clipboard reads
          while (!document.hasFocus()) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Helper to read signature from clipboard with retries and prompt fallback
          const readClipboard = async (): Promise<string | null> => {
            // Try up to 10 times with small delay to allow clipboard to populate
            for (let i = 0; i < 10; i++) {
              try {
                const text = await navigator.clipboard.readText();
                const val = (text || '').trim();
                if (val) return val;
              } catch {}
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Last resort: prompt user to paste manually (non-blocking UX is preferred, but this ensures progress)
            try {
              const manual = window.prompt('Paste signature from signer');
              if (manual && manual.trim()) return manual.trim();
            } catch {}
            return null;
          };

          // Handle SignKind1: finalize and publish a note
          try {
            const kind1Raw = sessionStorage.getItem('SignKind1');
            if (kind1Raw) {
              const payload = JSON.parse(kind1Raw) as { event?: any };
              sessionStorage.removeItem('SignKind1');

              if (payload && payload.event) {
                const sig = await readClipboard();
                if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                  console.error(
                    'No valid signature found in clipboard for note'
                  );
                  return;
                }

                const eventSigned = { ...payload.event, sig };
                const verified = verifyEvent(eventSigned);
                if (!verified) {
                  console.error('Invalid signed event (note)');
                  return;
                }

                if (nostrClientRef.current) {
                  await nostrClientRef.current.publishEvent(eventSigned);
                  console.log('Note published via external signer');
                }
              }
            }
          } catch (e) {
            console.warn('Error handling SignKind1 return:', e);
          }

          // Handle SignZapEvent: finalize and proceed to get invoice/pay
          try {
            const zapRaw = sessionStorage.getItem('SignZapEvent');
            if (zapRaw) {
              const payload = JSON.parse(zapRaw) as {
                callback: string;
                amount: number;
                lud16: string;
                event: any;
                id: string;
              };
              sessionStorage.removeItem('SignZapEvent');

              const sig = await readClipboard();
              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error('No valid signature found in clipboard for zap');
                return;
              }

              const eventSigned = { ...payload.event, sig };
              const verified = verifyEvent(eventSigned);
              if (!verified) {
                console.error('Invalid signed event (zap)');
                return;
              }

              if (zapServiceRef.current) {
                await zapServiceRef.current.getInvoiceandPay(
                  payload.callback,
                  payload.amount,
                  eventSigned,
                  payload.lud16,
                  payload.id
                );
              }
            }
          } catch (e) {
            console.warn('Error handling SignZapEvent return:', e);
          }

          // Handle SignProfileUpdate: finalize and publish profile update
          try {
            const profileRaw = sessionStorage.getItem('SignProfileUpdate');
            if (profileRaw) {
              console.log(
                'Found SignProfileUpdate data, processing profile update...'
              );
              const eventTemplate = JSON.parse(profileRaw);
              sessionStorage.removeItem('SignProfileUpdate');

              console.log(
                'Reading signature from clipboard for profile update...'
              );
              let sig = await readClipboard();
              if (sig) {
                sig = sig.trim();
              }
              console.log(
                'Signature read, length:',
                sig?.length,
                'first 20 chars:',
                sig?.substring(0, 20)
              );

              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error(
                  'No valid signature found in clipboard for profile update. Signature:',
                  sig?.substring(0, 40)
                );
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'No valid signature found. Please try saving again.',
                      'error',
                      true
                    );
                } catch {}
                return;
              }

              const eventSigned = { ...eventTemplate, sig };
              const verified = verifyEvent(eventSigned);
              if (!verified) {
                console.error('Invalid signed event (profile update)');
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'Invalid signature. Please try saving again.',
                      'error',
                      true
                    );
                } catch {}
                return;
              }

              console.log('Event verified, publishing profile update...');
              if (nostrClientRef.current) {
                await nostrClientRef.current.publishEvent(eventSigned);
                console.log('Profile updated via external signer');

                // Show success toast
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'Profile updated successfully!',
                      'success',
                      false
                    );
                  setTimeout(() => {
                    try {
                      useUIStore.getState().closeToast();
                    } catch {}
                  }, 2000);
                } catch {}

                // Invalidate cache and reload profile to reflect changes
                if (authState.publicKey) {
                  const pubkey = authState.publicKey;
                  const queryClient = getQueryClient();
                  queryClient.removeQueries({ queryKey: ['profile', pubkey] });
                  queryClient.invalidateQueries({
                    queryKey: ['profile', pubkey]
                  });
                  setTimeout(async () => {
                    await loadUserProfile(pubkey);
                  }, 500);
                }

                // Wait a bit for profile to reload, then navigate
                await new Promise(resolve => setTimeout(resolve, 1000));
                window.location.href = '/profile';
              }
            }
          } catch (e) {
            console.error('Error handling SignProfileUpdate return:', e);
            try {
              const { useUIStore } = await import('@pubpay/shared-services');
              useUIStore
                .getState()
                .updateToast(
                  `Failed to save profile: ${e instanceof Error ? e.message : 'Unknown error'}`,
                  'error',
                  true
                );
            } catch {}
          }

          // Handle BlossomAuth: complete file upload
          try {
            const blossomData = sessionStorage.getItem('BlossomAuth');
            if (blossomData) {
              console.log('Found BlossomAuth data, processing upload...');

              console.log('Reading signature from clipboard...');
              let sig = await readClipboard();
              if (sig) {
                sig = sig.trim();
              }
              console.log(
                'Signature read, length:',
                sig?.length,
                'first 20 chars:',
                sig?.substring(0, 20)
              );

              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error(
                  'No valid signature found in clipboard for Blossom upload. Signature:',
                  sig?.substring(0, 40)
                );
                window.dispatchEvent(
                  new CustomEvent('blossomUploadError', {
                    detail: {
                      error:
                        'No valid signature found in clipboard. Expected 128 hex characters.'
                    }
                  })
                );
                return;
              }

              console.log('Completing external signer upload...');
              const imageUrl =
                await BlossomService.completeExternalSignerUpload(sig);

              if (imageUrl) {
                console.log(
                  'Blossom upload completed via external signer:',
                  imageUrl
                );
                // Dispatch custom event with the uploaded image URL
                window.dispatchEvent(
                  new CustomEvent('blossomUploadComplete', {
                    detail: { imageUrl }
                  })
                );
              } else {
                console.warn('Blossom upload returned null');
                window.dispatchEvent(
                  new CustomEvent('blossomUploadError', {
                    detail: { error: 'Upload returned no result' }
                  })
                );
              }
            }
          } catch (e) {
            console.error('Error handling BlossomAuth return:', e);
            // Dispatch error event
            window.dispatchEvent(
              new CustomEvent('blossomUploadError', {
                detail: {
                  error: e instanceof Error ? e.message : 'Unknown error'
                }
              })
            );
          }
        } catch (e) {
          console.warn('External signer return processing error:', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Respond to NewPayNoteOverlay follow suggestions request
    const handleRequestFollowSuggestions = async () => {
      try {
        const auth = AuthService.getStoredAuthData
          ? AuthService.getStoredAuthData()
          : null;
        const pubkey = auth?.publicKey;
        const client = nostrClientRef.current;
        if (!client || !pubkey) return;
        const suggestions = await FollowService.getFollowSuggestions(
          client,
          pubkey
        );
        useUIStore.getState().setFollowSuggestions(suggestions);
        try {
          window.dispatchEvent(
            new CustomEvent('followingUpdated', {
              detail: { suggestions }
            })
          );
        } catch {}
      } catch {}
    };
    window.addEventListener(
      'requestFollowSuggestions',
      handleRequestFollowSuggestions
    );

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(
        'requestFollowSuggestions',
        handleRequestFollowSuggestions
      );
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

      // Load user profile and follow suggestions
      if (nostrClientRef.current && publicKey) {
        loadUserProfile(publicKey);
        try {
          (async () => {
            const suggestions = await FollowService.getFollowSuggestions(
              nostrClientRef.current,
              publicKey
            );
            useUIStore.getState().setFollowSuggestions(suggestions);
          })();
        } catch {}
      }
    }
  };

  const loadUserProfile = async (pubkey: string) => {
    if (!nostrClientRef.current || !pubkey) return;

    try {
      // Use ensureProfiles for centralized profile loading
      const profileMap = await ensureProfiles(
        getQueryClient(),
        nostrClientRef.current!,
        [pubkey]
      );
      const profile = profileMap.get(pubkey);

      if (profile) {
        const profileData = safeJson<Record<string, unknown>>(
          profile?.content || '{}',
          {}
        );
        const displayName =
          (profileData as any).display_name ||
          (profileData as any).displayName ||
          (profileData as any).name ||
          null;

        setAuthState(prev => ({
          ...prev,
          userProfile: profile || null,
          displayName
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
    if (typeof window === 'undefined') {
      console.warn('NostrTools not available yet');
      return;
    }

    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      // Build posts params
      const params: { until?: number; limit?: number; authors?: string[] } = {
        limit: 21
      };

      // Add following filter if needed
      if (
        feed === 'following' &&
        followingPubkeysRef.current &&
        followingPubkeysRef.current.length > 0
      ) {
        params.authors = [...followingPubkeysRef.current];
      }

      // Add until filter for loading more posts (older posts)
      if (loadMore) {
        const currentPosts = feed === 'following' ? followingPosts : posts;
        if (currentPosts.length > 0) {
          // Get the oldest post (last in the array since they're sorted newest first)
          const oldestPost = currentPosts[currentPosts.length - 1];
          if (oldestPost) {
            params.until = oldestPost.createdAt;
            console.log(
              'Loading more posts until:',
              oldestPost.createdAt,
              'for post:',
              oldestPost.id
            );
          }
        }
      }
      // Fetch posts via react-query ensure
      // If following too many authors, batch the queries to avoid relay errors
      let kind1Events: Kind1Event[];
      if (
        feed === 'following' &&
        params.authors &&
        params.authors.length > 100
      ) {
        console.log(
          `Batching ${params.authors.length} authors into queries of 100`
        );
        const batchSize = 100;
        const batches: Kind1Event[] = [];

        for (let i = 0; i < params.authors.length; i += batchSize) {
          const authorBatch = params.authors.slice(i, i + batchSize);
          console.log(
            `Loading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(params.authors.length / batchSize)}: ${authorBatch.length} authors`
          );

          try {
            const events = await ensurePosts(
              getQueryClient(),
              nostrClientRef.current!,
              {
                until: params.until,
                limit: params.limit,
                authors: authorBatch
              }
            );
            batches.push(...events);
          } catch (err) {
            console.warn(`Failed to load batch ${i / batchSize + 1}:`, err);
          }
        }

        // Deduplicate events by ID
        const uniqueEvents = new Map<string, Kind1Event>();
        batches.forEach(event => uniqueEvents.set(event.id, event));
        kind1Events = Array.from(uniqueEvents.values());
      } else {
        // Fetch posts via react-query ensure
        kind1Events = await ensurePosts(
          getQueryClient(),
          nostrClientRef.current!,
          {
            until: params.until,
            limit: params.limit,
            authors: params.authors
          }
        );
      }

      if (!kind1Events || kind1Events.length === 0) {
        if (loadMore) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
        return;
      }

      // Get author pubkeys
      const authorPubkeys = [
        ...new Set(kind1Events.map(event => event.pubkey))
      ];

      // Load profiles via react-query (deduped & cached)
      const profileEvents = Array.from(
        (
          await ensureProfiles(
            getQueryClient(),
            nostrClientRef.current!,
            authorPubkeys
          )
        ).values()
      );

      // Load zaps for these events via react-query
      const eventIds = kind1Events.map(event => event.id);
      const zapEvents = await ensureZaps(
        getQueryClient(),
        nostrClientRef.current!,
        eventIds
      );

      // Extract zap payer pubkeys and load their profiles
      const zapPayerPubkeys = new Set<string>();

      // Also include zap-payer from the note itself (even if there are no zaps yet)
      try {
        const zapPayerTagFromNote = kind1Events[0]?.tags?.find(
          (t: string[]) => t[0] === 'zap-payer' && t[1]
        );
        if (zapPayerTagFromNote && zapPayerTagFromNote[1]) {
          zapPayerPubkeys.add(zapPayerTagFromNote[1]);
        }
      } catch {}
      zapEvents.forEach(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let hasPubkeyInDescription = false;

        if (descriptionTag) {
          try {
            const zapData =
              parseZapDescription(descriptionTag[1] || undefined) || {};
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

      // Load zap payer profiles (cached & batched)
      const zapPayerProfiles =
        zapPayerPubkeys.size > 0
          ? Array.from(
              (await loadProfilesBatched(Array.from(zapPayerPubkeys))).values()
            )
          : [];

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
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
            return [...prev, ...newPosts];
          });
        } else {
          setPosts(prev => {
            // Filter out duplicates based on post ID
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = basicPosts.filter(p => !existingIds.has(p.id));
            console.log(
              `Adding ${newPosts.length} new posts (${basicPosts.length - newPosts.length} duplicates filtered)`
            );
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
        await loadZapsForPosts(kind1Events, zapEvents, feed);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
      console.error(
        'Failed to load posts:',
        err instanceof Error ? err.message : 'Failed to load posts'
      );
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Process posts with basic info only (like legacy drawKind1)
  const processPostsBasic = async (
    kind1Events: Kind1Event[],
    profileEvents: Kind0Event[]
  ): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    // Collect all zap-payer pubkeys to load their profiles
    const zapPayerPubkeys = new Set<string>();
    kind1Events.forEach(event => {
      const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
      if (zapPayerTag && zapPayerTag[1]) {
        zapPayerPubkeys.add(zapPayerTag[1]);
      }
    });

    // Load zap-payer profiles
    let zapPayerProfiles: Kind0Event[] = [];
    if (zapPayerPubkeys.size > 0) {
      const map = await loadProfilesBatched(Array.from(zapPayerPubkeys));
      zapPayerProfiles = Array.from(map.values());
    }

    // Combine all profiles
    const allProfiles = [...profileEvents, ...zapPayerProfiles];

    for (const event of kind1Events) {
      const author = allProfiles.find(p => p.pubkey === event.pubkey);

      // Basic post info (no zaps yet)
      const post: PubPayPost = {
        id: event.id,
        event,
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
        zapGoal: undefined,
        isPayable: true,
        hasZapTags: false,
        content: event.content
      };

      // Extract zap min/max and overrides from tags
      const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
      const zapGoalTag = event.tags.find(tag => tag[0] === 'zap-goal');
      const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
      const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');

      if (zapMinTag && zapMinTag[1]) {
        post.zapMin = parseInt(zapMinTag[1]) / 1000 || 0;
      }
      if (zapMaxTag && zapMaxTag[1]) {
        post.zapMax = parseInt(zapMaxTag[1]) / 1000 || 0;
      }
      if (zapUsesTag && zapUsesTag[1]) {
        post.zapUses = parseInt(zapUsesTag[1]) || 0;
      }
      if (zapGoalTag && zapGoalTag[1]) {
        post.zapGoal = parseInt(zapGoalTag[1]) / 1000 || undefined; // Convert from millisats to sats
      }
      if (zapPayerTag && zapPayerTag[1]) {
        post.zapPayer = zapPayerTag[1];

        // Find the zap-payer's profile picture
        const zapPayerProfile = allProfiles.find(
          p => p.pubkey === zapPayerTag[1]
        );
        if (zapPayerProfile) {
          try {
            const profileData = safeJson<Record<string, any>>(
              zapPayerProfile.content,
              {}
            );
            post.zapPayerPicture =
              (profileData as any).picture || genericUserIcon;
            post.zapPayerName =
              (profileData as any).display_name ||
              (profileData as any).name ||
              undefined;
          } catch {
            post.zapPayerPicture = genericUserIcon;
          }
        } else {
          post.zapPayerPicture = genericUserIcon;
        }
      }

      // Set zap LNURL override if present
      if (zapLNURLTag && zapLNURLTag[1]) {
        (post as any).zapLNURL = zapLNURLTag[1];
      }

      // Determine if payable (author lud16 or override LNURL) AND has zap tags
      try {
        const authorData = post.author
          ? safeJson<Record<string, any>>(
              (post.author as any).content || '{}',
              {}
            )
          : {};
        const hasLud16 = !!(authorData as any).lud16;
        const hasZapTags = !!(zapMinTag || zapMaxTag);
        post.hasZapTags = hasZapTags;
        post.isPayable = (hasLud16 || !!(post as any).zapLNURL) && hasZapTags;
      } catch {
        const hasZapTags = !!(zapMinTag || zapMaxTag);
        post.hasZapTags = hasZapTags;
        post.isPayable = !!(post as any).zapLNURL && hasZapTags;
      }

      posts.push(post);
    }

    // Sort by creation time (newest first) - matches legacy behavior
    return posts.sort((a, b) => b.createdAt - a.createdAt);
  };

  // Load zaps separately and update posts (like legacy subscribeKind9735)
  const loadZapsForPosts = async (
    kind1Events: Kind1Event[],
    zapEvents: Kind9735Event[],
    feed: 'global' | 'following'
  ) => {
    const eventIds = kind1Events.map(event => event.id);
    const relevantZaps = zapEvents.filter(zap =>
      zap.tags.some(
        tag => tag[0] === 'e' && tag[1] && eventIds.includes(tag[1])
      )
    );

    if (relevantZaps.length === 0) return;

    // Load zap payer profiles
    const zapPayerPubkeys = new Set<string>();
    relevantZaps.forEach(zap => {
      const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
      let hasPubkeyInDescription = false;

      if (descriptionTag) {
        try {
          const zapData =
            parseZapDescription(descriptionTag[1] || undefined) || {};
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

    // Load zap payer profiles (cached & batched)
    const zapPayerProfiles =
      zapPayerPubkeys.size > 0
        ? Array.from(
            (await loadProfilesBatched(Array.from(zapPayerPubkeys))).values()
          )
        : [];

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
          let isAnonymousZap = false;
          let zapContent = '';

          if (descriptionTag) {
            try {
              const zapData = parseZapDescription(
                descriptionTag[1] || undefined
              );
              if (zapData?.pubkey) {
                zapPayerPubkey = zapData.pubkey;
              } else {
                isAnonymousZap = true;
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
              isAnonymousZap = true;
            }
          } else {
            isAnonymousZap = true;
          }

          const zapPayerProfile = zapPayerProfiles.find(
            p => p.pubkey === zapPayerPubkey
          );
          const zapPayerPicture = zapPayerProfile
            ? (
                safeJson<Record<string, unknown>>(
                  zapPayerProfile.content || '{}',
                  {}
                ) as any
              ).picture || genericUserIcon
            : genericUserIcon;

          // Generate npub for the zap payer
          const zapPayerNpub = nip19.npubEncode(zapPayerPubkey);
          zapPayerPubkey;

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
        const zapsWithinLimits = processedZaps.filter(zap => {
          const amount = zap.zapAmount;
          const min = post.zapMin;
          const max = post.zapMax;

          // Match legacy filtering logic
          if (min > 0 && max > 0) {
            // Both min and max specified
            return amount >= min && amount <= max;
          } else if (min > 0 && max === 0) {
            // Only min specified
            return amount >= min;
          } else if (min === 0 && max > 0) {
            // Only max specified
            return amount <= max;
          } else {
            // No limits specified
            return true;
          }
        });

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
      setFollowingPosts(prev => updatePostsWithZaps(prev));
    } else {
      setPosts(prev => updatePostsWithZaps(prev));
    }
  };

  const processPosts = async (
    kind1Events: Kind1Event[],
    profileEvents: Kind0Event[],
    zapEvents: Kind9735Event[]
  ): Promise<PubPayPost[]> => {
    const posts: PubPayPost[] = [];

    for (const event of kind1Events) {
      const author = profileEvents.find(p => p.pubkey === event.pubkey);
      const zaps = zapEvents
        .filter(z => z.tags.some(tag => tag[0] === 'e' && tag[1] === event.id))
        .reverse();

      // Process zaps with proper data extraction
      const processedZaps = zaps.map(zap => {
        // Extract zap amount from bolt11 tag
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

        // Extract zap payer pubkey from description tag
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let zapPayerPubkey = '';
        let isAnonymousZap = false;

        if (descriptionTag) {
          try {
            const zapData =
              parseZapDescription(descriptionTag[1] || undefined) || {};
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
        const zapPayerProfile = profileEvents.find(
          p => p.pubkey === zapPayerPubkey
        );

        let zapPayerPicture = genericUserIcon;

        if (zapPayerProfile) {
          try {
            const profileData = safeJson<Record<string, any>>(
              zapPayerProfile.content,
              {}
            );
            zapPayerPicture = (profileData as any).picture || genericUserIcon;
          } catch {
            // If parsing fails, use default
            zapPayerPicture = genericUserIcon;
          }
        }

        // Debug logging removed for cleaner output

        // Create npub for zap payer
        const zapPayerNpub = zapPayerPubkey
            ? nip19.npubEncode(zapPayerPubkey)
          : '';

        return {
          ...zap,
          zapAmount,
          zapPayerPubkey,
          zapPayerPicture,
          zapPayerNpub
        };
      });

      const totalZapAmount = processedZaps.reduce(
        (sum, zap) => sum + zap.zapAmount,
        0
      );

      // Extract zap tags
      const zapMinTag = event.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = event.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = event.tags.find(tag => tag[0] === 'zap-uses');
      const zapGoalTag = event.tags.find(tag => tag[0] === 'zap-goal');
      const zapPayerTag = event.tags.find(tag => tag[0] === 'zap-payer');
      const zapLNURLTag = event.tags.find(tag => tag[0] === 'zap-lnurl');

      const zapMin = zapMinTag ? parseInt(zapMinTag[1] || '0') / 1000 : 0;
      const zapMax = zapMaxTag ? parseInt(zapMaxTag[1] || '0') / 1000 : zapMin;
      const zapUses = zapUsesTag ? parseInt(zapUsesTag[1] || '0') : 0;
      const zapGoal = zapGoalTag ? parseInt(zapGoalTag[1] || '0') / 1000 : undefined; // Convert from millisats to sats

      // Filter zaps by amount limits for usage counting (matches legacy behavior)
      const zapsWithinLimits = zaps.filter(zap => {
        // Extract zap amount from bolt11 tag
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

        const min = zapMin;
        const max = zapMax;

        // Match legacy filtering logic
        if (min > 0 && max > 0) {
          // Both min and max specified
          return zapAmount >= min && zapAmount <= max;
        } else if (min > 0 && max === 0) {
          // Only min specified
          return zapAmount >= min;
        } else if (min === 0 && max > 0) {
          // Only max specified
          return zapAmount <= max;
        } else {
          // No limits specified
          return true;
        }
      });

      const zapUsesCurrent = zapsWithinLimits.length;
      const zapPayer = zapPayerTag?.[1];
      const zapLNURL = zapLNURLTag?.[1];

      // Debug logging removed - no zap-payer tags found in current feed

      // Check if payable
      const isPayable =
        !!(
          author &&
          safeJson<Record<string, unknown>>(author.content, {})['lud16']
        ) || !!zapLNURL;

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
        zapGoal,
        content: event.content,
        isPayable,
        hasZapTags: !!(zapMinTag || zapMaxTag),
        zapPayer,
        zapLNURL,
        createdAt: event.created_at
      });
    }

    // Sort by creation time (newest first)
    const sortedPosts = posts.sort((a, b) => b.createdAt - a.createdAt);

    // Update newest post timestamp for subscription management
    if (sortedPosts.length > 0) {
      newestPostTimestampRef.current = sortedPosts[0].createdAt;
    }

    return sortedPosts;
  };

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

  const loadFollowingPosts = async () => {
    if (!authState.isLoggedIn || !nostrClientRef.current) return;

    try {
      // Load kind 3 (contacts) to get following list
      const kind3Events = await nostrClientRef.current.getEvents([
        {
          kinds: [3],
          authors: [authState.publicKey!]
        }
      ]);

      const followingPubkeys: string[] = [];
      for (const event of kind3Events) {
        const pTags = event.tags.filter(tag => tag[0] === 'p');
        followingPubkeys.push(
          ...pTags
            .map(tag => tag[1])
            .filter((pubkey): pubkey is string => Boolean(pubkey))
        );
      }

      followingPubkeysRef.current = followingPubkeys;

      // If user follows nobody, set empty array and don't load posts
      if (followingPubkeys.length === 0) {
        console.log('User follows nobody, setting empty following posts');
        setFollowingPosts([]);
        setIsLoading(false);
        return;
      }

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
    // Open login via UI store
    import('@pubpay/shared-services')
      .then(({ useUIStore }) => {
        useUIStore.getState().openLogin();
      })
      .catch(() => {
        console.warn('UI store not available yet');
      });
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
        AuthService.storeAuthData(
          result.publicKey,
          result.privateKey || null,
          'extension'
        );

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
        console.error(
          'Extension sign in failed:',
          result.error || 'Extension sign in failed'
        );
        return {
          success: false,
          error: result.error || 'Extension sign in failed'
        };
      }
    } catch (error) {
      console.error('Extension sign in failed:', error);
      return { success: false, error: 'Extension sign in failed' };
    }
  };

  const handleSignInExternalSigner = async () => {
    try {
      const result = await AuthService.signInWithExternalSigner();

      if (!result.success) {
        console.error(
          'External signer failed:',
          result.error || 'External signer failed'
        );
        return {
          success: false,
          error: result.error || 'External signer failed'
        };
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

  const handleContinueWithNsec = async (nsec: string) => {
    try {
      const result = await AuthService.signInWithNsec(nsec);

      if (result.success && result.publicKey) {
        AuthService.storeAuthData(
          result.publicKey,
          result.privateKey || null,
          'nsec'
        );

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

  const handlePayWithExtension = async (
    post: PubPayPost,
    amount: number,
    comment: string = ''
  ) => {
    if (!authState.isLoggedIn) {
      handleLogin();
      return;
    }

    // Only require extension API when sign-in method is actually 'extension'
    if (authState.signInMethod === 'extension') {
      if (!window.nostr) {
        console.error('Nostr extension not available');
        return;
      }
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
      let callback;
      try {
        callback = await zapServiceRef.current.getInvoiceCallBack(
          post.event,
          post.author
        );
        if (!callback) {
          const errorMessage = "CAN'T PAY: Failed to get Lightning callback";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to get Lightning callback');
          return;
        }
        // Clear error if callback succeeds
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.delete(post.id);
          return next;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Failed to get Lightning callback:', error);
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
        publicKey,
        comment
      );

      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event (ZapService will branch per sign-in method)
      // Note: signZapEvent may throw errors with "CAN'T PAY:" prefix
      try {
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
          // Clear error on success
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.delete(post.id);
            return next;
          });
        } else {
          const errorMessage = "CAN'T PAY: Failed to sign and send zap event";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to sign and send zap event');
        }
      } catch (signError) {
        // signZapEvent can throw errors from getInvoiceandPay
        const errorMessage =
          signError instanceof Error ? signError.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Error in signZapEvent:', signError);
        return; // Don't continue after error
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "CAN'T PAY: Payment failed";
      setPaymentErrors(prev => {
        const next = new Map(prev);
        next.set(post.id, errorMessage);
        return next;
      });
      console.error('Payment failed:', err);
    }
  };

  const handlePayAnonymously = async (
    post: PubPayPost,
    amount: number,
    comment: string = ''
  ) => {
    if (!zapServiceRef.current) {
      console.error('Zap service not initialized');
      return;
    }

    try {
      console.log(
        'Processing anonymous zap payment:',
        amount,
        'sats for post:',
        post.id
      );

      // Get author data
      if (!post.author) {
        console.error('No author data found');
        return;
      }

      // Get Lightning callback (pass raw author object, not parsed content)
      let callback;
      try {
        callback = await zapServiceRef.current.getInvoiceCallBack(
          post.event,
          post.author
        );
        if (!callback) {
          const errorMessage = "CAN'T PAY: Failed to get Lightning callback";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to get Lightning callback');
          return;
        }
        // Clear error if callback succeeds
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.delete(post.id);
          return next;
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Failed to get Lightning callback:', error);
        return;
      }

      // Create zap event (no public key for anonymous)
      const zapEventData = await zapServiceRef.current.createZapEvent(
        post.event,
        amount,
        callback.lud16ToZap,
        null, // No public key for anonymous zap
        comment
      );

      if (!zapEventData) {
        console.error('Failed to create zap event');
        return;
      }

      // Sign and send zap event (anonymous = true)
      // Note: signZapEvent may throw errors with "CAN'T PAY:" prefix
      try {
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
          // Clear error on success
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.delete(post.id);
            return next;
          });
        } else {
          const errorMessage = "CAN'T PAY: Failed to initiate anonymous zap payment";
          setPaymentErrors(prev => {
            const next = new Map(prev);
            next.set(post.id, errorMessage);
            return next;
          });
          console.error('Failed to initiate anonymous zap payment');
        }
      } catch (signError) {
        // signZapEvent can throw errors from getInvoiceandPay
        const errorMessage =
          signError instanceof Error ? signError.message : "CAN'T PAY: Payment failed";
        setPaymentErrors(prev => {
          const next = new Map(prev);
          next.set(post.id, errorMessage);
          return next;
        });
        console.error('Error in signZapEvent (anonymous):', signError);
        return; // Don't continue after error
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "CAN'T PAY: Payment failed";
      setPaymentErrors(prev => {
        const next = new Map(prev);
        next.set(post.id, errorMessage);
        return next;
      });
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

      // Add zap-goal tag if provided (convert to millisats for consistency)
      if (zapGoal && parseInt(zapGoal) > 0) {
        const zapGoalAmount = parseInt(zapGoal) * 1000; // Convert to millisatoshis
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
        sessionStorage.setItem('SignKind1', JSON.stringify({ event }));
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
    if (typeof window === 'undefined') {
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
      const kind1Events = (await nostrClientRef.current.getEvents([
        cleanFilter
      ])) as Kind1Event[];

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
      // Use ensureProfiles for centralized profile loading
      const profileMap = await ensureProfiles(
        getQueryClient(),
        nostrClientRef.current!,
        [authorPubkey]
      );
      const profileEvents = profileMap.get(authorPubkey)
        ? [profileMap.get(authorPubkey)!]
        : [];

      // Load zaps for this event via react-query
      const zapEvents = await ensureZaps(
        getQueryClient(),
        nostrClientRef.current!,
        [eventId]
      );

      // Extract zap payer pubkeys and load their profiles
      const zapPayerPubkeys = new Set<string>();
      zapEvents.forEach(zap => {
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let hasPubkeyInDescription = false;

        if (descriptionTag) {
          try {
            const zapData =
              parseZapDescription(descriptionTag[1] || undefined) || {};
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

      // Load zap payer profiles (cached & batched)
      const zapPayerProfiles =
        zapPayerPubkeys.size > 0
          ? Array.from(
              (await loadProfilesBatched(Array.from(zapPayerPubkeys))).values()
            )
          : [];

      // Combine all profiles
      const allProfiles = [...profileEvents, ...zapPayerProfiles];

      // Process the single note
      const processedPosts = await processPosts(
        kind1Events,
        allProfiles,
        zapEvents
      );

      if (processedPosts.length > 0) {
        setPosts(processedPosts);
      }

      // Load replies to this note
      await loadReplies(eventId);

      setIsLoading(false);
      // Signal ready after essentials are loaded in single note mode as well
      setNostrReady(true);
    } catch (err) {
      console.error('Failed to load single note:', err);
      setIsLoading(false);
    }
  };

  // Calculate reply levels for proper indentation (matches legacy behavior)
  const calculateReplyLevels = (
    replies: PubPayPost[]
  ): (PubPayPost & { replyLevel: number })[] => {
    const repliesWithLevels: (PubPayPost & { replyLevel: number })[] = [];
    const replyMap = new Map<string, number>(); // eventId -> level

    for (const reply of replies) {
      let level = 0;

      // Find the reply tag to get the parent event ID
      const replyTag = reply.event.tags.find(
        tag => tag[0] === 'e' && tag[3] === 'reply'
      );
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
      const replyEvents = (await nostrClientRef.current.getEvents([
        cleanFilter
      ])) as Kind1Event[];

      if (!replyEvents || replyEvents.length === 0) {
        setReplies([]);
        return;
      }

      console.log('Found replies:', replyEvents.length);

      // Get author pubkeys for replies
      const authorPubkeys = [
        ...new Set(replyEvents.map(event => event.pubkey))
      ];

      // Load profiles for reply authors via react-query
      const profileEvents = Array.from(
        (
          await ensureProfiles(
            getQueryClient(),
            nostrClientRef.current!,
            authorPubkeys
          )
        ).values()
      );

      // Load zaps for reply events via react-query
      const eventIds = replyEvents.map(event => event.id);
      const zapEvents = await ensureZaps(
        getQueryClient(),
        nostrClientRef.current!,
        eventIds
      );

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
      const zapPayerProfiles =
        zapPayerPubkeys.size > 0
          ? ((await nostrClientRef.current.getEvents([
              {
                kinds: [0],
                authors: Array.from(zapPayerPubkeys)
              }
            ])) as Kind0Event[])
          : [];

      // Combine all profiles
      const allProfiles = [...profileEvents, ...zapPayerProfiles];

      // Process replies
      const processedReplies = await processPosts(
        replyEvents,
        allProfiles,
        zapEvents
      );

      // Sort replies by creation time (oldest first, like the original)
      const sortedReplies = processedReplies.sort(
        (a, b) => a.createdAt - b.createdAt
      );

      // Calculate reply levels for proper indentation
      const repliesWithLevels = calculateReplyLevels(sortedReplies);

      setReplies(repliesWithLevels);
    } catch (err) {
      console.error('Failed to load replies:', err);
    }
  };

  // Subscribe to new posts in real-time (only posts created after we started loading)
  useEffect(() => {
    if (!nostrClientRef.current || isLoading) {
      return () => {}; // Return empty cleanup function
    }

    // Detect single-post mode via URL (?note=...)
    let singlePostMode = false;
    let singlePostEventId: string | null = null;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qNote = params.get('note');
        const path = window.location.pathname || '';
        let noteRef: string | null = null;
        if (qNote) noteRef = qNote;
        else if (path.startsWith('/note/'))
          noteRef = path.split('/note/')[1] || null;

        if (noteRef) {
          try {
            const decoded = nip19.decode(noteRef);
            if (decoded.type === 'note' || decoded.type === 'nevent') {
              // note: decoded.data is id; nevent: decoded.data.id
              singlePostEventId =
                (decoded as any).data?.id || (decoded as any).data || null;
              singlePostMode = !!singlePostEventId;
            }
          } catch {}
        }
      }
    } catch {}

    // Determine which posts to subscribe to based on active feed
    const currentPosts = activeFeed === 'following' ? followingPostsRef.current : postsRef.current;

    // If in following mode and user follows nobody, don't set up subscription
    if (
      activeFeed === 'following' &&
      followingPubkeysRef.current.length === 0
    ) {
      console.log('Following feed with 0 follows - no subscription needed');
      return () => {}; // Return empty cleanup function
    }

    // Skip subscription if following too many people (relay will reject)
    if (
      activeFeed === 'following' &&
      followingPubkeysRef.current.length > 100
    ) {
      console.log(
        `Following ${followingPubkeysRef.current.length} authors - skipping real-time subscription to avoid relay errors`
      );
      return () => {}; // Return empty cleanup function
    }

    if (currentPosts.length === 0) {
      return () => {}; // Return empty cleanup function
    }

    // Determine the cutoff time: only listen to posts NEWER than our newest post
    const cutoffTime =
      newestPostTimestampRef.current || Math.floor(Date.now() / 1000);

    console.log(
      'Setting up new post subscription since:',
      cutoffTime,
      'for feed:',
      activeFeed
    );

    // Build filter based on active feed
    const filter: any = {
      kinds: [1],
      '#t': ['pubpay'],
      since: cutoffTime + 1 // Only posts created AFTER our newest post
    };

    // If in following mode, only subscribe to posts from followed authors
    if (activeFeed === 'following' && followingPubkeysRef.current.length > 0) {
      filter.authors = [...followingPubkeysRef.current];
      console.log(
        'Filtering by followed authors:',
        followingPubkeysRef.current.length
      );
    }

    // In single-post mode we do NOT subscribe to new posts
    let notesSub: any = null;
    if (!singlePostMode) {
      // Subscribe to new kind 1 events with 'pubpay' tag created after our newest post
      notesSub = nostrClientRef.current.subscribeToEvents(
        [filter],
        async (noteEvent: NostrEvent) => {
          // Type guard to ensure this is a note event
          if (noteEvent.kind !== 1) return;

          console.log('Received new post in real-time:', noteEvent.id);
          // Process and add to feed (duplicate check is inside processNewNote)
          await processNewNote(noteEvent as Kind1Event);
        },
        {
          oneose: () => {
            console.log('New post subscription EOS');
          },
          onclosed: () => {
            console.log('New post subscription closed');
          }
        }
      );
      subscriptionRef.current = notesSub;
    }

    // Subscribe to new zaps for all current posts
    // Only recreate subscription if event IDs have actually changed
    let eventIds: string[] = [];
    if (singlePostMode && singlePostEventId) {
      // In single post mode, include both the main post and all reply IDs
      const replyIds = repliesRef.current.map(reply => reply.id);
      eventIds = [singlePostEventId, ...replyIds];
    } else if (currentPosts.length > 0) {
      eventIds = currentPosts.map(post => post.id);
    }

    // Check if event IDs have changed
    const currentEventIdsSet = new Set(eventIds);
    const eventIdsChanged = 
      eventIds.length !== subscribedEventIdsRef.current.size ||
      eventIds.some(id => !subscribedEventIdsRef.current.has(id)) ||
      Array.from(subscribedEventIdsRef.current).some(id => !currentEventIdsSet.has(id));

    // Only create/update subscription if event IDs changed or subscription doesn't exist
    if ((singlePostMode && singlePostEventId) || currentPosts.length > 0) {
      if (!zapSubscriptionRef.current || eventIdsChanged) {
        // Clean up old subscription if it exists
        if (zapSubscriptionRef.current) {
          try {
            zapSubscriptionRef.current.unsubscribe();
          } catch (e) {
            console.warn('Error unsubscribing from old zap subscription:', e);
          }
        }

        // Update tracked event IDs
        subscribedEventIdsRef.current = currentEventIdsSet;

        console.log('Creating/updating zap subscription with event IDs:', eventIds.length, 'in single post mode:', singlePostMode);
        if (singlePostMode && singlePostEventId) {
          console.log('Single post mode - main post:', singlePostEventId, 'replies:', repliesRef.current.length);
        }

        zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
          [
            {
              kinds: [9735],
              '#e': eventIds
            }
          ],
          async (zapEvent: NostrEvent) => {
            // Type guard to ensure this is a zap event
            if (zapEvent.kind !== 9735) return;
            // Extra guard in single post mode: ensure zap references our event id or reply IDs
            if (singlePostMode && singlePostEventId) {
              const eTag = zapEvent.tags.find(t => t[0] === 'e');
              if (!eTag || !eTag[1]) {
                console.log('Zap event rejected: no e tag or event ID');
                return;
              }
              // Check if it's for the main post or any reply
              const replyIds = repliesRef.current.map(reply => reply.id);
              if (eTag[1] !== singlePostEventId && !replyIds.includes(eTag[1])) {
                console.log('Zap event rejected: event ID not in main post or replies', eTag[1], 'main:', singlePostEventId, 'replies:', replyIds);
                return;
              }
              console.log('Zap event accepted for single post mode:', eTag[1], 'is main post:', eTag[1] === singlePostEventId, 'is reply:', replyIds.includes(eTag[1]));
            }
            // Add to batch for processing
            console.log('Adding zap event to batch:', zapEvent.id);
            zapBatchRef.current.push(zapEvent as Kind9735Event);

            // Clear existing timeout
            if (zapBatchTimeoutRef.current) {
              clearTimeout(zapBatchTimeoutRef.current);
            }

            // Process batch after 500ms delay (or immediately if batch is large)
            if (zapBatchRef.current.length >= 10) {
              // Process immediately if batch is large
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              await processZapBatch(batchToProcess);
            } else {
              // Process after delay
              zapBatchTimeoutRef.current = setTimeout(async () => {
                const batchToProcess = [...zapBatchRef.current];
                zapBatchRef.current = [];
                await processZapBatch(batchToProcess);
              }, 500);
            }
          },
          {
            oneose: () => {
              console.log('Zap subscription EOS');
            },
            onclosed: () => {
              console.log('Zap subscription closed');
            }
          }
        );
      }
    }

    return () => {
      // Clean up existing subscriptions before creating new ones
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from notes subscription:', e);
        }
        subscriptionRef.current = null;
      }
      if (notesSub) {
        try {
          notesSub.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from new notes subscription:', e);
        }
      }
      if (zapSubscriptionRef.current) {
        try {
          zapSubscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from zaps subscription:', e);
        }
        zapSubscriptionRef.current = null;
      }
    };
  }, [activeFeed, isLoading, nostrReady]); // Re-subscribe when feed changes, loading state changes, or nostr client becomes ready

  // Update zap subscription when replies change in single post mode
  useEffect(() => {
    if (!nostrClientRef.current || isLoading || !nostrReady) {
      return;
    }

    // Check if we're in single post mode
    let singlePostMode = false;
    let singlePostEventId: string | null = null;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const qNote = params.get('note');
        const path = window.location.pathname || '';
        let noteRef: string | null = null;
        if (qNote) noteRef = qNote;
        else if (path.startsWith('/note/'))
          noteRef = path.split('/note/')[1] || null;

        if (noteRef) {
          try {
            const decoded = nip19.decode(noteRef);
            if (decoded.type === 'note' || decoded.type === 'nevent') {
              singlePostEventId =
                (decoded as any).data?.id || (decoded as any).data || null;
              singlePostMode = !!singlePostEventId;
            }
          } catch {}
        }
      }
    } catch {}

    // Only update if in single post mode
    if (!singlePostMode || !singlePostEventId) {
      return;
    }

    // Get current reply IDs
    const replyIds = repliesRef.current.map(reply => reply.id);
    const eventIds = [singlePostEventId, ...replyIds];
    const currentEventIdsSet = new Set(eventIds);

    // Check if event IDs have changed
    const eventIdsChanged =
      eventIds.length !== subscribedEventIdsRef.current.size ||
      eventIds.some(id => !subscribedEventIdsRef.current.has(id)) ||
      Array.from(subscribedEventIdsRef.current).some(id => !currentEventIdsSet.has(id));

    // Only update if event IDs changed (or subscription doesn't exist yet)
    if (eventIdsChanged || !zapSubscriptionRef.current) {
      // Clean up old subscription
      if (zapSubscriptionRef.current) {
        try {
          zapSubscriptionRef.current.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from old zap subscription:', e);
        }
      }

      // Update tracked event IDs
      subscribedEventIdsRef.current = currentEventIdsSet;

      console.log('Updating zap subscription for replies - event IDs:', eventIds.length, 'main post:', singlePostEventId, 'replies:', repliesRef.current.length);

      // Create new subscription
      zapSubscriptionRef.current = nostrClientRef.current.subscribeToEvents(
        [
          {
            kinds: [9735],
            '#e': eventIds
          }
        ],
        async (zapEvent: NostrEvent) => {
          if (zapEvent.kind !== 9735) return;
          const eTag = zapEvent.tags.find(t => t[0] === 'e');
          if (!eTag || !eTag[1]) {
            console.log('Zap event rejected (separate useEffect): no e tag or event ID');
            return;
          }
          // Get current reply IDs from ref (always use latest)
          const currentReplyIds = repliesRef.current.map(reply => reply.id);
          if (eTag[1] !== singlePostEventId && !currentReplyIds.includes(eTag[1])) {
            console.log('Zap event rejected (separate useEffect): event ID not in main post or replies', eTag[1], 'main:', singlePostEventId, 'replies:', currentReplyIds);
            return;
          }
          console.log('Zap event accepted (separate useEffect):', eTag[1], 'is main post:', eTag[1] === singlePostEventId, 'is reply:', currentReplyIds.includes(eTag[1]));
          zapBatchRef.current.push(zapEvent as Kind9735Event);

          if (zapBatchTimeoutRef.current) {
            clearTimeout(zapBatchTimeoutRef.current);
          }

          if (zapBatchRef.current.length >= 10) {
            const batchToProcess = [...zapBatchRef.current];
            zapBatchRef.current = [];
            await processZapBatch(batchToProcess);
          } else {
            zapBatchTimeoutRef.current = setTimeout(async () => {
              const batchToProcess = [...zapBatchRef.current];
              zapBatchRef.current = [];
              await processZapBatch(batchToProcess);
            }, 500);
          }
        },
        {
          oneose: () => {
            console.log('Zap subscription EOS');
          },
          onclosed: () => {
            console.log('Zap subscription closed');
          }
        }
      );
    }
  }, [replies, isLoading, nostrReady]); // Only update when replies change

  // Process zaps in batches to reduce relay load
  const processZapBatch = async (zapEvents: Kind9735Event[]) => {
    if (zapEvents.length === 0) return;

    // Collect all unique zap payer pubkeys
    const zapPayerPubkeys = new Set<string>();
    zapEvents.forEach(zapEvent => {
      const descriptionTag = zapEvent.tags.find(
        tag => tag[0] === 'description'
      );
      let zapPayerPubkey = '';

      if (descriptionTag) {
        try {
          const zapData =
            parseZapDescription(descriptionTag[1] || undefined) || {};
          zapPayerPubkey = zapData.pubkey || '';
        } catch {
          zapPayerPubkey = '';
        }
      }

      // For anonymous zaps, use the zap event's pubkey
      if (!zapPayerPubkey) {
        zapPayerPubkey = zapEvent.pubkey;
      }

      if (zapPayerPubkey) {
        zapPayerPubkeys.add(zapPayerPubkey);
      }
    });

    // Load all profiles in one batch
    const profiles = await loadProfilesBatched(Array.from(zapPayerPubkeys));

    // Process each zap with cached profile data and update posts
    for (const zapEvent of zapEvents) {
      const processedZap = await processNewZapWithProfiles(zapEvent, profiles);
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
          const { eventId, show } = useUIStore.getState().invoiceOverlay;
          if (show && eventId === zapRequestEventId) {
            useUIStore.getState().closeInvoice();
          }
        }
      } catch {}

      // Update posts with the new zap
      setPosts(prevPosts => {
        const newPosts = [...prevPosts];
        const postIndex = newPosts.findIndex(post => post.id === postId);
        if (postIndex === -1) return newPosts;

        const post = newPosts[postIndex];
        if (!post) return newPosts;

        // Check for duplicates
        const existingZapInState = post.zaps.find(
          zap => zap.id === zapEvent.id
        );
        if (existingZapInState) {
          return newPosts;
        }

        // Check if the new zap is within amount limits for usage counting
        const isWithinLimits = (() => {
          const amount = processedZap.zapAmount;
          const min = post.zapMin;
          const max = post.zapMax;

          // Match legacy filtering logic
          if (min > 0 && max > 0) {
            // Both min and max specified
            return amount >= min && amount <= max;
          } else if (min > 0 && max === 0) {
            // Only min specified
            return amount >= min;
          } else if (min === 0 && max > 0) {
            // Only max specified
            return amount <= max;
          } else {
            // No limits specified
            return true;
          }
        })();

        // Add the new zap to the post
        const updatedPost: PubPayPost = {
          ...post,
          zaps: [...post.zaps, processedZap],
          zapAmount: post.zapAmount + processedZap.zapAmount,
          zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
        };

        newPosts[postIndex] = updatedPost;
        return newPosts;
      });

      // Also update following posts if this post exists there
      setFollowingPosts(prevPosts => {
        const newPosts = [...prevPosts];
        const postIndex = newPosts.findIndex(post => post.id === postId);
        if (postIndex === -1) return newPosts;

        const post = newPosts[postIndex];
        if (!post) return newPosts;

        // Check for duplicates
        const existingZapInState = post.zaps.find(
          zap => zap.id === zapEvent.id
        );
        if (existingZapInState) {
          return newPosts;
        }

        // Check if the new zap is within amount limits for usage counting
        const isWithinLimits = (() => {
          const amount = processedZap.zapAmount;
          const min = post.zapMin;
          const max = post.zapMax;

          // Match legacy filtering logic
          if (min > 0 && max > 0) {
            // Both min and max specified
            return amount >= min && amount <= max;
          } else if (min > 0 && max === 0) {
            // Only min specified
            return amount >= min;
          } else if (min === 0 && max > 0) {
            // Only max specified
            return amount <= max;
          } else {
            // No limits specified
            return true;
          }
        })();

        // Add the new zap to the post
        const updatedPost: PubPayPost = {
          ...post,
          zaps: [...post.zaps, processedZap],
          zapAmount: post.zapAmount + processedZap.zapAmount,
          zapUsesCurrent: post.zapUsesCurrent + (isWithinLimits ? 1 : 0)
        };

        newPosts[postIndex] = updatedPost;
        return newPosts;
      });

      // Also update replies if this post exists there
      setReplies(prevReplies => {
        const newReplies = [...prevReplies];
        const replyIndex = newReplies.findIndex(reply => reply.id === postId);
        if (replyIndex === -1) {
          console.log('Zap processed: reply not found in replies array for postId:', postId);
          return newReplies;
        }
        console.log('Zap processed: updating reply at index', replyIndex, 'for postId:', postId);

        const reply = newReplies[replyIndex];
        if (!reply) return newReplies;

        // Check for duplicates
        const existingZapInState = reply.zaps.find(
          zap => zap.id === zapEvent.id
        );
        if (existingZapInState) {
          return newReplies;
        }

        // Check if the new zap is within amount limits for usage counting
        const isWithinLimits = (() => {
          const amount = processedZap.zapAmount;
          const min = reply.zapMin;
          const max = reply.zapMax;

          // Match legacy filtering logic
          if (min > 0 && max > 0) {
            // Both min and max specified
            return amount >= min && amount <= max;
          } else if (min > 0 && max === 0) {
            // Only min specified
            return amount >= min;
          } else if (min === 0 && max > 0) {
            // Only max specified
            return amount <= max;
          } else {
            // No limits specified
            return true;
          }
        })();

        // Add the new zap to the reply
        const updatedReply: PubPayPost = {
          ...reply,
          zaps: [...reply.zaps, processedZap],
          zapAmount: reply.zapAmount + processedZap.zapAmount,
          zapUsesCurrent: reply.zapUsesCurrent + (isWithinLimits ? 1 : 0)
        };

        newReplies[replyIndex] = updatedReply;
        return newReplies;
      });
    }
  };

  // Batched profile loading to prevent duplicate requests
  const loadProfilesBatched = async (
    pubkeys: string[]
  ): Promise<Map<string, Kind0Event>> => {
    const profiles = new Map<string, Kind0Event>();
    const uncachedPubkeys: string[] = [];

    // Check cache first
    for (const pubkey of pubkeys) {
      const cached = profileCacheRef.current.get(pubkey);
      if (cached) {
        profiles.set(pubkey, cached);
      } else if (!pendingProfileRequestsRef.current.has(pubkey)) {
        uncachedPubkeys.push(pubkey);
      }
    }

    // Load uncached profiles in batches
    if (uncachedPubkeys.length > 0 && nostrClientRef.current) {
      // Mark as pending to prevent duplicate requests
      uncachedPubkeys.forEach(pubkey =>
        pendingProfileRequestsRef.current.add(pubkey)
      );

      try {
        // Use ensureProfiles for centralized profile loading
        const profileMap = await ensureProfiles(
          getQueryClient(),
          nostrClientRef.current!,
          uncachedPubkeys
        );
        const profileEvents = Array.from(profileMap.values());

        // Cache the results
        profileEvents.forEach(profile => {
          profileCacheRef.current.set(profile.pubkey, profile);
          profiles.set(profile.pubkey, profile);
        });

        // Remove from pending
        uncachedPubkeys.forEach(pubkey =>
          pendingProfileRequestsRef.current.delete(pubkey)
        );
      } catch (error) {
        console.error('Error loading profiles:', error);
        // Remove from pending on error
        uncachedPubkeys.forEach(pubkey =>
          pendingProfileRequestsRef.current.delete(pubkey)
        );
      }
    }

    return profiles;
  };

  // Process a new zap event with pre-loaded profiles
  const processNewZapWithProfiles = async (
    zapEvent: Kind9735Event,
    profiles: Map<string, Kind0Event>
  ): Promise<ProcessedZap | null> => {
    try {
      // Extract zap amount from bolt11 tag
      const bolt11Tag = zapEvent.tags.find(tag => tag[0] === 'bolt11');
      let zapAmount = 0;
      if (bolt11Tag) {
        try {
          const decoded = bolt11.decode(bolt11Tag[1] || '');
          zapAmount = decoded.satoshis || 0;
        } catch {
          zapAmount = 0;
        }
      }

      // Extract zap payer pubkey and content from description tag
      const descriptionTag = zapEvent.tags.find(
        tag => tag[0] === 'description'
      );
      let zapPayerPubkey = '';
      let isAnonymousZap = false;
      let zapContent = '';

      if (descriptionTag) {
        try {
          const zapData =
            parseZapDescription(descriptionTag[1] || undefined) || {};
          zapPayerPubkey = zapData.pubkey || '';
          isAnonymousZap = !zapData.pubkey;
          // Extract content from zap description (the zap message/comment)
          if (
            zapData &&
            'content' in zapData &&
            typeof zapData.content === 'string'
          ) {
            zapContent = zapData.content;
          }
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

      // Do not filter out non-matching zap-payer zaps here; classification happens in component
      // Keep all zaps so UI can show in-range (hero) vs out-of-restriction (actions)

      // Get zap payer profile from pre-loaded profiles
      const zapPayerProfile = zapPayerPubkey
        ? profiles.get(zapPayerPubkey)
        : null;

      let zapPayerPicture = genericUserIcon;

      if (zapPayerProfile) {
        try {
          const profileData = safeJson<Record<string, any>>(
            zapPayerProfile.content,
            {}
          );
          zapPayerPicture = (profileData as any).picture || genericUserIcon;
        } catch {
          // If parsing fails, use default
          zapPayerPicture = '/images/generic-user-icon.svg';
        }
      }

      // Create npub for zap payer
      const zapPayerNpub = zapPayerPubkey
            ? nip19.npubEncode(zapPayerPubkey)
        : '';

      return {
        ...zapEvent,
        zapAmount,
        zapPayerPubkey,
        zapPayerPicture,
        zapPayerNpub,
        content: zapContent,
        isNewZap: true // Mark as new zap for lightning effect
      };
    } catch (error) {
      console.error('Error processing zap:', error);
      return null;
    }
  };

  // Process a new zap event (legacy function for backward compatibility)
  const processNewZap = async (
    zapEvent: Kind9735Event
  ): Promise<ProcessedZap | null> => {
    try {
      // Extract zap amount from bolt11 tag
      const bolt11Tag = zapEvent.tags.find(tag => tag[0] === 'bolt11');
      let zapAmount = 0;
      if (bolt11Tag) {
        try {
          const decoded = bolt11.decode(bolt11Tag[1] || '');
          zapAmount = decoded.satoshis || 0;
        } catch {
          zapAmount = 0;
        }
      }

      // Extract zap payer pubkey from description tag
      const descriptionTag = zapEvent.tags.find(
        tag => tag[0] === 'description'
      );
      let zapPayerPubkey = '';
      let isAnonymousZap = false;

      if (descriptionTag) {
        try {
          const zapData =
            parseZapDescription(descriptionTag[1] || undefined) || {};
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

      // Do not filter out non-matching zap-payer zaps here; classification happens in component
      // Keep all zaps so UI can show in-range (hero) vs out-of-restriction (actions)

      // Get zap payer profile using batched loading
      let zapPayerProfile = null;
      if (zapPayerPubkey) {
        const profiles = await loadProfilesBatched([zapPayerPubkey]);
        zapPayerProfile = profiles.get(zapPayerPubkey) || null;
      }

      let zapPayerPicture = genericUserIcon;

      if (zapPayerProfile) {
        try {
          const profileData = safeJson<Record<string, any>>(
            zapPayerProfile.content,
            {}
          );
          zapPayerPicture = (profileData as any).picture || genericUserIcon;
        } catch {
          // If parsing fails, use default
          zapPayerPicture = '/images/generic-user-icon.svg';
        }
      }

      // Create npub for zap payer
      const zapPayerNpub = zapPayerPubkey
            ? nip19.npubEncode(zapPayerPubkey)
        : '';

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
      const authorProfiles = (await nostrClientRef.current?.getEvents([
        {
          kinds: [0],
          authors: [noteEvent.pubkey]
        }
      ])) as Kind0Event[];

      const author = authorProfiles[0] || {
        kind: 0,
        id: '',
        pubkey: noteEvent.pubkey,
        content: '{}',
        created_at: 0,
        sig: '',
        tags: []
      };

      // Create basic post structure (like processPostsBasic)
      const newPost: PubPayPost = {
        id: noteEvent.id,
        event: noteEvent,
        author,
        createdAt: noteEvent.created_at,
        zapMin: 0,
        zapMax: 0,
        zapUses: 0,
        zapAmount: 0,
        zaps: [],
        zapUsesCurrent: 0,
        zapGoal: undefined,
        isPayable: true,
        hasZapTags: false,
        content: noteEvent.content
      };

      // Extract zap min/max from tags
      const zapMinTag = noteEvent.tags.find(tag => tag[0] === 'zap-min');
      const zapMaxTag = noteEvent.tags.find(tag => tag[0] === 'zap-max');
      const zapUsesTag = noteEvent.tags.find(tag => tag[0] === 'zap-uses');
      const zapGoalTag = noteEvent.tags.find(tag => tag[0] === 'zap-goal');

      if (zapMinTag && zapMinTag[1]) {
        newPost.zapMin = parseInt(zapMinTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapMaxTag && zapMaxTag[1]) {
        newPost.zapMax = parseInt(zapMaxTag[1]) / 1000 || 0; // Divide by 1000 for sats
      }
      if (zapUsesTag && zapUsesTag[1]) {
        newPost.zapUses = parseInt(zapUsesTag[1]) || 0; // Only set if tag exists
      }
      if (zapGoalTag && zapGoalTag[1]) {
        newPost.zapGoal = parseInt(zapGoalTag[1]) / 1000 || undefined; // Convert from millisats to sats
      }

      // Set hasZapTags based on whether zap tags exist
      newPost.hasZapTags = !!(zapMinTag || zapMaxTag);

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
    handleLogout,
    handlePayWithExtension,
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    clearPosts,
    loadUserProfile
  };
};
