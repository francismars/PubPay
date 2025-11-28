// PayNoteComponent - Renders individual PubPay posts
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import { nip19 } from 'nostr-tools';
import { formatContent } from '../utils/contentFormatter';
import { useUIStore } from '@pubpay/shared-services';

// Define ProcessedZap interface locally since it's not exported
interface ProcessedZap {
  zapAmount: number;
  zapPayerPubkey: string;
  zapPayerPicture: string;
  zapPayerNpub: string;
  id: string;
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
  sig: string;
  isNewZap?: boolean; // Flag to indicate if this is a newly detected zap
}

interface PayNoteComponentProps {
  post: PubPayPost & { replyLevel?: number };
  onPay: any;
  onPayAnonymously: any;
  onShare: any;
  onViewRaw: any;
  isLoggedIn: boolean;
  currentUserPublicKey?: string | null; // Current logged-in user's public key (hex)
  isReply?: boolean;
  nostrClient: any; // NostrClient type
  nostrReady?: boolean;
  paymentError?: string;
}

export const PayNoteComponent: React.FC<PayNoteComponentProps> = React.memo(
  ({
    post,
    onPay,
    onPayAnonymously,
    onShare,
    onViewRaw,
    isLoggedIn,
    currentUserPublicKey,
    isReply = false,
    nostrClient,
    nostrReady,
    paymentError
  }) => {
    const navigate = useNavigate();
    
    // Debug: log payment error changes
    useEffect(() => {
      if (paymentError) {
        console.log('Payment error for post', post.id, ':', paymentError);
      }
    }, [paymentError, post.id]);

    const [zapAmount, setZapAmount] = useState(post.zapMin);
    const [showZapMenu, setShowZapMenu] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [customZapAmount, setCustomZapAmount] = useState('');
    const [zapComment, setZapComment] = useState('');
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [showZapModal, setShowZapModal] = useState(false);
    const [zapModalComment, setZapModalComment] = useState('');
    const [isPaying, setIsPaying] = useState(false);
    const [isAnonPaying, setIsAnonPaying] = useState(false);
    const [isAnonymousModal, setIsAnonymousModal] = useState(false);
    const [heroZaps, setHeroZaps] = useState<ProcessedZap[]>([]);
    const [overflowZaps, setOverflowZaps] = useState<ProcessedZap[]>([]);
    const [formattedContent, setFormattedContent] = useState<string>('');
    const [timeTick, setTimeTick] = useState(Date.now()); // Force re-render for time updates
    const zapMenuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const zapActionRef = useRef<HTMLAnchorElement>(null);
    const paynoteRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressRef = useRef(false);

    // Format content: baseline first, then upgrade when nostr is ready
    useEffect(() => {
      const raw = post.event.content || '';
      // Baseline formatting: linkify nostr:npub, @npub, bare npub, and URLs
      let baseline = raw;
      
      // Process mentions using position-based replacement to handle duplicate mentions correctly
      const processedRanges: Array<{start: number, end: number, replacement: string}> = [];
      
      // First, handle bare npub mentions (process before other formats to avoid conflicts)
      const bareNpubMatches = Array.from(baseline.matchAll(/\b((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})\b/gi));
      
      for (const matchObj of bareNpubMatches) {
        const match = matchObj[0];
        const offset = matchObj.index || 0;
        
        // Check if it's preceded by nostr: or @
        const prefix = baseline.substring(Math.max(0, offset - 7), offset);
        if (prefix.endsWith('nostr:') || prefix.endsWith('@')) {
          continue; // Skip, will be processed with prefix
        }
        
        const shortId =
          match.length > 35
            ? `${match.substr(0, 4)}...${match.substr(match.length - 4)}`
            : match;
        const replacement = `<a href="/profile/${match}" class="nostrMention">${shortId}</a>`;
        processedRanges.push({
          start: offset,
          end: offset + match.length,
          replacement: replacement
        });
      }
      
      // Handle nostr:npub mentions
      const nostrNpubMatches = Array.from(baseline.matchAll(/nostr:((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi));
      
      for (const matchObj of nostrNpubMatches) {
        const match = matchObj[0];
        const offset = matchObj.index || 0;
        const clean = match.replace(/^nostr:/i, '');
        const shortId =
          clean.length > 35
            ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
            : clean;
        const replacement = `<a href="/profile/${clean}" class="nostrMention">${shortId}</a>`;
        processedRanges.push({
          start: offset,
          end: offset + match.length,
          replacement: replacement
        });
      }
      
      // Handle @npub mentions
      const atNpubMatches = Array.from(baseline.matchAll(/@((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi));
      
      for (const matchObj of atNpubMatches) {
        const match = matchObj[0];
        const offset = matchObj.index || 0;
        const clean = match.replace(/^@/i, '');
        const shortId =
          clean.length > 35
            ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
            : clean;
        const replacement = `<a href="/profile/${clean}" class="nostrMention">${shortId}</a>`;
        processedRanges.push({
          start: offset,
          end: offset + match.length,
          replacement: replacement
        });
      }
      
      // Apply all replacements in reverse order to maintain correct positions
      processedRanges.sort((a, b) => b.start - a.start);
      for (const range of processedRanges) {
        baseline = baseline.substring(0, range.start) + range.replacement + baseline.substring(range.end);
      }
      
      // Handle URLs
      baseline = baseline
        .replace(
          /(https?:\/\/[^\s<]+)/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        )
        .replace(/\n/g, '<br />');
      
      setFormattedContent(baseline);

      const upgrade = async () => {
        if (!nostrClient || !nostrReady) return;
        try {
          const rich = await formatContent(raw, nostrClient);
          setFormattedContent(rich);
        } catch {
          // keep baseline
        }
      };
      upgrade();
    }, [
      post.event.content,
      nostrClient,
      nostrReady,
      post.author,
      post.zapPayerName
    ]);

    // Click outside to close zap menu
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          zapMenuRef.current &&
          zapActionRef.current &&
          !zapMenuRef.current.contains(event.target as Node) &&
          !zapActionRef.current.contains(event.target as Node)
        ) {
          setShowZapMenu(false);
          setShowCommentInput(false);
        }
      };

      if (showZapMenu) {
        document.addEventListener('click', handleClickOutside);
      }

      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }, [showZapMenu]);

    // Update time display every minute
    useEffect(() => {
      const interval = setInterval(() => {
        setTimeTick(Date.now());
      }, 60000); // Update every minute

      return () => clearInterval(interval);
    }, []);

    const authorData = post.author
      ? (() => {
          try {
            return JSON.parse(post.author.content || '{}');
          } catch {
            return null;
          }
        })()
      : null;
    const isProfileLoading = post.profileLoading === true;
    const displayName = isProfileLoading
      ? '' // Will show skeleton
      : (authorData?.display_name || authorData?.name || 'Anonymous');
    const profilePicture = isProfileLoading
      ? genericUserIcon // Will show skeleton
      : (authorData?.picture || genericUserIcon);
    const nip05 = isProfileLoading ? undefined : authorData?.nip05;
    const lud16 = isProfileLoading ? undefined : authorData?.lud16;
    const hasValidLightning = !!lud16 && /.+@.+\..+/.test(lud16);
    // Use validation result if available, otherwise fall back to format check
    const isLightningValid = post.lightningValid !== undefined
      ? post.lightningValid
      : hasValidLightning;

    // Check if note has payment amount defined (zap-min or zap-max)
    const hasPaymentAmount = post.zapMin > 0 || post.zapMax > 0;
    
    // Calculate total amount from zaps within limits (for goal checking)
    // Must respect: amount limits (zap-min/zap-max) and zap-payer restriction (if present)
    // CRITICAL: Sort zaps by created_at (oldest first) to ensure correct order for zap-uses and zap-goal
    const sortedZapsForTotals = [...post.zaps].sort((a, b) => {
      const timeA = a.created_at || 0;
      const timeB = b.created_at || 0;
      return timeA - timeB; // Oldest first
    });
    
    const hasZapPayerRestrictionForTotals = !!post.zapPayer;
    const zapsWithinLimits = sortedZapsForTotals.filter(zap => {
      const amount = zap.zapAmount || 0;
      const min = post.zapMin || 0;
      const max = post.zapMax || 0;

      // Check amount range
      let isWithinRange = true;
      if (min > 0 && max > 0) {
        isWithinRange = amount >= min && amount <= max;
      } else if (min > 0 && max === 0) {
        isWithinRange = amount >= min;
      } else if (min === 0 && max > 0) {
        isWithinRange = amount <= max;
      }

      // Check zap-payer restriction
      const matchesPayer = !hasZapPayerRestrictionForTotals || zap.zapPayerPubkey === post.zapPayer;

      return isWithinRange && matchesPayer;
    });

    const zapsToCount = post.zapUses && post.zapUses > 0
      ? zapsWithinLimits.slice(0, post.zapUses)
      : zapsWithinLimits;

    const totalAmount = zapsToCount.reduce(
      (sum, zap) => sum + (zap.zapAmount || 0),
      0
    );

    // Check if restrictions have been met
    const zapUsesReached = post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses;
    const zapGoalReached = post.zapGoal && post.zapGoal > 0 && totalAmount >= post.zapGoal;
    const restrictionsMet = zapUsesReached || zapGoalReached;
    
    // Check if current user matches zap-payer restriction (if present)
    const hasZapPayerRestriction = !!post.zapPayer;
    const isCurrentUserZapPayer = hasZapPayerRestriction && 
      currentUserPublicKey && 
      currentUserPublicKey === post.zapPayer;
    
    // Check if note is payable - must have:
    // 1. Valid lightning address
    // 2. zap-min or zap-max tags (payment amount defined)
    // 3. Not reached zap uses target (if zap-uses is set)
    // 4. If zap-payer restriction exists, current user must be the zap-payer
    // If validation shows invalid, don't allow payment
    // If no payment amount, don't show pay button (but don't mark as "not payable")
    const isPayable =
      hasPaymentAmount &&
      post.isPayable &&
      isLightningValid &&
      (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses) &&
      !zapGoalReached &&
      (!hasZapPayerRestriction || isCurrentUserZapPayer);

    // Format time ago
    const timeAgo = (timestamp: number): string => {
      const now = Date.now();
      const timestampMs = timestamp * 1000;
      const differenceMs = now - timestampMs;
      const minutesAgo = Math.floor(differenceMs / (1000 * 60));
      const hoursAgo = Math.floor(differenceMs / (1000 * 60 * 60));
      const daysAgo = Math.floor(differenceMs / (1000 * 60 * 60 * 24));

      if (minutesAgo < 60) {
        return `${minutesAgo}m`;
      } else if (hoursAgo < 24) {
        return `${hoursAgo}h`;
      } else {
        return `${daysAgo}d`;
      }
    };

    // Handle zap slider change
    const handleZapSliderChange = (value: number) => {
      setZapAmount(value);
    };

    // Handle zap amount input change
    const handleZapAmountInput = (value: string) => {
      // Remove commas to get the raw number
      const cleanValue = value.replace(/,/g, '');
      const numValue = parseInt(cleanValue);
      if (!isNaN(numValue)) {
        // Clamp value between min and max
        const clampedValue = Math.max(
          post.zapMin,
          Math.min(post.zapMax, numValue)
        );
        setZapAmount(clampedValue);
      } else if (cleanValue === '') {
        // Allow empty input temporarily
        setZapAmount(post.zapMin);
      }
    };

    // Handle custom zap
    const handleCustomZap = async () => {
      if (!isLoggedIn) {
        useUIStore.getState().openLogin();
        return; // Require login for non-anonymous zaps
      }
      const amount = parseInt(customZapAmount);
      if (amount > 0) {
        try {
          setIsPaying(true);
          const hasNwc =
            (typeof localStorage !== 'undefined' &&
              localStorage.getItem('nwcConnectionString')) ||
            (typeof sessionStorage !== 'undefined' &&
              sessionStorage.getItem('nwcConnectionString'));
          if (hasNwc) {
            useUIStore
              .getState()
              .openToast('Preparing payment…', 'loading', true);
          } else {
            useUIStore
              .getState()
              .openToast('Preparing invoice…', 'loading', false);
            setTimeout(() => {
              try {
                useUIStore.getState().closeToast();
              } catch {}
            }, 800);
          }
          await onPay(post, amount, zapComment);
        } finally {
          setIsPaying(false);
          setShowZapMenu(false);
          setCustomZapAmount('');
          setZapComment('');
          setShowCommentInput(false);
        }
      }
    };

    // Handle anonymous zap from custom menu
    const handleAnonZap = async () => {
      const amount = parseInt(customZapAmount);
      if (amount > 0) {
        try {
          setIsAnonPaying(true);
          useUIStore
            .getState()
            .openToast('Preparing anonymous zap…', 'loading', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 800);
          await onPayAnonymously(post, amount, zapComment);
        } finally {
          setIsAnonPaying(false);
          setShowZapMenu(false);
          setCustomZapAmount('');
          setZapComment('');
          setShowCommentInput(false);
        }
      }
    };

    // Handle anonymous pay from dropdown (opens modal for anonymous payment)
    const handlePayAnonymously = () => {
      if (isPayable) {
        setIsAnonymousModal(true);
        setShowZapModal(true);
      }
    };

    // Handle long press start
    const handleLongPressStart = () => {
      if (!isPayable) return;

      isLongPressRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        if (!isLoggedIn) {
          useUIStore.getState().openLogin();
        } else {
          setShowZapModal(true);
        }
      }, 500); // 500ms long press
    };

    // Handle long press end
    const handleLongPressEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    // Handle zap from modal
    const handleZapFromModal = async () => {
      if (!isLoggedIn && !isAnonymousModal) {
        useUIStore.getState().openLogin();
        return;
      }

      try {
        setIsPaying(true);
        const hasNwc =
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('nwcConnectionString')) ||
          (typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem('nwcConnectionString'));

        if (isAnonymousModal) {
          // Handle anonymous payment
          useUIStore
            .getState()
            .openToast('Preparing anonymous zap…', 'loading', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 800);
          await onPayAnonymously(post, zapAmount, zapModalComment);
        } else {
          // Handle regular payment
          if (hasNwc) {
            useUIStore
              .getState()
              .openToast('Preparing payment…', 'loading', true);
          } else {
            useUIStore
              .getState()
              .openToast('Preparing invoice…', 'loading', false);
            setTimeout(() => {
              try {
                useUIStore.getState().closeToast();
              } catch {}
            }, 800);
          }
          await onPay(post, zapAmount, zapModalComment);
        }

        setShowZapModal(false);
        setZapModalComment('');
        setIsAnonymousModal(false);
      } finally {
        setIsPaying(false);
      }
    };

    // Process zaps and separate into hero zaps and overflow zaps
    useEffect(() => {
      if (post.zaps.length === 0) {
        setHeroZaps([]);
        setOverflowZaps([]);
        return;
      }

      // CRITICAL: Sort zaps by created_at (oldest first) to ensure correct order for zap-uses and zap-goal
      // This ensures the first N zaps (by time) are counted, not random order
      const sortedZaps = [...post.zaps].sort((a, b) => {
        const timeA = a.created_at || 0;
        const timeB = b.created_at || 0;
        return timeA - timeB; // Oldest first
      });

      const zapMin = post.zapMin || 0;
      const zapMax = post.zapMax || 0;
      const hasZapPayerRestriction = !!post.zapPayer;
      const hasZapUsesRestriction = !!(post.zapUses && post.zapUses > 0);
      
      // Check if there are any restrictions at all
      const hasAnyRestrictions = 
        zapMin > 0 || 
        zapMax > 0 || 
        hasZapPayerRestriction || 
        hasZapUsesRestriction;

      // If no restrictions, all zaps go to hero (zapReaction) - maintain chronological order
      if (!hasAnyRestrictions) {
        setHeroZaps([...sortedZaps]);
        setOverflowZaps([]);
        return;
      }

      // With restrictions: classify zaps based on amount range and zap-payer (if present)
      // Process in chronological order to ensure first N zaps are counted correctly
      const withinRestrictions: ProcessedZap[] = [];
      const outsideRestrictions: ProcessedZap[] = [];

      for (const zap of sortedZaps) {
        // Check amount range: if min/max are set, zap must be within range
        let isWithinRange = true;
        if (zapMin > 0 || zapMax > 0) {
          if (zapMin > 0 && zapMax > 0) {
            // Both min and max specified
            isWithinRange = zap.zapAmount >= zapMin && zap.zapAmount <= zapMax;
          } else if (zapMin > 0) {
            // Only min specified
            isWithinRange = zap.zapAmount >= zapMin;
          } else if (zapMax > 0) {
            // Only max specified
            isWithinRange = zap.zapAmount <= zapMax;
          }
        }
        
        // Check zap-payer restriction
        const matchesPayer =
          !hasZapPayerRestriction || zap.zapPayerPubkey === post.zapPayer;

        if (isWithinRange && matchesPayer) {
          withinRestrictions.push(zap);
        } else {
          outsideRestrictions.push(zap);
        }
      }

      // Keep original arrival order (post.zaps already oldest-first; new zaps append at end)

      // Apply zap-uses cap: only first N within restrictions count as hero
      const usesCap =
        post.zapUses && post.zapUses > 0 ? post.zapUses : undefined;
      const heroZapsList = usesCap
        ? withinRestrictions.slice(0, usesCap)
        : withinRestrictions.slice();

      // Remaining within-restriction zaps beyond uses go to overflow along with all outside-restriction zaps
      const overflowZapsList = [
        ...(usesCap ? withinRestrictions.slice(usesCap) : []),
        ...outsideRestrictions
      ];

      setHeroZaps(heroZapsList);
      setOverflowZaps(overflowZapsList);
    }, [post.zaps, post.zapUses, post.zapMin, post.zapMax, post.zapPayer]);

    // Clear isNewZap flag after animation completes
    useEffect(() => {
      const newZaps = [...heroZaps, ...overflowZaps].filter(
        zap => zap.isNewZap
      );
      if (newZaps.length > 0) {
        const timer = setTimeout(() => {
          // Clear the isNewZap flag after animation duration (600ms)
          setHeroZaps(prev => prev.map(zap => ({ ...zap, isNewZap: false })));
          setOverflowZaps(prev =>
            prev.map(zap => ({ ...zap, isNewZap: false }))
          );
        }, 600);

        return () => clearTimeout(timer);
      }
      return undefined;
    }, [heroZaps, overflowZaps]);

    // Close dropdowns when clicking outside (global handler)
    useEffect(() => {
      const handleGlobalClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (
          !target.matches('.dropdown') &&
          !target.matches('.dropdown-element')
        ) {
          // Close dropdown
          setShowDropdown(false);
        }
      };

      const handleTouchStart = (event: TouchEvent) => {
        const target = event.target as HTMLElement;
        if (
          !target.matches('.dropdown') &&
          !target.matches('.dropdown-element')
        ) {
          // Close dropdown
          setShowDropdown(false);
        }
      };

      const handlePaynoteHover = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const hoveredPaynote = target.closest('.paynote');
        const hoveredDropdown = target.closest('.dropdown-content, .zapMenu');

        // Clear any existing timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }

        // If hovering over a different paynote AND not hovering over any dropdown content, schedule closing
        if (
          hoveredPaynote &&
          hoveredPaynote !== paynoteRef.current &&
          !hoveredDropdown
        ) {
          hideTimeoutRef.current = setTimeout(() => {
            // Close dropdown menus
            setShowDropdown(false);

            // Close zap menus
            setShowZapMenu(false);
            setShowCommentInput(false);
          }, 300); // 300ms delay
        }
      };

      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('touchstart', handleTouchStart);
      document.addEventListener('mouseover', handlePaynoteHover);

      return () => {
        document.removeEventListener('click', handleGlobalClick);
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('mouseover', handlePaynoteHover);
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
      };
    }, []);

    const hasOpenDropdown = showZapMenu || showDropdown;

    return (
      <div
        ref={paynoteRef}
        className={`${isReply ? 'paynote reply' : 'paynote'} ${hasOpenDropdown ? 'has-open-dropdown' : ''}`}
        style={
          isReply
            ? { marginLeft: `${(post.replyLevel || 0) * 15 + 15}px` }
            : undefined
        }
      >
        <div className="noteProfileImg">
          {isProfileLoading ? (
            <div className="skeleton skeleton-avatar" style={{ width: '48px', height: '48px', borderRadius: '50%' }}></div>
          ) : (
            <Link to={`/profile/${nip19.npubEncode(post.event.pubkey)}`}>
              <img className="userImg" src={profilePicture} alt="Profile" />
            </Link>
          )}
        </div>
        <div className="noteData">
          <div className="noteHeader">
            <div className="noteAuthor">
              <div className="noteDisplayName">
                {isProfileLoading ? (
                  <div className="skeleton skeleton-text short" style={{ display: 'inline-block', width: '120px', height: '16px' }}></div>
                ) : (
                  <Link
                    to={`/profile/${nip19.npubEncode(post.event.pubkey)}`}
                    className="noteAuthorLink"
                  >
                    {displayName}
                  </Link>
                )}
              </div>

              {/* NIP-05 Verification */}
              <div className="noteNIP05 label">
                {isProfileLoading ? (
                  <div className="skeleton skeleton-text tiny" style={{ display: 'inline-block', width: '100px', height: '12px', marginTop: '8px' }}></div>
                ) : nip05 ? (
                  post.nip05Valid === false ? (
                    // Invalid NIP-05 - still clickable
                    <a
                      href={`https://${nip05.split('@')[1]}/.well-known/nostr.json?name=${nip05.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="unverified label"
                      title="NIP-05 identifier does not match this profile"
                    >
                      <span className="material-symbols-outlined">block</span>
                      {nip05}
                    </a>
                  ) : post.nip05Validating ? (
                    // Validating - still clickable
                    <a
                      href={`https://${nip05.split('@')[1]}/.well-known/nostr.json?name=${nip05.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label"
                      title="Validating NIP-05 identifier..."
                    >
                      <span className="material-symbols-outlined validating-icon">
                        hourglass_empty
                      </span>
                      {nip05}
                    </a>
                  ) : (
                    // Valid NIP-05
                    <a
                      href={`https://${nip05.split('@')[1]}/.well-known/nostr.json?name=${nip05.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Verified NIP-05 identifier"
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      {nip05}
                    </a>
                  )
                ) : (
                  <span className="unverified label">
                    <span className="material-symbols-outlined">block</span>
                    Unverified
                  </span>
                )}
              </div>

              {/* Lightning Address */}
              <div className="noteLNAddress label">
                {isProfileLoading ? (
                  <div className="skeleton skeleton-text tiny" style={{ display: 'inline-block', width: '120px', height: '12px', marginTop: '8px' }}></div>
                ) : lud16 ? (
                  post.lightningValid === false ? (
                    // Invalid lightning address - still clickable
                    <a
                      href={`https://${lud16.split('@')[1]}/.well-known/lnurlp/${lud16.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="unverified label"
                      title="Lightning address does not support Nostr zaps"
                    >
                      <span className="material-symbols-outlined">block</span>
                      {lud16}
                    </a>
                  ) : post.lightningValidating ? (
                    // Validating - still clickable
                    <a
                      href={`https://${lud16.split('@')[1]}/.well-known/lnurlp/${lud16.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="label"
                      title="Validating lightning address..."
                    >
                      <span className="material-symbols-outlined validating-icon">hourglass_empty</span>
                      {lud16}
                    </a>
                  ) : (
                    // Valid lightning address
                    <a
                      href={`https://${lud16.split('@')[1]}/.well-known/lnurlp/${lud16.split('@')[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined">bolt</span>
                      {lud16}
                    </a>
                  )
                ) : hasPaymentAmount ? (
                  <span className="unverified label">
                    <span className="material-symbols-outlined">block</span>
                    Not Payable
                  </span>
                ) : null}
              </div>
            </div>

            <div className="noteDate label">{timeAgo(post.createdAt)}</div>
            {/* timeTick forces re-render every minute to update time display */}
            {timeTick && null}
          </div>

          {/* Content */}
          <div
            className="noteContent"
            onClick={e => {
              // Check if the clicked element is a link or inside a link
              const target = e.target as HTMLElement;
              const clickedLink = target.tagName === 'A' ? target as HTMLAnchorElement : target.closest('a');

              if (clickedLink) {
                // Check if it's an internal profile or note link
                const href = clickedLink.getAttribute('href');
                if (href && (href.startsWith('/profile/') || href.startsWith('/note/'))) {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(href);
                  return;
                }
                // External links or other types - let them work normally
                return;
              }

              // Clicking on the note content (not a link) - navigate to single note view
              console.log('noteContent clicked for post:', post.id);
              const nevent = nip19.noteEncode(post.id);
              console.log('Navigating to single note:', nevent);
              navigate(`/note/${nevent}`);
            }}
            style={{ cursor: 'pointer' }}
            dangerouslySetInnerHTML={{
              __html: formattedContent || post.event.content
            }}
          />

          {/* Zap Payer */}
          {post.zapPayer && (
            <div className="zapPayer">
              Payer{' '}
              <span className="material-symbols-outlined main-icon">
                target
              </span>
              <div className="zapPayerInner">
                <img
                  className="userImg"
                  src={post.zapPayerPicture || genericUserIcon}
                />
                <div className="userName">
                  {post.zapPayerName && post.zapPayerName.trim() !== ''
                    ? post.zapPayerName
                    : (() => {
                        if (post.zapPayer) {
                          const npub = nip19.npubEncode(post.zapPayer);
                          return npub.length > 35
                            ? `${npub.substr(0, 4)}...${npub.substr(npub.length - 4, npub.length)}`
                            : npub;
                        }
                        return 'Unknown';
                      })()}
                </div>
              </div>
            </div>
          )}

          {/* LNURL Override (match legacy structure/styling) */}
          {post.zapLNURL && (
            <div className="zapPayer">
              <div>
                <span className="material-symbols-outlined main-icon">
                  double_arrow
                </span>{' '}
                Redirect to
              </div>
              <div className="zapPayerInner">
                <a
                  href={post.zapLNURL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {post.zapLNURL}
                </a>
              </div>
            </div>
          )}

          {/* Hero Zaps - for zaps within target */}
          <div className="noteHeroZaps noteZapReactions">
            {heroZaps.map((zap, index) => {
              return (
                <div
                  key={index}
                  className={`zapReaction ${zap.isNewZap ? 'newZap' : ''}`}
                >
                  <Link to={`/profile/${zap.zapPayerPubkey}`}>
                    <img
                      className="userImg"
                      src={zap.zapPayerPicture || genericUserIcon}
                    />
                  </Link>
                  <Link
                    to={`/note/${nip19.noteEncode(zap.id)}`}
                    className="zapReactionAmount"
                  >
                    {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                  </Link>
                  {zap.content && (
                    <div className="zapReactionTooltip">
                      {zap.content.length > 21
                        ? `${zap.content.substring(0, 21)  }...`
                        : zap.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total Zaps Accounting - only count zaps within payment restrictions
              Always show if zap-goal exists, even with zero zaps */}
          {(post.zaps.length > 0 || (post.zapGoal && post.zapGoal > 0)) && (() => {
            // CRITICAL: Sort zaps by created_at (oldest first) to ensure correct order for zap-uses and zap-goal
            const sortedZapsForAccounting = [...post.zaps].sort((a, b) => {
              const timeA = a.created_at || 0;
              const timeB = b.created_at || 0;
              return timeA - timeB; // Oldest first
            });
            
            // Filter zaps by amount limits and zap-payer restriction (matches logic from useHomeFunctionality)
            const hasZapPayerRestriction = !!post.zapPayer;
            const zapsWithinLimits = sortedZapsForAccounting.filter(zap => {
              const amount = zap.zapAmount || 0;
              const min = post.zapMin || 0;
              const max = post.zapMax || 0;

              // Check amount range
              let isWithinRange = true;
              if (min > 0 && max > 0) {
                // Both min and max specified
                isWithinRange = amount >= min && amount <= max;
              } else if (min > 0 && max === 0) {
                // Only min specified
                isWithinRange = amount >= min;
              } else if (min === 0 && max > 0) {
                // Only max specified
                isWithinRange = amount <= max;
              }

              // Check zap-payer restriction
              const matchesPayer = !hasZapPayerRestriction || zap.zapPayerPubkey === post.zapPayer;

              return isWithinRange && matchesPayer;
            });

            // Cap count at zapUses if specified
            const zapsToCount = post.zapUses && post.zapUses > 0
              ? zapsWithinLimits.slice(0, post.zapUses)
              : zapsWithinLimits;

            const totalAmount = zapsToCount.reduce(
              (sum, zap) => sum + (zap.zapAmount || 0),
              0
            );
            const totalCount = zapsToCount.length;

            // Don't show if total is 0, unless there's a zap-goal (goal should always be visible)
            if (totalAmount === 0 && totalCount === 0 && !(post.zapGoal && post.zapGoal > 0)) {
              return null;
            }

            // Calculate goal progress if zap-goal exists
            let goalProgress = null;
            let goalPercentage = null;
            if (post.zapGoal && post.zapGoal > 0) {
              const progress = Math.min((totalAmount / post.zapGoal) * 100, 100);
              goalProgress = progress;
              goalPercentage = Math.round(progress);
            }

            return (
              <div className="totalZapsAccounting">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                  {post.zapGoal && post.zapGoal > 0 ? (
                    <>
                      <div className="totalZapsGoal">
                        <span className="totalZapsNumber">
                          {totalAmount.toLocaleString()} / {post.zapGoal.toLocaleString()}
                        </span>
                        <span className="label"> sats ({goalPercentage}%)</span>
                      </div>
                      <div className="totalZapsSeparator">·</div>
                      <div className="totalZapsCount">
                        <span className="totalZapsNumber">{totalCount}</span>
                        <span className="label">
                          {totalCount === 1 ? 'zap' : 'zaps'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="totalZapsAmount">
                          <span className="totalZapsNumber">
                            {totalAmount.toLocaleString()}
                          </span>
                          <span className="label">sats</span>
                        </div>
                        <div className="totalZapsSeparator">·</div>
                        <div className="totalZapsCount">
                          <span className="totalZapsNumber">{totalCount}</span>
                          <span className="label">
                            {totalCount === 1 ? 'zap' : 'zaps'}
                          </span>
                        </div>
                        
                      </div>
                     
                    </>
                  )}
                </div>
                {post.zapGoal && post.zapGoal > 0 && goalProgress !== null && (
                  <div className="zapGoalBar">
                    <div
                      className="zapGoalBarFill"
                      style={{ width: `${goalProgress}%` }}
                    />
                  </div>
                )}
                 <div className="zapTotalLabel">
                  {post.zapGoal && post.zapGoal > 0 && goalProgress !== null  ? 'Progress' : 'Totals'}
                  </div>
                  
              </div>
            );
          })()}

          {/* Zap Values - only show for notes with zap tags, right above slider */}
          {post.hasZapTags && (
            <div className="noteValues">
              {/* Only show Min/Max if zap-min or zap-max tags exist (zapMin > 0) */}
              {post.zapMin > 0 && (
                <div className="zapMinContainer">
                  <div className="zapMin">
                    <span className="zapMinVal">
                      {post.zapMin.toLocaleString()}
                    </span><br/>
                    <span className="label">sats</span>
                  </div>
                  <div className="zapMinLabel">
                    {post.zapMin !== post.zapMax ? 'Min' : 'Fixed Amount'}
                  </div>
                </div>
              )}

              {post.zapMin > 0 && post.zapMin !== post.zapMax && (
                <div className="zapMaxContainer">
                  <div className="zapMax">
                    <span className="label">sats</span>
                    <span className="zapMaxVal">
                      {post.zapMax.toLocaleString()}
                    </span>
                  </div>
                  <div className="zapMaxLabel">Max</div>
                </div>
              )}

              {/* Show zap-uses even if no min/max */}
              {post.zapUses > 0 && (
                <div className="zapUsesContainer">
                  <div className="zapUses">
                    <span className="zapUsesCurrent">
                      {post.zapUsesCurrent}
                    </span>
                    <span className="label">of</span>
                    <span className="zapUsesTotal">{post.zapUses}</span>
                  </div>
                  <div className="zapUsesLabel">Uses</div>
                </div>
              )}
            </div>
          )}

          {/* Zap Slider for Range - directly above pay button */}
          {post.zapMin !== post.zapMax &&
            isPayable &&
            (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses) && (
              <div className="zapSliderContainer">
                <div className="zapAmountInput">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="zapAmountField"
                    value={zapAmount.toLocaleString()}
                    onChange={e => handleZapAmountInput(e.target.value)}
                    onFocus={e => e.target.select()}
                    onBlur={() => {
                      // Ensure value is within bounds on blur
                      if (zapAmount < post.zapMin) setZapAmount(post.zapMin);
                      if (zapAmount > post.zapMax) setZapAmount(post.zapMax);
                    }}
                  />
                  <span className="zapAmountSuffix">
                    {zapAmount === 1 ? 'sat' : 'sats'}
                  </span>
                </div>
                <input
                  type="range"
                  className="zapSlider"
                  min={post.zapMin}
                  max={post.zapMax}
                  value={zapAmount}
                  onChange={e =>
                    handleZapSliderChange(parseInt(e.target.value))
                  }
                />
              </div>
            )}

          {/* Main CTA - show for notes with zap tags AND (payment amount defined OR restrictions met)
              Button will be disabled if zap-payer restriction exists and current user is not the zap-payer */}
          {post.hasZapTags && (hasPaymentAmount || restrictionsMet) && (
            <div className="noteCTA">
              <button
                className={`noteMainCTA cta ${restrictionsMet || !isPayable || paymentError ? 'disabled' : ''} ${paymentError ? 'red' : ''} ${restrictionsMet ? 'paid' : ''}`}
                onMouseDown={handleLongPressStart}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                onTouchStart={handleLongPressStart}
                onTouchEnd={handleLongPressEnd}
                onClick={async () => {
                  // Don't trigger quick zap if it was a long press
                  if (isLongPressRef.current) {
                    isLongPressRef.current = false;
                    return;
                  }

                  if (restrictionsMet || !isPayable || paymentError) {
                    return;
                  }
                  if (!isLoggedIn) {
                    useUIStore.getState().openLogin();
                    return;
                  }
                  try {
                    setIsPaying(true);
                    const hasNwc =
                      (typeof localStorage !== 'undefined' &&
                        localStorage.getItem('nwcConnectionString')) ||
                      (typeof sessionStorage !== 'undefined' &&
                        sessionStorage.getItem('nwcConnectionString'));
                    if (hasNwc) {
                      useUIStore
                        .getState()
                        .openToast('Preparing payment…', 'loading', true);
                    } else {
                      useUIStore
                        .getState()
                        .openToast('Preparing invoice…', 'loading', false);
                      setTimeout(() => {
                        try {
                          useUIStore.getState().closeToast();
                        } catch {}
                      }, 800);
                    }
                    await onPay(post, zapAmount);
                  } finally {
                    setIsPaying(false);
                  }
                }}
                disabled={restrictionsMet || !isPayable || isPaying || !!paymentError}
                title={
                  paymentError
                    ? paymentError
                    : restrictionsMet
                      ? 'This post has been fully paid'
                      : hasZapPayerRestriction && !isCurrentUserZapPayer
                        ? 'Only the specified payer can pay this post'
                      : !isPayable
                        ? 'This post is not payable'
                        : post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses
                          ? 'This post has been fully paid'
                          : ''
                }
              >
                {paymentError
                  ? paymentError
                  : isPaying
                  ? 'Paying…'
                  : restrictionsMet
                    ? 'Paid'
                    : hasZapPayerRestriction && !isCurrentUserZapPayer
                      ? 'Authorized Payer Only'
                    : !isPayable
                      ? 'Not Payable'
                      : 'Pay'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="noteActionsReactions">
            <div className="noteZaps noteZapReactions">
              {overflowZaps.map((zap, index) => {
                return (
                  <div
                    key={index}
                    className={`zapReaction ${zap.isNewZap ? 'newZap' : ''}`}
                  >
                    <Link to={`/profile/${zap.zapPayerPubkey}`}>
                      <img
                        className="userImg"
                        src={zap.zapPayerPicture || genericUserIcon}
                      />
                    </Link>
                    <Link
                      to={`/note/${nip19.noteEncode(zap.id)}`}
                      className="zapReactionAmount"
                    >
                      {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                    </Link>
                    {zap.content && (
                      <div className="zapReactionTooltip">
                        {zap.content.length > 21
                          ? `${zap.content.substring(0, 21)  }...`
                          : zap.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="noteActions">
              {/* Zap Menu */}
              <a
                ref={zapActionRef}
                className={`noteAction zapMenuAction ${!hasValidLightning ? 'disabled' : ''}`}
                onClick={e => {
                  e.preventDefault();
                  if (!hasValidLightning) return;
                  const newState = !showZapMenu;
                  setShowZapMenu(newState);
                  if (!newState) {
                    setShowCommentInput(false);
                  }
                }}
                style={{ position: 'relative' }}
                title={
                  !hasValidLightning
                    ? 'Lightning address missing or invalid'
                    : 'Open zap menu'
                }
              >
                <span className="material-symbols-outlined">bolt</span>
                <div
                  className={`zapMenu ${showZapMenu ? 'show' : ''}`}
                  ref={zapMenuRef}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="zapMenuCustom">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                    <input
                      type="number"
                      id="customZapInput"
                      placeholder="sats"
                      min="1"
                      value={customZapAmount}
                      onChange={e => setCustomZapAmount(e.target.value)}
                      onClick={e => e.stopPropagation()}
                        style={{ flex: 1 }}
                    />
                      {!showCommentInput && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setShowCommentInput(true);
                          }}
                          style={{
                            padding: '0',
                            background: 'transparent',
                            border: '2px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            minWidth: '36px',
                            width: '36px',
                            boxSizing: 'border-box',
                            alignSelf: 'stretch'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--hover-bg)';
                            e.currentTarget.style.borderColor = 'var(--text-secondary)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                          }}
                          title="Add comment"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle' }}>
                            comment
                          </span>
                        </button>
                      )}
                    </div>
                    {showCommentInput && (
                    <textarea
                      id="zapCommentInput"
                        placeholder="Comment (optional)"
                      value={zapComment}
                      onChange={e => setZapComment(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      rows={2}
                        style={{ marginTop: '8px' }}
                        autoFocus
                    />
                    )}
                    <button
                      id="customZapButton"
                      onClick={async e => {
                        e.stopPropagation();
                        await handleCustomZap();
                      }}
                      disabled={isPaying}
                      style={{ opacity: isPaying ? 0.5 : 1 }}
                    >
                      {isPaying ? 'Zapping…' : 'Zap'}
                    </button>
                    <button
                      id="customAnonZapButton"
                      onClick={async e => {
                        e.stopPropagation();
                        await handleAnonZap();
                      }}
                      disabled={isAnonPaying}
                      style={{ opacity: isAnonPaying ? 0.5 : 1 }}
                    >
                      {isAnonPaying ? 'anon…' : 'anonZap'}
                    </button>
                  </div>
                </div>
              </a>

              {/* Share */}
              <a className="noteAction" onClick={() => onShare(post)}>
                <span className="material-symbols-outlined">ios_share</span>
              </a>

              {/* More Menu */}
              <button
                className="noteAction dropdown"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDropdown(!showDropdown);
                }}
              >
                <span className="material-symbols-outlined">more_horiz</span>

                <div
                  className={`dropdown-content dropdown-element ${showDropdown ? 'show' : ''}`}
                  ref={dropdownRef}
                >
                  <a className="cta dropdown-element disabled">
                    New Pay Forward
                  </a>

                  {isPayable && (
                    <a
                      className={`cta dropdown-element ${!isPayable ? 'disabled' : ''}`}
                      onClick={e => {
                        e.preventDefault();
                        if (isPayable) {
                          handlePayAnonymously();
                        }
                      }}
                    >
                      Pay Anonymously
                    </a>
                  )}

                  <a
                    className="toolTipLink dropdown-element"
                    href="#"
                    onClick={e => {
                      e.preventDefault();
                      onViewRaw(post);
                    }}
                  >
                    View Raw
                  </a>

                  <a
                    href={`/live/${
                      /^[0-9a-f]{64}$/i.test(post.id)
                        ? nip19.noteEncode(post.id)
                        : post.id
                    }`}
                    className="toolTipLink dropdown-element"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const noteId = /^[0-9a-f]{64}$/i.test(post.id)
                        ? nip19.noteEncode(post.id)
                        : post.id;
                      window.open(`/live/${noteId}`, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    View on live
                  </a>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Zap Confirmation Modal */}
          <div
            className="overlayContainer"
          style={{
            display: 'flex',
            visibility: showZapModal ? 'visible' : 'hidden',
            opacity: showZapModal ? 1 : 0,
            pointerEvents: showZapModal ? 'auto' : 'none'
          }}
            onClick={() => {
              setShowZapModal(false);
              setZapModalComment('');
              setIsAnonymousModal(false);
            }}
          >
            <div
              className="overlayInner zapModal"
              onClick={e => e.stopPropagation()}
            >
              <h3
                style={{
                  margin: '0 0 20px 0',
                  color: 'var(--text-primary)',
                  textAlign: 'center'
                }}
              >
                {isAnonymousModal ? 'Pay Anonymously' : 'Confirm Zap'}
              </h3>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '20px'
                }}
              >
                <img
                  src={profilePicture}
                  alt="Profile"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                  onError={e => {
                    e.currentTarget.src = genericUserIcon;
                  }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                      marginBottom: '4px'
                    }}
                  >
                    {displayName}
                  </div>
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: '700',
                      color: '#4a75ff'
                    }}
                  >
                    ⚡ {zapAmount} sats
                  </div>
                </div>
              </div>

              <textarea
                id="zapModalComment"
                placeholder="Comment (optional)"
                value={zapModalComment}
                onChange={e => setZapModalComment(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '400',
                  fontFamily: 'Inter, sans-serif',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  marginBottom: '20px'
                }}
              />

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="cta"
                  onClick={handleZapFromModal}
                  disabled={isPaying}
                  style={{
                    flex: 1,
                    opacity: isPaying ? 0.5 : 1,
                    marginBottom: 0
                  }}
                >
                  {isPaying ? 'Paying…' : 'Pay'}
                </button>
                <button
                  className="cta"
                  onClick={() => {
                    setShowZapModal(false);
                    setZapModalComment('');
                    setIsAnonymousModal(false);
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    marginBottom: 0
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
      </div>
    );
  }
);
