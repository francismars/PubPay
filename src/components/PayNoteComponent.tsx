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
  post: PubPayPost;
  onPay: (post: PubPayPost, amount: number) => void;
  onShare: (post: PubPayPost) => void;
  onViewRaw: (post: PubPayPost) => void;
  isLoggedIn: boolean;
}

export const PayNoteComponent: React.FC<PayNoteComponentProps> = ({
  post,
  onPay,
  onShare,
  onViewRaw,
  isLoggedIn
}) => {
  const [zapAmount, setZapAmount] = useState(post.zapMin);
  const [showZapMenu, setShowZapMenu] = useState(false);
  const [customZapAmount, setCustomZapAmount] = useState('');
  const [heroZaps, setHeroZaps] = useState<ProcessedZap[]>([]);
  const [overflowZaps, setOverflowZaps] = useState<ProcessedZap[]>([]);
  const zapMenuRef = useRef<HTMLDivElement>(null);


  const authorData = post.author ? JSON.parse(post.author.content) : null;
  const displayName = authorData?.display_name || authorData?.name || 'Anonymous';
  const profilePicture = authorData?.picture || 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg';
  const nip05 = authorData?.nip05;
  const lud16 = authorData?.lud16;
  const isPayable = post.isPayable;

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
      (match) => `<img src="${match}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;">`
    );

    // Handle video URLs
    content = content.replace(
      /(https?:\/\/[\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)\.(mp4|webm|ogg|mov)/gi,
      (match) => `<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%; margin: 8px 0;">
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
      (match) => {
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
        const shortNpub = cleanNpub.length > 35 
          ? cleanNpub.substr(0, 4) + '...' + cleanNpub.substr(cleanNpub.length - 4)
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

  // Handle anonymous zap
  const handleAnonZap = () => {
    const amount = parseInt(customZapAmount);
    if (amount > 0) {
      // This would be an anonymous zap
      onPay(post, amount);
      setShowZapMenu(false);
      setCustomZapAmount('');
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
      // Check if this zap is within the target (zap-uses limit)
      const currentUses = post.zapUsesCurrent;
      const maxUses = post.zapUses;
      
      if (index < maxUses) {
        // This is a hero zap (within target)
        heroZapsList.push(zap);
      } else {
        // This is an overflow zap (exceeds target)
        overflowZapsList.push(zap);
      }
    });

    setHeroZaps(heroZapsList);
    setOverflowZaps(overflowZapsList);
  }, [post.zaps, post.zapUsesCurrent, post.zapUses]);

  // Close zap menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (zapMenuRef.current && !zapMenuRef.current.contains(event.target as Node)) {
        setShowZapMenu(false);
      }
    };

    if (showZapMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showZapMenu]);

  return (
    <div className="paynote">
      <div className="noteProfileImg">
        <img
          className="userImg"
          src={profilePicture}
          alt="Profile"
        />
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
                  <span className="material-symbols-outlined">check_circle</span>
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

          <div className="noteDate label">
            {timeAgo(post.createdAt)}
          </div>
        </div>

        {/* Content */}
        <div 
          className="noteContent"
          dangerouslySetInnerHTML={{ __html: formatContent(post.event.content) }}
        />

        {/* Zap Values */}
        <div className="noteValues">
          <div className="zapMin">
            <span className="zapMinVal">{post.zapMin.toLocaleString()}</span>
            <span className="label">sats<br />{post.zapMin !== post.zapMax ? 'Min' : ''}</span>
          </div>
          
          {post.zapMin !== post.zapMax && (
            <div className="zapMax">
              <span className="zapMaxVal">{post.zapMax.toLocaleString()}</span>
              <span className="label">sats<br />Max</span>
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
            <span className="material-symbols-outlined">target</span>
            Payer: {post.zapPayer.substr(0, 8)}...{post.zapPayer.substr(-8)}
          </div>
        )}

        {/* LNURL Override */}
        {post.zapLNURL && (
          <div className="zapLNURL">
            <span className="material-symbols-outlined">double_arrow</span>
            Redirect to: <a href={post.zapLNURL} target="_blank" rel="noopener noreferrer">{post.zapLNURL}</a>
          </div>
        )}

        {/* Zap Slider for Range */}
        {post.zapMin !== post.zapMax && isPayable && (
          <div className="zapSliderContainer">
            <input
              type="range"
              className="zapSlider"
              min={post.zapMin}
              max={post.zapMax}
              value={zapAmount}
              onChange={(e) => handleZapSliderChange(parseInt(e.target.value))}
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
            console.log('Rendering hero zap:', { index, zapAmount: zap.zapAmount, zapPayerPicture: zap.zapPayerPicture, zapPayerNpub: zap.zapPayerNpub });
            return (
              <div key={index} className="zapReaction">
                <a 
                  href={`https://next.nostrudel.ninja/#/u/${zap.zapPayerNpub}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <img className="userImg" src={zap.zapPayerPicture} alt="Zap Payer" />
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
            className={`noteMainCTA cta ${!isPayable || !isLoggedIn ? 'disabled' : ''}`}
            onClick={() => isPayable && onPay(post, zapAmount)}
            disabled={!isPayable || !isLoggedIn}
          >
            Pay
          </button>
        </div>

        {/* Actions */}
        <div className="noteActionsReactions">
          <div className="noteZaps noteZapReactions">
            {overflowZaps.map((zap, index) => {
              console.log('Rendering overflow zap:', { index, zapAmount: zap.zapAmount, zapPayerPicture: zap.zapPayerPicture, zapPayerNpub: zap.zapPayerNpub });
              return (
                <div key={index} className="zapReaction">
                  <a 
                    href={`https://next.nostrudel.ninja/#/u/${zap.zapPayerNpub}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <img className="userImg" src={zap.zapPayerPicture} alt="Zap Payer" />
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
              className={isPayable ? "noteAction zapMenuAction" : "disabled"}
              onClick={(e) => {
                e.preventDefault();
                if (!isPayable) return;
                setShowZapMenu(!showZapMenu);
              }}
              style={{ position: 'relative' }}
            >
              <span className="material-symbols-outlined">bolt</span>
              {showZapMenu && (
                <div className="zapMenu" ref={zapMenuRef}>
                  <div className="zapMenuCustom">
                    <input 
                      type="number" 
                      placeholder="sats" 
                      min="1"
                      value={customZapAmount}
                      onChange={(e) => setCustomZapAmount(e.target.value)}
                    />
                    <button onClick={handleCustomZap}>Zap</button>
                    <button onClick={handleAnonZap}>anonZap</button>
                  </div>
                </div>
              )}
            </a>

            {/* Share */}
            <a 
              className="noteAction" 
              onClick={() => onShare(post)}
            >
              <span className="material-symbols-outlined">ios_share</span>
            </a>

            {/* More Menu */}
            <div className="noteAction dropdown">
              <button 
                className="dropbtn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    const dropdown = e.currentTarget.nextElementSibling;
                    if (dropdown) {
                      dropdown.classList.toggle("show");
                    }
                  }, 100);
                }}
              >
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
              
              <div className="dropdown-content">
                <a className="cta dropdown-element disabled">New Pay Forward</a>
                
                {isPayable && (
                  <a className={`cta dropdown-element ${!isPayable ? 'disabled' : ''}`}>
                    Pay Anonymously
                  </a>
                )}
                
                <div className="noteAction">
                  <a 
                    className="toolTipLink dropdown-element" 
                    href="#" 
                    onClick={(e) => {
                      e.preventDefault();
                      onViewRaw(post);
                    }}
                  >
                    View Raw
                  </a>
                </div>
                
                <div className="noteAction">
                  <a
                    href={`https://next.nostrudel.ninja/#/n/${post.id}`}
                    className="toolTipLink"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on nostrudel
                  </a>
                </div>
                
                <div className="noteAction">
                  <a
                    href={`/live?note=${post.id}`}
                    className="toolTipLink"
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
    </div>
  );
};
