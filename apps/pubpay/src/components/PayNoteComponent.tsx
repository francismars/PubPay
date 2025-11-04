// PayNoteComponent - Renders individual PubPay posts
import React, { useState, useRef, useEffect } from 'react';
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
    isReply = false,
    nostrClient,
    nostrReady,
    paymentError
  }) => {
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
      // Baseline formatting: linkify only nostr:npubs and URLs, no client required
      const baseline = raw
        .replace(
          /nostr:((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi,
          (_m, npub) => {
            const clean = String(npub);
            const shortId =
              clean.length > 35
                ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}`
                : clean;
            return `<a href="/profile/${clean}" class="nostrMention">${shortId}</a>`;
          }
        )
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

    const authorData = post.author
      ? (() => {
          try {
            return JSON.parse(post.author.content || '{}');
          } catch {
            return null;
          }
        })()
      : null;
    const displayName =
      authorData?.display_name || authorData?.name || 'Anonymous';
    const profilePicture = authorData?.picture || genericUserIcon;
    const nip05 = authorData?.nip05;
    const lud16 = authorData?.lud16;
    const hasValidLightning = !!lud16 && /.+@.+\..+/.test(lud16);

    // Check if note is payable - must have lud16 AND not reached zap uses target
    const isPayable =
      post.isPayable &&
      (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses);

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

      const zapMin = post.zapMin;
      const zapMax = post.zapMax;
      const hasZapPayerRestriction = !!post.zapPayer;

      // Classify zaps based on tag restrictions: amount range and zap-payer (if present)
      const withinRestrictions: ProcessedZap[] = [];
      const outsideRestrictions: ProcessedZap[] = [];

      for (const zap of post.zaps) {
        const isWithinRange =
          zap.zapAmount >= zapMin && zap.zapAmount <= zapMax;
        const matchesPayer =
          !hasZapPayerRestriction || zap.zapPayerPubkey === post.zapPayer;

        if (isWithinRange && matchesPayer) {
          withinRestrictions.push(zap);
        } else {
          outsideRestrictions.push(zap);
        }
      }

      // Debug counts
      console.log('Zap classification', {
        postId: post.id,
        total: post.zaps.length,
        withinRestrictions: withinRestrictions.length,
        outsideRestrictions: outsideRestrictions.length,
        zapMin,
        zapMax,
        zapPayer: post.zapPayer || null,
        zapUses: post.zapUses
      });

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
          <a href={`/profile/${post.event.pubkey}`}>
            <img className="userImg" src={profilePicture} alt="Profile" />
          </a>
        </div>
        <div className="noteData">
          <div className="noteHeader">
            <div className="noteAuthor">
              <div className="noteDisplayName">
                <a
                  href={`/profile/${post.event.pubkey}`}
                  className="noteAuthorLink"
                >
                  {displayName}
                </a>
              </div>

              {/* NIP-05 Verification */}
              <div className="noteNIP05 label">
                {nip05 ? (
                  <a
                    href={`https://${nip05.split('@')[1]}/.well-known/nostr.json?name=${nip05.split('@')[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    {nip05}
                  </a>
                ) : (
                  <span className="unverified label">
                    <span className="material-symbols-outlined">block</span>
                    Unverified
                  </span>
                )}
              </div>

              {/* Lightning Address */}
              <div className="noteLNAddress label">
                {lud16 ? (
                  <a
                    href={`https://${lud16.split('@')[1]}/.well-known/lnurlp/${lud16.split('@')[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="material-symbols-outlined">bolt</span>
                    {lud16}
                  </a>
                ) : (
                  <span className="unverified label">
                    <span className="material-symbols-outlined">block</span>
                    Not Payable
                  </span>
                )}
              </div>
            </div>

            <div className="noteDate label">{timeAgo(post.createdAt)}</div>
          </div>

          {/* Content */}
          <div
            className="noteContent"
            onClick={e => {
              // Check if the clicked element is a link or inside a link
              const target = e.target as HTMLElement;
              const isLink = target.tagName === 'A' || target.closest('a');

              if (!isLink) {
                console.log('noteContent clicked for post:', post.id);
                // Navigate to single note view using NIP-19 encoding
                const nevent = nip19.noteEncode(post.id);
                console.log('Navigating to single note:', nevent);
                window.location.href = `/note/${nevent}`;
              }
            }}
            style={{ cursor: 'pointer' }}
            dangerouslySetInnerHTML={{
              __html: formattedContent || post.event.content
            }}
          />

          {/* Zap Values - only show for notes with zap tags */}
          {post.hasZapTags && (
            <div className="noteValues">
              <div className="zapMinContainer">
                <div className="zapMin">
                  <span className="zapMinVal">
                    {post.zapMin.toLocaleString()}
                  </span>
                  <span className="label">sats</span>
                </div>
                <div className="zapMinLabel">
                  {post.zapMin !== post.zapMax ? 'Min' : ''}
                </div>
              </div>

              {post.zapMin !== post.zapMax && (
                <div className="zapMaxContainer">
                  <div className="zapMax">
                    <span className="zapMaxVal">
                      {post.zapMax.toLocaleString()}
                    </span>
                    <span className="label">sats</span>
                  </div>
                  <div className="zapMaxLabel">Max</div>
                </div>
              )}

              {post.zapUses > 1 && (
                <div className="zapUsesContainer">
                  <div className="zapUses">
                    <span className="zapUsesCurrent">
                      {post.zapUsesCurrent}
                    </span>
                    <span className="label">of</span>
                    <span className="zapUsesTotal">{post.zapUses}</span>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {/* Zap Slider for Range */}
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

          {/* Hero Zaps - for zaps within target */}
          <div className="noteHeroZaps noteZapReactions">
            {heroZaps.map((zap, index) => {
              return (
                <div
                  key={index}
                  className={`zapReaction ${zap.isNewZap ? 'newZap' : ''}`}
                >
                  <a href={`/profile/${zap.zapPayerPubkey}`}>
                    <img
                      className="userImg"
                      src={zap.zapPayerPicture || genericUserIcon}
                    />
                  </a>
                  <a
                    href={`/note/${nip19.noteEncode(zap.id)}`}
                    className="zapReactionAmount"
                  >
                    {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                  </a>
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

          {/* Main CTA - only show for notes with zap tags */}
          {post.hasZapTags && (
            <div className="noteCTA">
              <button
                className={`noteMainCTA cta ${!isPayable || paymentError ? 'disabled' : ''} ${paymentError ? 'red' : ''}`}
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

                  if (!isPayable || paymentError) {
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
                disabled={!isPayable || isPaying || !!paymentError}
                title={
                  paymentError
                    ? paymentError
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
                    : post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses
                      ? 'Paid'
                      : !isPayable
                        ? 'Not Payable'
                        : 'Pay'}
              </button>
            </div>
          )}

          {/* Total Zaps Accounting */}
          {post.zaps.length > 0 && (
            <div className="totalZapsAccounting">
              <div className="totalZapsAmount">
                <span className="totalZapsNumber">
                  {post.zaps
                    .reduce((sum, zap) => sum + (zap.zapAmount || 0), 0)
                    .toLocaleString()}
                </span>
                <span className="totalZapsLabel">sats</span>
              </div>
              <div className="totalZapsSeparator">·</div>
              <div className="totalZapsCount">
                <span className="totalZapsNumber">{post.zaps.length}</span>
                <span className="totalZapsLabel">
                  {post.zaps.length === 1 ? 'zap' : 'zaps'}
                </span>
              </div>
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
                    <a href={`/profile/${zap.zapPayerPubkey}`}>
                      <img
                        className="userImg"
                        src={zap.zapPayerPicture || genericUserIcon}
                      />
                    </a>
                    <a
                      href={`/note/${nip19.noteEncode(zap.id)}`}
                      className="zapReactionAmount"
                    >
                      {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                    </a>
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
        {showZapModal && (
          <div
            className="overlayContainer"
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
        )}
      </div>
    );
  }
);
