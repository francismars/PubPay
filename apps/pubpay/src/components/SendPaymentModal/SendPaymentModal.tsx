import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useUIStore,
  NwcClient,
  FollowService,
  ensureProfiles,
  getQueryClient,
  InvoiceService,
  LightningAddressService,
  LnurlService,
  detectPaymentType
} from '@pubpay/shared-services';
import { formatContent } from '../../utils/contentFormatter';
import { sanitizeImageUrl } from '../../utils/profileUtils';
import { TOAST_DURATION, TIMEOUT, COLORS, Z_INDEX, STORAGE_KEYS, LIGHTNING } from '../../constants';
import { validatePaymentAmount, validateInvoice, validateLightningAddressFormat } from '../../utils/validation';
import { useWalletState } from '../../stores/useWalletStore';

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
  const navigate = useNavigate();
  const { balance, balanceLoading } = useWalletState();
  // Unified send input
  const [sendInput, setSendInput] = useState('');
  const [sendDescription, setSendDescription] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

  // Detected type: 'invoice' | 'lightning-address' | 'lnurl' | 'nostr-user' | 'nostr-post' | null
  const [detectedType, setDetectedType] = useState<'invoice' | 'lightning-address' | 'lnurl' | 'nostr-user' | 'nostr-post' | null>(null);
  const [detectedNostrPubkey, setDetectedNostrPubkey] = useState<string | null>(null);
  const [detectedNostrProfile, setDetectedNostrProfile] = useState<any>(null);
  const [detectedPostEvent, setDetectedPostEvent] = useState<any>(null);
  const [detectedPostAuthor, setDetectedPostAuthor] = useState<any>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  const [formattedPostContent, setFormattedPostContent] = useState<string>('');
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

  // LNURL state
  const [lnurlInfo, setLnurlInfo] = useState<{
    callback: string;
    minSendable?: number;
    maxSendable?: number;
    metadata?: string;
    allowsNostr?: boolean;
    commentAllowed?: number;
  } | null>(null);
  const [loadingLnurlInfo, setLoadingLnurlInfo] = useState(false);

  // Nostr follow list state (for autocomplete)
  const [followList, setFollowList] = useState<any[]>([]);
  const [loadingFollowList, setLoadingFollowList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  // Lightning Address domain suggestions
  const [lnAddressDomainQuery, setLnAddressDomainQuery] = useState('');
  const [showLnAddressSuggestions, setShowLnAddressSuggestions] = useState(false);
  const [activeLnAddressIndex, setActiveLnAddressIndex] = useState(0);
  const [previewSuffix, setPreviewSuffix] = useState<string | null>(null);

  // Payment type for Nostr user payments: 'zap' (public) or 'lightning' (private)
  const [paymentType, setPaymentType] = useState<'zap' | 'lightning'>('lightning');
  // Anonymous zap option (only relevant when paymentType === 'zap')
  const [anonymousZap, setAnonymousZap] = useState(false);

  const renderAnonymousToggle = useCallback(
    (disabled: boolean, marginTop: string = '6px') => (
      <button
        type="button"
        onClick={() => setAnonymousZap(!anonymousZap)}
        disabled={disabled}
        style={{
          width: '100%',
          marginTop,
          padding: '6px 10px',
          borderRadius: '4px',
          border: `1px solid ${anonymousZap ? COLORS.PRIMARY : 'var(--border-color)'}`,
          background: anonymousZap ? `${COLORS.PRIMARY}15` : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: '500',
          color: anonymousZap ? COLORS.PRIMARY : 'var(--text-secondary)',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          {anonymousZap ? 'visibility_off' : 'visibility'}
        </span>
        {anonymousZap ? 'Anonymous' : 'Show identity'}
      </button>
    ),
    [anonymousZap]
  );

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

    // Validate invoice format and length first
    const invoiceValidation = validateInvoice(invoice);
    if (!invoiceValidation.valid) {
      setInvoiceError(invoiceValidation.error || 'Invalid invoice');
      setParsedInvoice(null);
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
      // Validate lightning address format first
      const addressValidation = validateLightningAddressFormat(address);
      if (!addressValidation.valid) {
        setLnurlError(addressValidation.error || 'Invalid lightning address format');
        setFetchingInvoice(false);
        return null;
      }

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

  // Discover and decode LNURL info
  const discoverLNURL = useCallback(async (lnurl: string) => {
    setLoadingLnurlInfo(true);
    setLnurlError('');
    setLnurlInfo(null);

    try {
      // Decode LNURL to URL
      const url = LnurlService.decodeLnurl(lnurl);
      if (!url) {
        throw new Error('Invalid LNURL format');
      }

      // Discover LNURL-pay endpoint
      const info = await LnurlService.discoverLNURLPay(url);
      setLnurlInfo(info);

      // Pre-fill amount with minimum (convert from millisats to sats)
      if (info.minSendable) {
        const minSats = Math.ceil(info.minSendable / 1000);
        setSendAmount(minSats.toString());
      }
    } catch (error) {
      console.error('Failed to discover LNURL:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to discover LNURL';
      setLnurlError(errorMessage);
      setLnurlInfo(null);
    } finally {
      setLoadingLnurlInfo(false);
    }
  }, []);

  // Fetch invoice from LNURL (with parameters)
  const fetchInvoiceFromLNURL = async (lnurl: string, amount: number, description?: string): Promise<string | null> => {
    setFetchingInvoice(true);
    setLnurlError('');

    try {
      const invoice = await LnurlService.fetchInvoice(lnurl, amount, { description });
      parseInvoice(invoice);
      return invoice;
    } catch (error) {
      console.error('Failed to fetch invoice from LNURL:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch invoice';
      setLnurlError(errorMessage);
      return null;
    } finally {
      setFetchingInvoice(false);
    }
  };

  // Handle send payment
  const handleSendPayment = async () => {
    if (!detectedType) {
      useUIStore.getState().openToast('Please enter an invoice, Lightning Address, LNURL, or Nostr user', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
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
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      invoiceToPay = sendInput.trim();
    } else if (detectedType === 'lightning-address') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amountValidation = validatePaymentAmount(sendAmount);
      if (!amountValidation.valid) {
        useUIStore.getState().openToast(amountValidation.error || 'Invalid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);

      // Fetch invoice automatically
      useUIStore.getState().openToast('Fetching invoice...', 'loading', true);
      invoiceToPay = await fetchInvoiceFromLNAddress(sendInput.trim(), amount, sendDescription);

      if (!invoiceToPay) {
        useUIStore.getState().updateToast(
          lnurlError || 'Failed to fetch invoice',
          'error',
          true
        );
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

        useUIStore.getState().updateToast('Invoice fetched! Sending payment...', 'loading', true);
    } else if (detectedType === 'lnurl') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amountValidation = validatePaymentAmount(sendAmount);
      if (!amountValidation.valid) {
        useUIStore.getState().openToast(amountValidation.error || 'Invalid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);

      // Fetch invoice automatically
      useUIStore.getState().openToast('Fetching invoice...', 'loading', true);
      invoiceToPay = await fetchInvoiceFromLNURL(sendInput.trim(), amount, sendDescription);

      if (!invoiceToPay) {
        useUIStore.getState().updateToast(
          lnurlError || 'Failed to fetch invoice',
          'error',
          true
        );
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      useUIStore.getState().updateToast('Invoice fetched! Sending payment...', 'loading', true);
      console.log('LNURL invoice fetched:', invoiceToPay ? `${invoiceToPay.substring(0, 50)}...` : 'null');
    } else if (detectedType === 'nostr-post') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amountValidation = validatePaymentAmount(sendAmount);
      if (!amountValidation.valid) {
        useUIStore.getState().openToast(amountValidation.error || 'Invalid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);

      // Validate post event is loaded
      if (!detectedPostEvent) {
        useUIStore.getState().openToast('Post not loaded', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      // Posts can only be zapped (public), not private payments
      // Note: Anonymous zaps don't require login
      if (!anonymousZap && (!authState?.isLoggedIn || !authState?.publicKey)) {
        useUIStore.getState().openToast('Please log in to zap posts', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      try {
        useUIStore.getState().updateToast(
          anonymousZap ? 'Creating anonymous zap request...' : 'Creating zap request...',
          'loading',
          true
        );

        // Import ZapService
        const { ZapService } = await import('@pubpay/shared-services');
        const zapService = new ZapService();

        // Get callback for the post author
        const callback = await zapService.getInvoiceCallBack(detectedPostEvent, detectedPostAuthor);
        if (!callback) {
          throw new Error('Failed to get Lightning callback');
        }

        // Create zap event for the post
        const zapEventData = await zapService.createZapEvent(
          detectedPostEvent,
          amount,
          callback.lud16ToZap,
          anonymousZap ? null : (authState?.publicKey || null),
          sendDescription
        );

        if (!zapEventData) {
          throw new Error('Failed to create zap request');
        }

        // Sign and send zap
        const success = await zapService.signZapEvent(
          zapEventData.zapEvent,
          callback.callbackToZap,
          zapEventData.amountPay,
          callback.lud16ToZap,
          detectedPostEvent.id,
          anonymousZap,
          anonymousZap ? null : (authState?.privateKey || null)
        );

        if (success) {
          useUIStore.getState().updateToast(
            anonymousZap ? 'Anonymous zap sent!' : 'Zap sent!',
            'success',
            false
          );
            setTimeout(async () => {
              useUIStore.getState().closeToast();
              handleClose();
              onPaymentSent();
              // Navigate to post page after zap
              try {
                const { nip19 } = await import('nostr-tools');
                const nevent = nip19.noteEncode(detectedPostEvent.id);
                navigate(`/note/${nevent}`);
              } catch (error) {
                console.error('Failed to navigate to post:', error);
              }
            }, 2000);
        } else {
          useUIStore.getState().updateToast('Failed to send zap', 'error', true);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        }
      } catch (error) {
        console.error('Zap payment error:', error);
        const errorMessage = error instanceof Error
          ? error.message
          : 'Failed to send zap';
        useUIStore.getState().updateToast(errorMessage, 'error', true);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
      }
      return; // Exit early for zap flow (doesn't use invoiceToPay)
    } else if (detectedType === 'nostr-user') {
      // Validate amount
      if (!sendAmount.trim()) {
        useUIStore.getState().openToast('Please enter an amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amountValidation = validatePaymentAmount(sendAmount);
      if (!amountValidation.valid) {
        useUIStore.getState().openToast(amountValidation.error || 'Invalid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        return;
      }

      const amount = parseInt(sendAmount.trim(), 10);

      // Get lightning address from profile
      if (!detectedNostrProfile) {
        useUIStore.getState().openToast('Loading user profile...', 'loading', true);
        try {
          const profileMap = await ensureProfiles(getQueryClient(), nostrClient, [detectedNostrPubkey!]);
          const profile = profileMap.get(detectedNostrPubkey!);
          setDetectedNostrProfile(profile || null);
          if (!profile) {
            useUIStore.getState().updateToast('User profile not found', 'error', true);
            setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
            return;
          }
        } catch {
          useUIStore.getState().updateToast('Failed to load user profile', 'error', true);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
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
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        return;
      }

      // Handle zap vs lightning payment
      if (paymentType === 'zap') {
        // Send as public zap
        // Note: Anonymous zaps don't require login (same as posts)
        if (!anonymousZap && (!authState?.isLoggedIn || !authState?.publicKey)) {
          useUIStore.getState().openToast('Please log in to send zaps', 'error', false);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          return;
        }

        try {
          useUIStore.getState().updateToast(
            anonymousZap ? 'Creating anonymous zap request...' : 'Creating zap request...',
            'loading',
            true
          );

          // Import ZapService
          const { ZapService } = await import('@pubpay/shared-services');
          const zapService = new ZapService();

          // Send profile zap - pass null for pubkey/private key if anonymous
          const success = await zapService.sendProfileZap(
            detectedNostrPubkey!,
            detectedNostrProfile,
            amount,
            sendDescription,
            anonymousZap ? null : (authState?.publicKey || null),
            anonymousZap ? null : (authState?.privateKey || null),
            anonymousZap // Pass anonymous flag
          );

          if (success) {
            useUIStore.getState().updateToast(
              anonymousZap ? 'Anonymous zap sent!' : 'Zap sent!',
              'success',
              false
            );
            setTimeout(() => {
              useUIStore.getState().closeToast();
              handleClose();
              onPaymentSent();
              // Navigate to recipient's profile page after public payment
              if (detectedNostrPubkey) {
                try {
                  navigate(`/profile/${detectedNostrPubkey}`);
                } catch (error) {
                  console.error('Failed to navigate to profile:', error);
                }
              }
            }, 2000);
          } else {
            useUIStore.getState().updateToast('Failed to send zap', 'error', true);
            setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          }
        } catch (error) {
          console.error('Zap payment error:', error);
          const errorMessage = error instanceof Error
            ? error.message
            : 'Failed to send zap';
          useUIStore.getState().updateToast(errorMessage, 'error', true);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        }
        return; // Exit early for zap flow (doesn't use invoiceToPay)
      } else {
        // Send as private lightning payment (existing behavior)
        useUIStore.getState().updateToast('Fetching invoice...', 'loading', true);
        invoiceToPay = await fetchInvoiceFromLNAddress(lud16, amount, sendDescription);

        if (!invoiceToPay) {
          useUIStore.getState().updateToast(
            lnurlError || 'Failed to fetch invoice',
            'error',
            true
          );
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          return;
        }

        useUIStore.getState().updateToast('Invoice fetched! Sending payment...', 'loading', true);
      }
    }

    if (!invoiceToPay) {
      useUIStore.getState().openToast('No invoice to pay', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return;
    }

    // Check if auto-pay with NWC is enabled
    const nwcAutoPay = localStorage.getItem(STORAGE_KEYS.NWC_AUTO_PAY);
    const shouldAutoPay = nwcAutoPay === null || nwcAutoPay === 'true'; // Default to true for backward compatibility

    // If no NWC client OR auto-pay is disabled, show invoice overlay instead
    if (!nwcClient || !shouldAutoPay) {
      useUIStore.getState().closeToast();
      handleClose();
      // Extract amount from invoice if possible
      let amount = 0;
      try {
        const { InvoiceService } = await import('@pubpay/shared-services');
        const parsed = InvoiceService.parseBolt11(invoiceToPay);
        if (parsed.success && parsed.data?.amount) {
          amount = parsed.data.amount;
        }
      } catch {
        // Ignore parsing errors
      }
      // Show invoice overlay
      useUIStore.getState().openInvoice({
        bolt11: invoiceToPay,
        amount: amount * LIGHTNING.MILLISATS_PER_SAT, // Convert to millisats
        eventId: '',
        zapRequestId: undefined
      });
      return;
    }

    setSending(true);
    try {
      // Validate invoice before sending
      if (!invoiceToPay || !invoiceToPay.trim()) {
        throw new Error('Invalid invoice: invoice is empty');
      }
      if (!invoiceToPay.match(/^(lnbc|lntb|lnbcrt)/i)) {
        throw new Error('Invalid invoice format');
      }

      console.log('Sending payment with invoice:', `${invoiceToPay.substring(0, 50)}...`);
      useUIStore.getState().openToast('Sending payment...', 'loading', true);
      const response = await nwcClient.payInvoice(invoiceToPay);
      console.log('NWC payment response:', response);
      if (response.error) {
        console.error('NWC payment error:', response.error);
        const errorMessage = response.error.message || response.error.code || 'Payment failed';
        useUIStore.getState().updateToast(
          errorMessage,
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
      } else {
        // No error and no result - unexpected response
        console.error('Unexpected NWC response:', response);
        useUIStore.getState().updateToast(
          'Unexpected response from wallet',
          'error',
          true
        );
      }
    } catch (error) {
      console.error('Send payment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      useUIStore.getState().updateToast(
        errorMessage,
        'error',
        true
      );
    } finally {
      setSending(false);
    }
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
  // When query is empty, show all follows (for the icon button)
  const filteredMentionFollows = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q || q.length < 1) {
      // Show all follows when query is empty (icon button clicked or just "@")
      return followList;
    }
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
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
    } else if (detection.type === 'lightning-address') {
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
    } else if (detection.type === 'lnurl') {
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
      // Discover LNURL info
      discoverLNURL(detection.data);
    } else if (detection.type === 'nostr-user') {
      setDetectedNostrPubkey(detection.data.pubkey);
      setDetectedNostrProfile(null);
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
      // Load profile
      ensureProfiles(getQueryClient(), nostrClient, [detection.data.pubkey])
        .then(profileMap => {
          const profile = profileMap.get(detection.data.pubkey);
          setDetectedNostrProfile(profile || null);
        });
    } else if (detection.type === 'nostr-post') {
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
      setLoadingPost(true);

      // Fetch post event
      const postData = detection.data;
      const eventId = postData.eventId;

      nostrClient.getEvents([{ kinds: [1], ids: [eventId] }])
        .then((events: any[]) => {
          if (events && events.length > 0) {
            const postEvent = events[0];
            setDetectedPostEvent(postEvent);

            // Fetch author profile
            ensureProfiles(getQueryClient(), nostrClient, [postEvent.pubkey])
              .then(profileMap => {
                const author = profileMap.get(postEvent.pubkey);
                setDetectedPostAuthor(author || null);
                setLoadingPost(false);
              })
              .catch(() => {
                setLoadingPost(false);
              });
          } else {
            setLoadingPost(false);
            useUIStore.getState().openToast('Post not found', 'error', false);
            setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
          }
        })
        .catch((error: any) => {
          console.error('Failed to fetch post:', error);
          setLoadingPost(false);
          useUIStore.getState().openToast('Failed to load post', 'error', false);
          setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
        });
    } else {
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
    }
  }, [sendInput, parseInvoice, nostrClient, discoverLNURL]);

  // Format post content for preview (links, mentions, media)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!detectedPostEvent?.content) {
        setFormattedPostContent('');
        return;
      }
      try {
        const rich = await formatContent(detectedPostEvent.content, nostrClient);
        if (!cancelled) setFormattedPostContent(rich);
      } catch (error) {
        console.error('Failed to format post content:', error);
        if (!cancelled) setFormattedPostContent(detectedPostEvent.content || '');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [detectedPostEvent?.content, nostrClient]);

  // Listen for scanned invoices and Lightning Addresses
  useEffect(() => {
    if (!isVisible) return;

    // Check sessionStorage first (in case we navigated here and event was missed)
    const scannedInvoice = sessionStorage.getItem(STORAGE_KEYS.SCANNED_INVOICE);
    if (scannedInvoice) {
      sessionStorage.removeItem(STORAGE_KEYS.SCANNED_INVOICE);
      setSendInput(scannedInvoice);
      return;
    }

    const scannedAddress = sessionStorage.getItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
    if (scannedAddress) {
      sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
      setSendInput(scannedAddress);
      return;
    }

    const scannedLnurl = sessionStorage.getItem(STORAGE_KEYS.SCANNED_LNURL);
    if (scannedLnurl) {
      sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LNURL);
      setSendInput(scannedLnurl);
      return;
    }

    const handleScannedInvoice = (e: CustomEvent) => {
      const invoice = e.detail?.invoice;
      if (invoice) {
        sessionStorage.removeItem(STORAGE_KEYS.SCANNED_INVOICE);
        setSendInput(invoice);
      }
    };

    const handleScannedLightningAddress = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
        setSendInput(address);
      }
    };

    const handleScannedLnurl = (e: CustomEvent) => {
      const lnurl = e.detail?.lnurl;
      if (lnurl) {
        sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LNURL);
        setSendInput(lnurl);
      }
    };

    window.addEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
    window.addEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);
    window.addEventListener('walletScannedLnurl', handleScannedLnurl as EventListener);

    return () => {
      window.removeEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
      window.removeEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);
      window.removeEventListener('walletScannedLnurl', handleScannedLnurl as EventListener);
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
      setLnurlInfo(null);
      setDetectedType(null);
      setDetectedNostrPubkey(null);
      setDetectedNostrProfile(null);
      setDetectedPostEvent(null);
      setDetectedPostAuthor(null);
      setPreviewSuffix(null);
      setPaymentType('lightning'); // Reset payment type
      setAnonymousZap(false); // Reset anonymous zap
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
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '5vh',
        paddingBottom: '5vh',
        animation: 'none',
        transition: 'none',
        overflowY: 'auto'
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
          {nwcClient && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'var(--bg-secondary)',
              border: '2px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-primary)'
            }}>
              {balanceLoading ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>
                    hourglass_empty
                  </span>
                  <span>Loading...</span>
                </>
              ) : balance !== null && balance !== undefined ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    account_balance_wallet
                  </span>
                  <span>{balance.toLocaleString()} sats</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    account_balance_wallet
                  </span>
                  <span>Balance unavailable</span>
                </>
              )}
            </div>
          )}
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
                Send to <span style={{ color: COLORS.ERROR }}>*</span>
                {detectedType && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    ({
                      detectedType === 'invoice'
                        ? 'Invoice'
                        : detectedType === 'lightning-address'
                          ? 'Lightning Address'
                          : detectedType === 'lnurl'
                            ? 'LNURL'
                            : detectedType === 'nostr-post'
                              ? 'Nostr Post'
                              : 'Nostr User'
                    })
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
                        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
                      }
                    } catch (error) {
                      console.error('Failed to read clipboard:', error);
                      useUIStore.getState().openToast('Failed to read from clipboard', 'error', false);
                      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
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
                    border: invoiceError ? `2px solid ${COLORS.ERROR}` : parsedInvoice ? `2px solid ${COLORS.SUCCESS}` : '2px solid var(--border-color)',
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
                        }, TIMEOUT.DEBOUNCE);
                      }}
                      placeholder={previewSuffix ? '' : 'Enter invoice, Lightning Address, LNURL, npub, or type @...'}
                      disabled={sending || fetchingInvoice}
                      style={{
                        backgroundColor: 'var(--input-bg)',
                        color: previewSuffix ? 'transparent' : 'var(--text-primary)',
                        border: (invoiceError || lnurlError) ? `2px solid ${COLORS.ERROR}` : (detectedType && sendInput.trim()) ? `2px solid ${COLORS.SUCCESS}` : '2px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '12px 48px 12px 16px',
                        width: '100%',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    {/* Follows dropdown button */}
                    {authState?.isLoggedIn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const input = sendInputRef.current;
                          if (!input) return;

                          // Insert "@" at cursor position or at the end
                          const currentValue = input.value;
                          const caret = input.selectionStart || currentValue.length;
                          const before = currentValue.slice(0, caret);
                          const after = currentValue.slice(caret);

                          // Only add "@" if there isn't already one at the cursor position
                          const needsAt = !before.endsWith('@') && (caret === 0 || /\s/.test(before.slice(-1)));
                          if (needsAt) {
                            const newValue = `${before}@${after}`;
                            setSendInput(newValue);
                            // Focus and position cursor after "@"
                            setTimeout(() => {
                              input.focus();
                              const newPos = `${before}@`.length;
                              input.setSelectionRange(newPos, newPos);
                              // Trigger mention detection
                              detectMention();
                            }, 0);
                          } else {
                            // If "@" already exists, just focus and trigger detection
                            input.focus();
                            detectMention();
                          }
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input from losing focus
                        }}
                        disabled={sending || fetchingInvoice}
                        tabIndex={-1}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '-20px',
                          bottom: '0',
                          margin: 'auto 0',
                          background: 'transparent',
                          border: 'none',
                          cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-secondary)',
                          opacity: (sending || fetchingInvoice) ? 0.5 : 1,
                          transition: 'color 0.2s ease',
                          outline: 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!sending && !fetchingInvoice) {
                            e.currentTarget.style.color = COLORS.PRIMARY;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!sending && !fetchingInvoice) {
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                        title="Select from follows"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                          people
                        </span>
                      </button>
                    )}
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
                        zIndex: Z_INDEX.DROPDOWN,
                        maxHeight: '240px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        width: '100%',
                        boxSizing: 'border-box'
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
                              transition: 'background 0.15s ease',
                              minWidth: 0,
                              overflow: 'hidden'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                              alternate_email
                            </span>
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {fullAddress}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {provider}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Nostr User Mention Suggestions */}
                  {showMentionSuggestions && (
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
                        zIndex: Z_INDEX.DROPDOWN,
                        maxHeight: '240px',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    >
                      {loadingFollowList ? (
                        <div
                          style={{
                            padding: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: '20px',
                              animation: 'spin 1s linear infinite',
                              display: 'inline-block'
                            }}
                          >
                            progress_activity
                          </span>
                          <span style={{ fontSize: '14px' }}>Loading follows...</span>
                        </div>
                      ) : filteredMentionFollows.length > 0 ? (
                        filteredMentionFollows.map((f: any, idx: number) => (
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
                            transition: 'background 0.15s ease',
                            minWidth: 0,
                            overflow: 'hidden'
                          }}
                        >
                          {(() => {
                            const sanitized = sanitizeImageUrl(f.picture);
                            return sanitized ? (
                              <img
                                src={sanitized}
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
                          );
                        })()}
                          <div className="suggestionInfo" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <div className="suggestionName" style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.displayName}
                            </div>
                            <div className="suggestionNpub" style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.npub.substring(0, 20)}…
                            </div>
                          </div>
                        </div>
                        ))
                      ) : (
                        <div
                          style={{
                            padding: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            fontSize: '14px'
                          }}
                        >
                          No follows found
                        </div>
                      )}
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
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: COLORS.ERROR, flexShrink: 0 }}>
                  error_outline
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.ERROR, marginBottom: '4px' }}>
                    Invalid Invoice
                  </div>
                  <div style={{ fontSize: '12px', color: COLORS.ERROR, lineHeight: '1.5' }}>
                    {invoiceError}
                  </div>
                </div>
              </div>
            )}

            {lnurlError && (detectedType === 'lightning-address' || detectedType === 'lnurl') && (
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
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: COLORS.ERROR, flexShrink: 0 }}>
                  error_outline
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.ERROR, marginBottom: '4px' }}>
                    Error
                  </div>
                  <div style={{ fontSize: '12px', color: COLORS.ERROR, lineHeight: '1.5' }}>
                    {lnurlError}
                  </div>
                </div>
              </div>
            )}

            {/* Instructions - Show when input is empty or no valid format detected yet */}
            {!sendInput.trim() && !detectedType && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  info
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Accepted Formats
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • BOLT11 invoice (lnbc, lntb, or lnbcrt)<br />
                    • Lightning Address (e.g., user@domain.com)<br />
                    • LNURL (lnurl1)<br />
                    • Nostr user (npub or nprofile)<br />
                    • Nostr post (note1 or nevent1)<br />
                    • Type @ to mention a follow
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
                {parsedInvoice.amount && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Amount: <strong style={{ color: 'var(--text-primary)' }}>{parsedInvoice.amount.toLocaleString()} sats</strong>
                  </div>
                )}
                {parsedInvoice.description && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: parsedInvoice.amount ? '4px' : '0' }}>
                    Description: {parsedInvoice.description}
                  </div>
                )}
              </div>
            )}

            {/* LNURL Info Display */}
            {detectedType === 'lnurl' && loadingLnurlInfo && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                  hourglass_empty
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Loading LNURL info...
                </span>
              </div>
            )}

            {detectedType === 'lnurl' && lnurlInfo && !lnurlError && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                {lnurlInfo.minSendable && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Min: <strong style={{ color: 'var(--text-primary)' }}>{Math.ceil(lnurlInfo.minSendable / 1000).toLocaleString()} sats</strong>
                  </div>
                )}
                {lnurlInfo.maxSendable && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: lnurlInfo.minSendable ? '4px' : '0' }}>
                    Max: <strong style={{ color: 'var(--text-primary)' }}>{Math.floor(lnurlInfo.maxSendable / 1000).toLocaleString()} sats</strong>
                  </div>
                )}
                {(() => {
                  if (!lnurlInfo.metadata) return null;

                  try {
                    // LNURL metadata is a JSON string: [["text/plain", "description"], ...]
                    const metadata = JSON.parse(lnurlInfo.metadata);

                    if (!Array.isArray(metadata)) return null;

                    // Find the first text/plain entry
                    const textEntry = metadata.find(
                      (item: any) => Array.isArray(item) && item[0] === 'text/plain' && item[1]
                    );

                    if (textEntry && textEntry[1]) {
                      return (
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: (lnurlInfo.minSendable || lnurlInfo.maxSendable) ? '4px' : '0' }}>
                          Description: {textEntry[1]}
                        </div>
                      );
                    }
                  } catch (error) {
                    console.error('Failed to parse LNURL metadata:', error, lnurlInfo.metadata);
                  }

                  return null;
                })()}
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
                        {(() => {
                          const sanitized = sanitizeImageUrl(picture);
                          return sanitized ? (
                            <img
                              src={sanitized}
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
                        );
                      })()}
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

            {/* Post Preview - Show when post is detected */}
            {detectedType === 'nostr-post' && (
              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  marginTop: '12px'
                }}
              >
                {loadingPost ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>
                      refresh
                    </span>
                    <span style={{ fontSize: '14px' }}>Loading post...</span>
                  </div>
                ) : detectedPostEvent && detectedPostAuthor ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      {(() => {
                        const authorContent = typeof detectedPostAuthor?.content === 'string'
                          ? JSON.parse(detectedPostAuthor.content)
                          : detectedPostAuthor?.content || detectedPostAuthor;
                        const picture = authorContent?.picture;
                        const displayName = authorContent?.display_name || authorContent?.name || 'Unknown';
                        return (
                          <>
                            {(() => {
                              const sanitized = sanitizeImageUrl(picture);
                              return sanitized ? (
                                <img
                                  src={sanitized}
                                  alt={displayName}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    objectFit: 'cover'
                                  }}
                                />
                              ) : (
                              <div
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
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                            );
                          })()}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                              {displayName}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.5',
                        marginTop: '8px',
                        maxHeight: '60px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      dangerouslySetInnerHTML={{
                        __html: formattedPostContent || 'No content'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ color: COLORS.ERROR, fontSize: '13px' }}>
                    Post not found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Type Toggle - Only show for Nostr User */}
          {detectedType === 'nostr-user' && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '3px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setPaymentType('lightning')}
                  disabled={sending || fetchingInvoice}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: paymentType === 'lightning' ? COLORS.PRIMARY : 'transparent',
                    color: paymentType === 'lightning' ? COLORS.TEXT_WHITE : 'var(--text-primary)',
                    cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    opacity: (sending || fetchingInvoice) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('zap')}
                  disabled={sending || fetchingInvoice}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: paymentType === 'zap' ? COLORS.PRIMARY : 'transparent',
                    color: paymentType === 'zap' ? COLORS.TEXT_WHITE : 'var(--text-primary)',
                    cursor: (sending || fetchingInvoice) ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease',
                    opacity: (sending || fetchingInvoice) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  Public
                </button>
              </div>
              {/* Anonymous toggle - integrated design when zap is selected */}
              {paymentType === 'zap' && renderAnonymousToggle(sending || fetchingInvoice)}
            </div>
          )}
          {/* Anonymous toggle for posts - posts can only be zapped */}
          {detectedType === 'nostr-post' && (
            <div style={{ marginBottom: '12px' }}>
              {renderAnonymousToggle(sending || fetchingInvoice || loadingPost, '0')}
            </div>
          )}

          {/* Amount Field (for Lightning Address, LNURL, Nostr User, and Nostr Post) */}
          {(detectedType === 'lightning-address' || detectedType === 'lnurl' || detectedType === 'nostr-user' || detectedType === 'nostr-post') && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}
              >
                Amount (sats) <span style={{ color: COLORS.ERROR }}>*</span>
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
                  border: lnurlError && !sendInput.trim() ? `2px solid ${COLORS.ERROR}` : '2px solid var(--border-color)',
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
            (detectedType === 'lnurl' && lnurlInfo && !lnurlError) ||
            (detectedType === 'nostr-user' && detectedNostrProfile) ||
            (detectedType === 'nostr-post' && detectedPostEvent && !loadingPost)
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
                Comment (optional)
              </label>
              <input
                type="text"
                value={sendDescription}
                onChange={e => {
                  // Limit length for LNURL if commentAllowed is set
                  if (detectedType === 'lnurl' && lnurlInfo?.commentAllowed) {
                    if (e.target.value.length <= lnurlInfo.commentAllowed) {
                      setSendDescription(e.target.value);
                    }
                  } else {
                    setSendDescription(e.target.value);
                  }
                }}
                placeholder="Add a comment"
                disabled={sending || fetchingInvoice || (detectedType === 'nostr-post' && loadingPost)}
                maxLength={detectedType === 'lnurl' && lnurlInfo?.commentAllowed ? lnurlInfo.commentAllowed : undefined}
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
                ((detectedType === 'lightning-address' || detectedType === 'lnurl' || detectedType === 'nostr-user' || detectedType === 'nostr-post') && !sendAmount.trim()) ||
                (detectedType === 'nostr-post' && (!detectedPostEvent || loadingPost))
              }
            >
              {(() => {
                if (sending) {
                  if ((detectedType === 'nostr-user' && paymentType === 'zap') || detectedType === 'nostr-post') {
                    return anonymousZap ? 'Paying anonymously...' : 'Paying...';
                  }
                  return 'Paying...';
                }
                if (fetchingInvoice) {
                  return 'Fetching invoice...';
                }
                if (detectedType === 'invoice') {
                  return 'Pay Invoice';
                }
                if (detectedType === 'nostr-post') {
                  return anonymousZap ? 'Pay Anonymously' : 'Pay Publicly';
                }
                if (detectedType === 'nostr-user' && paymentType === 'zap') {
                  return anonymousZap ? 'Pay Anonymously' : 'Pay Publicly';
                }
                if (detectedType === 'nostr-user' && paymentType === 'lightning') {
                  return 'Pay';
                }
                if (detectedType === 'lightning-address' || detectedType === 'lnurl') {
                  return 'Pay';
                }
                return 'Pay';
              })()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};



