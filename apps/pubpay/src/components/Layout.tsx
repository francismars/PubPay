import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useUIStore, NostrRegistrationService, AuthService } from '@pubpay/shared-services';
import { useHomeFunctionality } from '../hooks/useHomeFunctionality';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { usePostStoreData } from '../stores/usePostStore';
import {
  useModalState,
  useModalActions,
  useExtensionAvailability,
  useLoginFormState,
  useLoginFormActions,
  useNewPayNoteForm,
  useShowQRScanner,
  useShowPasswordPrompt
} from '../stores/useModalStore';
import { nip19 } from 'nostr-tools';
import { NewPayNoteOverlay } from './NewPayNoteOverlay/NewPayNoteOverlay';
import { StatusToast } from './StatusToast/StatusToast';
import { ProcessingOverlay } from './ProcessingOverlay/ProcessingOverlay';
import { LoggedInFormOverlay } from './LoggedInFormOverlay/LoggedInFormOverlay';
import { PasswordPromptOverlay } from './PasswordPromptOverlay/PasswordPromptOverlay';
import { InvoiceOverlay } from './InvoiceOverlay/InvoiceOverlay';
import { TopNavigation } from './TopNavigation/TopNavigation';
import { SideNavigation } from './SideNavigation/SideNavigation';
import { LoginFormOverlay } from './LoginFormOverlay/LoginFormOverlay';
import { QRScannerOverlay } from './QRScannerOverlay/QRScannerOverlay';
import { TOAST_DURATION, STORAGE_KEYS } from '../constants';

export const Layout: React.FC = () => {
  // Use composite hooks for optimized state access
  const showQRScanner = useShowQRScanner();
  const showPasswordPrompt = useShowPasswordPrompt();

  // Get remaining modal state that's not in composite hooks
  const { showLoggedInForm } = useModalState();

  // Use composite hooks for grouped state
  const {
    extensionAvailable,
    externalSignerAvailable,
    externalSignerLoading
  } = useExtensionAvailability();

  const {
    showNsecGroup,
    nsecInput,
    nsecPassword,
    showRecoveryGroup,
    recoveryMnemonic,
    recoveryPassword
  } = useLoginFormState();

  const {
    show: showNewPayNoteForm,
    isPublishing,
    open: openNewPayNoteForm,
    close: closeNewPayNoteForm,
    setIsPublishing
  } = useNewPayNoteForm();

  // Get actions - use composite hooks where available
  const {
    openQRScanner,
    closeQRScanner,
    openLoggedInForm,
    closeLoggedInForm,
    openPasswordPrompt,
    closePasswordPrompt,
    setExtensionAvailable,
    setExternalSignerAvailable,
    setExternalSignerLoading
  } = useModalActions();

  const {
    openNsecGroup,
    closeNsecGroup,
    setNsecInput,
    setNsecPassword,
    resetNsecForm,
    openRecoveryGroup,
    closeRecoveryGroup,
    setRecoveryMnemonic,
    setRecoveryPassword,
    resetRecoveryForm
  } = useLoginFormActions();

  // Shared UI store for login form and invoice overlay
  const showLoginForm = useUIStore(s => s.loginForm.show);
  const showInvoiceOverlay = useUIStore(s => s.invoiceOverlay.show);
  const closeInvoice = useUIStore(s => s.closeInvoice);
  const openLogin = useUIStore(s => s.openLogin);
  const closeLogin = useUIStore(s => s.closeLogin);

  // Use optimized selector hook to get all post state in a single subscription
  // This prevents unnecessary re-renders by using shallow equality
  const {
    posts,
    followingPosts,
    replies,
    activeFeed,
    isLoading,
    isLoadingMore,
    nostrReady,
    paymentErrors
  } = usePostStoreData();

  // Get handlers and authState from useHomeFunctionality (authState includes privateKey from local state)
  const {
    authState,
    nostrClient,
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
    resetNsecForm();
    resetRecoveryForm();
    closePasswordPrompt();
  };

  const handleQRScannerOpen = () => {
    openQRScanner();
  };

  // Listen for QR scanner open requests from payments page
  useEffect(() => {
    const handleOpenQRScanner = () => {
      openQRScanner();
    };

    window.addEventListener('openQRScanner', handleOpenQRScanner);
    return () => {
      window.removeEventListener('openQRScanner', handleOpenQRScanner);
    };
  }, [openQRScanner]);

  // Handle navigation to home feed - clear posts if coming from single note mode
  const handleNavigateToHome = () => {
    const currentPath = window.location.pathname;
    // If we're on a note page, clear posts to ensure feed reloads
    if (currentPath.startsWith('/note/')) {
      clearPosts();
    }
    // Navigation will happen via Link component
  };

  const handleNsecScanned = (nsec: string) => {
    // Close QR scanner
    closeQRScanner();
    // Open login form and show nsec input group
    resetLoginForm();
    openLogin();
    openNsecGroup();
    // Pre-fill the nsec input with scanned value
    setNsecInput(nsec);
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
      }, TOAST_DURATION.MEDIUM);
    } catch (toastError) {
      console.warn('Failed to show toast:', toastError);
    }
  };

  const handleLoginOpen = () => {
    if (authState.isLoggedIn) {
      openLoggedInForm();
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

  const handlePasswordPromptSubmit = async (password: string) => {
    const result = await checkAuthStatus(password);

    // Check the result - if requiresPassword is false, the password was correct
    if (!result.requiresPassword) {
      // Success - password was correct and private key is now decrypted
      closePasswordPrompt();
      // Show success feedback
      try {
        useUIStore.getState().openToast('Password accepted. Welcome back!', 'success', false);
        setTimeout(() => {
          try {
            useUIStore.getState().closeToast();
          } catch {
            // Ignore toast errors
          }
        }, TOAST_DURATION.SHORT);
      } catch (toastError) {
        console.warn('Failed to show toast:', toastError);
      }
    } else {
      // Password was incorrect (still requires password means it failed)
      // Throw error so component can handle error display
      throw new Error('Incorrect password');
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
          openPasswordPrompt();
        } else if (authState.privateKey) {
          // Private key is now available, hide the prompt
          closePasswordPrompt();
        }
      } else if (authState.privateKey) {
        // Not password-protected or key is available, hide prompt
        closePasswordPrompt();
      }
    };

    checkPasswordRequirement().catch(console.error);
  }, [authState.isLoggedIn, authState.privateKey, authState.signInMethod]);

  const handleRecoveryFromMnemonic = async (mnemonic: string, password?: string) => {
    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(
        mnemonic.trim()
      );

      if (result.success && result.keyPair && result.keyPair.privateKey) {
        // Sign in with the recovered private key and optional password
        await handleContinueWithNsec(result.keyPair.privateKey, password);
        resetRecoveryForm();
        closeLogin();
      } else {
        alert(`Failed to recover keys: ${result.error || 'Invalid mnemonic'}`);
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
    }
  };

  const handleSignInExtensionWrapper = async () => {
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
  };

  const handleSignInExternalSignerWrapper = async () => {
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
          text: 'Here\'s a PubPay I want to share with you:',
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
  const handleNewPayNoteFromNavClick = () => {
    if (authState.isLoggedIn) {
      // Dispatch custom event to FeedsPage
      window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
    } else {
      handleNewPayNote();
    }
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
      openNewPayNoteForm();
    }
  };

  // Handler for closing new pay note form
  const handleCloseNewPayNoteForm = () => {
    closeNewPayNoteForm();
  };

  // Handler for posting a new note
  const handlePostNoteSubmit = async (formData: Record<string, string>) => {
    setIsPublishing(true);
    try {
      await handlePostNote(formData);
      closeNewPayNoteForm();
    } catch (error) {
      console.error('Failed to post note:', error);
    } finally {
      setIsPublishing(false);
    }
  };

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
  }, [setExtensionAvailable, setExternalSignerAvailable]);

  // Initialize dark mode on mount
  useEffect(() => {
    const savedDarkMode = localStorage.getItem(STORAGE_KEYS.DARK_MODE) === 'true';
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

  // External signer return is handled centrally in useHomeFunctionality

  return (
    <div>
      <TopNavigation
        authState={authState}
        onQRScannerOpen={handleQRScannerOpen}
        onLoginOpen={handleLoginOpen}
        onNavigateToHome={handleNavigateToHome}
      />

      <div id="container">
        <div id="containerInner">
          <SideNavigation
            authState={authState}
            onClose={closeMobileMenu}
            onNavigateToHome={handleNavigateToHome}
            onNewPayNote={handleNewPayNoteFromNavClick}
          />
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
      <QRScannerOverlay
        isVisible={showQRScanner}
        onClose={closeQRScanner}
        onNsecScanned={handleNsecScanned}
      />

      {/* Login Form Overlay */}
      <LoginFormOverlay
        isVisible={showLoginForm}
        onClose={() => {
          resetLoginForm();
          closeLogin();
        }}
        showNsecGroup={showNsecGroup}
        showRecoveryGroup={showRecoveryGroup}
        extensionAvailable={extensionAvailable}
        externalSignerAvailable={externalSignerAvailable}
        externalSignerLoading={externalSignerLoading}
        onSignInExtension={handleSignInExtensionWrapper}
        onSignInExternalSigner={handleSignInExternalSignerWrapper}
        onShowNsecGroup={openNsecGroup}
        onShowRecoveryGroup={() => {
          closeNsecGroup();
          openRecoveryGroup();
        }}
        onHideNsecGroup={closeNsecGroup}
        onHideRecoveryGroup={() => {
          closeRecoveryGroup();
          openNsecGroup();
        }}
        onContinueWithNsec={handleNsecContinue}
        onRecoverFromMnemonic={handleRecoveryFromMnemonic}
        nsecInput={nsecInput}
        nsecPassword={nsecPassword}
        recoveryMnemonic={recoveryMnemonic}
        recoveryPassword={recoveryPassword}
        onNsecInputChange={setNsecInput}
        onNsecPasswordChange={setNsecPassword}
        onRecoveryMnemonicChange={setRecoveryMnemonic}
        onRecoveryPasswordChange={setRecoveryPassword}
      />

      {/* Logged In Form Overlay */}
      <LoggedInFormOverlay
        isVisible={showLoggedInForm}
        onClose={closeLoggedInForm}
        authState={authState}
        onLogout={handleLogout}
      />

      {/* Invoice Overlay */}
      <InvoiceOverlay
        isVisible={showInvoiceOverlay}
        onClose={closeInvoice}
        posts={[...posts, ...followingPosts, ...replies]}
      />

      {/* Password Prompt Overlay */}
      <PasswordPromptOverlay
        isVisible={showPasswordPrompt}
        onSubmit={handlePasswordPromptSubmit}
        onLogout={() => {
          handleLogout();
          closePasswordPrompt();
        }}
      />

      {/* Processing Overlay */}
      <ProcessingOverlay />

      {/* Non-blocking Status Toast */}
      <StatusToast />

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
