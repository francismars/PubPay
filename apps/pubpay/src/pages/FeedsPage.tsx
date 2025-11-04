// FeedsPage component - handles all feed-related functionality
import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
// import { useUIStore } from '@pubpay/shared-services';
import { PayNoteComponent } from '../components/PayNoteComponent';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import { nip19 } from 'nostr-tools';

// FeedsPageProps intentionally omitted; consuming via Outlet context

export const FeedsPage: React.FC = () => {
  const location = useLocation();
  const {
    authState,
    nostrClient,
    handlePayWithExtension,
    handlePayAnonymously,
    handleSharePost,
    handlePostNote,
    handleNewPayNote,
    showNewPayNoteForm,
    handleCloseNewPayNoteForm,
    isPublishing,
    // Hook state via Layout context
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    replies,
    isLoadingMore,
    nostrReady,
    paymentErrors,
    handleFeedChange,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    clearPosts
  } = useOutletContext<{
    authState: {
      isLoggedIn: boolean;
      publicKey: string | null;
      privateKey: string | null;
      signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
      userProfile: any;
      displayName: string | null;
    };
    nostrClient: any;
    handlePayWithExtension: (post: PubPayPost, amount: number) => void;
    handlePayAnonymously: (post: PubPayPost, amount: number) => void;
    handleSharePost: (post: PubPayPost) => void;
    handlePostNote: (formData: Record<string, string>) => Promise<void>;
    handleNewPayNote: () => void;
    showNewPayNoteForm: boolean;
    handleCloseNewPayNoteForm: () => void;
    isPublishing: boolean;
    isLoading: boolean;
    activeFeed: 'global' | 'following';
    posts: PubPayPost[];
    followingPosts: PubPayPost[];
    replies: PubPayPost[];
    isLoadingMore: boolean;
    nostrReady: boolean;
    paymentErrors: Map<string, string>;
    handleFeedChange: (feed: 'global' | 'following') => void;
    loadMorePosts: () => Promise<void | unknown>;
    loadSingleNote: (eventId: string) => Promise<void>;
    loadReplies: (eventId: string) => Promise<void>;
    clearPosts: () => void;
  }>();
  const [showJSON, setShowJSON] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [singleNoteMode, setSingleNoteMode] = useState(false);
  const [singleNoteId, setSingleNoteId] = useState<string>('');

  // Track previous path to detect when exiting single note mode
  const prevPathRef = useRef(location.pathname);

  // Detect when exiting single note mode and clear posts to reload feed
  useEffect(() => {
    const wasInNoteMode = prevPathRef.current.startsWith('/note/');
    const isInNoteMode = location.pathname.startsWith('/note/');
    prevPathRef.current = location.pathname;

    if (wasInNoteMode && !isInNoteMode) {
      // Just exited single note mode - clear posts and let the hook reload the feed
      console.log('Exiting single note mode, clearing posts');
      clearPosts();
    }
  }, [location.pathname, clearPosts]);

  const handleViewRaw = (post: PubPayPost) => {
    setJsonContent(JSON.stringify(post.event, null, 2));
    setShowJSON(true);
  };

  // Handler for new pay note from side navigation
  const handleNewPayNoteFromNav = () => {
    if (authState.isLoggedIn) {
      // This will be handled by the parent component
      window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
    } else {
      handleNewPayNote();
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

  // Check for single note in URL path; wait for nostr client readiness
  useEffect(() => {
    const checkForSingleNote = () => {
      const pathname = window.location.pathname;
      console.log('Checking pathname:', pathname);
      if (!nostrReady) {
        console.log('nostr not ready yet, postponing single-note load');
        return;
      }

      // Check if pathname matches /note/:noteId pattern
      if (pathname.startsWith('/note/')) {
        // Extract the note identifier (everything after /note/)
        const identifier = pathname.substring(6);

        console.log('Note identifier:', identifier);
        // Check if it looks like a note identifier (starts with note1 or nevent1)
        if (
          identifier.startsWith('note1') ||
          identifier.startsWith('nevent1')
        ) {
          try {
            console.log('Decoding identifier:', identifier);
            // Decode the note
            const decoded = nip19.decode(identifier);
            console.log('Decoded:', decoded);
            if (decoded.type === 'note' || decoded.type === 'nevent') {
              let eventId: string;

              if (decoded.type === 'note') {
                eventId = decoded.data;
              } else {
                // For nevent, extract the id
                eventId = (decoded.data as any).id;
              }

              console.log('Event ID:', eventId);
              if (!/^[0-9a-f]{64}$/.test(eventId)) {
                console.error('Invalid event ID format.');
                return;
              }

              // Set single note mode immediately to prevent other loading
              console.log('Setting single note mode with ID:', eventId);
              setSingleNoteMode(true);
              setSingleNoteId(eventId);

              // Load the single note
              loadSingleNote(eventId);
            } else {
              console.log('Not a note or nevent type:', decoded.type);
            }
          } catch (error) {
            console.error('Failed to decode note:', error);
          }
        } else {
          console.log('Not a note identifier:', identifier);
          // Reset single note mode if we're not viewing a note
          setSingleNoteMode(false);
          setSingleNoteId('');
        }
      } else {
        console.log('Not on /note/ path, resetting single note mode');
        // Reset single note mode if we're not on a note page
        setSingleNoteMode(false);
        setSingleNoteId('');
      }
    };

    // Check immediately when ready or path changes
    checkForSingleNote();
  }, [location.pathname, nostrReady]); // Re-run when pathname changes or nostr becomes ready

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
        <a href="#" className="feedSelectorLink disabled" title="coming soon">
          High Rollers
        </a>
      </div>

      <div
        id="main"
        style={{
          display: activeFeed === 'global' ? 'block' : 'none'
        }}
      >
        {isLoading && posts.length === 0 ? (
          // Show dummy posts while loading
          <>
            {/* First dummy post - always show */}
            <div className="paynote blink">
              <div className="noteProfileImg">
                <img className="userImg" src={genericUserIcon} alt="Profile" />
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
                        <span className="material-symbols-outlined">bolt</span>
                        loading@example.com
                      </a>
                    </div>
                  </div>
                  <div className="noteDate label">Loading...</div>
                </div>
                <div className="noteContent disabled">Loading posts...</div>
                <div className="noteValues">
                  <div className="zapMinContainer">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMinLabel">Min</div>
                  </div>
                  <div className="zapMaxContainer">
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMaxLabel">Max</div>
                  </div>
                  <div className="zapUsesContainer">
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                    <div className="zapUsesLabel">Uses</div>
                  </div>
                </div>
                <div className="noteCTA">
                  <button className="noteMainCTA cta disabled">Pay</button>
                </div>
                <div className="noteActionsReactions">
                  <div className="noteZaps noteZapReactions"></div>
                  <div className="noteActions">
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">bolt</span>
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
                    <div className="noteContent disabled">Loading posts...</div>
                    <div className="noteValues">
                      <div className="zapMinContainer">
                        <div className="zapMin">
                          <span className="zapMinVal disabled">Loading...</span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMinLabel">Min</div>
                      </div>
                      <div className="zapMaxContainer">
                        <div className="zapMax">
                          <span className="zapMaxVal disabled">Loading...</span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMaxLabel">Max</div>
                      </div>
                      <div className="zapUsesContainer">
                        <div className="zapUses">
                          <span className="zapUsesCurrent disabled">0</span>
                          <span className="label">of</span>
                          <span className="zapUsesTotal disabled">5</span>
                        </div>
                        <div className="zapUsesLabel">Uses</div>
                      </div>
                    </div>
                    <div className="noteCTA">
                      <button className="noteMainCTA cta disabled">Pay</button>
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
                    <div className="noteContent disabled">Loading posts...</div>
                    <div className="noteValues">
                      <div className="zapMinContainer">
                        <div className="zapMin">
                          <span className="zapMinVal disabled">Loading...</span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMinLabel">Min</div>
                      </div>
                      <div className="zapMaxContainer">
                        <div className="zapMax">
                          <span className="zapMaxVal disabled">Loading...</span>
                          <span className="label">sats</span>
                        </div>
                        <div className="zapMaxLabel">Max</div>
                      </div>
                      <div className="zapUsesContainer">
                        <div className="zapUses">
                          <span className="zapUsesCurrent disabled">0</span>
                          <span className="label">of</span>
                          <span className="zapUsesTotal disabled">5</span>
                        </div>
                        <div className="zapUsesLabel">Uses</div>
                      </div>
                    </div>
                    <div className="noteCTA">
                      <button className="noteMainCTA cta disabled">Pay</button>
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
        ) : singleNoteMode && posts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: '#666'
            }}
          >
            Loading note...
          </div>
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
              onPay={handlePayWithExtension}
              onPayAnonymously={handlePayAnonymously}
              onShare={handleSharePost}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              nostrClient={nostrClient}
              nostrReady={nostrReady}
              paymentError={paymentErrors.get(post.id)}
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
            Posts loaded: {posts.length} | Scroll to load more (100px from
            bottom)
          </div>
        )}

        {/* Render replies when in single note mode */}
        {singleNoteMode &&
          replies.map((reply: PubPayPost) => (
            <PayNoteComponent
              key={reply.id}
              post={reply}
              onPay={handlePayWithExtension}
              onPayAnonymously={handlePayAnonymously}
              onShare={handleSharePost}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              isReply={true}
              nostrClient={nostrClient}
              nostrReady={nostrReady}
              paymentError={paymentErrors.get(reply.id)}
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
                <img className="userImg" src={genericUserIcon} alt="Profile" />
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
                        <span className="material-symbols-outlined">bolt</span>
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
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMinLabel">Min</div>
                  </div>
                  <div className="zapMaxContainer">
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats</span>
                    </div>
                    <div className="zapMaxLabel">Max</div>
                  </div>
                  <div className="zapUsesContainer">
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                    <div className="zapUsesLabel">Uses</div>
                  </div>
                </div>
                <div className="noteCTA">
                  <button className="noteMainCTA cta disabled">Pay</button>
                </div>
                <div className="noteActionsReactions">
                  <div className="noteZaps noteZapReactions"></div>
                  <div className="noteActions">
                    <a className="noteAction disabled">
                      <span className="material-symbols-outlined">bolt</span>
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
              onPay={handlePayWithExtension}
              onPayAnonymously={handlePayAnonymously}
              onShare={handleSharePost}
              onViewRaw={handleViewRaw}
              isLoggedIn={authState.isLoggedIn}
              nostrClient={nostrClient}
              nostrReady={nostrReady}
              paymentError={paymentErrors.get(post.id)}
            />
          ))
        )}
      </div>

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

      {/* Mobile Floating Action Button */}
      <button
        className="mobile-fab"
        onClick={() => {
          if (authState.isLoggedIn) {
            window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
          } else {
            handleNewPayNote();
          }
        }}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
};
