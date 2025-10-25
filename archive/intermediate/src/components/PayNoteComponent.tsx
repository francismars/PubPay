// PayNoteComponent - Renders individual PubPay posts
import React, { useState, useRef, useEffect } from 'react';
import { PubPayPost } from '../hooks/useHomeFunctionality';

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
}

interface PayNoteComponentProps {
  post: PubPayPost & { replyLevel?: number };
  onPay: (post: PubPayPost, amount: number) => void;
  onPayAnonymously: (post: PubPayPost, amount: number) => void;
  onShare: (post: PubPayPost) => void;
  onViewRaw: (post: PubPayPost) => void;
  isLoggedIn: boolean;
  isReply?: boolean;
}

export const PayNoteComponent: React.FC<PayNoteComponentProps> = React.memo(
  ({
    post,
    onPay,
    onPayAnonymously,
    onShare,
    onViewRaw,
    isLoggedIn,
    isReply = false
  }) => {
    const [zapAmount, setZapAmount] = useState(post.zapMin);
    const [showZapMenu, setShowZapMenu] = useState(false);
    const [customZapAmount, setCustomZapAmount] = useState('');
    const [heroZaps, setHeroZaps] = useState<ProcessedZap[]>([]);
    const [overflowZaps, setOverflowZaps] = useState<ProcessedZap[]>([]);
    const zapMenuRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const zapActionRef = useRef<HTMLAnchorElement>(null);

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
    const profilePicture =
      authorData?.picture || '/images/generic-user-icon.svg';
    const nip05 = authorData?.nip05;
    const lud16 = authorData?.lud16;

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

    // Format content with mentions and links
    const formatContent = (content: string): string => {
      // Handle image URLs
      content = content.replace(
        /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(gif|png|jpg|jpeg)/gi,
        match =>
          `<img src="${match}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;">`
      );

      // Handle video URLs
      content = content.replace(
        /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(mp4|webm|ogg|mov)/gi,
        match => `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%; margin: 8px 0;">
        <video src="${match}" controls style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;">
          Your browser does not support the video tag.
        </video>
      </div>`
      );

      // Handle YouTube URLs
      content = content.replace(
        /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w\-]+)|https?:\/\/youtu\.be\/([\w\-]+))/gi,
        (match, p1, p2) => {
          const videoId = p2 || p1;
          return `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%; margin: 8px 0;">
          <iframe src="https://www.youtube.com/embed/${videoId}" 
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 8px;"
                  frameborder="0" allowfullscreen>
          </iframe>
        </div>`;
        }
      );

      // Handle regular URLs
      content = content.replace(
        /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+|www\.[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)/gi,
        match => {
          if (content.includes(`src="${match}"`)) {
            return match;
          }
          const url = match.startsWith('http') ? match : `http://${match}`;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #0066cc; text-decoration: underline;">${match}</a>`;
        }
      );

      // Handle npub mentions
      content = content.replace(
        /(nostr:|@)?((npub|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/gi,
        (match, prefix, npub) => {
          const cleanNpub = npub.replace('nostr:', '').replace('@', '');
          const shortNpub =
            cleanNpub.length > 35
              ? `${cleanNpub.substr(0, 4)}...${cleanNpub.substr(cleanNpub.length - 4)}`
              : cleanNpub;
          return `<a href="https://next.nostrudel.ninja/#/u/${cleanNpub}" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   style="color: #0066cc; text-decoration: underline;">
                   ${shortNpub}
                 </a>`;
        }
      );

      // Convert newlines to breaks
      content = content.replace(/\n/g, '<br />');

      return content;
    };

    // Handle zap slider change
    const handleZapSliderChange = (value: number) => {
      setZapAmount(value);
    };

    // Handle custom zap
    const handleCustomZap = () => {
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

      const heroZapsList: ProcessedZap[] = [];
      const overflowZapsList: ProcessedZap[] = [];

      post.zaps.forEach((zap, index) => {
        // Check if this zap amount is within the zap min/max range
        const zapAmount = zap.zapAmount;
        const zapMin = post.zapMin;
        const zapMax = post.zapMax;

        // Check if zap amount is within the valid range
        const isWithinRange = zapAmount >= zapMin && zapAmount <= zapMax;

        if (isWithinRange) {
          // This is a hero zap (within amount range)
          heroZapsList.push(zap);
        } else {
          // This is an overflow zap (outside amount range)
          overflowZapsList.push(zap);
        }
      });

      // Sort zaps by date chronologically (oldest first)
      heroZapsList.sort((a, b) => a.created_at - b.created_at);
      overflowZapsList.sort((a, b) => a.created_at - b.created_at);

      setHeroZaps(heroZapsList);
      setOverflowZaps(overflowZapsList);
    }, [post.zaps, post.zapUsesCurrent, post.zapUses]);

    // Close dropdowns when clicking outside (global handler)
    useEffect(() => {
      const handleGlobalClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (
          !target.matches('.dropbtn') &&
          !target.matches('.dropdown-element')
        ) {
          // Close all dropdowns
          const dropdowns = document.getElementsByClassName('dropdown-content');
          for (let i = 0; i < dropdowns.length; i++) {
            const dropdown = dropdowns[i] as HTMLElement;
            dropdown.classList.remove('show');
          }
        }
      };

      const handleTouchStart = (event: TouchEvent) => {
        const target = event.target as HTMLElement;
        if (
          !target.matches('.dropbtn') &&
          !target.matches('.dropdown-element')
        ) {
          // Close all dropdowns
          const dropdowns = document.getElementsByClassName('dropdown-content');
          for (let i = 0; i < dropdowns.length; i++) {
            const dropdown = dropdowns[i] as HTMLElement;
            dropdown.classList.remove('show');
          }
        }
      };

      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('touchstart', handleTouchStart);

      return () => {
        document.removeEventListener('click', handleGlobalClick);
        document.removeEventListener('touchstart', handleTouchStart);
      };
    }, []);

    return (
      <div
        className={isReply ? 'paynote reply' : 'paynote'}
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
                  href={`https://next.nostrudel.ninja/#/u/${post.event.pubkey}`}
                  className="noteAuthorLink"
                  target="_blank"
                  rel="noopener noreferrer"
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

            <div
              className="noteDate label"
              onClick={() => {
                console.log('noteDate clicked for post:', post.id);
                // Navigate to single note view using NIP-19 encoding
                if (
                  typeof window !== 'undefined' &&
                  (window as any).NostrTools
                ) {
                  const nevent = (window as any).NostrTools.nip19.noteEncode(
                    post.id
                  );
                  console.log('Navigating to single note:', nevent);
                  window.location.href = `/?note=${nevent}`;
                } else {
                  console.error('NostrTools not available');
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {timeAgo(post.createdAt)}
            </div>
          </div>

          {/* Content */}
          <div
            className="noteContent"
            dangerouslySetInnerHTML={{
              __html: formatContent(post.event.content)
            }}
          />

          {/* Zap Values */}
          <div className="noteValues">
            <div className="zapMin">
              <span className="zapMinVal">{post.zapMin.toLocaleString()}</span>
              <span className="label">
                sats
                <br />
                {post.zapMin !== post.zapMax ? 'Min' : ''}
              </span>
            </div>

            {post.zapMin !== post.zapMax && (
              <div className="zapMax">
                <span className="zapMaxVal">
                  {post.zapMax.toLocaleString()}
                </span>
                <span className="label">
                  sats
                  <br />
                  Max
                </span>
              </div>
            )}

            {post.zapUses > 1 && (
              <div className="zapUses">
                <span className="zapUsesCurrent">{post.zapUsesCurrent}</span>
                <span className="label">of</span>
                <span className="zapUsesTotal">{post.zapUses}</span>
              </div>
            )}
          </div>

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
                  src={post.zapPayerPicture || '/images/generic-user-icon.svg'}
                />
                <div className="userName">
                  {(() => {
                    if (window.NostrTools) {
                      const npub = window.NostrTools.nip19.npubEncode(
                        post.zapPayer
                      );
                      // Use start_and_end formatting: first 4 chars + "..." + last 4 chars
                      return npub.length > 35
                        ? `${npub.substr(0, 4)}...${npub.substr(npub.length - 4, npub.length)}`
                        : npub;
                    }
                    // Fallback to pubkey formatting
                    return `${post.zapPayer.substr(0, 8)}...${post.zapPayer.substr(-8)}`;
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
                <div key={index} className="zapReaction">
                  <a
                    href={`https://next.nostrudel.ninja/#/u/${zap.zapPayerNpub}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img className="userImg" src={zap.zapPayerPicture} />
                  </a>
                  <a
                    href={`https://next.nostrudel.ninja/#/n/${zap.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="zapReactionAmount"
                  >
                    {zap.zapAmount ? zap.zapAmount.toLocaleString() : '0'}
                  </a>
                </div>
              );
            })}
          </div>

          {/* Main CTA */}
          <div className="noteCTA">
            <button
              className={`noteMainCTA cta ${!isPayable || !isLoggedIn || isReply ? 'disabled' : ''}`}
              onClick={() => !isReply && isPayable && onPay(post, zapAmount)}
              disabled={!isPayable || !isLoggedIn || isReply}
            >
              {post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses
                ? 'Paid'
                : 'Pay'}
            </button>
          </div>

          {/* Actions */}
          <div className="noteActionsReactions">
            <div className="noteZaps noteZapReactions">
              {overflowZaps.map((zap, index) => {
                return (
                  <div key={index} className="zapReaction">
                    <a
                      href={`https://next.nostrudel.ninja/#/u/${zap.zapPayerNpub}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img className="userImg" src={zap.zapPayerPicture} />
                    </a>
                    <a
                      href={`https://next.nostrudel.ninja/#/n/${zap.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
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
                className={
                  isPayable &&
                  (post.zapUses === 0 || post.zapUsesCurrent < post.zapUses)
                    ? 'noteAction zapMenuAction'
                    : 'disabled'
                }
                onClick={e => {
                  e.preventDefault();
                  if (
                    !isPayable ||
                    (post.zapUses > 0 && post.zapUsesCurrent >= post.zapUses)
                  )
                    return;
                  setShowZapMenu(!showZapMenu);
                }}
                style={{ position: 'relative' }}
              >
                <span className="material-symbols-outlined">bolt</span>
                <div
                  className="zapMenu"
                  style={{ display: showZapMenu ? 'block' : 'none' }}
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
              <div className="noteAction dropdown">
                <button
                  className="dropbtn"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Dropdown button clicked');
                    setTimeout(() => {
                      if (dropdownRef.current) {
                        dropdownRef.current.classList.toggle('show');
                        console.log(
                          'Dropdown classes after toggle:',
                          dropdownRef.current.className
                        );
                      }
                    }, 100);
                  }}
                >
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>

                <div
                  className="dropdown-content dropdown-element"
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
                    href={`https://next.nostrudel.ninja/#/n/${post.id}`}
                    className="toolTipLink dropdown-element"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on nostrudel
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
