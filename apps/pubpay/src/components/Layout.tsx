import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useUIStore } from '@pubpay/shared-services';
import { useHomeFunctionality } from '../hooks/useHomeFunctionality';
import { InvoiceQR } from '@pubpay/shared-ui';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import * as NostrTools from 'nostr-tools';
import { NewPayNoteOverlay } from './NewPayNoteOverlay';

export const Layout: React.FC = () => {
  const [showQRScanner, setShowQRScanner] = useState(false);
  const showLoginForm = useUIStore(s => s.loginForm.show);
  const showProcessing = (useUIStore as any)((s: any) => s.processingOverlay.show);
  const processingMessage = (useUIStore as any)((s: any) => s.processingOverlay.message);
  const [showLoggedInForm, setShowLoggedInForm] = useState(false);
  const showInvoiceOverlay = useUIStore(s => s.invoiceOverlay.show);
  const [showNewPayNoteForm, setShowNewPayNoteForm] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  // const openInvoice = useUIStore(s => s.openInvoice);
  const closeInvoice = useUIStore(s => s.closeInvoice);
  const openLogin = useUIStore(s => s.openLogin);
  const closeLogin = useUIStore(s => s.closeLogin);
  const [showNsecGroup, setShowNsecGroup] = useState(false);
  const [nsecInput, setNsecInput] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [qrScanner, setQrScanner] = useState<any>(null);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [extensionAvailable, setExtensionAvailable] = useState(true);
  const [externalSignerAvailable, setExternalSignerAvailable] = useState(true);
  const [externalSignerLoading, setExternalSignerLoading] = useState(false);

  const isStoppingScannerRef = useRef(false);

  const {
    authState,
    nostrClient,
    // Hook state
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    replies,
    isLoadingMore,
    nostrReady,
    handleFeedChange,
    loadMorePosts,
    loadSingleNote,
    loadReplies,
    clearPosts,
    // UI handlers
    handleNewPayNote,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleContinueWithNsec,
    handleLogout,
    handlePayWithExtension,
    handlePayAnonymously,
    handlePostNote
  } = useHomeFunctionality();

  // Reset login form to main state
  const resetLoginForm = () => {
    setShowNsecGroup(false);
    setNsecInput('');
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

  // Handler functions for FeedsPage
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

  // Handler for new pay note from side navigation
  const onNewPayNote = () => {
    // This will trigger the new pay note form in FeedsPage
    console.log('New pay note requested from side navigation');
  };

  // Handler for new pay note from side navigation (calls FeedsPage handler)
  const handleNewPayNoteFromNav = () => {
    // Dispatch custom event to FeedsPage
    window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
  };

  // Handler to close mobile menu when a link is clicked
  const closeMobileMenu = () => {
    const sideNav = document.getElementById('sideNav');
    const hamburger = document.querySelector('.hamburger');
    if (sideNav && hamburger) {
      sideNav.classList.remove('open');
      hamburger.classList.remove('open');
    }
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler for opening new pay note form
  const handleOpenNewPayNoteForm = () => {
    if (authState.isLoggedIn) {
      setShowNewPayNoteForm(true);
    }
  };

  // Handler for closing new pay note form
  const handleCloseNewPayNoteForm = () => {
    setShowNewPayNoteForm(false);
  };

  // Handler for posting a new note
  const handlePostNoteSubmit = async (formData: Record<string, string>) => {
    setIsPublishing(true);
    try {
      await handlePostNote(formData);
      setShowNewPayNoteForm(false);
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
      console.log(
        'Scanner stop attempted (already stopped or in transition):',
        error
      );
      setIsScannerRunning(false);
      setQrScanner(null);
    } finally {
      isStoppingScannerRef.current = false;
    }
  }, [qrScanner, isScannerRunning]);

  // Listen for custom event to open new pay note form
  useEffect(() => {
    const handleOpenNewPayNoteFormEvent = () => {
      handleOpenNewPayNoteForm();
    };

    window.addEventListener('openNewPayNoteForm', handleOpenNewPayNoteFormEvent);

    return () => {
      window.removeEventListener('openNewPayNoteForm', handleOpenNewPayNoteFormEvent);
    };
  }, [authState.isLoggedIn]);

  // Initialize button states on mount
  useEffect(() => {
    setExtensionAvailable(true);
    setExternalSignerAvailable(true);
  }, []);

  // Initialize dark mode on mount
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

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
            const decodedNPUB = NostrTools.nip19.decode(npub);
            const pubKey = decodedNPUB.data as string;

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

  return (
    <div>
      <div id="nav">
        <div id="navInner">
          <div className="navLeft">
            <button
              className="hamburger"
              onClick={() => {
                const sideNav = document.getElementById('sideNav');
                const hamburger = document.querySelector('.hamburger');
                if (sideNav && hamburger) {
                  sideNav.classList.toggle('open');
                  hamburger.classList.toggle('open');
                }
              }}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            <Link id="logo" to="/">
              PUB<span className="logoPay">PAY</span>
              <span className="logoMe">.me</span>
              <span className="version">alpha 0.02</span>
            </Link>
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
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <img
                    className="userImg currentUserImg"
                    src={
                      (() => {
                        try {
                          return JSON.parse(
                            authState.userProfile.content || '{}'
                          ).picture;
                        } catch {
                          return undefined;
                        }
                      })() || genericUserIcon
                    }
                    alt="Profile"
                  />
                  <span className="profileUserNameNav">
                    {authState.displayName ||
                      (typeof window !== 'undefined' &&
                      (window as any).NostrTools
                        ? (window as any).NostrTools.nip19
                            .npubEncode(authState.publicKey)
                            .substring(0, 12) + '...'
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
              <Link
                to="/"
                className="sideNavLink"
                title="Home Feed"
                onClick={closeMobileMenu}
              >
                Home
              </Link>
              <Link
                to="/profile"
                className="sideNavLink"
                title="Your PubPay Profile"
                onClick={closeMobileMenu}
              >
                Profile
              </Link>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={(e) => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Splits
              </a>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={(e) => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Events
              </a>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={(e) => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Notifications
              </a>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={(e) => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Messages
              </a>
              <Link
                to="/settings"
                className="sideNavLink"
                title="Settings"
                onClick={closeMobileMenu}
              >
                Settings
              </Link>
              <a href="/live" className="sideNavLink " title="PubPay Live" onClick={closeMobileMenu}>
                Live
              </a>
              <Link
                to="/about"
                className="sideNavLink"
                title="About PubPay"
                onClick={closeMobileMenu}
              >
                About
              </Link>
              <a
                id="newPayNote"
                className="sideNavLink cta"
                href="#"
                onClick={() => {
                  if (authState.isLoggedIn) {
                    handleNewPayNoteFromNav();
                  } else {
                    handleNewPayNote();
                  }
                  closeMobileMenu();
                }}
              >
                New Paynote
              </a>
            </div>
          </div>
          <div id="mainContent">
            <Outlet context={{
              authState,
              nostrClient,
              // Hook state (single source of truth)
              isLoading,
              activeFeed,
              posts,
              followingPosts,
              replies,
              isLoadingMore,
              nostrReady,
              // Actions from hook
              handleFeedChange,
              loadMorePosts,
              loadSingleNote,
              loadReplies,
              clearPosts,
              // UI handlers
              handlePayWithExtension,
              handlePayAnonymously,
              handleSharePost,
              handlePostNote,
              handleNewPayNote,
              showNewPayNoteForm,
              handleCloseNewPayNoteForm,
              isPublishing
            }} />
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
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
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
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p className="label" id="titleSignin">
            Choose Sign-in Method
          </p>
          <div 
            className="formFieldGroup" 
            id="loginFormGroup"
            style={{ display: showNsecGroup ? 'none' : 'flex' }}
          >
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
          <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px' }}>
            <Link
              to="/register"
              className="label"
              style={{ textDecoration: 'none', color: '#6b7280' }}
              onClick={() => {
                closeLogin();
              }}
            >
              Don't have an account? Sign up
            </Link>
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
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p className="label">You are logged in as:</p>
          <p id="loggedInPublicKey">
            {authState.publicKey ? (
              <a
                href={`/profile`}
                className="userMention"
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
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
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
            href="javascript:void(0)"
            className="label"
            onClick={(e) => {
              e.preventDefault();
              closeInvoice();
            }}
          >
            Close
          </a>
        </div>
      </div>

      {/* Processing Overlay */}
      <div
        className="overlayContainer"
        id="processingOverlay"
        style={{ display: showProcessing ? 'flex' : 'none' }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p className="label" style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a75ff' }}>
            {processingMessage || 'Processing payment...'}
          </p>
          <div className="formFieldGroup" style={{ justifyContent: 'center', padding: '24px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', animation: 'spin 1.2s linear infinite' }}>progress_activity</span>
          </div>
        </div>
      </div>

      {/* New Pay Note Overlay */}
      <NewPayNoteOverlay
        isVisible={showNewPayNoteForm}
        onClose={handleCloseNewPayNoteForm}
        onSubmit={handlePostNoteSubmit}
        isPublishing={isPublishing}
        nostrClient={nostrClient}
      />
    </div>
  );
};
