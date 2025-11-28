import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useUIStore, NostrRegistrationService, AuthService } from '@pubpay/shared-services';
import { useHomeFunctionality } from '../hooks/useHomeFunctionality';
import { InvoiceQR } from '@pubpay/shared-ui';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { genericUserIcon } from '../assets/images';
import { nip19 } from 'nostr-tools';
import { NewPayNoteOverlay } from './NewPayNoteOverlay';
import { getActiveNWCUri, migrateOldNWCConnection } from '../utils/nwcStorage';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const showLoginForm = useUIStore(s => s.loginForm.show);
  const showProcessing = (useUIStore as any)(
    (s: any) => s.processingOverlay.show
  );
  const processingMessage = (useUIStore as any)(
    (s: any) => s.processingOverlay.message
  );
  const statusToast = (useUIStore as any)((s: any) => s.statusToast);
  const closeToast = (useUIStore as any)((s: any) => s.closeToast);
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
  const [nsecPassword, setNsecPassword] = useState('');
  const [showRecoveryGroup, setShowRecoveryGroup] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordPromptPassword, setPasswordPromptPassword] = useState('');
  // Remember me removed: always persist until logout
  const [qrScanner, setQrScanner] = useState<any>(null);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [cameraList, setCameraList] = useState<any[]>([]);
  const currentCameraIdRef = useRef<string | null>(null);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [zoomVal, setZoomVal] = useState(1);
  const [showCameraPicker, setShowCameraPicker] = useState(false);
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
    paymentErrors,
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
    handlePostNote,
    loadUserProfile,
    checkAuthStatus
  } = useHomeFunctionality();

  // Reset login form to main state
  const resetLoginForm = () => {
    setShowNsecGroup(false);
    setNsecInput('');
    setNsecPassword('');
    setShowRecoveryGroup(false);
    setRecoveryMnemonic('');
    setRecoveryPassword('');
    setShowPasswordPrompt(false);
    setPasswordPromptPassword('');
  };

  const handleQRScannerOpen = () => {
    setShowQRScanner(true);
  };

  // Handle navigation to home feed - clear posts if coming from single note mode
  const handleNavigateToHome = () => {
    const currentPath = window.location.pathname;
    // If we're on a note page, clear posts to ensure feed reloads
    if (currentPath.startsWith('/note/')) {
      clearPosts();
    }
    // Navigation will happen via Link component
  };

  const handleScannedContent = async (decodedText: string) => {
    try {
      // Check if it's an nsec (for login)
      if (decodedText.startsWith('nsec1')) {
        try {
          // Validate that it's a valid nsec by decoding it
          const decoded = nip19.decode(decodedText);
          if (decoded.type === 'nsec') {
            // Close QR scanner
            setShowQRScanner(false);
            // Open login form and show nsec input group
            resetLoginForm();
            openLogin();
            setShowNsecGroup(true);
            // Pre-fill the nsec input with scanned value
            setNsecInput(decodedText);
            // Clear password field to allow user to optionally set one
            setNsecPassword('');
            // Show info toast
            try {
              useUIStore.getState().openToast('Nsec scanned. Add optional password to encrypt your key.', 'info', false);
              setTimeout(() => {
                try {
                  useUIStore.getState().closeToast();
                } catch (toastError) {
                  console.warn('Failed to close toast:', toastError);
                }
              }, 3000);
            } catch (toastError) {
              console.warn('Failed to show toast:', toastError);
            }
            return;
          }
        } catch (nsecError) {
          // Invalid nsec, try other formats
          console.error('Invalid nsec format:', nsecError);
        }
      }

      // Accept note/nevent for posts and npub/nprofile for profiles
      const regex =
        /(note1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|nevent1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|npub1[0-9a-z]{58,}|nprofile1[0-9a-z]+)/i;
      const match = decodedText.match(regex);
      if (!match) return;

      const token = match[0];
      const decoded = nip19.decode(token);

      if (decoded.type === 'note') {
        navigate(`/note/${token}`);
      } else if (decoded.type === 'nevent') {
        const noteID = (decoded.data as any).id;
        const note1 = nip19.noteEncode(noteID);
        navigate(`/note/${note1}`);
      } else if (decoded.type === 'npub') {
        const pubkeyHex = decoded.data as string;
        navigate(`/profile/${pubkeyHex}`);
      } else if (decoded.type === 'nprofile') {
        const pubkeyHex = (decoded.data as any).pubkey;
        navigate(`/profile/${pubkeyHex}`);
      } else {
        console.error(
          'Invalid QR code content. Expected \'note\', \'nevent\', \'npub\' or \'nprofile\'.'
        );
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

  const handleNsecContinue = async () => {
    if (nsecInput.trim()) {
      await handleContinueWithNsec(nsecInput, nsecPassword || undefined);
      setNsecInput('');
      setNsecPassword('');
      closeLogin();
    }
  };

  const handlePasswordPromptSubmit = async () => {
    try {
      if (!passwordPromptPassword.trim()) {
        // Show validation message
        try {
          useUIStore.getState().openToast('Please enter your password', 'error', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 2000);
        } catch (toastError) {
          console.warn('Failed to show toast:', toastError);
        }
        return;
      }

      const result = await checkAuthStatus(passwordPromptPassword);
      
      // Check the result - if requiresPassword is false, the password was correct
      if (!result.requiresPassword) {
        // Success - password was correct and private key is now decrypted
        setPasswordPromptPassword('');
        setShowPasswordPrompt(false);
        // Show success feedback
        try {
          useUIStore.getState().openToast('Password accepted. Welcome back!', 'success', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 2000);
        } catch (toastError) {
          console.warn('Failed to show toast:', toastError);
        }
      } else {
        // Password was incorrect (still requires password means it failed)
        try {
          useUIStore.getState().openToast('Incorrect password. Please check your password and try again.', 'error', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 3000);
        } catch (toastError) {
          console.warn('Failed to show toast:', toastError);
        }
        setPasswordPromptPassword('');
      }
    } catch (error) {
      console.error('Password prompt failed:', error);
      // Extract user-friendly error message
      const errorMessage = error instanceof Error 
        ? (error.message.includes('incorrect') || error.message.includes('password') 
            ? error.message 
            : 'Incorrect password. Please check your password and try again.')
        : 'Incorrect password. Please check your password and try again.';
      
      try {
        useUIStore.getState().openToast(errorMessage, 'error', false);
        setTimeout(() => {
          try {
            useUIStore.getState().closeToast();
          } catch (toastError) {
            console.warn('Failed to close toast:', toastError);
          }
        }, 4000);
      } catch (toastError) {
        console.warn('Failed to show toast:', toastError);
      }
      setPasswordPromptPassword('');
    }
  };

  // Check if password is required on mount and when auth state changes
  useEffect(() => {
    const checkPasswordRequirement = async () => {
      // Check if user is authenticated and has password-protected key
      if (AuthService.isAuthenticated() && AuthService.requiresPassword()) {
        // Show password prompt if:
        // 1. User is logged in with nsec method
        // 2. Private key is not yet decrypted (null)
        if (authState.isLoggedIn && authState.signInMethod === 'nsec' && !authState.privateKey) {
          setShowPasswordPrompt(true);
        } else if (authState.privateKey) {
          // Private key is now available, hide the prompt
          setShowPasswordPrompt(false);
        }
      } else if (authState.privateKey) {
        // Not password-protected or key is available, hide prompt
        setShowPasswordPrompt(false);
      }
    };

    checkPasswordRequirement().catch(console.error);
  }, [authState.isLoggedIn, authState.privateKey, authState.signInMethod]);

  const handleRecoveryFromMnemonic = async () => {
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }

    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(
        recoveryMnemonic.trim()
      );

      if (result.success && result.keyPair && result.keyPair.privateKey) {
        // Sign in with the recovered private key and optional password
        await handleContinueWithNsec(result.keyPair.privateKey, recoveryPassword || undefined);
        setRecoveryMnemonic('');
        setRecoveryPassword('');
        setShowRecoveryGroup(false);
        closeLogin();
      } else {
        alert(`Failed to recover keys: ${result.error || 'Invalid mnemonic'}`);
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
    }
  };

  // Handler functions for FeedsPage
  const handleSharePost = async (post: PubPayPost) => {
    // Use note1 format (NIP-19) for share links - matches the /note/:noteId route
    const noteId = nip19.noteEncode(post.id);
    const shareURL = `${window.location.origin}/note/${noteId}`;

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

    window.addEventListener(
      'openNewPayNoteForm',
      handleOpenNewPayNoteFormEvent
    );

    return () => {
      window.removeEventListener(
        'openNewPayNoteForm',
        handleOpenNewPayNoteFormEvent
      );
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

  // External signer return is handled centrally in useHomeFunctionality

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
          (async () => {
            try {
              // enumerate cameras to allow flipping
              const cams = await (window as any).Html5Qrcode.getCameras();
              setCameraList(cams || []);
              // Prefer environment/back camera
              const saved = localStorage.getItem('qrCameraId');
              const preferred =
                (cams || []).find((c: any) => c.id === saved) ||
                (cams || []).find((c: any) =>
                  /back|rear|environment/i.test(c.label)
                ) ||
                (cams || [])[0];
              currentCameraIdRef.current = preferred ? preferred.id : undefined;

              await html5QrCode.start(
                currentCameraIdRef.current
                  ? { deviceId: { exact: currentCameraIdRef.current } }
                  : { facingMode: 'environment' },
                {
                  fps: 10,
                  qrbox: { width: 250, height: 250 },
                  aspectRatio: 1.0
                },
                async (decodedText: string) => {
                  console.log('QR Code scanned:', decodedText);
                  setIsScannerRunning(false);
                  setShowQRScanner(false);
                  html5QrCode.stop().catch(() => {});
                  await handleScannedContent(decodedText);
                },
                () => {
                  // noisy errors; keep silent or log
                }
              );

              // After start, probe zoom/torch capabilities
              try {
                const videoEl = document.querySelector('#reader video') as any;
                const track = (
                  videoEl?.srcObject as any
                )?.getVideoTracks?.()[0];
                const caps = track?.getCapabilities?.();
                if (caps && typeof caps.zoom !== 'undefined') {
                  setZoomSupported(true);
                  const min = caps.zoom.min ?? 1;
                  const max = caps.zoom.max ?? 1;
                  const step = caps.zoom.step ?? 0.1;
                  setZoomMin(min);
                  setZoomMax(max);
                  setZoomStep(step);
                  setZoomVal(Math.min(Math.max(min, 1), max));
                } else {
                  setZoomSupported(false);
                }
                if (caps && typeof caps.torch !== 'undefined') {
                  setTorchSupported(true);
                } else {
                  setTorchSupported(false);
                }
              } catch {
                // Ignore errors when checking torch/zoom capabilities
              }

              setQrScanner(html5QrCode);
              setIsScannerRunning(true);
              isStoppingScannerRef.current = false;
            } catch (error) {
              console.error('Failed to start QR scanner:', error);
              setIsScannerRunning(false);
              isStoppingScannerRef.current = false;
            }
          })();
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

  // Removed flip button; use picker instead

  const applyZoom = async (val: number) => {
    try {
      setZoomVal(val);
      const videoEl = document.querySelector('#reader video') as any;
      const track = (videoEl?.srcObject as any)?.getVideoTracks?.()[0];
      if (track?.applyConstraints) {
        await track.applyConstraints({ advanced: [{ zoom: val }] });
      }
    } catch {
      // Ignore errors when applying zoom constraints
    }
  };

  const selectCamera = async (deviceId: string) => {
    try {
      const html5QrCode = qrScanner;
      if (!html5QrCode) return;
      await html5QrCode.stop().catch(() => {});
      currentCameraIdRef.current = deviceId;
      localStorage.setItem('qrCameraId', deviceId);
      await html5QrCode.start(
        { deviceId: { exact: deviceId } },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        async (decodedText: string) => {
          setIsScannerRunning(false);
          setShowQRScanner(false);
          html5QrCode.stop().catch(() => {});
          await handleScannedContent(decodedText);
        },
        () => {}
      );
    } catch (e) {
      console.warn('Select camera failed:', e);
    }
  };

  const toggleTorch = async () => {
    try {
      const videoEl = document.querySelector('#reader video') as any;
      const track = (videoEl?.srcObject as any)?.getVideoTracks?.()[0];
      if (!track?.applyConstraints || !torchSupported) return;
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

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
            <Link id="logo" to="/" onClick={handleNavigateToHome}>
              PUB<span className="logoPay">PAY</span>
              <span className="logoMe">.me</span>
              <span className="version">alpha 0.03</span>
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
                      (authState.publicKey
                        ? `${nip19.npubEncode(authState.publicKey).substring(0, 12)}...`
                        : '...')}
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
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  handleNavigateToHome();
                  closeMobileMenu();
                }}
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
                onClick={e => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Discovery
              </a>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={e => {
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
                onClick={e => {
                  e.preventDefault();
                  closeMobileMenu();
                }}
              >
                Bets & Wagers
              </a>
              <a
                href="javascript:void(0)"
                className="sideNavLink disabled"
                title="coming soon"
                onClick={e => {
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
                onClick={e => {
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
                onClick={e => {
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
              <Link
                to="/wallet"
                className="sideNavLink"
                title="Wallet"
                onClick={closeMobileMenu}
              >
                Wallet
              </Link>
              <Link
                to="/live"
                className="sideNavLink "
                title="PubPay Live"
                onClick={closeMobileMenu}
              >
                Live
              </Link>
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
            <Outlet
              context={{
                authState,
                nostrClient,
                loadUserProfile,
                checkAuthStatus,
                // Hook state (single source of truth)
                isLoading,
                activeFeed,
                posts,
                followingPosts,
                replies,
                isLoadingMore,
                nostrReady,
                paymentErrors,
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
              }}
            />
          </div>
        </div>
      </div>

      {/* QR Scanner Overlay */}
      <div
        className="overlayContainer"
        id="qrScanner"
        style={{
          display: 'flex',
          visibility: showQRScanner ? 'visible' : 'hidden',
          opacity: showQRScanner ? 1 : 0,
          pointerEvents: showQRScanner ? 'auto' : 'none'
        }}
        onClick={() => setShowQRScanner(false)}
      >
        <div className="overlayInner" onClick={e => e.stopPropagation()}>
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p className="label" id="titleScanner">
            Scan note/nevent, npub/nprofile, or nsec QR code
          </p>
          <div id="reader" style={{ position: 'relative' }}></div>
          
          {/* Camera Controls Container - iPhone Style */}
          <div className="camera-controls-container">
            {/* Zoom Slider - Top of controls */}
            {zoomSupported && (
              <div className="camera-zoom-control">
                <div className="zoom-value-display">{zoomVal.toFixed(1)}x</div>
                <div className="zoom-slider-wrapper">
                  <input
                    type="range"
                    min={zoomMin}
                    max={zoomMax}
                    step={zoomStep}
                    value={zoomVal}
                    onChange={e => applyZoom(parseFloat(e.target.value))}
                    className="camera-zoom-slider"
                  />
                </div>
              </div>
            )}

            {/* Bottom Control Bar */}
            <div className="camera-controls-bar">
              {/* Camera Switch Button */}
            {cameraList.length > 0 && (
                <div className="camera-control-button-wrapper">
                <button
                    className="camera-control-button"
                  onClick={e => {
                    e.preventDefault();
                      e.stopPropagation();
                    setShowCameraPicker(v => !v);
                  }}
                  title="Switch Camera"
                    aria-label="Switch Camera"
                >
                    <span className="material-symbols-outlined camera-icon">
                    cameraswitch
                  </span>
                </button>
                {showCameraPicker && (
                    <>
                      <div
                        className="camera-picker-overlay"
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowCameraPicker(false);
                        }}
                      />
                      <div className="camera-picker-menu">
                    {cameraList.map((c: any) => (
                          <button
                        key={c.id}
                            className={`camera-picker-item ${
                              c.id === currentCameraIdRef.current
                                ? 'active'
                                : ''
                            }`}
                            onClick={e => {
                          e.preventDefault();
                              e.stopPropagation();
                          selectCamera(c.id);
                          setShowCameraPicker(false);
                        }}
                          >
                            <span className="material-symbols-outlined">
                              {/back|rear|environment/i.test(c.label)
                                ? 'camera_rear'
                                : /front|user|face/i.test(c.label)
                                ? 'camera_front'
                                : 'videocam'}
                            </span>
                            <span className="camera-picker-label">
                        {c.label || c.id}
                            </span>
                            {c.id === currentCameraIdRef.current && (
                              <span className="material-symbols-outlined check-icon">
                                check
                              </span>
                            )}
                          </button>
                    ))}
                  </div>
                    </>
                )}
              </div>
            )}

              {/* Torch Button */}
            {torchSupported && (
              <button
                  className={`camera-control-button ${torchOn ? 'active' : ''}`}
                onClick={e => {
                  e.preventDefault();
                    e.stopPropagation();
                  toggleTorch();
                }}
                  title={torchOn ? 'Turn off torch' : 'Turn on torch'}
                  aria-label={torchOn ? 'Turn off torch' : 'Turn on torch'}
              >
                  <span className="material-symbols-outlined camera-icon">
                    {torchOn ? 'flashlight_on' : 'flashlight_off'}
                  </span>
              </button>
            )}
              </div>
          </div>
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
        style={{
          display: 'flex',
          visibility: showLoginForm ? 'visible' : 'hidden',
          opacity: showLoginForm ? 1 : 0,
          pointerEvents: showLoginForm ? 'auto' : 'none'
        }}
        onClick={closeLogin}
      >
        <div className="overlayInner" onClick={e => e.stopPropagation()}>
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
            style={{
              display: showNsecGroup || showRecoveryGroup ? 'none' : 'flex'
            }}
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
                  const result = await handleSignInExtension();
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
                  const result = await handleSignInExternalSigner();
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
                type="text"
                id="nsecInput"
                placeholder="Enter your nsec"
                className="inputField"
                value={nsecInput}
                onChange={e => setNsecInput(e.target.value)}
                autoComplete="off"
                required
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  width: '100%',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                  fontFamily: 'monospace'
                }}
              />
              <input
                type="password"
                id="nsecPasswordInput"
                placeholder="Password (optional, for extra security)"
                className="inputField"
                value={nsecPassword}
                onChange={e => setNsecPassword(e.target.value)}
                autoComplete="new-password"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  width: '100%',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  marginBottom: '12px'
                }}
              />
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  margin: '0 0 12px 0',
                  textAlign: 'left'
                }}
              >
                Optional: Set a password to encrypt your private key. You'll need to enter it each session.
              </p>
              <button
                id="continueWithNsec"
                className="cta"
                type="submit"
                onClick={async () => {
                  await handleContinueWithNsec(nsecInput, nsecPassword || undefined);
                  closeLogin();
                }}
              >
                Continue
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <a
                  href="#"
                  className="label"
                  style={{
                    color: '#6b7280',
                    fontSize: '13px',
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={e => {
                    e.preventDefault();
                    setShowNsecGroup(false);
                    setShowRecoveryGroup(true);
                  }}
                >
                  Recover from seed
                </a>
              </div>
            </form>
          </div>
          <div
            id="recoveryInputGroup"
            style={{ display: showRecoveryGroup ? 'block' : 'none' }}
          >
            <form
              onSubmit={e => {
                e.preventDefault();
                handleRecoveryFromMnemonic();
              }}
            >
              <div
                className="formField"
                style={{ textAlign: 'left', marginBottom: '20px' }}
              >
                <textarea
                  id="recoveryMnemonic"
                  placeholder="Enter your 12-word recovery phrase separated by spaces..."
                  value={recoveryMnemonic}
                  onChange={e => setRecoveryMnemonic(e.target.value)}
                  rows={3}
                  required
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    padding: '12px 16px',
                    border: '2px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '14px',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    marginBottom: '12px'
                  }}
                />
              </div>
              <input
                type="password"
                id="recoveryPasswordInput"
                placeholder="Password (optional, for extra security)"
                className="inputField"
                value={recoveryPassword}
                onChange={e => setRecoveryPassword(e.target.value)}
                autoComplete="new-password"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  width: '100%',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  marginBottom: '12px'
                }}
              />
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  margin: '0 0 12px 0',
                  textAlign: 'left'
                }}
              >
                Optional: Set a password to encrypt your private key. You'll need to enter it each session.
              </p>
              <button id="continueWithRecovery" className="cta" type="submit">
                Recover Account
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <a
                  href="#"
                  className="label"
                  style={{
                    color: '#6b7280',
                    fontSize: '13px',
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                  onClick={e => {
                    e.preventDefault();
                    setShowRecoveryGroup(false);
                    setShowNsecGroup(true);
                  }}
                >
                  Back to nsec login
                </a>
              </div>
            </form>
          </div>
          {/* Remember option removed: sessions persist until logout */}
          <div
            style={{ textAlign: 'center', marginTop: '32px', fontSize: '13px' }}
          >
            <span className="label" style={{ color: '#6b7280' }}>
              Don't have an account?{' '}
              <Link
                to="/register"
                style={{ color: '#4a75ff', textDecoration: 'underline' }}
                onClick={() => {
                  closeLogin();
                }}
              >
                Sign up
              </Link>
            </span>
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
        style={{
          display: 'flex',
          visibility: showLoggedInForm ? 'visible' : 'hidden',
          opacity: showLoggedInForm ? 1 : 0,
          pointerEvents: showLoggedInForm ? 'auto' : 'none'
        }}
        onClick={() => setShowLoggedInForm(false)}
      >
        <div className="overlayInner" onClick={e => e.stopPropagation()}>
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p className="label">You are logged in as:</p>
          <p id="loggedInPublicKey">
            {authState.publicKey ? (
              <Link to="/profile" className="userMention">
                {authState.displayName ||
                  (authState.publicKey
                    ? nip19.npubEncode(authState.publicKey)
                    : '')}
              </Link>
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
        style={{
          display: 'flex',
          visibility: showInvoiceOverlay ? 'visible' : 'hidden',
          opacity: showInvoiceOverlay ? 1 : 0,
          pointerEvents: showInvoiceOverlay ? 'auto' : 'none'
        }}
        onClick={closeInvoice}
      >
        <div className="overlayInner" onClick={e => e.stopPropagation()}>
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          {(() => {
            const invoiceOverlay = useUIStore.getState().invoiceOverlay;
            // Convert from millisats to sats
            const amountInSats = invoiceOverlay.amount > 0 ? Math.floor(invoiceOverlay.amount / 1000) : 0;
            const eventId = invoiceOverlay.eventId;

            // Find the post by eventId to get author info
            let recipientName = 'Anonymous';
            let recipientPicture = genericUserIcon;

            if (eventId) {
              // Check posts, followingPosts, and replies
              const allPosts = [...posts, ...followingPosts, ...replies];
              const post = allPosts.find(p => p.id === eventId);

              if (post && post.author) {
                try {
                  const authorData = JSON.parse(post.author.content || '{}');
                  recipientName = authorData?.display_name || authorData?.name || 'Anonymous';
                  recipientPicture = authorData?.picture || genericUserIcon;
                } catch {
                  // Use defaults
                }
              }
            }

            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '8px' }}>
                <span className="label" style={{ fontSize: '16px' }}>Pay</span>
                <img
                  src={recipientPicture}
                  alt={recipientName}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0
                  }}
                />
                <span className="label" style={{ fontSize: '16px' }}>{recipientName}</span>
                {amountInSats > 0 && (
                  <span className="label" style={{ fontSize: '16px' }}>{amountInSats.toLocaleString()} sats</span>
          )}
              </div>
            );
          })()}
          <InvoiceQR bolt11={useUIStore.getState().invoiceOverlay.bolt11} />
          <div
            style={{
              marginTop: '16px',
              marginBottom: '16px',
              position: 'relative'
            }}
          >
            <input
              type="text"
              readOnly
              value={useUIStore.getState().invoiceOverlay.bolt11}
              style={{
                width: '100%',
                padding: '12px 48px 12px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'monospace',
                backgroundColor: '#f9fafb',
                color: '#374151',
                boxSizing: 'border-box',
                cursor: 'text'
              }}
              onClick={e => {
                (e.target as HTMLInputElement).select();
              }}
            />
            <button
              onClick={async () => {
                const bolt11 = useUIStore.getState().invoiceOverlay.bolt11;
                if (bolt11) {
                  try {
                    await navigator.clipboard.writeText(bolt11);
                    useUIStore.getState().openToast('Invoice copied to clipboard', 'success', false);
                    setTimeout(() => {
                      useUIStore.getState().closeToast();
                    }, 2000);
                  } catch (err) {
                    console.error('Failed to copy invoice:', err);
                    // Fallback: select the text
                    const textArea = document.createElement('textarea');
                    textArea.value = bolt11;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    useUIStore.getState().openToast('Invoice copied to clipboard', 'success', false);
                    setTimeout(() => {
                      useUIStore.getState().closeToast();
                    }, 2000);
                  }
                }
              }}
              style={{
                position: 'absolute',
                right: '3px',
                top: '7px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#4a75ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = '#6b7280';
              }}
              title="Copy invoice"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                content_copy
              </span>
            </button>
          </div>
          <p id="qrcodeTitle" className="label">
            Otherwise, Pay with:
          </p>
          <div className="formFieldGroup">
            {(() => {
              // Check if NWC is configured
              // Migrate old format (safe to call multiple times)
              try {
                migrateOldNWCConnection();
              } catch {
                // Ignore migration errors
              }

              const nwcUri = getActiveNWCUri();

              if (nwcUri) {
                return (
                  <button
                    id="payWithNwc"
                    className="cta"
                    onClick={async () => {
                      const { bolt11 } = useUIStore.getState().invoiceOverlay;
                      if (!bolt11) {
                        useUIStore.getState().openToast('No invoice available', 'error', false);
                        return;
                      }

                      try {
                        useUIStore.getState().openToast('Sending invoice to wallet…', 'loading', true);
                        const { NwcClient } = await import('@pubpay/shared-services');
                        const client = new NwcClient(nwcUri);
                        
                        useUIStore.getState().updateToast('Waiting for wallet…', 'loading', true);

                        const timeoutMs = 45000;
                        const timeoutPromise = new Promise<any>(resolve => {
                          setTimeout(() => {
                            resolve({
                              error: { code: 'timeout', message: 'Wallet not responding' },
                              result: null,
                              result_type: 'error'
                            });
                          }, timeoutMs);
                        });

                        const resp = await Promise.race([
                          client.payInvoice(bolt11),
                          timeoutPromise
                        ]);

                        if (resp && !resp.error && resp.result) {
                          useUIStore.getState().updateToast('Paid via NWC', 'success', false);
                          setTimeout(() => {
                            useUIStore.getState().closeToast();
                            useUIStore.getState().closeInvoice();
                          }, 2000);
                        } else {
                          const msg =
                            resp && resp.error && resp.error.message
                              ? resp.error.message
                              : 'NWC payment error';
                          useUIStore.getState().updateToast(msg, 'error', true);
                        }
                      } catch (err) {
                        console.warn('NWC payment exception:', err);
                        useUIStore.getState().updateToast('NWC payment failed', 'error', true);
                      }
                    }}
                  >
                    NWC
                  </button>
                );
              }
              return null;
            })()}
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
              Extension
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
              Wallet
            </button>
          </div>
          <a
            id="closeInvoiceOverlay"
            href="javascript:void(0)"
            className="label"
            onClick={e => {
              e.preventDefault();
              closeInvoice();
            }}
          >
            Close
          </a>
        </div>
      </div>

      {/* Password Prompt Overlay */}
      <div
        className="overlayContainer"
        id="passwordPromptOverlay"
        style={{
          display: 'flex',
          visibility: showPasswordPrompt ? 'visible' : 'hidden',
          opacity: showPasswordPrompt ? 1 : 0,
          pointerEvents: showPasswordPrompt ? 'auto' : 'none',
          transition: 'opacity 0.2s ease-out',
          willChange: showPasswordPrompt ? 'opacity' : 'auto'
        }}
        onClick={() => {
          // Don't close on outside click - password is required
        }}
      >
        <div
          className="overlayInner"
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: '400px',
            width: '90%',
            transform: 'none !important',
            animation: 'none !important'
          }}
        >
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>
            Enter Password
          </h3>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: '0 0 24px 0'
            }}
          >
            Your private key is encrypted with a password. Please enter it to continue.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              handlePasswordPromptSubmit();
            }}
          >
            <input
              type="password"
              id="passwordPromptInput"
              placeholder="Enter your password"
              className="inputField"
              value={passwordPromptPassword}
              onChange={e => setPasswordPromptPassword(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '2px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px 16px',
                width: '100%',
                fontSize: '14px',
                boxSizing: 'border-box',
                marginBottom: '16px'
              }}
            />
            <button
              type="submit"
              className="cta"
              style={{ width: '100%', marginBottom: '12px' }}
            >
              Unlock
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <a
              href="#"
              className="label"
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
                setShowPasswordPrompt(false);
                setPasswordPromptPassword('');
              }}
              style={{
                color: 'var(--text-secondary)',
                textDecoration: 'underline',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Logout
            </a>
          </div>
        </div>
      </div>

      {/* Processing Overlay */}
      <div
        className="overlayContainer"
        id="processingOverlay"
        style={{
          display: 'flex',
          visibility: showProcessing ? 'visible' : 'hidden',
          opacity: showProcessing ? 1 : 0,
          pointerEvents: showProcessing ? 'auto' : 'none'
        }}
      >
        <div className="overlayInner">
          <div className="brand">
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
          </div>
          <p
            className="label"
            style={{ fontSize: '18px', fontWeight: 'bold', color: '#4a75ff' }}
          >
            {processingMessage || 'Processing payment...'}
          </p>
          <div
            className="formFieldGroup"
            style={{ justifyContent: 'center', padding: '24px' }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '48px',
                animation: 'spin 1.2s linear infinite'
              }}
            >
              progress_activity
            </span>
          </div>
        </div>
      </div>

      {/* Non-blocking Status Toast */}
      {statusToast?.show && (
        <div className="statusToast" role="status" aria-live="polite">
          <span
            className={`material-symbols-outlined statusToastIcon statusToast-${statusToast.variant}`}
          >
            {statusToast.variant === 'success'
              ? 'check_circle'
              : statusToast.variant === 'error'
                ? 'error'
                : 'progress_activity'}
          </span>
          <div className="statusToastMessage">{statusToast.message}</div>
          <button
            onClick={() => closeToast()}
            className="statusToastClose"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

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
