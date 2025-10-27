// FeedsPage component - handles all feed-related functionality
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '@pubpay/shared-services';
import { useHomeFunctionality } from '../hooks/useHomeFunctionality';
import { PayNoteComponent } from '../components/PayNoteComponent';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import * as NostrTools from 'nostr-tools';

interface FeedsPageProps {
  authState: {
    isLoggedIn: boolean;
    publicKey: string | null;
    privateKey: string | null;
    signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
    userProfile: any;
    displayName: string | null;
  };
  nostrClient: any;
  onPayWithExtension: (post: PubPayPost, amount: number) => void;
  onPayAnonymously: (post: PubPayPost, amount: number) => void;
  onShare: (post: PubPayPost) => void;
  onPostNote: (formData: Record<string, string>) => Promise<void>;
  onNewPayNote: () => void;
}

export const FeedsPage: React.FC<FeedsPageProps> = ({
  authState,
  nostrClient,
  onPayWithExtension,
  onPayAnonymously,
  onShare,
  onPostNote,
  onNewPayNote
}) => {
  const [showJSON, setShowJSON] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [showNewPayNoteForm, setShowNewPayNoteForm] = useState(false);
  const [paymentType, setPaymentType] = useState<'fixed' | 'range'>('fixed');
  const [isPublishing, setIsPublishing] = useState(false);
  const [singleNoteMode, setSingleNoteMode] = useState(false);
  const [singleNoteId, setSingleNoteId] = useState<string>('');

  const {
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    replies,
    isLoadingMore,
    handleFeedChange,
    handlePostNote,
    loadMorePosts,
    loadSingleNote,
    loadReplies
  } = useHomeFunctionality();

  // Handler functions
  const handleSharePost = async (post: PubPayPost) => {
    const noteID = post.id;
    const shareURL = `${window.location.origin}/?note=${noteID}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check out this PubPay!',
          text: "Here's a PubPay I want to share with you:",
          url: shareURL
        });
      } catch (error) {
        console.error('Error sharing the link:', error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareURL);
        alert('Link copied to clipboard!');
      } catch (error) {
        console.error('Failed to copy the link:', error);
      }
    }
  };

  const handleViewRaw = (post: PubPayPost) => {
    setJsonContent(JSON.stringify(post.event, null, 2));
    setShowJSON(true);
  };

  // Handler for new pay note from side navigation
  const handleNewPayNoteFromNav = () => {
    if (authState.isLoggedIn) {
      setShowNewPayNoteForm(true);
      setPaymentType('fixed');
    } else {
      onNewPayNote();
    }
  };

  const handlePostNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value.toString();
    }

    setIsPublishing(true);

    try {
      await onPostNote(data);

      // Close the form after successful submission
      setShowNewPayNoteForm(false);

      // Reset local UI state
      setPaymentType('fixed');
    } catch (error) {
      console.error('Failed to post note:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  // Infinite scroll handler with debouncing to prevent duplicate loads
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isLoading = false; // Local flag to prevent race conditions

    const handleScroll = () => {
      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Debounce scroll events
      timeoutId = setTimeout(() => {
        // Check if already loading to prevent race conditions
        if (isLoading || isLoadingMore || singleNoteMode) {
          return;
        }

        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.body.offsetHeight;
        const threshold = documentHeight - 100;

        if (scrollPosition >= threshold) {
          isLoading = true; // Set local flag
          loadMorePosts().finally(() => {
            isLoading = false; // Reset flag when done
          });
        }
      }, 150); // 150ms debounce
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoadingMore, singleNoteMode, posts.length]);

  // Listen for custom event from HomePage to open new pay note form
  useEffect(() => {
    const handleOpenNewPayNoteForm = () => {
      if (authState.isLoggedIn) {
        setShowNewPayNoteForm(true);
        setPaymentType('fixed');
      }
    };

    window.addEventListener('openNewPayNoteForm', handleOpenNewPayNoteForm);

    return () => {
      window.removeEventListener('openNewPayNoteForm', handleOpenNewPayNoteForm);
    };
  }, [authState.isLoggedIn]);

  // Check for single note URL parameter on load
  useEffect(() => {
    const checkForSingleNote = () => {
      const queryParams = new URLSearchParams(window.location.search);
      const queryNote = queryParams.get('note');

      if (queryNote) {
        try {
          // Decode the note parameter
          const decoded = NostrTools.nip19.decode(queryNote);
          if (decoded.type !== 'note') {
            console.error('Invalid type.');
            return;
          }
          if (!/^[0-9a-f]{64}$/.test(decoded.data)) {
            console.error('Invalid event ID format.');
            return;
          }

          // Set single note mode immediately to prevent other loading
          setSingleNoteMode(true);
          setSingleNoteId(decoded.data);

          // Load the single note
          loadSingleNote(decoded.data);
        } catch (error) {
          console.error('Failed to decode note parameter:', error);
        }
      }
    };

    // Check immediately on mount
    checkForSingleNote();

    // Wait for NostrTools to be available if not already
    if (typeof window !== 'undefined' && (window as any).NostrTools) {
      // Already checked above
    } else {
      // Retry when NostrTools becomes available
      const retryInterval = setInterval(() => {
        if (typeof window !== 'undefined' && (window as any).NostrTools) {
          checkForSingleNote();
          clearInterval(retryInterval);
        }
      }, 1000);

      // Cleanup interval after 30 seconds
      setTimeout(() => clearInterval(retryInterval), 30000);
    }
  }, []);

  return (
    <div id="feeds">
      <div
        id="feedSelector"
        style={singleNoteMode ? { display: 'none' } : undefined}
      >
        <a
          href="#"
          id="feedGlobal"
          className={`feedSelectorLink ${activeFeed === 'global' ? 'active' : ''}`}
          onClick={() => handleFeedChange('global')}
        >
          Global
        </a>
        <a
          href="#"
          id="feedFollowing"
          className={`feedSelectorLink ${activeFeed === 'following' ? 'active' : ''}`}
          onClick={() => handleFeedChange('following')}
        >
          Following
        </a>
        <a
          href="#"
          className="feedSelectorLink disabled"
          title="coming soon"
        >
          High Rollers
        </a>
      </div>

      <div id="main">
        {isLoading && posts.length === 0 ? (
          // Show dummy posts while loading
          <>
            {/* First dummy post - always show */}
            <div className="paynote blink">
              <div className="noteProfileImg">
                <img
                  className="userImg"
                  src={genericUserIcon}
                  alt="Profile"
                />
              </div>
              <div className="noteData">
                <div className="noteHeader">
                  <div className="noteAuthor">
                    <div className="noteDisplayName">
                      <a
                        href="#"
                        className="noteAuthorLink disabled"
                        target="_blank"
                      >
                        Loading...
                      </a>
                    </div>
                    <div className="noteNIP05 label">
                      <a href="#" target="_blank">
                        <span className="material-symbols-outlined">
                          check_circle
                        </span>
                        loading@example.com
                      </a>
                    </div>
                    <div className="noteLNAddress label">
                      <a href="#" target="_blank">
                        <span className="material-symbols-outlined">
                          bolt
                        </span>
                        loading@example.com
                      </a>
                    </div>
                  </div>
                  <div className="noteDate label">Loading...</div>
                </div>
                <div className="noteContent disabled">
                  Loading posts...
                </div>
                <div className="noteValues">
                  <div className="zapMinContainer">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">
                        Loading...
                      </span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMinLabel">Min</div>
                  </div>
                  <div className="zapMaxContainer">
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">
                        Loading...
                      </span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMaxLabel">Max</div>
                  </div>
                  <div className="zapUsesContainer">
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">
                        0
                      </span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                    <div className="zapUsesLabel">Uses</div>
                  </div>
                </div>
                <div className="noteCTA">
                  <button className="noteMainCTA cta disabled">
                    Pay
                  </button>
                </div>
                <div className="noteActionsReactions">
                  <div className="noteZaps noteZapReactions"></div>
                  <div className="noteActions">
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        bolt
                      </span>
                    </a>
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        favorite
                      </span>
                    </a>
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        ios_share
                      </span>
                    </a>
                    <button className="noteAction dropdown disabled">
                      <span className="material-symbols-outlined disabled">
                        more_horiz
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Close conditional rendering for normal mode dummy posts */}
            {!singleNoteMode && (
              <>
                <div className="paynote blink">
                  <div className="noteProfileImg">
                    <img
                      className="userImg"
                      src={genericUserIcon}
                      alt="Profile"
                    />
                  </div>
                  <div className="noteData">
                    <div className="noteHeader">
                      <div className="noteAuthor">
                        <div className="noteDisplayName">
                          <a
                            href="#"
                            className="noteAuthorLink disabled"
                            target="_blank"
                          >
                            Loading...
                          </a>
                        </div>
                        <div className="noteNIP05 label">
                          <a href="#" target="_blank">
                            <span className="material-symbols-outlined">
                              check_circle
                            </span>
                            loading@example.com
                          </a>
                        </div>
                        <div className="noteLNAddress label">
                          <a href="#" target="_blank">
                            <span className="material-symbols-outlined">
                              bolt
                            </span>
                            loading@example.com
                          </a>
                        </div>
                      </div>
                      <div className="noteDate label">Loading...</div>
                    </div>
                    <div className="noteContent disabled">
                      Loading posts...
                    </div>
                    <div className="noteValues">
                      <div className="zapMinContainer">
                        <div className="zapMin">
                          <span className="zapMinVal disabled">
                            Loading...
                          </span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMinLabel">Min</div>
                      </div>
                      <div className="zapMaxContainer">
                        <div className="zapMax">
                          <span className="zapMaxVal disabled">
                            Loading...
                          </span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMaxLabel">Max</div>
                      </div>
                      <div className="zapUsesContainer">
                        <div className="zapUses">
                          <span className="zapUsesCurrent disabled">
                            0
                          </span>
                          <span className="label">of</span>
                          <span className="zapUsesTotal disabled">
                            5
                          </span>
                        </div>
                        <div className="zapUsesLabel">Uses</div>
                      </div>
                    </div>
                    <div className="noteCTA">
                      <button className="noteMainCTA cta disabled">
                        Pay
                      </button>
                    </div>
                    <div className="noteActionsReactions">
                      <div className="noteZaps noteZapReactions"></div>
                      <div className="noteActions">
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            bolt
                          </span>
                        </a>
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            favorite
                          </span>
                        </a>
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            ios_share
                          </span>
                        </a>
                        <button className="noteAction dropdown disabled">
                          <span className="material-symbols-outlined disabled">
                            more_horiz
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="paynote blink">
                  <div className="noteProfileImg">
                    <img
                      className="userImg"
                      src={genericUserIcon}
                      alt="Profile"
                    />
                  </div>
                  <div className="noteData">
                    <div className="noteHeader">
                      <div className="noteAuthor">
                        <div className="noteDisplayName">
                          <a
                            href="#"
                            className="noteAuthorLink disabled"
                            target="_blank"
                          >
                            Loading...
                          </a>
                        </div>
                        <div className="noteNIP05 label">
                          <a href="#" target="_blank">
                            <span className="material-symbols-outlined">
                              check_circle
                            </span>
                            loading@example.com
                          </a>
                        </div>
                        <div className="noteLNAddress label">
                          <a href="#" target="_blank">
                            <span className="material-symbols-outlined">
                              bolt
                            </span>
                            loading@example.com
                          </a>
                        </div>
                      </div>
                      <div className="noteDate label">Loading...</div>
                    </div>
                    <div className="noteContent disabled">
                      Loading posts...
                    </div>
                    <div className="noteValues">
                      <div className="zapMinContainer">
                        <div className="zapMin">
                          <span className="zapMinVal disabled">
                            Loading...
                          </span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMinLabel">Min</div>
                      </div>
                      <div className="zapMaxContainer">
                        <div className="zapMax">
                          <span className="zapMaxVal disabled">
                            Loading...
                          </span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMaxLabel">Max</div>
                      </div>
                      <div className="zapUsesContainer">
                        <div className="zapUses">
                          <span className="zapUsesCurrent disabled">
                            0
                          </span>
                          <span className="label">of</span>
                          <span className="zapUsesTotal disabled">
                            5
                          </span>
                        </div>
                        <div className="zapUsesLabel">Uses</div>
                      </div>
                    </div>
                    <div className="noteCTA">
                      <button className="noteMainCTA cta disabled">
                        Pay
                      </button>
                    </div>
                    <div className="noteActionsReactions">
                      <div className="noteZaps noteZapReactions"></div>
                      <div className="noteActions">
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            bolt
                          </span>
                        </a>
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            favorite
                          </span>
                        </a>
                        <a className="noteAction disabled">
                          <span className="material-symbols-outlined">
                            ios_share
                          </span>
                        </a>
                        <button className="noteAction dropdown disabled">
                          <span className="material-symbols-outlined disabled">
                            more_horiz
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : posts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#666'
            }}
          >
            No posts found
          </div>
        ) : (
          posts.map((post: PubPayPost) => (
            <PayNoteComponent
              key={post.id}
              post={post}
              onPay={onPayWithExtension}
              onPayAnonymously={onPayAnonymously}
              onShare={onShare}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              nostrClient={nostrClient}
            />
          ))
        )}

        {isLoadingMore && (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: '#666'
            }}
          >
            Loading more posts...
          </div>
        )}

        {/* Debug info for infinite scroll */}
        {!singleNoteMode && posts.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '10px',
              fontSize: '12px',
              color: '#999',
              borderTop: '1px solid #eee',
              marginTop: '20px'
            }}
          >
            Posts loaded: {posts.length} | Scroll to load more (100px
            from bottom)
          </div>
        )}

        {/* Render replies when in single note mode (match legacy wrapper and disabled Pay) */}
        {singleNoteMode &&
          replies.map((reply: PubPayPost) => (
            <PayNoteComponent
              key={reply.id}
              post={reply}
              onPay={onPayWithExtension}
              onPayAnonymously={onPayAnonymously}
              onShare={onShare}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              isReply={true}
              nostrClient={nostrClient}
            />
          ))}
      </div>

      <div
        id="following"
        style={{
          display: activeFeed === 'following' ? 'block' : 'none'
        }}
      >
        {isLoading && followingPosts.length === 0 ? (
          // Show dummy posts while loading following
          <>
            <div className="paynote blink">
              <div className="noteProfileImg">
                <img
                  className="userImg"
                  src={genericUserIcon}
                  alt="Profile"
                />
              </div>
              <div className="noteData">
                <div className="noteHeader">
                  <div className="noteAuthor">
                    <div className="noteDisplayName">
                      <a
                        href="#"
                        className="noteAuthorLink disabled"
                        target="_blank"
                      >
                        Loading...
                      </a>
                    </div>
                    <div className="noteNIP05 label">
                      <a href="#" target="_blank">
                        <span className="material-symbols-outlined">
                          check_circle
                        </span>
                        loading@example.com
                      </a>
                    </div>
                    <div className="noteLNAddress label">
                      <a href="#" target="_blank">
                        <span className="material-symbols-outlined">
                          bolt
                        </span>
                        loading@example.com
                      </a>
                    </div>
                  </div>
                  <div className="noteDate label">Loading...</div>
                </div>
                <div className="noteContent disabled">
                  Loading following posts...
                </div>
                <div className="noteValues">
                  <div className="zapMinContainer">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">
                        Loading...
                      </span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMinLabel">Min</div>
                  </div>
                  <div className="zapMaxContainer">
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">
                        Loading...
                      </span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMaxLabel">Max</div>
                  </div>
                  <div className="zapUsesContainer">
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">
                        0
                      </span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                    <div className="zapUsesLabel">Uses</div>
                  </div>
                </div>
                <div className="noteCTA">
                  <button className="noteMainCTA cta disabled">
                    Pay
                  </button>
                </div>
                <div className="noteActionsReactions">
                  <div className="noteZaps noteZapReactions"></div>
                  <div className="noteActions">
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        bolt
                      </span>
                    </a>
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        favorite
                      </span>
                    </a>
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">
                        ios_share
                      </span>
                    </a>
                    <button className="noteAction dropdown disabled">
                      <span className="material-symbols-outlined disabled">
                        more_horiz
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : followingPosts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#666'
            }}
          >
            No following posts found
          </div>
        ) : (
          followingPosts.map((post: PubPayPost) => (
            <PayNoteComponent
              key={post.id}
              post={post}
              onPay={onPayWithExtension}
              onPayAnonymously={onPayAnonymously}
              onShare={onShare}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              nostrClient={nostrClient}
            />
          ))
        )}
      </div>

      {/* JSON Viewer Overlay */}
      <div
        className="overlayContainer"
        id="viewJSON"
        style={{ display: showJSON ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
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

      {/* New Pay Note Form Overlay */}
      <div
        className="overlayContainer"
        id="newPayNoteForm"
        style={{ display: showNewPayNoteForm ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span style={{ color: '#cecece' }}>PAY</span>
            <span style={{ color: '#00000014' }}>.me</span>
          </div>
          <form id="newKind1" onSubmit={handlePostNoteSubmit}>
            <div className="formField">
              <label htmlFor="payNoteContent" className="label">
                Your Payment Request
              </label>
              <textarea
                id="payNoteContent"
                name="payNoteContent"
                rows={4}
                placeholder="Payment Request Description"
              ></textarea>
            </div>

            <fieldset className="formField formSelector">
              <legend className="uppercase">Select type</legend>
              <div>
                <input
                  type="radio"
                  id="fixedFlow"
                  name="paymentType"
                  value="fixed"
                  checked={paymentType === 'fixed'}
                  onChange={e => {
                    if (e.target.checked) setPaymentType('fixed');
                  }}
                />
                <label htmlFor="fixedFlow">Fixed</label>
              </div>
              <div>
                <input
                  type="radio"
                  id="rangeFlow"
                  name="paymentType"
                  value="range"
                  checked={paymentType === 'range'}
                  onChange={e => {
                    if (e.target.checked) setPaymentType('range');
                  }}
                />
                <label htmlFor="rangeFlow">Range</label>
              </div>
              <div className="disabled">
                <input
                  type="radio"
                  id="targetFlow"
                  name="paymentType"
                  value="target"
                  disabled
                />
                <label htmlFor="targetFlow">Target</label>
              </div>
            </fieldset>

            <div
              className="formFieldGroup"
              id="fixedInterface"
              style={{ display: paymentType === 'fixed' ? 'block' : 'none' }}
            >
              <div className="formField">
                <label htmlFor="zapFixed" className="label">
                  Fixed Amount*{' '}
                  <span className="tagName">zap-min = zap-max</span>
                </label>
                <input
                  type="number"
                  min={1}
                  id="zapFixed"
                  placeholder="1"
                  name="zapFixed"
                  required={paymentType === 'fixed'}
                />
              </div>
            </div>

            <div
              className="formFieldGroup"
              id="rangeInterface"
              style={{ display: paymentType === 'range' ? 'flex' : 'none' }}
            >
              <div className="formField">
                <label htmlFor="zapMin" className="label">
                  Minimum* <span className="tagName">zap-min</span>
                </label>
                <input
                  type="number"
                  min={1}
                  id="zapMin"
                  placeholder="1"
                  name="zapMin"
                  required={paymentType === 'range'}
                />
              </div>
              <div className="formField">
                <label htmlFor="zapMax" className="label">
                  Maximum* <span className="tagName">zap-max</span>
                </label>
                <input
                  type="number"
                  min={1}
                  id="zapMax"
                  placeholder="1000000000"
                  name="zapMax"
                  required={paymentType === 'range'}
                />
              </div>
            </div>

            <details className="formField">
              <summary className="legend summaryOptions">
                Advanced Options
              </summary>

              <div className="formFieldGroup">
                <div className="formField">
                  <label htmlFor="zapUses" className="label">
                    Uses <span className="tagName">zap-uses</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    id="zapUses"
                    placeholder="1"
                    name="zapUses"
                  />
                </div>
                <div className="formField disabled">
                  <label htmlFor="zapIncrement" className="label">
                    Increment <span className="tagName"></span>
                  </label>
                  <input
                    type="text"
                    id="zapIncrement"
                    placeholder="0"
                    name="zapIncrement"
                    disabled
                  />
                </div>
              </div>

              <div className="formField">
                <label htmlFor="zapPayer" className="label">
                  Payer <span className="tagName">zap-payer</span>
                </label>
                <input
                  type="text"
                  id="zapPayer"
                  placeholder="npub1..."
                  name="zapPayer"
                />
              </div>

              <div className="formField">
                <label htmlFor="overrideLNURL" className="label">
                  Override receiving address
                  <span className="tagName"> zap-lnurl</span>
                </label>
                <input
                  type="email"
                  id="overrideLNURL"
                  placeholder="address@lnprovider.net"
                  name="overrideLNURL"
                />
              </div>

              <div className="formField disabled">
                <label htmlFor="redirectToNote" className="label">
                  Redirect payment to note{' '}
                  <span className="tagName">zap-redirect</span>{' '}
                </label>
                <input
                  type="text"
                  id="redirectToNote"
                  placeholder="note1..."
                  name="redirectToNote"
                  disabled
                />
              </div>
            </details>
            <button type="submit" id="postNote" className="cta">
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          </form>
          <a
            id="cancelNewNote"
            href="#"
            className="label"
            onClick={() => setShowNewPayNoteForm(false)}
          >
            cancel
          </a>
        </div>
      </div>

      {/* Mobile Floating Action Button */}
      <button
        className="mobile-fab"
        onClick={() => {
          if (authState.isLoggedIn) {
            setShowNewPayNoteForm(true);
            setPaymentType('fixed');
          } else {
            onNewPayNote();
          }
        }}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
};
