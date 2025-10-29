// PayNoteComponent - Renders individual PubPay posts
import React, { useState, useRef, useEffect } from 'react';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import * as NostrTools from 'nostr-tools';
import { formatContent } from '../utils/contentFormatter';

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
    nostrReady
  }) => {
    const [zapAmount, setZapAmount] = useState(post.zapMin);
    const [showZapMenu, setShowZapMenu] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [customZapAmount, setCustomZapAmount] = useState('');
    const [heroZaps, setHeroZaps] = useState<ProcessedZap[]>([]);
    const [overflowZaps, setOverflowZaps] = useState<ProcessedZap[]>([]);
    const [formattedContent, setFormattedContent] = useState<string>('');
    const zapMenuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const zapActionRef = useRef<HTMLAnchorElement>(null);
    const paynoteRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Format content: baseline first, then upgrade when nostr is ready
    useEffect(() => {
      const raw = post.event.content || '';
      // Baseline formatting: linkify npubs and URLs, no client required
      const baseline = raw
        .replace(
          /(nostr:|@)?((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi,
          (_m, _p, npub) => {
            const clean = String(npub).replace('nostr:', '').replace('@', '');
            const shortId = clean.length > 35 ? `${clean.substr(0, 4)}...${clean.substr(clean.length - 4)}` : clean;
            return `<a href="/profile/${clean}" style="color: #0066cc; text-decoration: underline;">${shortId}</a>`;
          }
        )
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
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
    }, [post.event.content, nostrClient, nostrReady, post.author, post.zapPayerName]);

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

    // Handle custom zap
    const handleCustomZap = () => {
      if (!isLoggedIn) {
        return; // Require login for non-anonymous zaps
      }
      const amount = parseInt(customZapAmount);
      if (amount > 0) {
        onPay(post, amount);
        setShowZapMenu(false);
        setCustomZapAmount('');
      }
    };

    // Handle anonymous zap from custom menu
    const handleAnonZap = () => {
      const amount = parseInt(customZapAmount);
      if (amount > 0) {
        // Call anonymous zap handler
        onPayAnonymously(post, amount);
        setShowZapMenu(false);
        setCustomZapAmount('');
      }
    };

    // Handle anonymous pay from dropdown (uses current zap amount)
    const handlePayAnonymously = () => {
      if (isPayable) {
        onPayAnonymously(post, zapAmount);
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
        const isWithinRange = zap.zapAmount >= zapMin && zap.zapAmount <= zapMax;
        const matchesPayer = !hasZapPayerRestriction || zap.zapPayerPubkey === post.zapPayer;

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
      const usesCap = post.zapUses && post.zapUses > 0 ? post.zapUses : undefined;
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
          <img className="userImg" src={profilePicture} alt="Profile" />
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
                  <span>NOT PAYABLE</span>
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
                const nevent = NostrTools.nip19.noteEncode(post.id);
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
                          const npub = NostrTools.nip19.npubEncode(post.zapPayer);
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
                <div className="zapSliderVal">
                  {zapAmount.toLocaleString()}
                  <span className="label"> sats</span>
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
                  <a
                    href={`/profile/${zap.zapPayerPubkey}`}
                  >
                    <img
                      className="userImg"
                      src={zap.zapPayerPicture || genericUserIcon}
                    />
                  </a>
                  <a
                    href={`/note/${NostrTools.nip19.noteEncode(zap.id)}`}
                    className="zapReactionAmount"
                  >
                    {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                  </a>
                </div>
              );
            })}
          </div>

          {/* Main CTA - only show for notes with zap tags */}
          {post.hasZapTags && (
            <div className="noteCTA">
              <button
                className={`noteMainCTA cta ${!isPayable || !isLoggedIn || isReply ? 'disabled' : ''}`}
                onClick={() => {
                  // Early return if disabled
                  if (!isPayable || !isLoggedIn || isReply) {
                    return;
                  }
                  onPay(post, zapAmount);
                }}
                disabled={!isPayable || !isLoggedIn || isReply}
                title={
                  isReply
                    ? 'Cannot pay replies'
                    : !isLoggedIn && isPayable
                    ? 'Please sign in to pay'
                    : !isPayable
                    ? 'This post is not payable'
                    : post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses
                    ? 'This post has been fully paid'
                    : ''
                }
              >
                {post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses
                  ? 'Paid'
                  : !isPayable || isReply
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
                    <a
                      href={`/profile/${zap.zapPayerPubkey}`}
                    >
                      <img
                        className="userImg"
                        src={zap.zapPayerPicture || genericUserIcon}
                      />
                    </a>
                    <a
                      href={`/note/${NostrTools.nip19.noteEncode(zap.id)}`}
                      className="zapReactionAmount"
                    >
                      {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                    </a>
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
                  setShowZapMenu(!showZapMenu);
                }}
                style={{ position: 'relative' }}
                title={!hasValidLightning ? 'Lightning address missing or invalid' : 'Open zap menu'}
              >
                <span className="material-symbols-outlined">bolt</span>
                <div
                  className={`zapMenu ${showZapMenu ? 'show' : ''}`}
                  ref={zapMenuRef}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="zapMenuCustom">
                    <input
                      type="number"
                      id="customZapInput"
                      placeholder="sats"
                      min="1"
                      value={customZapAmount}
                      onChange={e => setCustomZapAmount(e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      id="customZapButton"
                      onClick={e => {
                        e.stopPropagation();
                        handleCustomZap();
                      }}
                      disabled={!isLoggedIn}
                      style={{ opacity: !isLoggedIn ? 0.5 : 1 }}
                      title={!isLoggedIn ? 'Please sign in to zap' : ''}
                    >
                      Zap
                    </button>
                    <button
                      id="customAnonZapButton"
                      onClick={e => {
                        e.stopPropagation();
                        handleAnonZap();
                      }}
                    >
                      anonZap
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
                    href={`/live?note=${post.id}`}
                    className="toolTipLink dropdown-element"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on live
                  </a>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
