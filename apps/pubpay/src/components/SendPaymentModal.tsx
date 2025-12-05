import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  useUIStore,
  NwcClient,
  FollowService,
  ensureProfiles,
  getQueryClient,
  InvoiceService,
  LightningAddressService,
  detectPaymentType
} from '@pubpay/shared-services';

interface SendPaymentModalProps {
  isVisible: boolean;
  onClose: () => void;
  nwcClient: NwcClient | null;
  nostrClient: any;
  authState: any;
  onPaymentSent: () => void;
}

// Common Lightning Address providers
const COMMON_LN_PROVIDERS = [
  'getalby.com',
  'ln.tips',
  'strike.me',
  'walletofsatoshi.com',
  'bitrefill.com',
  'coinos.io',
  'zebedee.io',
  'btcppay.org',
  'lightningaddress.com',
  'stacker.news'
];

export const SendPaymentModal: React.FC<SendPaymentModalProps> = ({
  isVisible,
  onClose,
  nwcClient,
  nostrClient,
  authState,
  onPaymentSent
}) => {
  // Unified send input
  const [sendInput, setSendInput] = useState('');
  const [sendDescription, setSendDescription] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

  // Detected type: 'invoice' | 'lightning-address' | 'nostr-user' | null
  const [detectedType, setDetectedType] = useState<'invoice' | 'lightning-address' | 'nostr-user' | null>(null);
  const [detectedNostrPubkey, setDetectedNostrPubkey] = useState<string | null>(null);
  const [detectedNostrProfile, setDetectedNostrProfile] = useState<any>(null);

  // Invoice state
  const [parsedInvoice, setParsedInvoice] = useState<{
    amount?: number;
    description?: string;
    expiry?: number;
    timestamp?: number;
  } | null>(null);
  const [invoiceError, setInvoiceError] = useState<string>('');

  // Lightning Address state
  const [fetchingInvoice, setFetchingInvoice] = useState(false);
  const [lnurlError, setLnurlError] = useState<string>('');

  // Nostr follow list state (for autocomplete)
  const [followList, setFollowList] = useState<any[]>([]);
  const [, setLoadingFollowList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  // Lightning Address domain suggestions
  const [lnAddressDomainQuery, setLnAddressDomainQuery] = useState('');
  const [showLnAddressSuggestions, setShowLnAddressSuggestions] = useState(false);
  const [activeLnAddressIndex, setActiveLnAddressIndex] = useState(0);
  const [previewSuffix, setPreviewSuffix] = useState<string | null>(null);

  const sendInputRef = useRef<HTMLInputElement>(null);

  // Filter Lightning Address providers based on query (exact matches only)
  const filteredLnProviders = useMemo(() => {
    const q = lnAddressDomainQuery.trim().toLowerCase();
    if (!q) return COMMON_LN_PROVIDERS;
    return COMMON_LN_PROVIDERS.filter(provider =>
      provider.toLowerCase().startsWith(q)
    );
  }, [lnAddressDomainQuery]);

  // Parse and validate BOLT11 invoice
  const parseInvoice = useCallback((invoice: string) => {
    // Clear previous errors
    setInvoiceError('');
    setParsedInvoice(null);

    // Check if empty
    if (!invoice.trim()) {
      setInvoiceError('');
      return false;
    }

    const result = InvoiceService.parseBolt11(invoice);

    if (!result.success) {
      setInvoiceError(result.error || 'Invalid invoice');
      setParsedInvoice(null);
      return false;
    }

    if (result.data) {
      setParsedInvoice(result.data);
      setInvoiceError('');
      return true;
    }

    return false;
  }, []);

  // Fetch invoice from Lightning Address (with parameters)
  const fetchInvoiceFromLNAddress = async (address: string, amount: number, description?: string): Promise<string | null> => {
    setFetchingInvoice(true);
    setLnurlError('');

    try {
      const invoice = await LightningAddressService.fetchInvoice(address, amount, { description });
      parseInvoice(invoice);
      return invoice;
    } catch (error) {
      console.error('Failed to fetch invoice from Lightning Address:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch invoice';
      setLnurlError(errorMessage);
      return null;
    } finally {
      setFetchingInvoice(false);
    }
  };

  // Handle send payment
  const handleSendPayment = async () => {
    if (!nwcClient) {
      useUIStore.getState().openToast('Wallet not connected', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
      return;
    }

    if (!detectedType) {
      useUIStore.getState().openToast('Please enter an invoice, Lightning Address, or Nostr user', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
      return;
    }

    let invoiceToPay: string | null = null;

    if (detectedType === 'invoice') {
      // Validate invoice
      if (invoiceError || !parsedInvoice) {
        useUIStore.getState().openToast(
          invoiceError || 'Please enter a valid invoice',
          'error',
          false
        );
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      invoiceToPay = sendInput.trim();
    } else if (detectedType === 'lightning-address') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        useUIStore.getState().openToast('Please enter a valid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      // Fetch invoice automatically
      useUIStore.getState().openToast('Fetching invoice...', 'loading', true);
      invoiceToPay = await fetchInvoiceFromLNAddress(sendInput.trim(), amount, sendDescription);

      if (!invoiceToPay) {
        useUIStore.getState().updateToast(
          lnurlError || 'Failed to fetch invoice',
          'error',
          true
        );
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      useUIStore.getState().updateToast('Invoice fetched! Sending payment...', 'loading', true);
    } else if (detectedType === 'nostr-user') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        useUIStore.getState().openToast('Please enter a valid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      // Get lightning address from profile
      if (!detectedNostrProfile) {
        useUIStore.getState().openToast('Loading user profile...', 'loading', true);
        try {
          const profileMap = await ensureProfiles(getQueryClient(), nostrClient, [detectedNostrPubkey!]);
          const profile = profileMap.get(detectedNostrPubkey!);
          setDetectedNostrProfile(profile || null);
          if (!profile) {
            useUIStore.getState().updateToast('User profile not found', 'error', true);
            setTimeout(() => useUIStore.getState().closeToast(), 3000);
            return;
          }
        } catch {
          useUIStore.getState().updateToast('Failed to load user profile', 'error', true);
          setTimeout(() => useUIStore.getState().closeToast(), 3000);
          return;
        }
      }

      // Extract lud16 from profile
      let lud16: string | null = null;
      try {
        const profileContent = typeof detectedNostrProfile?.content === 'string'
          ? JSON.parse(detectedNostrProfile.content)
          : detectedNostrProfile?.content || detectedNostrProfile;
        lud16 = profileContent?.lud16 || profileContent?.lud06 || null;
      } catch {
        // Try direct access
        lud16 = detectedNostrProfile?.lud16 || detectedNostrProfile?.lud06 || null;
      }

      if (!lud16) {
        useUIStore.getState().updateToast('User does not have a Lightning Address', 'error', true);
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      // Fetch invoice using lightning address
      useUIStore.getState().updateToast('Fetching invoice...', 'loading', true);
      invoiceToPay = await fetchInvoiceFromLNAddress(lud16, amount, sendDescription);

      if (!invoiceToPay) {
        useUIStore.getState().updateToast(
          lnurlError || 'Failed to fetch invoice',
          'error',
          true
        );
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      useUIStore.getState().updateToast('Invoice fetched! Sending payment...', 'loading', true);
    }

    if (!invoiceToPay) {
      useUIStore.getState().openToast('No invoice to pay', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
      return;
    }

    setSending(true);
    try {
      useUIStore.getState().openToast('Sending payment...', 'loading', true);
      const response = await nwcClient.payInvoice(invoiceToPay);
      if (response.error) {
        useUIStore.getState().updateToast(
          response.error.message || 'Payment failed',
          'error',
          true
        );
      } else if (response.result) {
        useUIStore.getState().updateToast('Payment sent!', 'success', false);
        setTimeout(() => {
          useUIStore.getState().closeToast();
          handleClose();
          onPaymentSent();
        }, 2000);
      }
    } catch (error) {
      console.error('Send payment error:', error);
      useUIStore.getState().updateToast(
        'Payment failed',
        'error',
        true
      );
    } finally {
      setSending(false);
    }
  };

  // Function to open QR scanner
  const openQRScanner = () => {
    window.dispatchEvent(new CustomEvent('openQRScanner'));
  };

  // Load follow list
  const loadFollowList = useCallback(async () => {
    if (!nostrClient || !authState?.isLoggedIn || !authState?.publicKey) {
      setFollowList([]);
      return;
    }

    setLoadingFollowList(true);
    try {
      const suggestions = await FollowService.getFollowSuggestions(nostrClient, authState.publicKey);
      setFollowList(suggestions);
    } catch (error) {
      console.error('Failed to load follow list:', error);
      setFollowList([]);
    } finally {
      setLoadingFollowList(false);
    }
  }, [nostrClient, authState]);

  // Load follow list when modal opens and user is logged in
  useEffect(() => {
    if (isVisible && authState?.isLoggedIn) {
      loadFollowList();
      // Also request from UI store (same as NewPayNoteOverlay)
      try {
        window.dispatchEvent(new CustomEvent('requestFollowSuggestions'));
      } catch {
        // Ignore errors
      }
    }
  }, [isVisible, authState?.isLoggedIn, loadFollowList]);

  // Listen for follow suggestions updates
  useEffect(() => {
    if (!isVisible) return;
    const handleFollowingUpdated = (e: any) => {
      try {
        if (e?.detail?.suggestions) {
          setFollowList(e.detail.suggestions);
        }
      } catch {
        // Ignore errors
      }
    };
    window.addEventListener('followingUpdated', handleFollowingUpdated);
    return () => {
      window.removeEventListener('followingUpdated', handleFollowingUpdated);
    };
  }, [isVisible]);

  // Filter follows based on mention query (only search in display name)
  const filteredMentionFollows = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return followList
      .filter(item => {
        return item.displayName?.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [mentionQuery, followList]);

  // Detect @ mentions in input (for both Nostr users and Lightning Address domains)
  const detectMention = useCallback(() => {
    if (!sendInputRef.current) return;
    const input = sendInputRef.current;
    const value = input.value;
    const caret = input.selectionStart || 0;
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf('@');

    if (at === -1) {
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setActiveMentionIndex(0);
      setShowLnAddressSuggestions(false);
      setLnAddressDomainQuery('');
      setActiveLnAddressIndex(0);
      return;
    }

    const beforeAt = upto.slice(0, at);
    const afterAt = upto.slice(at + 1);

    // Check if there's text before @ (like "user@") - this is a Lightning Address
    const hasTextBeforeAt = beforeAt.trim().length > 0 && /[a-z0-9_-]+/i.test(beforeAt.trim());

    // Check if @ is at start or after whitespace - this is a Nostr mention
    const isNostrMention = at === 0 || /\s/.test(beforeAt.slice(-1));

    // Close suggestions if whitespace after @
    if (/\s/.test(afterAt)) {
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setActiveMentionIndex(0);
      setShowLnAddressSuggestions(false);
      setLnAddressDomainQuery('');
      setActiveLnAddressIndex(0);
      return;
    }

    if (hasTextBeforeAt) {
      // Lightning Address domain suggestions
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setActiveMentionIndex(0);
      if (afterAt.length >= 0) {
        setLnAddressDomainQuery(afterAt);
        setShowLnAddressSuggestions(true);
        setActiveLnAddressIndex(0);
      } else {
        setShowLnAddressSuggestions(false);
        setLnAddressDomainQuery('');
        setActiveLnAddressIndex(0);
      }
    } else if (isNostrMention) {
      // Nostr user mention suggestions
      setShowLnAddressSuggestions(false);
      setLnAddressDomainQuery('');
      setActiveLnAddressIndex(0);
      if (afterAt.length >= 0) {
        setMentionQuery(afterAt);
        setShowMentionSuggestions(true);
        setActiveMentionIndex(0);
      } else {
        setShowMentionSuggestions(false);
        setMentionQuery('');
        setActiveMentionIndex(0);
      }
    } else {
      // @ is part of a word, close all suggestions
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setActiveMentionIndex(0);
      setShowLnAddressSuggestions(false);
      setLnAddressDomainQuery('');
      setActiveLnAddressIndex(0);
    }
  }, []);

  // Detect type when input changes
  useEffect(() => {
    if (!sendInput.trim()) {
      setDetectedType(null);
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setParsedInvoice(null);
      setInvoiceError('');
      setLnurlError('');
      return;
    }

    const detection = detectPaymentType(sendInput);
    setDetectedType(detection.type);

    if (detection.type === 'invoice') {
      parseInvoice(detection.data);
    } else if (detection.type === 'nostr-user') {
      setDetectedNostrPubkey(detection.data.pubkey);
      setDetectedNostrProfile(null);
      // Load profile
      ensureProfiles(getQueryClient(), nostrClient, [detection.data.pubkey])
        .then(profileMap => {
          const profile = profileMap.get(detection.data.pubkey);
          setDetectedNostrProfile(profile || null);
        })
        .catch(error => {
          console.error('Failed to load profile:', error);
          setDetectedNostrProfile(null);
        });
    } else {
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
    }
  }, [sendInput, parseInvoice, nostrClient]);

  // Listen for scanned invoices and Lightning Addresses
  useEffect(() => {
    if (!isVisible) return;

    // Check sessionStorage first (in case we navigated here and event was missed)
    const scannedInvoice = sessionStorage.getItem('scannedInvoice');
    if (scannedInvoice) {
      sessionStorage.removeItem('scannedInvoice');
      setSendInput(scannedInvoice);
      return;
    }

    const scannedAddress = sessionStorage.getItem('scannedLightningAddress');
    if (scannedAddress) {
      sessionStorage.removeItem('scannedLightningAddress');
      setSendInput(scannedAddress);
      return;
    }

    const handleScannedInvoice = (e: CustomEvent) => {
      const invoice = e.detail?.invoice;
      if (invoice) {
        sessionStorage.removeItem('scannedInvoice');
        setSendInput(invoice);
      }
    };

    const handleScannedLightningAddress = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        sessionStorage.removeItem('scannedLightningAddress');
        setSendInput(address);
      }
    };

    window.addEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
    window.addEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);

    return () => {
      window.removeEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
      window.removeEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);
    };
  }, [isVisible]);

  // Reset state when modal closes
  const handleClose = () => {
    if (!sending && !fetchingInvoice) {
      setSendInput('');
      setSendDescription('');
      setSendAmount('');
      setParsedInvoice(null);
      setInvoiceError('');
      setLnurlError('');
      setDetectedType(null);
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setPreviewSuffix(null);
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="overlayContainer"
      style={{
        display: 'flex',
        visibility: 'visible',
        opacity: 1,
        pointerEvents: 'auto',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'none',
        transition: 'none'
      }}
      onClick={handleClose}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          transform: 'none',
          animation: 'none',
          transition: 'none',
          minHeight: '625px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexShrink: 0 }}>
          <p className="label" style={{ margin: 0 }}>
            Send Payment
          </p>
          <button
            onClick={openQRScanner}
            disabled={sending || fetchingInvoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'var(--bg-secondary)',
              border: '2px solid #4a75ff',
              borderRadius: '8px',
              color: '#4a75ff',
              cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              opacity: (sending || fetchingInvoice) ? 0.5 : 1
            }}
            onMouseEnter={e => {
              if (!sending && !fetchingInvoice) {
                e.currentTarget.style.background = '#4a75ff';
                e.currentTarget.style.color = '#fff';
              }
            }}
            onMouseLeave={e => {
              if (!sending && !fetchingInvoice) {
                e.currentTarget.style.background = 'var(--bg-secondary)';
                e.currentTarget.style.color = '#4a75ff';
              }
            }}
            title="Scan QR code"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              photo_camera
            </span>
            Scan QR Code
          </button>
        </div>

        {/* Main Content Area - grows to fill space */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          {/* Unified Send Input */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  color: 'var(--text-primary)'
                }}
              >
                Send to <span style={{ color: '#ef4444' }}>*</span>
                {detectedType && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ({detectedType === 'invoice' ? 'Invoice' : detectedType === 'lightning-address' ? 'Lightning Address' : 'Nostr User'})
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text && text.trim()) {
                        setSendInput(text.trim());
                        useUIStore.getState().openToast('Pasted from clipboard', 'success', false);
                        setTimeout(() => useUIStore.getState().closeToast(), 2000);
                      }
                    } catch (error) {
                      console.error('Failed to read clipboard:', error);
                      useUIStore.getState().openToast('Failed to read from clipboard', 'error', false);
                      setTimeout(() => useUIStore.getState().closeToast(), 2000);
                    }
                  }}
                  disabled={sending || fetchingInvoice}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s ease',
                    opacity: (sending || fetchingInvoice) ? 0.5 : 1
                  }}
                  title="Paste from clipboard"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    content_paste
                  </span>
                  Paste
                </button>
                {sendInput && (
                  <button
                    onClick={() => {
                      setSendInput('');
                      setParsedInvoice(null);
                      setInvoiceError('');
                      setLnurlError('');
                      setDetectedType(null);
                      setDetectedNostrPubkey(null);
                      setDetectedNostrProfile(null);
                    }}
                    disabled={sending || fetchingInvoice}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)',
                      cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      transition: 'all 0.2s ease',
                      opacity: (sending || fetchingInvoice) ? 0.5 : 1
                    }}
                    title="Clear"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      close
                    </span>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Main Input Field */}
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
              {detectedType === 'invoice' ? (
                <textarea
                  value={sendInput}
                  onPaste={e => {
                    const pastedText = e.clipboardData.getData('text');
                    if (pastedText && pastedText.trim()) {
                      setSendInput(pastedText.trim());
                    }
                  }}
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px',
                    border: invoiceError ? '2px solid #ef4444' : parsedInvoice ? '2px solid #22c55e' : '2px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    cursor: 'text'
                  }}
                  onChange={() => {}}
                  onKeyDown={e => {
                    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) return;
                    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) return;
                    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) return;
                    if (e.key === 'x' && (e.ctrlKey || e.metaKey)) return;
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      const textarea = e.target as HTMLTextAreaElement;
                      if (textarea.selectionStart === textarea.selectionEnd) {
                        e.preventDefault();
                      }
                      return;
                    }
                    e.preventDefault();
                  }}
                  placeholder="Paste BOLT11 invoice here..."
                  readOnly
                  disabled={sending || fetchingInvoice}
                />
              ) : (
                <>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      ref={sendInputRef}
                      type="text"
                      value={sendInput}
                      onChange={e => {
                        const value = e.target.value;
                        setSendInput(value);
                        setInvoiceError('');
                        setLnurlError('');
                        setParsedInvoice(null);
                        setPreviewSuffix(null);
                        detectMention();
                      }}
                      onKeyDown={e => {
                        // Handle Lightning Address domain suggestions
                        if (showLnAddressSuggestions && filteredLnProviders.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const newIndex = (activeLnAddressIndex + 1) % filteredLnProviders.length;
                            setActiveLnAddressIndex(newIndex);
                            // Update preview (show full suggestion)
                            const input = sendInputRef.current;
                            if (input) {
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at + 1);
                                const choice = filteredLnProviders[newIndex];
                                const fullSuggestion = before + choice;
                                setPreviewSuffix(fullSuggestion);
                              }
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const newIndex = (activeLnAddressIndex - 1 + filteredLnProviders.length) % filteredLnProviders.length;
                            setActiveLnAddressIndex(newIndex);
                            // Update preview (show full suggestion)
                            const input = sendInputRef.current;
                            if (input) {
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at + 1);
                                const choice = filteredLnProviders[newIndex];
                                const fullSuggestion = before + choice;
                                setPreviewSuffix(fullSuggestion);
                              }
                            }
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            const choice = filteredLnProviders[activeLnAddressIndex];
                            if (choice) {
                              const input = sendInputRef.current;
                              if (!input) return;
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at + 1);
                                const after = value.slice(caret);
                                const insert = choice;
                                setSendInput(before + insert + after);
                                setShowLnAddressSuggestions(false);
                                setLnAddressDomainQuery('');
                                setActiveLnAddressIndex(0);
                                setPreviewSuffix(null);
                                setTimeout(() => {
                                  input.focus();
                                  const newPos = (before + insert).length;
                                  input.setSelectionRange(newPos, newPos);
                                }, 0);
                              }
                            }
                          } else if (e.key === 'Escape') {
                            setShowLnAddressSuggestions(false);
                            setPreviewSuffix(null);
                          } else {
                            setPreviewSuffix(null);
                          }
                        }
                        // Handle Nostr user mention suggestions
                        else if (showMentionSuggestions && filteredMentionFollows.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const newIndex = (activeMentionIndex + 1) % filteredMentionFollows.length;
                            setActiveMentionIndex(newIndex);
                            // Update preview (show full suggestion with display name)
                            const input = sendInputRef.current;
                            if (input) {
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at);
                                const choice = filteredMentionFollows[newIndex];
                                const displayName = choice.displayName || choice.npub;
                                const fullSuggestion = before + displayName;
                                setPreviewSuffix(fullSuggestion);
                              }
                            }
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const newIndex = (activeMentionIndex - 1 + filteredMentionFollows.length) % filteredMentionFollows.length;
                            setActiveMentionIndex(newIndex);
                            // Update preview (show full suggestion with display name)
                            const input = sendInputRef.current;
                            if (input) {
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at);
                                const choice = filteredMentionFollows[newIndex];
                                const displayName = choice.displayName || choice.npub;
                                const fullSuggestion = before + displayName;
                                setPreviewSuffix(fullSuggestion);
                              }
                            }
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            const choice = filteredMentionFollows[activeMentionIndex];
                            if (choice) {
                              const input = sendInputRef.current;
                              if (!input) return;
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at);
                                const after = value.slice(caret);
                                // Insert npub for detection, not display name
                                const insert = choice.npub;
                                setSendInput(before + insert + after);
                                setShowMentionSuggestions(false);
                                setMentionQuery('');
                                setActiveMentionIndex(0);
                                setPreviewSuffix(null);
                                setTimeout(() => {
                                  input.focus();
                                  const newPos = (before + insert).length;
                                  input.setSelectionRange(newPos, newPos);
                                }, 0);
                              }
                            }
                          } else if (e.key === 'Escape') {
                            setShowMentionSuggestions(false);
                            setPreviewSuffix(null);
                          } else {
                            setPreviewSuffix(null);
                          }
                        } else {
                          setPreviewSuffix(null);
                          detectMention();
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => {
                          setShowMentionSuggestions(false);
                          setShowLnAddressSuggestions(false);
                          setPreviewSuffix(null);
                        }, 200);
                      }}
                      placeholder="Enter invoice, Lightning Address, npub, or type @ to mention a follow..."
                      disabled={sending || fetchingInvoice}
                      style={{
                        backgroundColor: 'var(--input-bg)',
                        color: previewSuffix ? 'transparent' : 'var(--text-primary)',
                        border: (invoiceError || lnurlError) ? '2px solid #ef4444' : (detectedType && sendInput.trim()) ? '2px solid #22c55e' : '2px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '12px 16px',
                        width: '100%',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    {previewSuffix && sendInputRef.current && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '16px',
                          top: '12px',
                          pointerEvents: 'none',
                          userSelect: 'none',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          opacity: 0.5,
                          whiteSpace: 'pre',
                          zIndex: 1,
                          fontFamily: 'inherit',
                          lineHeight: '1.5'
                        }}
                      >
                        {previewSuffix}
                      </div>
                    )}
                  </div>
                  {/* Lightning Address Domain Suggestions */}
                  {showLnAddressSuggestions && filteredLnProviders.length > 0 && (
                    <div
                      className="suggestionDropdown"
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000,
                        maxHeight: '150px',
                        overflowY: 'auto'
                      }}
                    >
                      {filteredLnProviders.map((provider: string, idx: number) => {
                        const input = sendInputRef.current;
                        if (!input) return null;
                        const value = input.value;
                        const caret = input.selectionStart || 0;
                        const upto = value.slice(0, caret);
                        const at = upto.lastIndexOf('@');
                        const username = at >= 0 ? upto.slice(0, at + 1) : '';
                        const fullAddress = username + provider;

                        return (
                          <div
                            key={provider}
                            onMouseDown={e => {
                              e.preventDefault();
                              if (!input) return;
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at + 1);
                                const after = value.slice(caret);
                                const insert = provider;
                                setSendInput(before + insert + after);
                                setShowLnAddressSuggestions(false);
                                setLnAddressDomainQuery('');
                                setActiveLnAddressIndex(0);
                                setTimeout(() => {
                                  input.focus();
                                  const newPos = (before + insert).length;
                                  input.setSelectionRange(newPos, newPos);
                                }, 0);
                              }
                            }}
                            onMouseEnter={() => {
                              setActiveLnAddressIndex(idx);
                              // Update preview (show full suggestion on hover)
                              const input = sendInputRef.current;
                              if (input) {
                                const value = input.value;
                                const caret = input.selectionStart || 0;
                                const upto = value.slice(0, caret);
                                const at = upto.lastIndexOf('@');
                                if (at !== -1) {
                                  const before = value.slice(0, at + 1);
                                  const fullSuggestion = before + provider;
                                  setPreviewSuffix(fullSuggestion);
                                }
                              }
                            }}
                            className={`suggestionItem ${idx === activeLnAddressIndex ? 'active' : ''}`}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              background: idx === activeLnAddressIndex ? 'var(--bg-secondary)' : 'transparent',
                              borderBottom: idx < filteredLnProviders.length - 1 ? '1px solid var(--border-color)' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                              alternate_email
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                                {fullAddress}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {provider}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Nostr User Mention Suggestions */}
                  {showMentionSuggestions && filteredMentionFollows.length > 0 && (
                    <div
                      className="suggestionDropdown"
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000,
                        maxHeight: '150px',
                        overflowY: 'auto'
                      }}
                    >
                      {filteredMentionFollows.map((f: any, idx: number) => (
                        <div
                          key={f.pubkey + idx}
                          onMouseDown={e => {
                            e.preventDefault();
                            const input = sendInputRef.current;
                            if (!input) return;
                            const value = input.value;
                            const caret = input.selectionStart || 0;
                            const upto = value.slice(0, caret);
                            const at = upto.lastIndexOf('@');
                            if (at !== -1) {
                              const before = value.slice(0, at);
                              const after = value.slice(caret);
                              // Insert npub for detection, not display name
                              const insert = f.npub;
                              setSendInput(before + insert + after);
                              setShowMentionSuggestions(false);
                              setMentionQuery('');
                              setActiveMentionIndex(0);
                              setPreviewSuffix(null);
                              setTimeout(() => {
                                input.focus();
                                const newPos = (before + insert).length;
                                input.setSelectionRange(newPos, newPos);
                              }, 0);
                            }
                          }}
                          onMouseEnter={() => {
                            setActiveMentionIndex(idx);
                            // Update preview (show full suggestion with display name on hover)
                            const input = sendInputRef.current;
                            if (input) {
                              const value = input.value;
                              const caret = input.selectionStart || 0;
                              const upto = value.slice(0, caret);
                              const at = upto.lastIndexOf('@');
                              if (at !== -1) {
                                const before = value.slice(0, at);
                                const displayName = f.displayName || f.npub;
                                const fullSuggestion = before + displayName;
                                setPreviewSuffix(fullSuggestion);
                              }
                            }
                          }}
                          className={`suggestionItem ${idx === activeMentionIndex ? 'active' : ''}`}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            background: idx === activeMentionIndex ? 'var(--bg-secondary)' : 'transparent',
                            borderBottom: idx < filteredMentionFollows.length - 1 ? '1px solid var(--border-color)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {f.picture ? (
                            <img
                              src={f.picture}
                              alt={f.displayName}
                              className="suggestionAvatar"
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                objectFit: 'cover'
                              }}
                            />
                          ) : (
                            <div
                              className="suggestionAvatar"
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'var(--bg-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary)',
                                fontSize: '14px'
                              }}
                            >
                              {f.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="suggestionInfo" style={{ flex: 1 }}>
                            <div className="suggestionName" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                              {f.displayName}
                            </div>
                            <div className="suggestionNpub" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {f.npub.substring(0, 20)}…
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Error Messages */}
            {invoiceError && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ef4444', flexShrink: 0 }}>
                  error_outline
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
                    Invalid Invoice
                  </div>
                  <div style={{ fontSize: '12px', color: '#ef4444', lineHeight: '1.5' }}>
                    {invoiceError}
                  </div>
                </div>
              </div>
            )}

            {lnurlError && detectedType === 'lightning-address' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ef4444', flexShrink: 0 }}>
                  error_outline
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
                    Error
                  </div>
                  <div style={{ fontSize: '12px', color: '#ef4444', lineHeight: '1.5' }}>
                    {lnurlError}
                  </div>
                </div>
              </div>
            )}

            {/* Success/Info Messages */}
            {parsedInvoice && !invoiceError && detectedType === 'invoice' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>
                    check_circle
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Invoice Valid
                  </span>
                </div>
                {parsedInvoice.amount && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Amount: <strong style={{ color: 'var(--text-primary)' }}>{parsedInvoice.amount.toLocaleString()} sats</strong>
                  </div>
                )}
                {parsedInvoice.description && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Description: {parsedInvoice.description}
                  </div>
                )}
              </div>
            )}

            {detectedType === 'nostr-user' && detectedNostrProfile && (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {(() => {
                    const profileContent = typeof detectedNostrProfile?.content === 'string'
                      ? JSON.parse(detectedNostrProfile.content)
                      : detectedNostrProfile?.content || detectedNostrProfile;
                    const picture = profileContent?.picture;
                    const displayName = profileContent?.display_name || profileContent?.name || 'Unknown';
                    return (
                      <>
                        {picture ? (
                          <img
                            src={picture}
                            alt={displayName}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: 'var(--bg-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-secondary)',
                              fontSize: '16px'
                            }}
                          >
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {displayName}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {(() => {
                              try {
                                const profileContent = typeof detectedNostrProfile?.content === 'string'
                                  ? JSON.parse(detectedNostrProfile.content)
                                  : detectedNostrProfile?.content || detectedNostrProfile;
                                return profileContent?.lud16 || profileContent?.lud06 || 'No Lightning Address';
                              } catch {
                                return 'No Lightning Address';
                              }
                            })()}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Amount Field (for Lightning Address and Nostr User) */}
          {(detectedType === 'lightning-address' || detectedType === 'nostr-user') && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}
              >
                Amount (sats) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                value={sendAmount}
                onChange={e => {
                  setSendAmount(e.target.value);
                  setLnurlError('');
                  setParsedInvoice(null);
                }}
                placeholder="Enter amount in satoshis"
                disabled={sending || fetchingInvoice}
                min="1"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: lnurlError && !sendInput.trim() ? '2px solid #ef4444' : '2px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  width: '100%',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

        </div>

        {/* Fixed Bottom Section - Description and Buttons */}
        <div style={{ flexShrink: 0, marginTop: 'auto' }}>
          {/* Description Field - Only show when Send to is filled and valid */}
          {sendInput.trim() && detectedType && (
            (detectedType === 'invoice' && parsedInvoice && !invoiceError) ||
            (detectedType === 'lightning-address' && !lnurlError) ||
            (detectedType === 'nostr-user' && detectedNostrProfile)
          ) ? (
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}
              >
                Description (optional)
              </label>
              <input
                type="text"
                value={sendDescription}
                onChange={e => setSendDescription(e.target.value)}
                placeholder="Payment description"
                disabled={sending || fetchingInvoice}
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '2px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  width: '100%',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}
          >
            <button
              className="label"
              onClick={handleClose}
              disabled={sending || fetchingInvoice}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                padding: '8px 16px'
              }}
            >
              Cancel
            </button>
            <button
              className="cta"
              onClick={handleSendPayment}
              disabled={
                sending ||
                fetchingInvoice ||
                !detectedType ||
                (detectedType === 'invoice' && (!!invoiceError || !parsedInvoice)) ||
                ((detectedType === 'lightning-address' || detectedType === 'nostr-user') && !sendAmount.trim())
              }
            >
              {sending ? 'Sending...' : fetchingInvoice ? 'Fetching invoice...' : 'Send Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};



