import React, { useState, useEffect, useMemo } from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useLocation
} from 'react-router-dom';
import {
  useUIStore,
  ensureProfiles,
  ensureZaps,
  getQueryClient,
  NostrRegistrationService,
  AuthService,
  FollowService,
  ZapService,
  Nip05ValidationService,
  extractZapPayerPubkeys,
  loadPostData
} from '@pubpay/shared-services';
import { GenericQR } from '@pubpay/shared-ui';
import { nip19, finalizeEvent, verifyEvent } from 'nostr-tools';
import { PayNoteComponent } from '../components/PayNoteComponent';
import { Nip05PurchaseOverlay } from '../components/Nip05PurchaseOverlay';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import bolt11 from 'bolt11';
import { genericUserIcon } from '../assets/images';

// Validation function for pubkeys and npubs/nprofiles
const isValidPublicKey = (pubkey: string): boolean => {
  // Check for hex pubkey format (64 characters)
  if (/^[0-9a-f]{64}$/i.test(pubkey)) {
    return true;
  }

  // Check for npub format
  if (pubkey.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(pubkey);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  }

  // Check for nprofile format
  if (pubkey.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(pubkey);
      return decoded.type === 'nprofile';
    } catch {
      return false;
    }
  }

  return false;
};

//

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { pubkey } = useParams<{ pubkey?: string }>();
  const {
    authState,
    nostrClient,
    handlePayWithExtension,
    handlePayAnonymously,
    handleSharePost,
    nostrReady,
    paymentErrors
  } = useOutletContext<{
    authState: any;
    nostrClient: any;
    handlePayWithExtension: (
      post: PubPayPost,
      amount: number,
      comment?: string
    ) => void;
    handlePayAnonymously: (
      post: PubPayPost,
      amount: number,
      comment?: string
    ) => void;
    handleSharePost: (post: PubPayPost) => void;
    nostrReady: boolean;
    paymentErrors: Map<string, string>;
  }>();
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const displayName = authState?.displayName;
  const publicKey = authState?.publicKey;
  const openLogin = useUIStore(s => s.openLogin);

  // Recovery state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    show: boolean;
    message: string;
    x: number;
    y: number;
  }>({
    show: false,
    message: '',
    x: 0,
    y: 0
  });

  // QR Code modal state
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState('');
  const [qrCodeType, setQrCodeType] = useState<'npub' | 'lightning'>('npub');

  // JSON Viewer state
  const [showJSON, setShowJSON] = useState(false);
  const [jsonContent, setJsonContent] = useState('');

  // NIP-05 Purchase overlay state
  const [showNip05Purchase, setShowNip05Purchase] = useState(false);

  const handleViewRaw = (post: PubPayPost) => {
    setJsonContent(JSON.stringify(post.event, null, 2));
    setShowJSON(true);
  };

  // Recovery handler
  const handleRecoveryFromMnemonic = async () => {
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }

    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(
        recoveryMnemonic.trim()
      );

      if (result.success && result.keyPair && result.keyPair.privateKey) {
        // Sign in with the recovered private key
        const signInResult = await AuthService.signInWithNsec(
          result.keyPair.privateKey
        );

        if (signInResult.success && signInResult.publicKey) {
          await AuthService.storeAuthData(
            signInResult.publicKey,
            result.keyPair.privateKey,
            'nsec'
          );

          setRecoveryMnemonic('');
          setShowRecoveryModal(false);
          alert(
            'Account recovered successfully! Please refresh the page to continue.'
          );
          window.location.reload();
        } else {
          alert(
            `Failed to sign in with recovered keys: ${
              signInResult.error || 'Unknown error'}`
          );
        }
      } else {
        alert(
          `Failed to recover keys: ${  result.error || 'Invalid mnemonic'}`
        );
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
    }
  };

  // Determine if we're viewing own profile or another user's profile
  const isOwnProfile = !pubkey || pubkey === publicKey;

  // Extract hex pubkey from npub/nprofile for profile loading
  const getHexPubkey = (pubkeyOrNpub: string): string => {
    if (!pubkeyOrNpub) return '';

    // If it's already a hex pubkey, return it
    if (/^[0-9a-f]{64}$/i.test(pubkeyOrNpub)) {
      return pubkeyOrNpub;
    }

    // If it's an npub or nprofile, decode it
    if (
      pubkeyOrNpub.startsWith('npub1') ||
      pubkeyOrNpub.startsWith('nprofile1')
    ) {
      try {
        const decoded = nip19.decode(pubkeyOrNpub);
        if (decoded.type === 'npub') {
          return decoded.data;
        } else if (decoded.type === 'nprofile') {
          return decoded.data.pubkey;
        }
      } catch (error) {
        console.error('Failed to decode npub/nprofile:', error);
      }
    }

    return pubkeyOrNpub;
  };

  const targetPubkey = getHexPubkey(pubkey || publicKey);

  // Get npub for NIP-05 purchase
  const getNpubForPurchase = (): string => {
    if (!publicKey) return '';
    try {
      return nip19.npubEncode(publicKey);
    } catch {
      return publicKey;
    }
  };

  // Profile data state
  const [profileData, setProfileData] = useState({
    displayName: '',
    bio: '',
    website: '',
    banner: '',
    picture: '',
    lightningAddress: '',
    nip05: ''
  });
  const [nip05Valid, setNip05Valid] = useState<boolean | null>(null);
  const [nip05Validating, setNip05Validating] = useState(false);

  // Loading state for external profiles
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [profileDataLoaded, setProfileDataLoaded] = useState(false);

  // Activity stats (counts only for now)
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityStats, setActivityStats] = useState({
    paynotesCreated: 0,
    pubpaysReceived: 0,
    zapsReceived: 0
  });

  // Paynotes data
  const [userPaynotes, setUserPaynotes] = useState<PubPayPost[]>([]);
  const [isLoadingPaynotes, setIsLoadingPaynotes] = useState(false);
  const [hasMorePaynotes, setHasMorePaynotes] = useState(false);
  const [paynotesUntil, setPaynotesUntil] = useState<number | undefined>(undefined);
  // Track lightning addresses being validated to avoid duplicate calls
  const validatingLightningAddressesRef = React.useRef<Set<string>>(new Set());
  // Track NIP-05 identifiers being validated to avoid duplicate calls
  const validatingNip05sRef = React.useRef<Set<string>>(new Set());

  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followBusy, setFollowBusy] = useState<boolean>(false);

  // Check follow status (auth user's contacts)
  useEffect(() => {
    (async () => {
      try {
        if (
          !nostrClient ||
          !publicKey ||
          !targetPubkey ||
          publicKey === targetPubkey
        )
          return;
        const following = await FollowService.isFollowing(
          nostrClient,
          publicKey,
          targetPubkey
        );
        setIsFollowing(following);
      } catch (e) {
        console.warn('Failed to check following status', e);
      }
    })();
  }, [nostrClient, publicKey, targetPubkey]);

  const handleFollow = async () => {
    try {
      if (!nostrClient || !publicKey || !targetPubkey) return;
      setFollowBusy(true);
      const ok = await FollowService.follow(
        nostrClient,
        publicKey,
        targetPubkey
      );
      if (ok) setIsFollowing(true);
    } catch (e) {
      console.error('Follow failed:', e);
    } finally {
      setFollowBusy(false);
    }
  };

  // Handle profile updates from edit page - force refetch and update
  useEffect(() => {
    if (
      (location.state as any)?.profileUpdated &&
      publicKey &&
      nostrClient &&
      isOwnProfile
    ) {
      // Clear cache and force fresh fetch
      const queryClient = getQueryClient();
      queryClient.removeQueries({ queryKey: ['profile', publicKey] });
      // Force refetch own profile from relays and update local state
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to ensure relays have the event
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [publicKey]
          );
          const profileEvent = profileMap.get(publicKey);
          if (profileEvent?.content) {
            const content =
              typeof profileEvent.content === 'string'
                ? JSON.parse(profileEvent.content)
                : profileEvent.content;
            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
          }
        } catch (error) {
          console.error('Failed to refresh profile after update:', error);
        }
      })();
      // Clear location state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [
    location.state,
    publicKey,
    navigate,
    location.pathname,
    nostrClient,
    isOwnProfile
  ]);

  // Load profile data - either from own profile or fetch external profile
  useEffect(() => {
    let waitForProfileTimeout: NodeJS.Timeout | null = null;
    
    const loadProfileData = async () => {
      const startTime = Date.now();
      setLoadStartTime(startTime);
      setProfileDataLoaded(false);
      setIsLoadingProfile(false);
      setProfileError(null);
      setIsInitialLoad(true);

      const markAsLoaded = () => {
        // Ensure minimum display time for skeletons (300ms)
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, 300 - elapsed);
        setTimeout(() => {
          setIsInitialLoad(false);
          setIsLoadingProfile(false);
          setProfileDataLoaded(true);
        }, remainingTime);
      };

      if (isOwnProfile) {
        // For own profile, wait for userProfile to be loaded from authState
        // If user is logged in but userProfile is null, it might still be loading
        if (isLoggedIn && userProfile === null) {
          // User is logged in but userProfile is null - might still be loading
          // Wait a bit to see if it loads, then mark as loaded
          waitForProfileTimeout = setTimeout(() => {
            // After 500ms, if userProfile is still null, it's confirmed not available
            markAsLoaded();
          }, 500);
          return; // Exit early, will re-run when userProfile changes
        }
        
        // Load own profile from userProfile
        if (userProfile?.content) {
          try {
            const content =
              typeof userProfile.content === 'string'
                ? JSON.parse(userProfile.content)
                : userProfile.content;

            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
            
            markAsLoaded();
          } catch (error) {
            console.error('Failed to parse profile content:', error);
            markAsLoaded();
          }
        } else {
          // userProfile is null and user is not logged in, or confirmed not available
          // Mark as loaded after minimum time
          markAsLoaded();
        }
      } else if (targetPubkey && nostrClient) {
        // Validate pubkey format (use original pubkey parameter for validation)
        if (!isValidPublicKey(pubkey || publicKey)) {
          setProfileError('Invalid public key format');
          return;
        }

        // Load external profile using ensureProfiles
        setIsLoadingProfile(true);
        try {
          console.log('Loading profile for pubkey:', targetPubkey);
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [targetPubkey]
          );
          const profileEvent = profileMap.get(targetPubkey);
          console.log('Profile event received:', profileEvent);

          if (profileEvent?.content) {
            const content =
              typeof profileEvent.content === 'string'
                ? JSON.parse(profileEvent.content)
                : profileEvent.content;

            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
          } else {
            // Profile not found, show minimal profile
            setProfileData({
              displayName: '',
              bio: '',
              website: '',
              banner: '',
              picture: '',
              lightningAddress: '',
              nip05: ''
            });
          }
          
          markAsLoaded();
        } catch (error) {
          console.error('Failed to load external profile:', error);
          setProfileError('Failed to load profile');
          markAsLoaded();
        }
      }
    };

    loadProfileData();
    
    // Cleanup: clear timeout if component unmounts or dependencies change
    return () => {
      if (waitForProfileTimeout) {
        clearTimeout(waitForProfileTimeout);
      }
    };
  }, [isOwnProfile, targetPubkey, userProfile, nostrClient, isLoggedIn]);

  // Validate NIP-05 when it changes
  useEffect(() => {
    if (!profileData.nip05 || !targetPubkey) {
      setNip05Valid(null);
      setNip05Validating(false);
      return;
    }

    setNip05Validating(true);
    Nip05ValidationService.validateNip05(profileData.nip05, targetPubkey)
      .then(isValid => {
        setNip05Valid(isValid);
        setNip05Validating(false);
      })
      .catch(error => {
        console.warn('Failed to validate NIP-05:', error);
        setNip05Valid(false);
        setNip05Validating(false);
      });
  }, [profileData.nip05, targetPubkey]);

  // Load activity stats (lightweight - IDs only for counting)
  useEffect(() => {
    const loadActivityStats = async () => {
      if (!targetPubkey || !nostrClient) return;

      setActivityLoading(true);
      try {
        // Helper function to paginate and get all event IDs (lightweight)
        const getAllEventIds = async (
          filter: any,
          description: string
        ): Promise<Set<string>> => {
          const allEventIds = new Set<string>();
          let until: number | undefined = undefined;
          const limit = 500;
          let hasMore = true;
          let batchCount = 0;

          console.log(
            `[${description}] Starting to fetch event IDs with filter:`,
            filter
          );

          while (hasMore) {
            batchCount++;
            try {
              const batchFilter = {
                ...filter,
                limit,
                ...(until ? { until } : {})
              };

              const batch = (await nostrClient.getEvents([
                batchFilter
              ])) as any[];

              console.log(
                `[${description}] Batch ${batchCount} - Received ${batch.length} events`
              );

              if (batch.length === 0) {
                hasMore = false;
                break;
              }

              // Only extract IDs (lightweight)
              batch.forEach((event: any) => {
                if (event && event.id) {
                  allEventIds.add(event.id);
                }
              });

              // Sort to get oldest timestamp for pagination
              batch.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

              // If we got fewer events than the limit, we've reached the end
              if (batch.length < limit) {
                hasMore = false;
              } else {
                // Set until to the oldest event's timestamp for next batch
                const oldestEvent = batch[batch.length - 1];
                const oldestTimestamp = oldestEvent.created_at || 0;
                until = oldestTimestamp - 1;
              }

              // Safety limit to prevent infinite loops
              if (batchCount > 50) {
                console.warn(
                  `[${description}] Reached safety limit of 50 batches, stopping`
                );
                hasMore = false;
              }
            } catch (error) {
              console.error(
                `[${description}] Error fetching batch ${batchCount}:`,
                error
              );
              hasMore = false;
            }
          }

          console.log(
            `[${description}] Final count: ${allEventIds.size} unique event IDs`
          );

          return allEventIds;
        };

        // Fetch all kind:1 event IDs by this user (lightweight - just IDs)
        let allNoteIds: Set<string> = new Set();
        try {
          const allNotes = await getAllEventIds(
            {
              kinds: [1],
              authors: [targetPubkey]
            },
            'all notes'
          );
          allNoteIds = allNotes;
          console.log(`[stats] Fetched ${allNoteIds.size} total kind:1 event IDs`);
        } catch (error) {
          console.error('Error fetching all note IDs:', error);
        }

        // Fetch paynote IDs (try with #t filter first, fallback to client-side filtering)
        let paynoteIds: Set<string> = new Set();
        try {
          // Try querying with #t filter on relay side (more efficient)
          const paynotesWithFilter = await getAllEventIds(
            {
              kinds: [1],
              authors: [targetPubkey],
              '#t': ['pubpay']
            },
            'paynotes (with filter)'
          );
          paynoteIds = paynotesWithFilter;
          console.log(`[stats] Found ${paynoteIds.size} paynotes (with relay filter)`);
        } catch (error) {
          console.warn('Relay-side filtering failed, using all notes:', error);
          // Fallback: if relay doesn't support #t filter, we'd need to fetch all and filter
          // For now, use allNoteIds as approximation (will be less accurate)
          paynoteIds = allNoteIds;
        }

        // Count zaps where:
        //    - #e tag references one of the event IDs
        //    - #p tag matches targetPubkey (user is the recipient)
        const countZapsForEventIds = async (
          eventIdsSet: Set<string>,
          description: string
        ): Promise<number> => {
          if (eventIdsSet.size === 0) return 0;

          const seen = new Set<string>();

          // Query zaps received by this user (p tag = targetPubkey)
          try {
            // Get zaps where p tag matches targetPubkey
            const receipts = (await nostrClient.getEvents([
              { kinds: [9735], '#p': [targetPubkey], limit: 5000 }
            ])) as any[];

            // Filter to only zaps that reference events in our set
            for (const receipt of receipts) {
              if (!receipt || !receipt.id || !receipt.tags) continue;

              // Check if this zap references one of our events
              const eventTag = receipt.tags.find(
                (tag: any[]) => tag[0] === 'e'
              );
              if (!eventTag || !eventTag[1]) continue;

              const referencedEventId = eventTag[1];
              if (eventIdsSet.has(referencedEventId)) {
                seen.add(receipt.id);
              }
            }
          } catch (error) {
            console.error(`Error counting ${description}:`, error);
          }

          return seen.size;
        };

        const [pubpaysReceived, zapsReceived] = await Promise.all([
          countZapsForEventIds(paynoteIds, 'pubpays received'),
          countZapsForEventIds(allNoteIds, 'zaps received')
        ]);

        setActivityStats({
          paynotesCreated: paynoteIds.size,
          pubpaysReceived,
          zapsReceived
        });
      } catch (error) {
        console.error('Error loading activity stats:', error);
        // Set to zero on error
        setActivityStats({
          paynotesCreated: 0,
          pubpaysReceived: 0,
          zapsReceived: 0
        });
      } finally {
        setActivityLoading(false);
      }
    };

    loadActivityStats();
  }, [targetPubkey, nostrClient]);

  // Load display paynotes (limited, with progressive rendering)
  useEffect(() => {
    const loadDisplayPaynotes = async (loadMore = false) => {
      if (!targetPubkey || !nostrClient) return;

      if (!loadMore) {
        setIsLoadingPaynotes(true);
        setUserPaynotes([]);
        setPaynotesUntil(undefined);
      }

      try {
        // Query paynotes with limit (for display)
        const displayLimit = 21;
        const filter: any = {
          kinds: [1],
          authors: [targetPubkey],
          '#t': ['pubpay'],
          limit: displayLimit
        };

        if (paynotesUntil) {
          filter.until = paynotesUntil;
        }

        const paynoteEvents = (await nostrClient.getEvents([filter])) as any[];

        if (paynoteEvents.length === 0) {
          setHasMorePaynotes(false);
          if (!loadMore) {
            setIsLoadingPaynotes(false);
          }
          return;
        }

        // Deduplicate events by ID (multiple relays may return same events)
        const uniqueEventsMap = new Map<string, any>();
        paynoteEvents.forEach(event => {
          if (!uniqueEventsMap.has(event.id)) {
            uniqueEventsMap.set(event.id, event);
          }
        });
        let deduplicatedEvents = Array.from(uniqueEventsMap.values());

        // Sort by created_at (newest first)
        deduplicatedEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // Apply limit (safety check)
        if (!loadMore) {
          deduplicatedEvents = deduplicatedEvents.slice(0, displayLimit);
        }

        // Check if there are more posts
        if (deduplicatedEvents.length >= displayLimit) {
          const oldestEvent = deduplicatedEvents[deduplicatedEvents.length - 1];
          setPaynotesUntil(oldestEvent.created_at);
          setHasMorePaynotes(true);
        } else {
          setHasMorePaynotes(false);
        }

        // Convert to PubPayPost format (minimal data first)
        const formattedPaynotes: PubPayPost[] = deduplicatedEvents.map((event: any) => {
          // Extract PubPay metadata from tags
          let zapMin = 0;
          let zapMax = 0;
          let zapMaxUses = 0;
          let lud16ToZap = '';
          let zapPayerPubkey = '';

          let zapGoal: number | undefined;
          event.tags.forEach((tag: any[]) => {
            if (tag[0] === 'zap-min')
              zapMin = Math.floor((parseInt(tag[1]) || 0) / 1000);
            if (tag[0] === 'zap-max')
              zapMax = Math.floor((parseInt(tag[1]) || 0) / 1000);
            if (tag[0] === 'zap-uses') zapMaxUses = parseInt(tag[1]) || 0;
            if (tag[0] === 'zap-goal') zapGoal = Math.floor((parseInt(tag[1]) || 0) / 1000);
            if (tag[0] === 'zap-lnurl') lud16ToZap = tag[1] || '';
            if (tag[0] === 'zap-payer') zapPayerPubkey = tag[1] || '';
          });

          // Mark as loading if no author profile yet
          const hasAuthorProfile = false; // Will be loaded in background
          return {
            id: event.id,
            event,
            author: null, // Will be loaded in background
            zaps: [], // Will be loaded in background
            zapAmount: 0,
            zapMin,
            zapMax,
            zapUses: zapMaxUses,
            zapUsesCurrent: 0,
            zapGoal,
            content: event.content || '',
            isPayable: true,
            hasZapTags: true,
            zapPayer: zapPayerPubkey || undefined,
            zapLNURL: lud16ToZap,
            createdAt: event.created_at || 0,
            profileLoading: true, // Mark as loading
            lightningValidating: true
          };
        });

        // Show paynotes immediately (progressive rendering)
        if (loadMore) {
          setUserPaynotes(prev => {
            // Filter out duplicates
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = formattedPaynotes.filter(p => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        } else {
          setUserPaynotes(formattedPaynotes);
          setIsLoadingPaynotes(false);
        }

        // Load profiles, zaps, and zap payer profiles in background (non-blocking)
        (async () => {
          try {
            // Use unified loadPostData utility to load all related data
            const postData = await loadPostData(
              getQueryClient(),
              nostrClient,
              deduplicatedEvents,
              { genericUserIcon }
            );

            const profileMap = postData.profiles;
            const zapEvents = postData.zaps;
            const zapPayerProfileMap = postData.zapPayerProfiles;

            // Update posts with profiles (progressive enhancement)
            const updatePostWithProfile = (post: PubPayPost, event: any, author: any): PubPayPost => {
              if (!author || author.content === '{}') {
                return post;
              }

              const updatedPost = { ...post, author, profileLoading: false };

              // Recalculate isPayable based on author profile
              try {
                const authorData = safeJson<Record<string, any>>(author.content || '{}', {});
                const hasLud16 = !!(authorData as any).lud16;
                const hasNip05 = !!(authorData as any).nip05;

                const zapMinTag = event.tags.find((tag: any[]) => tag[0] === 'zap-min');
                const zapMaxTag = event.tags.find((tag: any[]) => tag[0] === 'zap-max');
                const zapLNURLTag = event.tags.find((tag: any[]) => tag[0] === 'zap-lnurl');
                const hasZapTags = !!(zapMinTag || zapMaxTag || event.tags.find((tag: any[]) => tag[0] === 'zap-uses') || event.tags.find((tag: any[]) => tag[0] === 'zap-goal'));
                const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

                updatedPost.hasZapTags = hasZapTags;
                updatedPost.isPayable = (hasLud16 || !!updatedPost.zapLNURL) && hasPaymentAmount;

                if (hasLud16) {
                  updatedPost.lightningValidating = true;
                }
                if (hasNip05) {
                  updatedPost.nip05Validating = true;
                }
              } catch {
                // Keep existing values on error
              }

              return updatedPost;
            };

            setUserPaynotes(prev => {
              return prev.map(post => {
                const event = deduplicatedEvents.find((e: any) => e.id === post.id);
                if (!event) return post;

                const author = profileMap.get(event.pubkey) || null;
                return updatePostWithProfile(post, event, author);
              });
            });

            // Process and update zaps
            setUserPaynotes(prev => {
              return prev.map(paynote => {
                const event = deduplicatedEvents.find((e: any) => e.id === paynote.id);
                if (!event) return paynote;

              const postZaps = zapEvents.filter((zap: any) => {
                const eTag = zap.tags.find((tag: any[]) => tag[0] === 'e');
                return eTag && eTag[1] === paynote.id;
              });

                if (postZaps.length === 0) return paynote;

              // Process zaps
              const processedZaps = postZaps.map((zap: any) => {
                  const bolt11Tag = zap.tags.find((tag: any[]) => tag[0] === 'bolt11');
                let zapAmount = 0;
                if (bolt11Tag) {
                  try {
                    const decoded = bolt11.decode(bolt11Tag[1] || '');
                    zapAmount = decoded.satoshis || 0;
                  } catch {
                    zapAmount = 0;
                  }
                }

                  const descriptionTag = zap.tags.find((tag: any[]) => tag[0] === 'description');
                let zapPayerPubkey = zap.pubkey;
                let zapContent = '';

                if (descriptionTag) {
                  try {
                      const zapData = parseZapDescription(descriptionTag[1] || undefined);
                    if (zapData?.pubkey) {
                      zapPayerPubkey = zapData.pubkey;
                    }
                      if (zapData && 'content' in zapData && typeof zapData.content === 'string') {
                      zapContent = zapData.content;
                    }
                  } catch {
                    // Use zap.pubkey as fallback
                  }
                }

                const zapPayerProfile = zapPayerProfileMap.get(zapPayerPubkey);
                  const zapPayerPicture = zapPayerProfile && zapPayerProfile.content && zapPayerProfile.content !== '{}'
                  ? (
                      safeJson<Record<string, unknown>>(
                        zapPayerProfile.content || '{}',
                        {}
                      ) as any
                    ).picture || genericUserIcon
                  : genericUserIcon;

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

              // Filter zaps by amount limits
              const zapsWithinLimits = processedZaps.filter((zap: any) => {
                const amount = zap.zapAmount;
                const min = paynote.zapMin;
                const max = paynote.zapMax;

                if (min > 0 && max > 0) {
                  return amount >= min && amount <= max;
                } else if (min > 0 && max === 0) {
                  return amount >= min;
                } else if (min === 0 && max > 0) {
                  return amount <= max;
                } else {
                  return true;
                }
              });

              const totalZapAmount = processedZaps.reduce(
                (sum: number, zap: any) => sum + zap.zapAmount,
                0
              );
              const zapUsesCurrent =
                paynote.zapUses && paynote.zapUses > 0
                  ? Math.min(zapsWithinLimits.length, paynote.zapUses)
                  : zapsWithinLimits.length;

              // Set zap-payer picture and name if zap-payer tag exists
                let zapPayerPicture = genericUserIcon;
                let zapPayerName: string | undefined = undefined;
              if (paynote.zapPayer) {
                const zapPayerProfile = zapPayerProfileMap.get(paynote.zapPayer);
                if (zapPayerProfile) {
                  try {
                    const profileData = safeJson<Record<string, any>>(
                      zapPayerProfile.content || '{}',
                      {}
                    );
                      zapPayerPicture = (profileData as any).picture || genericUserIcon;
                      zapPayerName = (profileData as any).display_name || (profileData as any).name || undefined;
                  } catch {
                      zapPayerPicture = genericUserIcon;
                    }
                  }
                }

                return {
                  ...paynote,
                  zaps: processedZaps,
                  zapAmount: totalZapAmount,
                  zapUsesCurrent,
                  zapPayerPicture,
                  zapPayerName
                };
              });
            });

            // Validate lightning addresses asynchronously
            setTimeout(() => {
              setUserPaynotes(prev => {
                validateLightningAddresses(prev);
                validateNip05s(prev);
                return prev;
              });
            }, 100);
          } catch (err) {
            console.error('Error loading profiles/zaps in background:', err);
          }
        })();
          } catch (error) {
        console.error('Error loading display paynotes:', error);
        setIsLoadingPaynotes(false);
      }
    };

    loadDisplayPaynotes(false);
  }, [targetPubkey, nostrClient]);

  // Load more paynotes handler
  const loadMorePaynotes = React.useCallback(async () => {
    if (!targetPubkey || !nostrClient || !hasMorePaynotes || isLoadingPaynotes) return;
    
    setIsLoadingPaynotes(true);
    try {
      const displayLimit = 21;
      const filter: any = {
        kinds: [1],
        authors: [targetPubkey],
        '#t': ['pubpay'],
        limit: displayLimit
      };

      if (paynotesUntil) {
        filter.until = paynotesUntil;
      }

      const paynoteEvents = (await nostrClient.getEvents([filter])) as any[];

      if (paynoteEvents.length === 0) {
        setHasMorePaynotes(false);
        setIsLoadingPaynotes(false);
        return;
      }

      // Deduplicate events by ID
      const uniqueEventsMap = new Map<string, any>();
      paynoteEvents.forEach(event => {
        if (!uniqueEventsMap.has(event.id)) {
          uniqueEventsMap.set(event.id, event);
        }
      });
      let deduplicatedEvents = Array.from(uniqueEventsMap.values());
      deduplicatedEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

      // Check if there are more posts
      if (deduplicatedEvents.length >= displayLimit) {
        const oldestEvent = deduplicatedEvents[deduplicatedEvents.length - 1];
        setPaynotesUntil(oldestEvent.created_at);
        setHasMorePaynotes(true);
      } else {
        setHasMorePaynotes(false);
      }

      // Convert to PubPayPost format
      const formattedPaynotes: PubPayPost[] = deduplicatedEvents.map((event: any) => {
        let zapMin = 0;
        let zapMax = 0;
        let zapMaxUses = 0;
        let lud16ToZap = '';
        let zapPayerPubkey = '';
        let zapGoal: number | undefined;

        event.tags.forEach((tag: any[]) => {
          if (tag[0] === 'zap-min') zapMin = Math.floor((parseInt(tag[1]) || 0) / 1000);
          if (tag[0] === 'zap-max') zapMax = Math.floor((parseInt(tag[1]) || 0) / 1000);
          if (tag[0] === 'zap-uses') zapMaxUses = parseInt(tag[1]) || 0;
          if (tag[0] === 'zap-goal') zapGoal = Math.floor((parseInt(tag[1]) || 0) / 1000);
          if (tag[0] === 'zap-lnurl') lud16ToZap = tag[1] || '';
          if (tag[0] === 'zap-payer') zapPayerPubkey = tag[1] || '';
        });

        return {
          id: event.id,
          event,
          author: null,
          zaps: [],
          zapAmount: 0,
          zapMin,
          zapMax,
          zapUses: zapMaxUses,
          zapUsesCurrent: 0,
          zapGoal,
          content: event.content || '',
          isPayable: true,
          hasZapTags: true,
          zapPayer: zapPayerPubkey || undefined,
          zapLNURL: lud16ToZap,
          createdAt: event.created_at || 0,
          profileLoading: true,
          lightningValidating: true
        };
      });

      // Add to existing paynotes
      setUserPaynotes(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newPosts = formattedPaynotes.filter(p => !existingIds.has(p.id));
        return [...prev, ...newPosts];
      });

      setIsLoadingPaynotes(false);

      // Load profiles and zaps in background (same as initial load)
      (async () => {
        try {
          const authorPubkeys = Array.from(
            new Set(deduplicatedEvents.map((e: any) => e.pubkey))
          );

          const [profileMap, zapEvents] = await Promise.all([
            ensureProfiles(getQueryClient(), nostrClient, authorPubkeys),
            ensureZaps(getQueryClient(), nostrClient, deduplicatedEvents.map((e: any) => e.id))
          ]);

          // Extract zap payer pubkeys
          // Extract zap payer pubkeys using utility function
          const zapPayerPubkeys = extractZapPayerPubkeys(deduplicatedEvents, zapEvents);

          const zapPayerProfileMap =
            zapPayerPubkeys.size > 0
              ? await ensureProfiles(getQueryClient(), nostrClient, Array.from(zapPayerPubkeys))
              : new Map();

          // Update posts with profiles
          setUserPaynotes(prev => {
            return prev.map(post => {
              const event = deduplicatedEvents.find((e: any) => e.id === post.id);
              if (!event) return post;

              const author = profileMap.get(event.pubkey) || null;
              if (author && author.content !== '{}') {
                const updatedPost = { ...post, author, profileLoading: false };
                try {
                  const authorData = safeJson<Record<string, any>>(author.content || '{}', {});
                  const hasLud16 = !!(authorData as any).lud16;
                  const hasNip05 = !!(authorData as any).nip05;

                  const zapMinTag = event.tags.find((tag: any[]) => tag[0] === 'zap-min');
                  const zapMaxTag = event.tags.find((tag: any[]) => tag[0] === 'zap-max');
                  const zapLNURLTag = event.tags.find((tag: any[]) => tag[0] === 'zap-lnurl');
                  const hasZapTags = !!(zapMinTag || zapMaxTag || event.tags.find((tag: any[]) => tag[0] === 'zap-uses') || event.tags.find((tag: any[]) => tag[0] === 'zap-goal'));
                  const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

                  updatedPost.hasZapTags = hasZapTags;
                  updatedPost.isPayable = (hasLud16 || !!updatedPost.zapLNURL) && hasPaymentAmount;

                  if (hasLud16) {
                    updatedPost.lightningValidating = true;
                  }
                  if (hasNip05) {
                    updatedPost.nip05Validating = true;
                  }
                } catch {
                  // Keep existing values on error
                }
                return updatedPost;
              }
              return post;
            });
          });

          // Process and update zaps
          setUserPaynotes(prev => {
            return prev.map(paynote => {
              const event = deduplicatedEvents.find((e: any) => e.id === paynote.id);
              if (!event) return paynote;

              const postZaps = zapEvents.filter((zap: any) => {
                const eTag = zap.tags.find((tag: any[]) => tag[0] === 'e');
                return eTag && eTag[1] === paynote.id;
              });

              if (postZaps.length === 0) return paynote;

              const processedZaps = postZaps.map((zap: any) => {
                const bolt11Tag = zap.tags.find((tag: any[]) => tag[0] === 'bolt11');
                let zapAmount = 0;
                if (bolt11Tag) {
                  try {
                    const decoded = bolt11.decode(bolt11Tag[1] || '');
                    zapAmount = decoded.satoshis || 0;
                  } catch {
                    zapAmount = 0;
                  }
                }

                const descriptionTag = zap.tags.find((tag: any[]) => tag[0] === 'description');
                let zapPayerPubkey = zap.pubkey;
                let zapContent = '';

                if (descriptionTag) {
                  try {
                    const zapData = parseZapDescription(descriptionTag[1] || undefined);
                    if (zapData?.pubkey) {
                      zapPayerPubkey = zapData.pubkey;
                    }
                    if (zapData && 'content' in zapData && typeof zapData.content === 'string') {
                      zapContent = zapData.content;
                    }
                  } catch {
                    // Use zap.pubkey as fallback
                  }
                }

                const zapPayerProfile = zapPayerProfileMap.get(zapPayerPubkey);
                const zapPayerPicture = zapPayerProfile && zapPayerProfile.content && zapPayerProfile.content !== '{}'
                  ? (safeJson<Record<string, unknown>>(zapPayerProfile.content || '{}', {}) as any).picture || genericUserIcon
                  : genericUserIcon;

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

              const zapsWithinLimits = processedZaps.filter((zap: any) => {
                const amount = zap.zapAmount;
                const min = paynote.zapMin;
                const max = paynote.zapMax;

                if (min > 0 && max > 0) {
                  return amount >= min && amount <= max;
                } else if (min > 0 && max === 0) {
                  return amount >= min;
                } else if (min === 0 && max > 0) {
                  return amount <= max;
                } else {
                  return true;
                }
              });

              const totalZapAmount = processedZaps.reduce((sum: number, zap: any) => sum + zap.zapAmount, 0);
              const zapUsesCurrent =
                paynote.zapUses && paynote.zapUses > 0
                  ? Math.min(zapsWithinLimits.length, paynote.zapUses)
                  : zapsWithinLimits.length;

              let zapPayerPicture = genericUserIcon;
              let zapPayerName: string | undefined = undefined;
              if (paynote.zapPayer) {
                const zapPayerProfile = zapPayerProfileMap.get(paynote.zapPayer);
                if (zapPayerProfile) {
                  try {
                    const profileData = safeJson<Record<string, any>>(zapPayerProfile.content || '{}', {});
                    zapPayerPicture = (profileData as any).picture || genericUserIcon;
                    zapPayerName = (profileData as any).display_name || (profileData as any).name || undefined;
                  } catch {
                    zapPayerPicture = genericUserIcon;
                  }
                }
              }

              return {
                ...paynote,
                zaps: processedZaps,
                zapAmount: totalZapAmount,
                zapUsesCurrent,
                zapPayerPicture,
                zapPayerName
              };
            });
          });

          setTimeout(() => {
            setUserPaynotes(prev => {
              validateLightningAddresses(prev);
              validateNip05s(prev);
              return prev;
            });
          }, 100);
        } catch (err) {
          console.error('Error loading profiles/zaps in background:', err);
        }
      })();
    } catch (error) {
      console.error('Error loading more paynotes:', error);
      setIsLoadingPaynotes(false);
    }
  }, [targetPubkey, nostrClient, hasMorePaynotes, isLoadingPaynotes, paynotesUntil]);

  // Validate lightning addresses for posts asynchronously
  const validateLightningAddresses = async (posts: PubPayPost[]) => {
    // Extract unique lightning addresses from posts
    const lightningAddresses = new Map<string, PubPayPost[]>();

    for (const post of posts) {
      if (post.author) {
        try {
          const authorData = JSON.parse(post.author.content || '{}');
          const lud16 = authorData?.lud16;
          if (lud16 && typeof lud16 === 'string') {
            if (!lightningAddresses.has(lud16)) {
              lightningAddresses.set(lud16, []);
            }
            lightningAddresses.get(lud16)!.push(post);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Validate each unique lightning address (only once per address)
    for (const [lud16, postsWithAddress] of lightningAddresses.entries()) {
      // Skip if already validating or validated
      if (validatingLightningAddressesRef.current.has(lud16)) {
        continue;
      }

      // Mark as validating
      validatingLightningAddressesRef.current.add(lud16);

      // Validate asynchronously (fire and forget)
      ZapService.validateLightningAddress(lud16)
        .then(isValid => {
          // Update all posts with this lightning address using functional updates
          setUserPaynotes(prev => prev.map(post => {
            if (postsWithAddress.some(p => p.id === post.id)) {
              return {
                ...post,
                lightningValid: isValid,
                lightningValidating: false,
                // Update isPayable based on validation result
                isPayable: !!(isValid && post.hasZapTags &&
                  (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses))
              };
            }
            return post;
          }));
        })
        .catch(error => {
          console.warn(`Failed to validate lightning address ${lud16}:`, error);
          // Mark as invalid on error
          setUserPaynotes(prev => prev.map(post => {
            if (postsWithAddress.some(p => p.id === post.id)) {
              return {
                ...post,
                lightningValid: false,
                lightningValidating: false,
                isPayable: false
              };
            }
            return post;
          }));
        })
        .finally(() => {
          // Remove from validating set
          validatingLightningAddressesRef.current.delete(lud16);
        });
    }
  };

  // Validate NIP-05 identifiers for posts asynchronously
  const validateNip05s = async (posts: PubPayPost[]) => {
    // Extract unique NIP-05 identifiers from posts with their pubkeys
    const nip05s = new Map<string, { nip05: string; pubkey: string; posts: PubPayPost[] }>();

    for (const post of posts) {
      if (post.author) {
        try {
          const authorData = JSON.parse(post.author.content || '{}');
          const nip05 = authorData?.nip05;
          if (nip05 && typeof nip05 === 'string' && post.event.pubkey) {
            const key = `${nip05}:${post.event.pubkey}`;
            if (!nip05s.has(key)) {
              nip05s.set(key, { nip05, pubkey: post.event.pubkey, posts: [] });
            }
            nip05s.get(key)!.posts.push(post);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Validate each unique NIP-05 identifier (only once per identifier:pubkey combo)
    for (const [key, { nip05, pubkey, posts: postsWithNip05 }] of nip05s.entries()) {
      // Skip if already validating
      if (validatingNip05sRef.current.has(key)) {
        continue;
      }

      // Mark as validating
      validatingNip05sRef.current.add(key);

      // Set validating state for all posts with this NIP-05
      setUserPaynotes(prev => prev.map(post => {
        if (postsWithNip05.some(p => p.id === post.id)) {
          return { ...post, nip05Validating: true };
        }
        return post;
      }));

      // Validate asynchronously (fire and forget)
      Nip05ValidationService.validateNip05(nip05, pubkey)
        .then(isValid => {
          // Update all posts with this NIP-05 using functional updates
          setUserPaynotes(prev => prev.map(post => {
            if (postsWithNip05.some(p => p.id === post.id)) {
              return {
                ...post,
                nip05Valid: isValid,
                nip05Validating: false
              };
            }
            return post;
          }));
        })
        .catch(error => {
          console.warn(`Failed to validate NIP-05 ${nip05}:`, error);
          // Mark as invalid on error
          setUserPaynotes(prev => prev.map(post => {
            if (postsWithNip05.some(p => p.id === post.id)) {
              return {
                ...post,
                nip05Valid: false,
                nip05Validating: false
              };
            }
            return post;
          }));
        })
        .finally(() => {
          // Remove from validating set
          validatingNip05sRef.current.delete(key);
        });
    }
  };

  // Subscribe to new zaps for profile page posts
  const paynoteEventIds = useMemo(
    () => userPaynotes.map(post => post.id),
    [userPaynotes]
  );

  useEffect(() => {
    if (!nostrClient || !nostrReady || paynoteEventIds.length === 0) {
      return;
    }

    const eventIds = paynoteEventIds;

    console.log('Profile page: subscribing to zaps for', eventIds.length, 'posts');

    const zapSubscription = nostrClient.subscribeToEvents(
      [
        {
          kinds: [9735],
          '#e': eventIds
        }
      ],
      async (zapEvent: any) => {
        if (zapEvent.kind !== 9735) return;

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
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [zapPayerPubkey]
          );
          zapPayerProfile = profileMap.get(zapPayerPubkey);
        } catch (error) {
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
      if (zapSubscription) {
        try {
          zapSubscription.unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing from profile zap subscription:', e);
        }
      }
    };
  }, [nostrClient, nostrReady, paynoteEventIds.join(',')]); // Re-subscribe when posts change

  // Copy to clipboard function with tooltip
  const handleCopyToClipboard = (
    text: string,
    label: string,
    event: React.MouseEvent
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 10;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setTooltip({
          show: true,
          message: `${label} copied to clipboard!`,
          x,
          y
        });

        // Auto-hide tooltip after 2 seconds
        setTimeout(() => {
          setTooltip(prev => ({ ...prev, show: false }));
        }, 2000);
      })
      .catch(() => {
        setTooltip({
          show: true,
          message: `Failed to copy ${label}`,
          x,
          y
        });

        // Auto-hide tooltip after 2 seconds
        setTimeout(() => {
          setTooltip(prev => ({ ...prev, show: false }));
        }, 2000);
      });
  };

  // Show QR code modal
  const handleShowQRCode = (
    data: string,
    type: 'npub' | 'lightning' = 'npub'
  ) => {
    setQrCodeData(data);
    setQrCodeType(type);
    setShowQRModal(true);
  };

  // Trim npub for display (show first 8 and last 4 characters)
  const trimNpub = (npub: string): string => {
    if (!npub || npub.length <= 12) return npub;
    return `${npub.substring(0, 12)}...${npub.substring(npub.length - 8)}`;
  };

  const trimWebsiteUrl = (url: string): string => {
    if (!url) return url;
    return url.replace(/^https?:\/\//, '');
  };

  // Convert public key to npub format
  const getNpubFromPublicKey = (pubkey?: string): string => {
    const keyToConvert = pubkey || publicKey;
    if (!keyToConvert) return '';

    try {
      // If it's already an npub, return it
      if (keyToConvert.startsWith('npub1')) {
        return keyToConvert;
      }

      // If it's an nprofile, extract the pubkey and convert to npub
      if (keyToConvert.startsWith('nprofile1')) {
        const decoded = nip19.decode(keyToConvert);
        if ((decoded as any).type === 'nprofile') {
          return nip19.npubEncode((decoded.data as any).pubkey);
        }
      }

      // If it's a hex string, convert to npub
      if (keyToConvert.length === 64 && /^[0-9a-fA-F]+$/.test(keyToConvert)) {
        return nip19.npubEncode(keyToConvert);
      }

      // If it's already a string, try to encode it directly
      return nip19.npubEncode(keyToConvert);
    } catch (error) {
      console.error('Failed to convert public key to npub:', error);
      return keyToConvert; // Return original if conversion fails
    }
  };

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        {isOwnProfile ? 'Profile' : 'User Profile'}
      </h1>

      {(() => {
        // Show skeletons if: loading, initial load, or data not confirmed loaded yet
        // Only hide skeleton when data is confirmed loaded (profileDataLoaded = true)
        const shouldShowSkeleton = 
          isLoadingProfile || 
          isInitialLoad || 
          !profileDataLoaded;
        return shouldShowSkeleton;
      })() ? (
        <div className="profileSection" id="profilePreview">
          {/* Banner Image */}
          <div className="profileBanner">
            <div className="skeleton" style={{ width: '100%', height: '120px', borderRadius: '0' }}></div>
          </div>

          <div className="profileUserInfo">
            <div className="profileAvatar">
              <div className="skeleton skeleton-avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }}></div>
            </div>
            <div className="profileUserDetails">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}
              >
                <h2 style={{ margin: 0 }}>
                  <div className="skeleton skeleton-text" style={{ width: '200px', height: '24px' }}></div>
                </h2>
                {isOwnProfile || isLoggedIn ? (
                  <div className="skeleton" style={{ width: '60px', height: '32px', borderRadius: '6px' }}></div>
                ) : null}
              </div>
              <div className="skeleton skeleton-text short" style={{ height: '16px', width: '150px', marginBottom: '8px' }}></div>
              <p style={{ margin: 0 }}>
                <div className="skeleton skeleton-text" style={{ height: '14px', width: '100%', marginBottom: '4px' }}></div>
                <div className="skeleton skeleton-text medium" style={{ height: '14px' }}></div>
              </p>

              {/* Profile Details */}
              <div className="profileDetails">
                {(isOwnProfile || true) && (
                  <div className="profileDetailItem">
                    <label>Lightning Address</label>
                    <div className="profileDetailValue">
                      <div className="skeleton skeleton-text" style={{ width: '180px', height: '20px' }}></div>
                    </div>
                  </div>
                )}
                {(isOwnProfile || true) && (
                  <div className="profileDetailItem">
                    <label>Identifier (nip-05)</label>
                    <div className="profileDetailValue">
                      <div className="skeleton skeleton-text" style={{ width: '150px', height: '20px' }}></div>
                    </div>
                  </div>
                )}
                {targetPubkey && (
                  <div className="profileDetailItem">
                    <label>User ID (npub)</label>
                    <div className="profileDetailValue">
                      <div className="skeleton skeleton-text" style={{ width: '200px', height: '20px' }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : profileError ? (
        <div className="profileError">
          <h2>Error</h2>
          <p>{profileError}</p>
        </div>
      ) : isOwnProfile && !isLoggedIn ? (
        <div>
          <div className="profileNotLoggedIn">
            <h2 className="profileNotLoggedInTitle">Not Logged In</h2>
            <p className="profileNotLoggedInText">
              Please log in to view your profile and manage your account
              settings.
            </p>
            <div className="profileButtonGroup">
              <button className="profileLoginButton" onClick={openLogin}>
                Log In
              </button>
              <button
                className="profileRegisterButton"
                onClick={() => navigate('/register')}
              >
                Register
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '15px' }}>
              <button
                className="profileRecoveryLink"
                onClick={() => setShowRecoveryModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4a75ff',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Recover Existing Account
              </button>
            </div>
          </div>
        </div>
      ) : !isLoadingProfile && !isInitialLoad ? (
        <div>
          {/* User Profile Section */}
          <div className="profileSection" id="profilePreview">
            {/* Banner Image */}
            <div className="profileBanner">
              {profileData.banner && (
                <img
                  src={profileData.banner}
                  alt="Profile banner"
                  className="profileBannerImage"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>

            <div className="profileUserInfo">
              <div className="profileAvatar">
                {(() => {
                  const shouldShowSkeleton = 
                    isLoadingProfile || 
                    isInitialLoad || 
                    !profileDataLoaded;
                  return shouldShowSkeleton;
                })() ? (
                  <div className="skeleton skeleton-avatar" style={{ width: '120px', height: '120px' }}></div>
                ) : profileData.picture ? (
                  <img
                    src={profileData.picture}
                    alt="Profile"
                    className="profileAvatarImage"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget
                        .nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                {(() => {
                  const shouldShowSkeleton = 
                    isLoadingProfile || 
                    isInitialLoad || 
                    !profileDataLoaded ||
                    (loadStartTime !== null && Date.now() - loadStartTime < 300);
                  return !shouldShowSkeleton;
                })() && (
                <div
                  className="profileAvatarFallback"
                  style={{ display: profileData.picture ? 'none' : 'flex' }}
                >
                  {profileData.displayName
                    ? profileData.displayName.charAt(0).toUpperCase()
                    : 'U'}
                </div>
                )}
              </div>
              <div className="profileUserDetails">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}
                >
                  <h2 style={{ margin: 0 }}>
                    {(() => {
                      const shouldShowSkeleton = 
                        isLoadingProfile || 
                        isInitialLoad || 
                        !profileDataLoaded ||
                        (loadStartTime !== null && Date.now() - loadStartTime < 300);
                      return shouldShowSkeleton;
                    })() ? (
                      <div className="skeleton skeleton-text" style={{ width: '200px', height: '28px' }}></div>
                    ) : (
                      profileData.displayName || displayName || 'Anonymous User'
                    )}
                  </h2>
                  {isOwnProfile ? (
                    <button
                      className="profileEditButton"
                      onClick={() => navigate('/edit-profile')}
                    >
                      Edit
                    </button>
                  ) : (
                    isLoggedIn && (
                      <button
                        className="profileEditButton"
                        onClick={handleFollow}
                        disabled={isFollowing || followBusy}
                      >
                        {isFollowing
                          ? 'Following'
                          : followBusy
                            ? 'Following…'
                            : 'Follow'}
                      </button>
                    )
                  )}
                </div>
                {(() => {
                  const shouldShowSkeleton = 
                    isLoadingProfile || 
                    isInitialLoad || 
                    !profileDataLoaded;
                  return shouldShowSkeleton;
                })() ? (
                  <>
                    <div className="skeleton skeleton-text short" style={{ height: '16px', marginBottom: '8px' }}></div>
                    <div className="skeleton skeleton-text" style={{ height: '14px', width: '100%', marginBottom: '4px' }}></div>
                    <div className="skeleton skeleton-text medium" style={{ height: '14px' }}></div>
                  </>
                ) : (
                  <>
                {profileData.website && (
                  <a
                    href={profileData.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profileWebsite"
                  >
                    {trimWebsiteUrl(profileData.website)}
                  </a>
                )}
                <p>{profileData.bio || 'PubPay User'}</p>
                  </>
                )}

                {/* Profile Details */}
                <div className="profileDetails">
                  {(isOwnProfile || profileData.lightningAddress) && (
                    <div className="profileDetailItem">
                      <label>Lightning Address</label>
                      <div className="profileDetailValue">
                        {(() => {
                          const shouldShowSkeleton = 
                            isLoadingProfile || 
                            isInitialLoad || 
                            !profileDataLoaded ||
                            (loadStartTime !== null && Date.now() - loadStartTime < 300);
                          return shouldShowSkeleton;
                        })() ? (
                          <div className="skeleton skeleton-text" style={{ width: '180px', height: '20px' }}></div>
                        ) : profileData.lightningAddress ? (
                          <>
                            <a
                              href={`lightning:${profileData.lightningAddress}`}
                              className="profileLightningLink"
                            >
                              {profileData.lightningAddress}
                            </a>
                            <div className="profileButtonGroup">
                              <button
                                className="profileCopyButton"
                                onClick={e =>
                                  handleCopyToClipboard(
                                    profileData.lightningAddress,
                                    'Lightning Address',
                                    e
                                  )
                                }
                              >
                                Copy
                              </button>
                              <button
                                className="profileCopyButton"
                                onClick={() =>
                                  handleShowQRCode(
                                    profileData.lightningAddress,
                                    'lightning'
                                  )
                                }
                              >
                                Show QR
                              </button>
                            </div>
                          </>
                        ) : (
                          <span className="profileEmptyField">Not set</span>
                        )}
                      </div>
                    </div>
                  )}

                  {(isOwnProfile || profileData.nip05) && (
                    <div className="profileDetailItem">
                      <label>Identifier (nip-05)</label>
                      <div className="profileDetailValue">
                        {(() => {
                          const shouldShowSkeleton = 
                            isLoadingProfile || 
                            isInitialLoad || 
                            !profileDataLoaded ||
                            (loadStartTime !== null && Date.now() - loadStartTime < 300);
                          return shouldShowSkeleton;
                        })() ? (
                          <div className="skeleton skeleton-text" style={{ width: '150px', height: '20px' }}></div>
                        ) : profileData.nip05 ? (
                          <>
                            <a
                              href={`https://${profileData.nip05.split('@')[1]}/.well-known/nostr.json?name=${profileData.nip05.split('@')[0]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={
                                nip05Valid === false
                                  ? 'profileLightningLink unverified'
                                  : nip05Validating
                                    ? 'profileLightningLink'
                                    : 'profileLightningLink'
                              }
                              title={
                                nip05Valid === false
                                  ? 'NIP-05 identifier does not match this profile'
                                  : nip05Validating
                                    ? 'Validating NIP-05 identifier...'
                                    : nip05Valid === true
                                      ? 'Verified NIP-05 identifier'
                                      : 'NIP-05 identifier'
                              }
                            >
                              {nip05Validating ? (
                                <span className="material-symbols-outlined validating-icon">
                                  hourglass_empty
                                </span>
                              ) : nip05Valid === false ? (
                                <span className="material-symbols-outlined">block</span>
                              ) : nip05Valid === true ? (
                                <span className="material-symbols-outlined">check_circle</span>
                              ) : null}
                              {profileData.nip05}
                            </a>
                            <button
                              className="profileCopyButton"
                              onClick={e =>
                                handleCopyToClipboard(
                                  profileData.nip05,
                                  'Identifier (nip-05)',
                                  e
                                )
                              }
                            >
                              Copy
                            </button>
                          </>
                        ) : (
                          <>
                          <span className="profileEmptyField">Not set</span>
                            {isOwnProfile && (
                              <button
                                className="profileCopyButton"
                                onClick={() => setShowNip05Purchase(true)}
                              >
                                Buy NIP-05
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {targetPubkey && (
                    <div className="profileDetailItem">
                      <label>User ID (npub)</label>
                      <div className="profileDetailValue">
                        <div
                          className="profilePublicKey"
                          title={getNpubFromPublicKey(pubkey)}
                        >
                          {trimNpub(getNpubFromPublicKey(pubkey))}
                        </div>
                        <div className="profileButtonGroup">
                          <button
                            className="profileCopyButton"
                            onClick={e =>
                              handleCopyToClipboard(
                                getNpubFromPublicKey(pubkey),
                                'Public Key',
                                e
                              )
                            }
                          >
                            Copy
                          </button>
                          <button
                            className="profileCopyButton"
                            onClick={() =>
                              handleShowQRCode(getNpubFromPublicKey(pubkey))
                            }
                          >
                            Show QR
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="profileStatsSection">
            <h2 className="profileStatsTitle">Activity Stats</h2>
            <div className="profileStatsGrid">
              <div className="profileStatCard">
                <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
                  {activityLoading ? (
                    <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
                  ) : (
                    activityStats.paynotesCreated
                  )}
                </div>
                <div className="profileStatLabel">Paynotes Created</div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
                  {activityLoading ? (
                    <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
                  ) : (
                    activityStats.pubpaysReceived
                  )}
                </div>
                <div className="profileStatLabel">PubPays Received</div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '32px' }}>
                  {activityLoading ? (
                    <div className="skeleton skeleton-value" style={{ width: '50px', height: '28px' }}></div>
                  ) : (
                    activityStats.zapsReceived
                  )}
                </div>
                <div className="profileStatLabel">Zaps Received</div>
              </div>
            </div>
          </div>

          {/* Paynotes Section */}
          <div className="profilePaynotesSection" style={{ marginTop: '30px' }}>
            <h2 className="profileStatsTitle">Paynotes</h2>
            {isLoadingPaynotes && userPaynotes.length === 0 ? (
              <div
                style={{ textAlign: 'center', padding: '40px', color: '#666' }}
              >
                Loading paynotes...
              </div>
            ) : userPaynotes.length === 0 ? (
              <div
                style={{ textAlign: 'center', padding: '40px', color: '#666' }}
              >
                No paynotes found
              </div>
            ) : (
              <div>
                {userPaynotes.map(post => (
                  <PayNoteComponent
                    key={post.id}
                    post={post}
                    onPay={handlePayWithExtension}
                    onPayAnonymously={handlePayAnonymously}
                    onShare={handleSharePost}
                    onViewRaw={handleViewRaw}
                    isLoggedIn={isLoggedIn}
                    currentUserPublicKey={publicKey}
                    nostrClient={nostrClient}
                    nostrReady={nostrReady}
                    paymentError={paymentErrors?.get(post.id)}
                  />
                ))}
                {hasMorePaynotes && (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                      onClick={loadMorePaynotes}
                      disabled={isLoadingPaynotes}
                      style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: isLoadingPaynotes ? '#ccc' : '#4a75ff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isLoadingPaynotes ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingPaynotes ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Tooltip */}
      {tooltip.show && (
        <div
          className="profileTooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: '#333',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            whiteSpace: 'nowrap'
          }}
        >
          {tooltip.message}
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="overlayContainer" onClick={() => setShowQRModal(false)}>
          <div
            className="overlayInner"
            style={{ textAlign: 'center', maxWidth: '400px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
              {qrCodeType === 'npub'
                ? 'User ID QR Code'
                : 'Lightning Address QR Code'}
            </h3>

            <div className="profileQRContainer">
              {qrCodeData ? (
                <GenericQR
                  data={qrCodeData}
                  width={200}
                  height={200}
                  id="npubQR"
                />
              ) : (
                <div
                  style={{
                    fontSize: '14px',
                    color: '#666',
                    textAlign: 'center'
                  }}
                >
                  No data to display
                </div>
              )}
            </div>

            <p
              style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}
            >
              <code
                style={{
                  fontSize: '12px',
                  wordBreak: 'break-all',
                  backgroundColor: '#f0f0f0',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  display: 'inline-block'
                }}
              >
                {qrCodeData}
              </code>
            </p>

            <p
              style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}
            >
              {qrCodeType === 'npub'
                ? 'Scan this QR code with a Nostr client to add this user'
                : 'Scan this QR code with a Lightning wallet to send payment'}
            </p>
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}
            >
              <button
                className="profileCopyButton"
                onClick={e => {
                  handleCopyToClipboard(
                    qrCodeData,
                    qrCodeType === 'npub' ? 'Public Key' : 'Lightning Address',
                    e
                  );
                }}
                style={{ margin: 0, background: '#4a75ff', color: '#fff' }}
              >
                Copy {qrCodeType === 'npub' ? 'npub' : 'address'}
              </button>
              <button
                className="profileCopyButton"
                onClick={() => setShowQRModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && (
        <div
          className="overlayContainer"
          onClick={() => setShowRecoveryModal(false)}
        >
          <div
            className="overlayInner"
            style={{ textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
              Recover Existing Account
            </h3>
            <p
              style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}
            >
              If you have a 12-word recovery phrase from a previous account, you
              can recover your keys here.
            </p>

            <div className="profileFormField" style={{ textAlign: 'left' }}>
              <label htmlFor="recoveryMnemonic">12-Word Recovery Phrase</label>
              <textarea
                id="recoveryMnemonic"
                value={recoveryMnemonic}
                onChange={e => setRecoveryMnemonic(e.target.value)}
                className="profileFormTextarea"
                placeholder="Enter your 12-word recovery phrase separated by spaces..."
                rows={3}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                marginTop: '20px'
              }}
            >
              <button
                className="profileCopyButton"
                onClick={handleRecoveryFromMnemonic}
                disabled={!recoveryMnemonic.trim()}
                style={{ margin: 0 }}
              >
                Recover Keys
              </button>
              <button
                className="profileCopyButton"
                onClick={() => {
                  setShowRecoveryModal(false);
                  setRecoveryMnemonic('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Overlay */}
      <div
        className="overlayContainer"
        id="viewJSON"
        style={{
          display: 'flex',
          visibility: showJSON ? 'visible' : 'hidden',
          opacity: showJSON ? 1 : 0,
          pointerEvents: showJSON ? 'auto' : 'none'
        }}
        onClick={() => setShowJSON(false)}
      >
        <div className="overlayInner" onClick={e => e.stopPropagation()}>
          <pre id="noteJSON">{jsonContent}</pre>
          <a
            id="closeJSON"
            href="#"
            className="label"
            onClick={() => setShowJSON(false)}
          >
            close
          </a>
        </div>
      </div>

      {/* NIP-05 Purchase Overlay */}
      {showNip05Purchase && publicKey && (
        <Nip05PurchaseOverlay
          pubkey={getNpubForPurchase()}
          onSuccess={async (nip05: string) => {
            setShowNip05Purchase(false);
            // Update profile data to show the new NIP-05
            setProfileData(prev => ({ ...prev, nip05 }));
            
            // Update kind 0 profile event with new NIP-05
            if (nostrClient && publicKey && authState?.privateKey && authState?.signInMethod === 'nsec') {
              try {
                // Get existing profile content
                const queryClient = getQueryClient();
                const profileMap = await ensureProfiles(
                  queryClient,
                  nostrClient,
                  [publicKey]
                );
                const profileEvent = profileMap.get(publicKey);
                
                let existingProfile: Record<string, any> = {};
                if (profileEvent?.content) {
                  try {
                    const content =
                      typeof profileEvent.content === 'string'
                        ? JSON.parse(profileEvent.content)
                        : profileEvent.content;
                    existingProfile = content || {};
                  } catch (e) {
                    console.warn('Failed to parse existing profile:', e);
                  }
                }

                // Merge with new NIP-05
                const profileDataForNostr: Record<string, any> = {
                  ...existingProfile,
                  nip05: nip05
                };

                // Remove empty strings
                Object.keys(profileDataForNostr).forEach(key => {
                  if (profileDataForNostr[key] === '' || profileDataForNostr[key] === null) {
                    delete profileDataForNostr[key];
                  }
                });

                // Create and sign event
                const eventTemplate = {
                  kind: 0,
                  pubkey: publicKey,
                  created_at: Math.floor(Date.now() / 1000),
                  tags: [],
                  content: JSON.stringify(profileDataForNostr)
                };

                const decoded = nip19.decode(authState.privateKey);
                const signedEvent = finalizeEvent(
                  eventTemplate,
                  decoded.data as unknown as Uint8Array
                );

                if (!verifyEvent(signedEvent)) {
                  throw new Error('Failed to create valid signed event');
                }

                // Publish the event
                await nostrClient.publishEvent(signedEvent);

                // Clear cache to force fresh fetch
                queryClient.removeQueries({ queryKey: ['profile', publicKey] });
                queryClient.invalidateQueries({ queryKey: ['profile', publicKey] });

                useUIStore.getState().openToast(
                  `NIP-05 registered and profile updated: ${nip05}`,
                  'success',
                  false
                );
              } catch (error) {
                console.error('Failed to update profile with NIP-05:', error);
                useUIStore.getState().openToast(
                  `NIP-05 registered: ${nip05}. Please update your profile manually to include it.`,
                  'info',
                  false
                );
              }
            } else {
              // Extension sign-in or no private key - just show success
              useUIStore.getState().openToast(
                `NIP-05 registered: ${nip05}. Please update your profile to include it.`,
                'success',
                false
              );
            }
            
            setTimeout(() => {
              useUIStore.getState().closeToast();
            }, 3000);
            
            // Refresh profile data
            if (nostrClient && publicKey) {
              try {
                const queryClient = getQueryClient();
                queryClient.removeQueries({ queryKey: ['profile', publicKey] });
                const profileMap = await ensureProfiles(
                  queryClient,
                  nostrClient,
                  [publicKey]
                );
                const profileEvent = profileMap.get(publicKey);
                if (profileEvent?.content) {
                  const content =
                    typeof profileEvent.content === 'string'
                      ? JSON.parse(profileEvent.content)
                      : profileEvent.content;
                  setProfileData(prev => ({
                    ...prev,
                    nip05: content.nip05 || nip05
                  }));
                }
              } catch (error) {
                console.error('Failed to refresh profile:', error);
              }
            }
          }}
          onClose={() => setShowNip05Purchase(false)}
        />
      )}
    </div>
  );
};

export default ProfilePage;
