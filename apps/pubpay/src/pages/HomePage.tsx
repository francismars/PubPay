// Home page component - matches original index.html design exactly
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '@pubpay/shared-services';
import { useHomeFunctionality } from '../hooks/useHomeFunctionality';
import { PayNoteComponent } from '../components/PayNoteComponent';
import { InvoiceQR } from '@pubpay/shared-ui';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import * as NostrTools from 'nostr-tools';
import AboutPage from './AboutPage';
import ProfilePage from './ProfilePage';

export const HomePage: React.FC = () => {
  const [showQRScanner, setShowQRScanner] = useState(false);
  const showLoginForm = useUIStore(s => s.loginForm.show);
  const [showLoggedInForm, setShowLoggedInForm] = useState(false);
  const showInvoiceOverlay = useUIStore(s => s.invoiceOverlay.show);
  const openInvoice = useUIStore(s => s.openInvoice);
  const closeInvoice = useUIStore(s => s.closeInvoice);
  const openLogin = useUIStore(s => s.openLogin);
  const closeLogin = useUIStore(s => s.closeLogin);
  const [showJSON, setShowJSON] = useState(false);
  const [currentPage, setCurrentPage] = useState<'home' | 'about' | 'profile'>('home');
  const [jsonContent, setJsonContent] = useState('');
  const [showNewPayNoteForm, setShowNewPayNoteForm] = useState(false);
  const [paymentType, setPaymentType] = useState<'fixed' | 'range'>('fixed');
  const [showNsecGroup, setShowNsecGroup] = useState(false);
  const [nsecInput, setNsecInput] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [qrScanner, setQrScanner] = useState<any>(null);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [extensionAvailable, setExtensionAvailable] = useState(true);
  const [externalSignerAvailable, setExternalSignerAvailable] = useState(true);
  const [externalSignerLoading, setExternalSignerLoading] = useState(false);
  // Invoice state now read from UI store
  const [singleNoteMode, setSingleNoteMode] = useState(false);
  const [singleNoteId, setSingleNoteId] = useState<string>('');

  const qrReaderRef = useRef<HTMLDivElement>(null);
  const isStoppingScannerRef = useRef(false);

  const {
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    replies,
    isLoadingMore,
    authState,
    nostrClient,
    handleFeedChange,
    handleQRScanner,
    handleLogin,
    handleNewPayNote,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleSignInNsec,
    handleContinueWithNsec,
    handleLogout,
    handlePayWithExtension,
    handlePayAnonymously,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts,
    loadSingleNote,
    loadReplies
  } = useHomeFunctionality();

  // Navigation handler
  const handleNavigation = (page: 'home' | 'about' | 'profile') => {
    setCurrentPage(page);
  };

  // Reset login form to main state
  const resetLoginForm = () => {
    setShowNsecGroup(false);
    setNsecInput('');
  };

  // Invoice QR is rendered by <InvoiceQR />

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

  const handleQRScannerOpen = () => {
    setShowQRScanner(true);
  };

  const handleScannedContent = async (decodedText: string) => {
    try {
      const regex =
        /(note1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|nevent1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/i;
      const match = decodedText.match(regex);
      if (!match) return;

      decodedText = match[0];

      const decoded = NostrTools.nip19.decode(decodedText);

      if (decoded.type === 'note') {
        window.location.href = `/?note=${decodedText}`;
      } else if (decoded.type === 'nevent') {
        const noteID = decoded.data.id;
        const note1 = NostrTools.nip19.noteEncode(noteID);
        window.location.href = `/?note=${note1}`;
      } else {
        console.error("Invalid QR code content. Expected 'note' or 'nevent'.");
      }
    } catch (error) {
      console.error('Failed to decode QR code content:', error);
    }
  };

  const handleLoginOpen = () => {
    if (authState.isLoggedIn) {
      setShowLoggedInForm(true);
    } else {
      resetLoginForm();
      openLogin();
    }
  };

  const handleNsecContinue = () => {
    if (nsecInput.trim()) {
      handleContinueWithNsec(nsecInput, rememberMe);
      setNsecInput('');
      closeLogin();
    }
  };

  const [isPublishing, setIsPublishing] = useState(false);
  const handlePostNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value.toString();
    }

    setIsPublishing(true);

    try {
      await handlePostNote(data);

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

  // Helper function to safely stop the QR scanner
  const safelyStopScanner = useCallback(async () => {
    // Prevent multiple simultaneous stop attempts
    if (isStoppingScannerRef.current) {
      return;
    }
    
    if (!qrScanner || !isScannerRunning) {
      // Scanner not running, just clear state
      setQrScanner(null);
      setIsScannerRunning(false);
      return;
    }

    isStoppingScannerRef.current = true;
    
    try {
      await qrScanner.stop();
      setIsScannerRunning(false);
      setQrScanner(null);
    } catch (error) {
      // Ignore errors - scanner might already be stopped or in transition
      console.log('Scanner stop attempted (already stopped or in transition):', error);
      setIsScannerRunning(false);
      setQrScanner(null);
    } finally {
      isStoppingScannerRef.current = false;
    }
  }, [qrScanner, isScannerRunning]);

  // Initialize button states on mount
  useEffect(() => {
    setExtensionAvailable(true);
    setExternalSignerAvailable(true);
  }, []);

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
  }, [isLoadingMore, singleNoteMode, posts.length]); // Removed loadMorePosts from deps

  // Handle return from external signer
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Wait for page to have focus
        while (!document.hasFocus()) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const signInData = JSON.parse(
          sessionStorage.getItem('signIn') || 'null'
        );
        if (signInData && signInData.rememberMe !== undefined) {
          sessionStorage.removeItem('signIn');

          try {
            // Get the public key from clipboard (external signer puts it there)
            const npub = await navigator.clipboard.readText();
            const decodedNPUB = window.NostrTools.nip19.decode(npub);
            const pubKey = decodedNPUB.data;

            // Store authentication data
            if (signInData.rememberMe === true) {
              localStorage.setItem('publicKey', pubKey);
              localStorage.setItem('signInMethod', 'externalSigner');
            } else {
              sessionStorage.setItem('publicKey', pubKey);
              sessionStorage.setItem('signInMethod', 'externalSigner');
            }

            // Reset button state
            setExternalSignerLoading(false);
            setExternalSignerAvailable(true);

            // Close login form
            closeLogin();

            // Reload the page to trigger authentication
            window.location.reload();
          } catch (error) {
            console.error('Failed to process external signer return:', error);
            setExternalSignerLoading(false);
            setExternalSignerAvailable(false);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize QR scanner when overlay opens
  useEffect(() => {
    if (
      showQRScanner &&
      !qrScanner &&
      typeof window !== 'undefined' &&
      (window as any).Html5Qrcode
    ) {
      // Add a small delay to ensure DOM element is ready
      setTimeout(() => {
        const readerElement = document.getElementById('reader');
        if (readerElement) {
          const html5QrCode = new (window as any).Html5Qrcode('reader');

          // Start the scanner FIRST, then store it in state
          html5QrCode
            .start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: { width: 250, height: 250 }
              },
              async (decodedText: string) => {
                console.log('QR Code scanned:', decodedText);
                setIsScannerRunning(false);
                setShowQRScanner(false);
                // Don't await stop - just try to stop in background
                html5QrCode.stop().catch(() => {
                  // Ignore errors when stopping after scan
                });
                await handleScannedContent(decodedText);
              },
              (errorMessage: string) => {
                console.error('QR Code scanning error:', errorMessage);
              }
            )
            .then(() => {
              // Only set qrScanner and isScannerRunning AFTER scanner successfully starts
              setQrScanner(html5QrCode);
              setIsScannerRunning(true);
              isStoppingScannerRef.current = false; // Reset ref when scanner starts
            })
            .catch((error: any) => {
              console.error('Failed to start QR scanner:', error);
              setIsScannerRunning(false);
              isStoppingScannerRef.current = false; // Reset ref if starting fails
            });
        }
      }, 100);
    }
  }, [showQRScanner]);

  // Cleanup QR scanner when overlay closes
  useEffect(() => {
    // Only stop scanner when overlay is closed AND scanner is running
    if (!showQRScanner && qrScanner && isScannerRunning) {
      safelyStopScanner();
    }
  }, [showQRScanner, qrScanner, isScannerRunning, safelyStopScanner]);

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScanner) {
        // Use the safe stop function but don't await it
        safelyStopScanner().catch(() => {
          // Ignore any errors during cleanup
        });
      }
    };
  }, [qrScanner, safelyStopScanner]);

  // No CustomEvent listener needed; login opens via store

  return (
    <div>
      <div id="nav">
        <div id="navInner">
          <div className="navLeft">
            <button className="hamburger" onClick={() => {
              const sideNav = document.getElementById('sideNav');
              const hamburger = document.querySelector('.hamburger');
              if (sideNav && hamburger) {
                sideNav.classList.toggle('open');
                hamburger.classList.toggle('open');
              }
            }}>
              <span></span>
              <span></span>
              <span></span>
            </button>
            <a id="logo" href="/">
              PUB<span style={{ color: '#000' }}>PAY</span>
              <span style={{ color: '#0000001c' }}>.me</span>
              <span className="version">alpha 0.02</span>
            </a>
          </div>
          <div id="navActions">
            <a
              id="scanQrCode"
              className="topAction"
              title="Scan QR Code"
              onClick={handleQRScannerOpen}
            >
              <span className="material-symbols-outlined">photo_camera</span>
            </a>
            <a
              id="settings"
              href="#"
              style={{ display: 'none' }}
              className="topAction disabled"
              title="coming soon"
            >
              <span className="material-symbols-outlined">settings</span>
            </a>
            <a
              id="login"
              href="#"
              className="topAction"
              onClick={handleLoginOpen}
            >
              {authState.isLoggedIn && authState.userProfile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img
                    className="userImg currentUserImg"
                    src={
                      (() => {
                        try {
                          return JSON.parse(authState.userProfile.content || '{}')
                            .picture;
                        } catch {
                          return undefined;
                        }
                      })() || genericUserIcon
                    }
                    alt="Profile"
                  />
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
                    {authState.displayName || 
                     (typeof window !== 'undefined' && (window as any).NostrTools
                       ? (window as any).NostrTools.nip19.npubEncode(authState.publicKey).substring(0, 12) + '...'
                       : authState.publicKey?.substring(0, 12) + '...')}
                  </span>
                </div>
              ) : (
                <span className="material-symbols-outlined">
                  account_circle
                </span>
              )}
            </a>
          </div>
        </div>
      </div>

      <div id="container">
        <div id="containerInner">
          <div id="sideNav">
            <div id="navInner">
              <a href="#" className="sideNavLink" title="Home Feed" onClick={(e) => { e.preventDefault(); handleNavigation('home'); }}>Home</a>
              <a href="#" className="sideNavLink" title="Your PubPay Profile" onClick={(e) => { e.preventDefault(); handleNavigation('profile'); }}>Profile</a>
              <a href="/splits" className="sideNavLink disabled" title="coming soon">Splits</a>
              <a href="/notifications" className="sideNavLink disabled" title="coming soon">Notifications</a>
              <a href="/settings" className="sideNavLink disabled" title="coming soon">Settings</a>
              <a href="/live" className="sideNavLink " title="PubPay Live">Live</a>
              <a href="#" className="sideNavLink" title="About PubPay" onClick={(e) => { e.preventDefault(); handleNavigation('about'); }}>About</a>
              <a
                id="newPayNote"
                className="sideNavLink cta"
                href="#"
                onClick={() => {
                  if (authState.isLoggedIn) {
                    setShowNewPayNoteForm(true);
                    setPaymentType('fixed');
                  } else {
                    handleNewPayNote();
                  }
                }}
              >
                New Paynote
              </a>
            </div>
          </div>
          <div id="mainContent">
            {currentPage === 'home' && (
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
                              <span className="zapUsesCurrent disabled">0</span>
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
                              <span className="zapUsesCurrent disabled">0</span>
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
                )}
              </>
            ) : posts.length === 0 ? (
              <div
                style={{ textAlign: 'center', padding: '40px', color: '#666' }}
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
                />
              ))
            )}

            {isLoadingMore && (
              <div
                style={{ textAlign: 'center', padding: '20px', color: '#666' }}
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

            {/* Render replies when in single note mode (match legacy wrapper and disabled Pay) */}
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
                />
              ))}
          </div>
          
          <div
            id="following"
            style={{ display: activeFeed === 'following' ? 'block' : 'none' }}
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
                style={{ textAlign: 'center', padding: '40px', color: '#666' }}
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
                />
              ))
            )}
              </div>
            </div>
            )}

            {/* About Page */}
            {currentPage === 'about' && (
              <AboutPage />
            )}

            {/* Profile Page */}
            {currentPage === 'profile' && (
              <ProfilePage authState={authState} />
            )}

          </div>
        </div>
      </div>

      {/* QR Scanner Overlay */}
      <div
        className="overlayContainer"
        id="qrScanner"
        style={{ display: showQRScanner ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span style={{ color: '#cecece' }}>PAY</span>
            <span style={{ color: '#00000014' }}>.me</span>
          </div>
          <p className="label" id="titleScanner">
            Scan note1 or nevent1 QR code
          </p>
          <div id="reader"></div>
          <a
            id="stopScanner"
            href="#"
            className="label"
            onClick={() => {
              // Just close the overlay - useEffect will handle stopping scanner
              setShowQRScanner(false);
            }}
          >
            cancel
          </a>
        </div>
      </div>

      {/* Login Form Overlay */}
      <div
        className="overlayContainer"
        id="loginForm"
        style={{ display: showLoginForm ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span style={{ color: '#cecece' }}>PAY</span>
            <span style={{ color: '#00000014' }}>.me</span>
          </div>
          <p className="label" id="titleSignin">
            Choose Sign-in Method
          </p>
          <div className="formFieldGroup" id="loginFormGroup">
            <a
              href="#"
              id="signInExtension"
              className={`cta ${!extensionAvailable ? 'disabled red' : ''}`}
              onClick={async e => {
                if (!extensionAvailable) {
                  e.preventDefault();
                  return;
                }
                try {
                  const result = await handleSignInExtension(rememberMe);
                  // Only close the form if sign in was successful
                  if (result && result.success) {
                    closeLogin();
                  } else {
                    // If extension is not available, disable the button
                    setExtensionAvailable(false);
                  }
                } catch (error) {
                  console.error('Extension sign in failed:', error);
                  setExtensionAvailable(false);
                }
              }}
            >
              {!extensionAvailable ? 'Not found' : 'Extension'}
            </a>
            <a
              href="#"
              id="signInexternalSigner"
              className={`cta ${!externalSignerAvailable ? 'disabled red' : ''}`}
              onClick={async e => {
                if (!externalSignerAvailable || externalSignerLoading) {
                  e.preventDefault();
                  return;
                }
                try {
                  setExternalSignerLoading(true);
                  const result = await handleSignInExternalSigner(rememberMe);
                  // Only close the form if sign in was successful
                  if (result && result.success) {
                    closeLogin();
                  } else {
                    // If external signer failed, disable the button
                    setExternalSignerAvailable(false);
                    setExternalSignerLoading(false);
                  }
                } catch (error) {
                  console.error('External signer failed:', error);
                  setExternalSignerAvailable(false);
                  setExternalSignerLoading(false);
                }
              }}
            >
              {!externalSignerAvailable
                ? 'Not found'
                : externalSignerLoading
                  ? 'Loading...'
                  : 'Signer'}
            </a>
            <a
              href="#"
              id="signInNsec"
              className="cta"
              onClick={() => {
                setShowNsecGroup(true);
              }}
            >
              NSEC
            </a>
          </div>
          <div
            id="nsecInputGroup"
            style={{ display: showNsecGroup ? 'block' : 'none' }}
          >
            <form
              onSubmit={e => {
                e.preventDefault();
                handleNsecContinue();
              }}
            >
              <input
                type="text"
                name="username"
                autoComplete="username"
                style={{ display: 'none' }}
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                type="password"
                id="nsecInput"
                placeholder="Enter your nsec"
                className="inputField"
                value={nsecInput}
                onChange={e => setNsecInput(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                id="continueWithNsec"
                className="cta"
                type="submit"
                onClick={async () => {
                  await handleContinueWithNsec(nsecInput, rememberMe);
                  closeLogin();
                }}
              >
                Continue
              </button>
            </form>
          </div>
          <div className="rememberPK">
            <label htmlFor="rememberMe" className="label">
              Remember
            </label>
            <input
              type="checkbox"
              className="checkBoxRemember"
              id="rememberMe"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
            />
          </div>
          <a
            id="cancelLogin"
            href="#"
            className="label"
            onClick={() => {
              resetLoginForm();
              closeLogin();
            }}
          >
            cancel
          </a>
        </div>
      </div>

      {/* Logged In Form Overlay */}
      <div
        className="overlayContainer"
        id="loggedInForm"
        style={{ display: showLoggedInForm ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span style={{ color: '#cecece' }}>PAY</span>
            <span style={{ color: '#00000014' }}>.me</span>
          </div>
          <p className="label">You are logged in as:</p>
          <p id="loggedInPublicKey">
            {authState.publicKey ? (
              <a
                href={`https://next.nostrudel.ninja/#/u/${
                  typeof window !== 'undefined' && (window as any).NostrTools
                    ? (window as any).NostrTools.nip19.npubEncode(
                        authState.publicKey
                      )
                    : authState.publicKey
                }`}
                className="userMention"
                target="_blank"
                rel="noopener noreferrer"
              >
                {authState.displayName ||
                  (typeof window !== 'undefined' && (window as any).NostrTools
                    ? (window as any).NostrTools.nip19.npubEncode(
                        authState.publicKey
                      )
                    : authState.publicKey)}
              </a>
            ) : (
              'Unknown'
            )}
          </p>
          <p className="label">Sign-in Method:</p>
          <span id="loggedInMethod">{authState.signInMethod || 'Unknown'}</span>
          <a href="" id="logoutButton" className="cta" onClick={handleLogout}>
            Logout
          </a>
          <a
            id="cancelLoggedin"
            href="#"
            className="label"
            onClick={() => setShowLoggedInForm(false)}
          >
            cancel
          </a>
        </div>
      </div>

      {/* Invoice Overlay */}
      <div
        className="overlayContainer"
        id="invoiceOverlay"
        style={{ display: showInvoiceOverlay ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span style={{ color: '#cecece' }}>PAY</span>
            <span style={{ color: '#00000014' }}>.me</span>
          </div>
          <p id="qrcodeTitle" className="label">
            Scan Invoice to Pay Zap
          </p>
          {useUIStore.getState().invoiceOverlay.amount > 0 && (
            <p
              className="label"
              style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a75ff' }}
            >
              {useUIStore.getState().invoiceOverlay.amount.toLocaleString()}{' '}
              sats
            </p>
          )}
          <InvoiceQR bolt11={useUIStore.getState().invoiceOverlay.bolt11} />
          <p id="qrcodeTitle" className="label">
            Otherwise:
          </p>
          <div className="formFieldGroup">
            <button
              id="payWithExtension"
              className="cta"
              onClick={() => {
                const { bolt11, amount } = useUIStore.getState().invoiceOverlay;
                if (bolt11 && amount > 0) {
                  // This would trigger the extension to pay the invoice
                  console.log('Paying with extension:', bolt11);
                  // For now, just show a message
                  alert(
                    'Extension payment not yet implemented. Please scan the QR code with your Lightning wallet.'
                  );
                } else {
                  alert('No invoice available to pay');
                }
              }}
            >
              Pay with Extension
            </button>
            <button
              id="payWithWallet"
              className="cta"
              onClick={() => {
                const bolt11 = useUIStore.getState().invoiceOverlay.bolt11;
                if (bolt11) {
                  try {
                    window.location.href = `lightning:${bolt11}`;
                  } catch (error) {
                    console.error('Error opening wallet:', error);
                  }
                } else {
                  console.error('No invoice available to pay');
                }
              }}
            >
              Pay with Wallet
            </button>
            <button
              id="copyInvoice"
              className="cta"
              onClick={async () => {
                const bolt11 = useUIStore.getState().invoiceOverlay.bolt11;
                if (bolt11) {
                  try {
                    await navigator.clipboard.writeText(bolt11);
                    // Change button text to "Copied!" for 1 second
                    const button = document.getElementById('copyInvoice');
                    if (button) {
                      button.textContent = 'Copied!';
                      setTimeout(() => {
                        button.textContent = 'Copy Invoice';
                      }, 1000);
                    }
                  } catch (err) {
                    console.error('Failed to copy invoice:', err);
                    // Fallback: select the text
                    const textArea = document.createElement('textarea');
                    textArea.value = bolt11;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    // Still show the "Copied!" feedback
                    const button = document.getElementById('copyInvoice');
                    if (button) {
                      button.textContent = 'Copied!';
                      setTimeout(() => {
                        button.textContent = 'Copy Invoice';
                      }, 1000);
                    }
                  }
                } else {
                  console.error('No invoice available to copy');
                }
              }}
            >
              Copy Invoice
            </button>
          </div>
          <a
            id="closeInvoiceOverlay"
            href="#"
            className="label"
            onClick={() => closeInvoice()}
          >
            Close
          </a>
        </div>
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
            handleNewPayNote();
          }
        }}
      >
        <span className="material-symbols-outlined">add</span>
      </button>
    </div>
  );
};
