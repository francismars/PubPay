import React, { useState, useEffect } from 'react';
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
  FollowService
} from '@pubpay/shared-services';
import { GenericQR } from '@pubpay/shared-ui';
import * as NostrTools from 'nostr-tools';
import { PayNoteComponent } from '../components/PayNoteComponent';
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
      const decoded = NostrTools.nip19.decode(pubkey);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  }

  // Check for nprofile format
  if (pubkey.startsWith('nprofile1')) {
    try {
      const decoded = NostrTools.nip19.decode(pubkey);
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
    nostrReady
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
          AuthService.storeAuthData(
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
            'Failed to sign in with recovered keys: ' +
              (signInResult.error || 'Unknown error')
          );
        }
      } else {
        alert(
          'Failed to recover keys: ' + (result.error || 'Invalid mnemonic')
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
        const decoded = NostrTools.nip19.decode(pubkeyOrNpub);
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

  // Loading state for external profiles
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Activity stats (counts only for now)
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityStats, setActivityStats] = useState({
    paynotesCreated: 0,
    pubpaysReceived: 0,
    zapsReceived: 0
  });

  // Paynotes data
  const [userPaynotes, setUserPaynotes] = useState<PubPayPost[]>([]);

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
    const loadProfileData = async () => {
      setIsLoadingProfile(false);
      setProfileError(null);
      setIsInitialLoad(true);

      if (isOwnProfile) {
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
          } catch (error) {
            console.error('Failed to parse profile content:', error);
          }
        }
        setIsInitialLoad(false);
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
        } catch (error) {
          console.error('Failed to load external profile:', error);
          setProfileError('Failed to load profile');
        } finally {
          setIsLoadingProfile(false);
          setIsInitialLoad(false);
        }
      }
    };

    loadProfileData();
  }, [isOwnProfile, targetPubkey, userProfile, nostrClient]);

  // Load activity stats (frontend-only, counts)
  useEffect(() => {
    const loadActivityStats = async () => {
      if (!targetPubkey || !nostrClient) return;

      setActivityLoading(true);
      try {
        // Helper function to paginate and get all events
        const getAllEvents = async (
          filter: any,
          description: string
        ): Promise<any[]> => {
          const allEvents: any[] = [];
          let until: number | undefined = undefined;
          const limit = 500;
          let hasMore = true;
          let batchCount = 0;

          console.log(
            `[${description}] Starting to fetch all events with filter:`,
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

              console.log(
                `[${description}] Batch ${batchCount} - Filter:`,
                batchFilter
              );
              const batch = (await nostrClient.getEvents([
                batchFilter
              ])) as any[];

              console.log(
                `[${description}] Batch ${batchCount} - Received ${batch.length} events`
              );

              if (batch.length === 0) {
                console.log(`[${description}] No more events found`);
                hasMore = false;
                break;
              }

              // Sort batch by created_at descending (newest first) to ensure consistent ordering
              batch.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

              allEvents.push(...batch);

              console.log(
                `[${description}] Total events so far: ${allEvents.length}`
              );

              // If we got fewer events than the limit, we've reached the end
              if (batch.length < limit) {
                console.log(
                  `[${description}] Got fewer events than limit (${batch.length} < ${limit}), reached end`
                );
                hasMore = false;
              } else {
                // Set until to the oldest event's timestamp for next batch
                const oldestEvent = batch[batch.length - 1]; // Last event is oldest (after sorting)
                const oldestTimestamp = oldestEvent.created_at || 0;
                until = oldestTimestamp - 1; // Subtract 1 to avoid overlap
                console.log(
                  `[${description}] Setting until to ${until} (oldest: ${oldestTimestamp})`
                );
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

          // Deduplicate by event ID
          const uniqueEvents = new Map<string, any>();
          for (const event of allEvents) {
            if (event && event.id) {
              uniqueEvents.set(event.id, event);
            }
          }

          const finalCount = uniqueEvents.size;
          console.log(
            `[${description}] Final count after deduplication: ${finalCount} unique events`
          );

          return Array.from(uniqueEvents.values());
        };

        // Fetch all kind:1 events by this user first (more reliable than filtering by tag on relay side)
        let allNotes: any[] = [];
        try {
          allNotes = await getAllEvents(
            {
              kinds: [1],
              authors: [targetPubkey]
            },
            'all notes'
          );
          console.log(`[stats] Fetched ${allNotes.length} total kind:1 events`);
        } catch (error) {
          console.error('Error fetching all notes:', error);
          allNotes = [];
        }

        // Filter for paynotes client-side (more reliable than relay tag filtering)
        const paynotes = allNotes.filter((event: any) => {
          if (!event || !event.tags) return false;
          const hasPubpayTag = event.tags.some(
            (tag: any[]) =>
              Array.isArray(tag) && tag[0] === 't' && tag[1] === 'pubpay'
          );
          return hasPubpayTag;
        });

        console.log(
          `[stats] Found ${paynotes.length} paynotes out of ${allNotes.length} total notes`
        );

        // Convert paynotes to PubPayPost format for display
        const formattedPaynotes: PubPayPost[] = paynotes.map((event: any) => {
          // Extract PubPay metadata from tags (note: tags use hyphenated names)
          let zapMin = 0;
          let zapMax = 0;
          let zapMaxUses = 0;
          let lud16ToZap = '';

          event.tags.forEach((tag: any[]) => {
            if (tag[0] === 'zap-min')
              zapMin = Math.floor((parseInt(tag[1]) || 0) / 1000); // Convert from millisats to sats
            if (tag[0] === 'zap-max')
              zapMax = Math.floor((parseInt(tag[1]) || 0) / 1000); // Convert from millisats to sats
            if (tag[0] === 'zap-uses') zapMaxUses = parseInt(tag[1]) || 0;
            if (tag[0] === 'zap-lnurl') lud16ToZap = tag[1] || '';
          });

          return {
            id: event.id,
            event,
            author: null, // Will be populated by PayNoteComponent via ensureProfiles
            zaps: [], // Will be populated by PayNoteComponent
            zapAmount: 0,
            zapMin,
            zapMax,
            zapUses: zapMaxUses,
            zapUsesCurrent: 0, // Will be calculated by PayNoteComponent
            content: event.content || '',
            isPayable: true,
            hasZapTags: true,
            zapLNURL: lud16ToZap,
            createdAt: event.created_at || 0
          };
        });

        // Sort by creation time (newest first)
        formattedPaynotes.sort(
          (a, b) => (b.event.created_at || 0) - (a.event.created_at || 0)
        );

        // Fetch author profiles for all paynotes
        if (formattedPaynotes.length > 0 && nostrClient) {
          try {
            const authorPubkeys = Array.from(
              new Set(formattedPaynotes.map(p => p.event.pubkey))
            );
            const profileMap = await ensureProfiles(
              getQueryClient(),
              nostrClient,
              authorPubkeys
            );

            // Update paynotes with author data
            formattedPaynotes.forEach(paynote => {
              const authorProfile = profileMap.get(paynote.event.pubkey);
              if (authorProfile) {
                paynote.author = authorProfile;
              }
            });

            // Load zaps for all paynotes
            const eventIds = formattedPaynotes.map(p => p.id);
            const zapEvents = await ensureZaps(
              getQueryClient(),
              nostrClient,
              eventIds
            );

            // Extract zap payer pubkeys
            const zapPayerPubkeys = new Set<string>();
            zapEvents.forEach((zap: any) => {
              const descriptionTag = zap.tags.find(
                (tag: any[]) => tag[0] === 'description'
              );
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

              // For anonymous zaps, use the zap event's pubkey
              if (!hasPubkeyInDescription) {
                zapPayerPubkeys.add(zap.pubkey);
              }
            });

            // Load zap payer profiles
            const zapPayerProfileMap =
              zapPayerPubkeys.size > 0
                ? await ensureProfiles(
                    getQueryClient(),
                    nostrClient,
                    Array.from(zapPayerPubkeys)
                  )
                : new Map();

            // Process zaps for each paynote
            formattedPaynotes.forEach(paynote => {
              const postZaps = zapEvents.filter((zap: any) => {
                const eTag = zap.tags.find((tag: any[]) => tag[0] === 'e');
                return eTag && eTag[1] === paynote.id;
              });

              // Process zaps
              const processedZaps = postZaps.map((zap: any) => {
                const bolt11Tag = zap.tags.find(
                  (tag: any[]) => tag[0] === 'bolt11'
                );
                let zapAmount = 0;
                if (bolt11Tag) {
                  try {
                    const decoded = bolt11.decode(bolt11Tag[1] || '');
                    zapAmount = decoded.satoshis || 0;
                  } catch {
                    zapAmount = 0;
                  }
                }

                const descriptionTag = zap.tags.find(
                  (tag: any[]) => tag[0] === 'description'
                );
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
                    // Use zap.pubkey as fallback
                  }
                }

                const zapPayerProfile = zapPayerProfileMap.get(zapPayerPubkey);
                const zapPayerPicture = zapPayerProfile
                  ? (
                      safeJson<Record<string, unknown>>(
                        zapPayerProfile.content || '{}',
                        {}
                      ) as any
                    ).picture || genericUserIcon
                  : genericUserIcon;

                const zapPayerNpub =
                  NostrTools.nip19.npubEncode(zapPayerPubkey);

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

              // Update paynote with zap data
              paynote.zaps = processedZaps;
              paynote.zapAmount = totalZapAmount;
              paynote.zapUsesCurrent = zapUsesCurrent;
            });
          } catch (error) {
            console.error(
              'Failed to load profiles and zaps for paynotes:',
              error
            );
          }
        }

        // Store the paynotes in state
        setUserPaynotes(formattedPaynotes);

        // Create Set for fast lookup
        const paynoteIdsSet = new Set<string>(
          paynotes.map((e: any) => e.id).filter(Boolean)
        );

        // Create Set of all note IDs (includes paynotes)
        const allNoteIdsSet = new Set<string>(
          allNotes.map(e => e.id).filter(Boolean)
        );

        // 3) Count zaps where:
        //    - #e tag references one of the event IDs
        //    - #p tag matches targetPubkey (user is the recipient)
        const countZapsForEventIds = async (
          eventIdsSet: Set<string>,
          description: string
        ): Promise<number> => {
          if (eventIdsSet.size === 0) return 0;

          // Query zaps where recipient is targetPubkey
          // Then filter by event IDs
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
          countZapsForEventIds(paynoteIdsSet, 'pubpays received'),
          countZapsForEventIds(allNoteIdsSet, 'zaps received')
        ]);

        setActivityStats({
          paynotesCreated: paynoteIdsSet.size,
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
        const decoded = NostrTools.nip19.decode(keyToConvert);
        if ((decoded as any).type === 'nprofile') {
          return NostrTools.nip19.npubEncode((decoded.data as any).pubkey);
        }
      }

      // If it's a hex string, convert to npub
      if (keyToConvert.length === 64 && /^[0-9a-fA-F]+$/.test(keyToConvert)) {
        return NostrTools.nip19.npubEncode(keyToConvert);
      }

      // If it's already a string, try to encode it directly
      return NostrTools.nip19.npubEncode(keyToConvert);
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

      {isLoadingProfile || isInitialLoad ? (
        <div className="profileSection">
          <div
            className="profileBanner"
            style={{ backgroundColor: '#e9ecef' }}
          ></div>
          <div className="profileUserInfo">
            <div
              className="profileAvatar"
              style={{ backgroundColor: '#e9ecef' }}
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: '#dee2e6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  color: '#adb5bd'
                }}
              >
                ...
              </div>
            </div>
            <div className="profileUserDetails" style={{ flex: 1 }}>
              <div
                style={{
                  height: '24px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  width: '200px'
                }}
              ></div>
              <div
                style={{
                  height: '16px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  width: '150px'
                }}
              ></div>
              <div
                style={{
                  height: '14px',
                  backgroundColor: '#e9ecef',
                  borderRadius: '4px',
                  width: '100px'
                }}
              ></div>
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
                {profileData.picture ? (
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
                <div
                  className="profileAvatarFallback"
                  style={{ display: profileData.picture ? 'none' : 'flex' }}
                >
                  {profileData.displayName
                    ? profileData.displayName.charAt(0).toUpperCase()
                    : 'U'}
                </div>
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
                    {profileData.displayName || displayName || 'Anonymous User'}
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

                {/* Profile Details */}
                <div className="profileDetails">
                  {(isOwnProfile || profileData.lightningAddress) && (
                    <div className="profileDetailItem">
                      <label>Lightning Address</label>
                      <div className="profileDetailValue">
                        {profileData.lightningAddress ? (
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
                      <label>NIP-05 Identifier</label>
                      <div className="profileDetailValue">
                        {profileData.nip05 ? (
                          <>
                            <a
                              href={`https://${profileData.nip05.split('@')[1]}/.well-known/nostr.json?name=${profileData.nip05.split('@')[0]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="profileLightningLink"
                            >
                              {profileData.nip05}
                            </a>
                            <button
                              className="profileCopyButton"
                              onClick={e =>
                                handleCopyToClipboard(
                                  profileData.nip05,
                                  'NIP-05 Identifier',
                                  e
                                )
                              }
                            >
                              Copy
                            </button>
                          </>
                        ) : (
                          <span className="profileEmptyField">Not set</span>
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
                <div className="profileStatValue">
                  {activityLoading ? '—' : activityStats.paynotesCreated}
                </div>
                <div className="profileStatLabel">Paynotes Created</div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  {activityLoading ? '—' : activityStats.pubpaysReceived}
                </div>
                <div className="profileStatLabel">PubPays Received</div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  {activityLoading ? '—' : activityStats.zapsReceived}
                </div>
                <div className="profileStatLabel">Zaps Received</div>
              </div>
            </div>
          </div>

          {/* Paynotes Section */}
          <div className="profilePaynotesSection" style={{ marginTop: '30px' }}>
            <h2 className="profileStatsTitle">Paynotes</h2>
            {activityLoading ? (
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
                    onViewRaw={() => {}}
                    isLoggedIn={isLoggedIn}
                    nostrClient={nostrClient}
                    nostrReady={nostrReady}
                  />
                ))}
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
    </div>
  );
};

export default ProfilePage;
