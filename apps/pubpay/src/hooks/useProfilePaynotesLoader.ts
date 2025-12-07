import { useEffect, useCallback, useRef } from 'react';
import {
  ensureProfiles,
  ensureZaps,
  getQueryClient,
  extractZapPayerPubkeys,
  loadPostData,
  ZapService,
  Nip05ValidationService
} from '@pubpay/shared-services';
import { LIGHTNING } from '../constants';
import { nip19 } from 'nostr-tools';
import { parseZapDescription, safeJson } from '@pubpay/shared-utils';
import bolt11 from 'bolt11';
import { genericUserIcon } from '../assets/images';
import { PubPayPost } from './useHomeFunctionality';
import {
  useProfileActions,
  useUserPaynotesWithPagination
} from '../stores/useProfileStore';

interface UseProfilePaynotesLoaderOptions {
  targetPubkey: string;
  nostrClient: any;
}

/**
 * Hook for loading and managing profile paynotes with pagination
 */
export const useProfilePaynotesLoader = (
  options: UseProfilePaynotesLoaderOptions
) => {
  const { targetPubkey, nostrClient } = options;

  const {
    setUserPaynotes,
    setIsLoadingPaynotes,
    setHasMorePaynotes,
    setPaynotesUntil,
    clearUserPaynotes
  } = useProfileActions();

  const { paynotesUntil, hasMorePaynotes, isLoadingPaynotes, userPaynotes } =
    useUserPaynotesWithPagination();

  // Track lightning addresses being validated to avoid duplicate calls
  const validatingLightningAddressesRef = useRef<Set<string>>(new Set());
  // Track NIP-05 identifiers being validated to avoid duplicate calls
  const validatingNip05sRef = useRef<Set<string>>(new Set());

  // Validate lightning addresses for posts asynchronously
  const validateLightningAddresses = useCallback(
    async (posts: PubPayPost[]) => {
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
            setUserPaynotes(prev =>
              prev.map(post => {
                if (postsWithAddress.some(p => p.id === post.id)) {
                  return {
                    ...post,
                    lightningValid: isValid,
                    lightningValidating: false,
                    // Update isPayable based on validation result
                    isPayable: !!(
                      isValid &&
                      post.hasZapTags &&
                      (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses)
                    )
                  };
                }
                return post;
              })
            );
          })
          .catch(error => {
            console.warn(`Failed to validate lightning address ${lud16}:`, error);
            // Mark as invalid on error
            setUserPaynotes(prev =>
              prev.map(post => {
                if (postsWithAddress.some(p => p.id === post.id)) {
                  return {
                    ...post,
                    lightningValid: false,
                    lightningValidating: false,
                    isPayable: false
                  };
                }
                return post;
              })
            );
          })
          .finally(() => {
            // Remove from validating set
            validatingLightningAddressesRef.current.delete(lud16);
          });
      }
    },
    [setUserPaynotes]
  );

  // Validate NIP-05 identifiers for posts asynchronously
  const validateNip05s = useCallback(
    async (posts: PubPayPost[]) => {
      // Extract unique NIP-05 identifiers from posts with their pubkeys
      const nip05s = new Map<
        string,
        { nip05: string; pubkey: string; posts: PubPayPost[] }
      >();

      for (const post of posts) {
        if (post.author) {
          try {
            const authorData = JSON.parse(post.author.content || '{}');
            const nip05 = authorData?.nip05;
            if (
              nip05 &&
              typeof nip05 === 'string' &&
              post.event.pubkey
            ) {
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
        setUserPaynotes(prev =>
          prev.map(post => {
            if (postsWithNip05.some(p => p.id === post.id)) {
              return { ...post, nip05Validating: true };
            }
            return post;
          })
        );

        // Validate asynchronously (fire and forget)
        Nip05ValidationService.validateNip05(nip05, pubkey)
          .then(isValid => {
            // Update all posts with this NIP-05 using functional updates
            setUserPaynotes(prev =>
              prev.map(post => {
                if (postsWithNip05.some(p => p.id === post.id)) {
                  return {
                    ...post,
                    nip05Valid: isValid,
                    nip05Validating: false
                  };
                }
                return post;
              })
            );
          })
          .catch(error => {
            console.warn(`Failed to validate NIP-05 ${nip05}:`, error);
            // Mark as invalid on error
            setUserPaynotes(prev =>
              prev.map(post => {
                if (postsWithNip05.some(p => p.id === post.id)) {
                  return {
                    ...post,
                    nip05Valid: false,
                    nip05Validating: false
                  };
                }
                return post;
              })
            );
          })
          .finally(() => {
            // Remove from validating set
            validatingNip05sRef.current.delete(key);
          });
      }
    },
    [setUserPaynotes]
  );

  // Load display paynotes (limited, with progressive rendering)
  useEffect(() => {
    const loadDisplayPaynotes = async (loadMore = false) => {
      if (!targetPubkey || !nostrClient) return;

      if (!loadMore) {
        setIsLoadingPaynotes(true);
        clearUserPaynotes();
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
        const formattedPaynotes: PubPayPost[] = deduplicatedEvents.map(
          (event: any) => {
            // Extract PubPay metadata from tags
            let zapMin = 0;
            let zapMax = 0;
            let zapMaxUses = 0;
            let lud16ToZap = '';
            let zapPayerPubkey = '';

            let zapGoal: number | undefined;
            event.tags.forEach((tag: any[]) => {
              if (tag[0] === 'zap-min')
                zapMin = Math.floor(
                  (parseInt(tag[1]) || 0) / LIGHTNING.MILLISATS_PER_SAT
                );
              if (tag[0] === 'zap-max')
                zapMax = Math.floor(
                  (parseInt(tag[1]) || 0) / LIGHTNING.MILLISATS_PER_SAT
                );
              if (tag[0] === 'zap-uses') zapMaxUses = parseInt(tag[1]) || 0;
              if (tag[0] === 'zap-goal')
                zapGoal = Math.floor(
                  (parseInt(tag[1]) || 0) / LIGHTNING.MILLISATS_PER_SAT
                );
              if (tag[0] === 'zap-lnurl') lud16ToZap = tag[1] || '';
              if (tag[0] === 'zap-payer') zapPayerPubkey = tag[1] || '';
            });

            // Mark as loading if no author profile yet
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
          }
        );

        // Show paynotes immediately (progressive rendering)
        if (loadMore) {
          setUserPaynotes(prev => {
            // Filter out duplicates
            const existingIds = new Set(prev.map(p => p.id));
            const newPosts = formattedPaynotes.filter(
              p => !existingIds.has(p.id)
            );
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
            const updatePostWithProfile = (
              post: PubPayPost,
              event: any,
              author: any
            ): PubPayPost => {
              if (!author || author.content === '{}') {
                return post;
              }

              const updatedPost = { ...post, author, profileLoading: false };

              // Recalculate isPayable based on author profile
              try {
                const authorData = safeJson<Record<string, any>>(
                  author.content || '{}',
                  {}
                );
                const hasLud16 = !!(authorData as any).lud16;
                const hasNip05 = !!(authorData as any).nip05;

                const zapMinTag = event.tags.find(
                  (tag: any[]) => tag[0] === 'zap-min'
                );
                const zapMaxTag = event.tags.find(
                  (tag: any[]) => tag[0] === 'zap-max'
                );
                const zapLNURLTag = event.tags.find(
                  (tag: any[]) => tag[0] === 'zap-lnurl'
                );
                const hasZapTags = !!(
                  zapMinTag ||
                  zapMaxTag ||
                  event.tags.find((tag: any[]) => tag[0] === 'zap-uses') ||
                  event.tags.find((tag: any[]) => tag[0] === 'zap-goal')
                );
                const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

                updatedPost.hasZapTags = hasZapTags;
                updatedPost.isPayable =
                  (hasLud16 || !!updatedPost.zapLNURL) && hasPaymentAmount;

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
                const event = deduplicatedEvents.find(
                  (e: any) => e.id === post.id
                );
                if (!event) return post;

                const author = profileMap.get(event.pubkey) || null;
                return updatePostWithProfile(post, event, author);
              });
            });

            // Process and update zaps
            setUserPaynotes(prev => {
              return prev.map(paynote => {
                const event = deduplicatedEvents.find(
                  (e: any) => e.id === paynote.id
                );
                if (!event) return paynote;

                const postZaps = zapEvents.filter((zap: any) => {
                  const eTag = zap.tags.find((tag: any[]) => tag[0] === 'e');
                  return eTag && eTag[1] === paynote.id;
                });

                if (postZaps.length === 0) return paynote;

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
                  const zapPayerPicture =
                    zapPayerProfile &&
                    zapPayerProfile.content &&
                    zapPayerProfile.content !== '{}'
                      ? (safeJson<Record<string, unknown>>(
                          zapPayerProfile.content || '{}',
                          {}
                        ) as any).picture || genericUserIcon
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
                  const zapPayerProfile = zapPayerProfileMap.get(
                    paynote.zapPayer
                  );
                  if (zapPayerProfile) {
                    try {
                      const profileData = safeJson<Record<string, any>>(
                        zapPayerProfile.content || '{}',
                        {}
                      );
                      zapPayerPicture =
                        (profileData as any).picture || genericUserIcon;
                      zapPayerName =
                        (profileData as any).display_name ||
                        (profileData as any).name ||
                        undefined;
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
  }, [
    targetPubkey,
    nostrClient,
    paynotesUntil,
    setIsLoadingPaynotes,
    clearUserPaynotes,
    setPaynotesUntil,
    setHasMorePaynotes,
    setUserPaynotes,
    validateLightningAddresses,
    validateNip05s
  ]);

  // Load more paynotes handler
  const loadMorePaynotes = useCallback(async () => {
    if (!targetPubkey || !nostrClient || !hasMorePaynotes || isLoadingPaynotes)
      return;

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
      const formattedPaynotes: PubPayPost[] = deduplicatedEvents.map(
        (event: any) => {
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
            if (tag[0] === 'zap-goal')
              zapGoal = Math.floor((parseInt(tag[1]) || 0) / 1000);
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
        }
      );

      // Add to existing paynotes
      setUserPaynotes(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newPosts = formattedPaynotes.filter(
          p => !existingIds.has(p.id)
        );
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
            ensureZaps(
              getQueryClient(),
              nostrClient,
              deduplicatedEvents.map((e: any) => e.id)
            )
          ]);

          // Extract zap payer pubkeys using utility function
          const zapPayerPubkeys = extractZapPayerPubkeys(
            deduplicatedEvents,
            zapEvents
          );

          const zapPayerProfileMap =
            zapPayerPubkeys.size > 0
              ? await ensureProfiles(
                  getQueryClient(),
                  nostrClient,
                  Array.from(zapPayerPubkeys)
                )
              : new Map();

          // Update posts with profiles
          setUserPaynotes(prev => {
            return prev.map(post => {
              const event = deduplicatedEvents.find(
                (e: any) => e.id === post.id
              );
              if (!event) return post;

              const author = profileMap.get(event.pubkey) || null;
              if (author && author.content !== '{}') {
                const updatedPost = { ...post, author, profileLoading: false };
                try {
                  const authorData = safeJson<Record<string, any>>(
                    author.content || '{}',
                    {}
                  );
                  const hasLud16 = !!(authorData as any).lud16;
                  const hasNip05 = !!(authorData as any).nip05;

                  const zapMinTag = event.tags.find(
                    (tag: any[]) => tag[0] === 'zap-min'
                  );
                  const zapMaxTag = event.tags.find(
                    (tag: any[]) => tag[0] === 'zap-max'
                  );
                  const zapLNURLTag = event.tags.find(
                    (tag: any[]) => tag[0] === 'zap-lnurl'
                  );
                  const hasZapTags = !!(
                    zapMinTag ||
                    zapMaxTag ||
                    event.tags.find((tag: any[]) => tag[0] === 'zap-uses') ||
                    event.tags.find((tag: any[]) => tag[0] === 'zap-goal')
                  );
                  const hasPaymentAmount = !!(zapMinTag || zapMaxTag);

                  updatedPost.hasZapTags = hasZapTags;
                  updatedPost.isPayable =
                    (hasLud16 || !!updatedPost.zapLNURL) && hasPaymentAmount;

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
              const event = deduplicatedEvents.find(
                (e: any) => e.id === paynote.id
              );
              if (!event) return paynote;

              const postZaps = zapEvents.filter((zap: any) => {
                const eTag = zap.tags.find((tag: any[]) => tag[0] === 'e');
                return eTag && eTag[1] === paynote.id;
              });

              if (postZaps.length === 0) return paynote;

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
                const zapPayerPicture =
                  zapPayerProfile &&
                  zapPayerProfile.content &&
                  zapPayerProfile.content !== '{}'
                    ? (safeJson<Record<string, unknown>>(
                        zapPayerProfile.content || '{}',
                        {}
                      ) as any).picture || genericUserIcon
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

              const totalZapAmount = processedZaps.reduce(
                (sum: number, zap: any) => sum + zap.zapAmount,
                0
              );
              const zapUsesCurrent =
                paynote.zapUses && paynote.zapUses > 0
                  ? Math.min(zapsWithinLimits.length, paynote.zapUses)
                  : zapsWithinLimits.length;

              let zapPayerPicture = genericUserIcon;
              let zapPayerName: string | undefined = undefined;
              if (paynote.zapPayer) {
                const zapPayerProfile = zapPayerProfileMap.get(
                  paynote.zapPayer
                );
                if (zapPayerProfile) {
                  try {
                    const profileData = safeJson<Record<string, any>>(
                      zapPayerProfile.content || '{}',
                      {}
                    );
                    zapPayerPicture =
                      (profileData as any).picture || genericUserIcon;
                    zapPayerName =
                      (profileData as any).display_name ||
                      (profileData as any).name ||
                      undefined;
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
  }, [
    targetPubkey,
    nostrClient,
    hasMorePaynotes,
    isLoadingPaynotes,
    paynotesUntil,
    setIsLoadingPaynotes,
    setHasMorePaynotes,
    setPaynotesUntil,
    setUserPaynotes,
    validateLightningAddresses,
    validateNip05s
  ]);

  return {
    loadMorePaynotes
  };
};

