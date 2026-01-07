import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useUIStore, NwcClient, ensureProfiles, getQueryClient } from '@pubpay/shared-services';
import { Kind9735Event, Kind0Event } from '@pubpay/shared-types';
import { nip19 } from 'nostr-tools';
import { NWCOptionsModal } from '../components/NWCOptionsModal/NWCOptionsModal';
import { SendPaymentModal } from '../components/SendPaymentModal/SendPaymentModal';
import { ReceivePaymentModal } from '../components/ReceivePaymentModal/ReceivePaymentModal';
import { getActiveNWCUri, getActiveNWCConnection, getActiveNWCConnectionId, migrateOldNWCConnection } from '../utils/nwcStorage';
import { TOAST_DURATION, INTERVAL, LIGHTNING, TIME, COLORS, STORAGE_KEYS, QUERY_LIMITS, DIMENSIONS } from '../constants';
import { useWalletState, useWalletActions, type Invoice } from '../stores/useWalletStore';
import { validatePaymentAmount } from '../utils/validation';
import { extractZapAmount, extractZapPayerPubkey, extractZapContent } from '@pubpay/shared-services';
import { sanitizeImageUrl } from '../utils/profileUtils';
import { genericUserIcon } from '../assets/images';
import { TransactionCard } from '../components/TransactionCard/TransactionCard';

type PaymentView = 'wallet' | 'public';

interface PublicZap {
  id: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  payerPubkey: string;
  recipientPubkey: string;
  payerProfile: Kind0Event | null;
  recipientProfile: Kind0Event | null;
  content: string;
  eventId: string | null; // Related post/note ID
  created_at: number;
  bolt11: string | null;
  preimage: string | null;
}

// Format timestamp display - shared utility function
export const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) return '—';
  const date = new Date(timestamp * TIME.MILLISECONDS_PER_SECOND);
  
  // Format: "Jan 3, 2009 – 06:23pm"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  
  return `${month} ${day}, ${year} – ${hours}:${minutesStr}${ampm}`;
};

const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  // Get auth state and nostr client from outlet context
  const {
    authState,
    nostrClient
  } = useOutletContext<{
    authState: any;
    nostrClient: any;
  }>();

  // Extract specific fields from authState to prevent unnecessary re-renders
  const isLoggedIn = authState?.isLoggedIn ?? false;
  const publicKey = authState?.publicKey ?? null;

  // View toggle
  const [paymentView, setPaymentView] = useState<PaymentView>('public');

  // Use wallet store for wallet-related state
  const {
    nwcClient,
    balance,
    balanceLoading,
    balanceError,
    transactions,
    transactionsLoading,
    transactionsError,
    receiveInvoice,
    generatingInvoice,
    lastBalanceUpdate
  } = useWalletState();
  const {
    setNwcClient,
    setBalance,
    setBalanceLoading,
    setBalanceError,
    setLastBalanceUpdate,
    setTransactions,
    setTransactionsLoading,
    setTransactionsError,
    setReceiveInvoice,
    setGeneratingInvoice,
    clearBalance,
    clearTransactions
  } = useWalletActions();

  // Public Payments state
  const [publicZaps, setPublicZaps] = useState<PublicZap[]>([]);
  const [publicZapsLoading, setPublicZapsLoading] = useState(false);
  const [publicZapsError, setPublicZapsError] = useState<string>('');
  const [visiblePublicZapsCount, setVisiblePublicZapsCount] = useState(10);

  // Local UI state (not in store)
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveOption, setReceiveOption] = useState<'public-address' | 'create-note' | 'create-invoice'>('create-note');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveDescription, setReceiveDescription] = useState('');
  const [visibleTransactionsCount, setVisibleTransactionsCount] = useState(5);

  // Get user's lightning address from profile
  const userLightningAddress = useMemo(() => {
    if (!authState?.userProfile?.content) return null;
    try {
      const profileData = JSON.parse(authState.userProfile.content);
      return profileData.lud16 || profileData.lud06 || null;
    } catch {
      return null;
    }
  }, [authState?.userProfile]);

  // Initialize NWC client and reload when active connection changes
  useEffect(() => {
    // Migrate old format if needed
    migrateOldNWCConnection();

    const initializeClient = () => {
      const nwcUri = getActiveNWCUri();
      if (nwcUri) {
        try {
          const client = new NwcClient(nwcUri);
          setNwcClient(client);
        } catch (error) {
          console.error('Failed to initialize NWC client:', error);
          setNwcClient(null);
        }
      } else {
        setNwcClient(null);
      }
    };

    // Initialize on mount
    initializeClient();

    // Listen for storage changes (when active connection changes in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nwcActiveConnectionId' || e.key === 'nwcConnections') {
        initializeClient();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Track active connection ID and reload when it changes
  const activeConnectionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const reloadClient = () => {
      const currentActiveId = getActiveNWCConnectionId();
      if (currentActiveId !== activeConnectionIdRef.current) {
        activeConnectionIdRef.current = currentActiveId;

        // Reload client
        const nwcUri = getActiveNWCUri();
        if (nwcUri) {
          try {
            const client = new NwcClient(nwcUri);
            setNwcClient(client);
          } catch (error) {
            console.error('Failed to initialize NWC client:', error);
            setNwcClient(null);
          }
        } else {
          setNwcClient(null);
        }
      }
    };

    // Check immediately
    activeConnectionIdRef.current = getActiveNWCConnectionId();
    reloadClient();

    // Listen for custom event when active connection changes
    const handleActiveConnectionChanged = () => {
      reloadClient();
    };
    window.addEventListener('nwcActiveConnectionChanged', handleActiveConnectionChanged);

    // Also poll for changes (fallback for cases where event doesn't fire)
    const interval = setInterval(reloadClient, INTERVAL.CLIENT_RELOAD);

    return () => {
      window.removeEventListener('nwcActiveConnectionChanged', handleActiveConnectionChanged);
      clearInterval(interval);
    };
  }, []);

  // Load balance
  const loadBalance = useCallback(async () => {
    if (!nwcClient) {
      setBalance(null);
      return;
    }

    // Check if wallet supports get_balance
    try {
      const connection = getActiveNWCConnection();
      if (connection?.capabilities?.methods) {
        if (!connection.capabilities.methods.includes('get_balance')) {
          setBalanceError('Wallet does not support balance checking');
          return;
        }
      }
    } catch {
      // Wallet may not support get_balance capability check
    }

    setBalanceLoading(true);
    setBalanceError('');
    try {
      const response = await nwcClient.getBalance();
      if (response.error) {
        setBalanceError(response.error.message || 'Failed to get balance');
        setBalance(null);
      } else if (response.result) {
        const rawBalance = response.result.balance;
        console.log('NWC getBalance response:', {
          raw: response.result,
          balance: rawBalance,
          balanceType: typeof rawBalance
        });

        // According to NIP-47 spec, get_balance MUST return balance in millisats
        // Always convert from millisats to sats by dividing by MILLISATS_PER_SAT
        const balanceInSats = Math.floor(rawBalance / LIGHTNING.MILLISATS_PER_SAT);
          console.log(`Converted ${rawBalance} millisats to ${balanceInSats} sats`);

        setBalance(balanceInSats);
        setLastBalanceUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
      setBalanceError(
        error instanceof Error ? error.message : 'Failed to load balance'
      );
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [nwcClient, setBalance, setBalanceLoading, setBalanceError, setLastBalanceUpdate]);

  // Load transactions
  const loadTransactions = useCallback(async () => {
    if (!nwcClient) {
      setTransactions([]);
      return;
    }

    // Check if wallet supports list_transactions
    let supportsListTransactions = true;
    try {
      const connection = getActiveNWCConnection();
      if (connection?.capabilities?.methods) {
        if (!connection.capabilities.methods.includes('list_transactions')) {
          supportsListTransactions = false;
          console.log('Wallet does not support list_transactions method');
        }
      }
    } catch (err) {
      console.warn('Failed to check NWC capabilities:', err);
    }

    if (!supportsListTransactions) {
      setTransactions([]);
      setTransactionsError('Wallet does not support listing transactions');
      setTransactionsLoading(false);
      return;
    }

    setTransactionsLoading(true);
    setTransactionsError('');
    try {
      console.log('Loading transactions...');
      const response = await nwcClient.listTransactions({ limit: QUERY_LIMITS.TRANSACTION_LIST_LIMIT });
      console.log('listTransactions response:', response);

      if (response.error) {
        console.error('listTransactions error:', response.error);
        setTransactionsError(response.error.message || 'Failed to load transactions');
        setTransactions([]);
      } else if (response.result) {
        const transactions = response.result.transactions || [];
        console.log(`Loaded ${transactions.length} transactions:`, transactions);
        // Map transactions to the Invoice interface format for compatibility
        const mappedTransactions = transactions.map((tx: {
          type: 'incoming' | 'outgoing';
          state?: 'pending' | 'settled' | 'expired' | 'failed';
          invoice?: string;
          description?: string;
          description_hash?: string;
          preimage?: string;
          payment_hash: string;
          amount: number;
          fees_paid?: number;
          created_at: number;
          expires_at?: number;
          settled_at?: number;
          metadata?: Record<string, unknown>;
        }) => {
          const mapped = {
            invoice: tx.invoice || '',
            payment_hash: tx.payment_hash,
            preimage: tx.preimage,
            amount: tx.amount,
            description: tx.description,
            created_at: tx.created_at,
            expiry: tx.expires_at ? Math.floor((tx.expires_at - tx.created_at) / TIME.MILLISECONDS_PER_SECOND) : undefined,
            state: tx.state,
            type: tx.type,
            paid_at: tx.settled_at,
            fees_paid: tx.fees_paid,
            metadata: tx.metadata as Invoice['metadata']
          };
          return mapped;
        });
        setTransactions(mappedTransactions);
        if (transactions.length === 0) {
          setTransactionsError(''); // Clear error if we got an empty list (that's valid)
        }
      } else {
        console.warn('listTransactions returned no result');
        setTransactionsError('No transaction data received');
        setTransactions([]);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setTransactionsError(
        error instanceof Error ? error.message : 'Failed to load transactions'
      );
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  }, [nwcClient, setTransactions, setTransactionsLoading, setTransactionsError]);

  // Load public zaps
  const loadPublicZaps = useCallback(async () => {
    if (!isLoggedIn || !publicKey || !nostrClient) {
      setPublicZapsError('Please log in to view public payments');
      setPublicZaps([]);
      return;
    }

    setPublicZapsLoading(true);
    setPublicZapsError('');

    try {
      const userPubkey = publicKey;

      // Load outgoing zaps (where user is the payer)
      const outgoingZapsFilter = {
        kinds: [9735] as number[],
        authors: [userPubkey],
        limit: 100
      };

      // Load incoming zaps (where user is the recipient)
      const incomingZapsFilter = {
        kinds: [9735] as number[],
        '#p': [userPubkey],
        limit: 100
      };

      const [outgoingZapEvents, incomingZapEvents] = await Promise.all([
        nostrClient.getEvents([outgoingZapsFilter]) as Promise<Kind9735Event[]>,
        nostrClient.getEvents([incomingZapsFilter]) as Promise<Kind9735Event[]>
      ]);

      // Combine and process zaps
      const allZaps: PublicZap[] = [];

      // Process outgoing zaps
      for (const zap of outgoingZapEvents) {
        const amount = extractZapAmount(zap);
        if (amount === 0) continue; // Skip zaps with no amount

        const payerPubkey = extractZapPayerPubkey(zap);
        const pTag = zap.tags.find(tag => tag[0] === 'p');
        const recipientPubkey = pTag?.[1] || zap.pubkey; // Fallback to zap event pubkey
        const eTag = zap.tags.find(tag => tag[0] === 'e');
        const eventId = eTag?.[1] || null;
        const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
        const bolt11 = bolt11Tag?.[1] || null;
        const preimageTag = zap.tags.find(tag => tag[0] === 'preimage');
        const preimage = preimageTag?.[1] || null;
        const content = extractZapContent(zap);

        allZaps.push({
          id: zap.id,
          amount,
          type: 'outgoing',
          payerPubkey,
          recipientPubkey,
          payerProfile: null, // Will load later
          recipientProfile: null, // Will load later
          content,
          eventId,
          created_at: zap.created_at,
          bolt11,
          preimage
        });
      }

      // Process incoming zaps
      for (const zap of incomingZapEvents) {
        const amount = extractZapAmount(zap);
        if (amount === 0) continue; // Skip zaps with no amount

        const payerPubkey = extractZapPayerPubkey(zap);
        const recipientPubkey = userPubkey;
        const eTag = zap.tags.find(tag => tag[0] === 'e');
        const eventId = eTag?.[1] || null;
        const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
        const bolt11 = bolt11Tag?.[1] || null;
        const preimageTag = zap.tags.find(tag => tag[0] === 'preimage');
        const preimage = preimageTag?.[1] || null;
        const content = extractZapContent(zap);

        allZaps.push({
          id: zap.id,
          amount,
          type: 'incoming',
          payerPubkey,
          recipientPubkey,
          payerProfile: null, // Will load later
          recipientProfile: null, // Will load later
          content,
          eventId,
          created_at: zap.created_at,
          bolt11,
          preimage
        });
      }

      // Sort by created_at (newest first)
      allZaps.sort((a, b) => b.created_at - a.created_at);

      // Deduplicate by zap ID
      const uniqueZaps = Array.from(
        new Map(allZaps.map(zap => [zap.id, zap])).values()
      );

      // Load profiles for all unique pubkeys
      const pubkeys = new Set<string>();
      uniqueZaps.forEach(zap => {
        pubkeys.add(zap.payerPubkey);
        pubkeys.add(zap.recipientPubkey);
      });

      const queryClient = getQueryClient();
      const profileMap = await ensureProfiles(queryClient, nostrClient, Array.from(pubkeys));

      // Attach profiles to zaps
      const zapsWithProfiles = uniqueZaps.map(zap => ({
        ...zap,
        payerProfile: profileMap.get(zap.payerPubkey) || null,
        recipientProfile: profileMap.get(zap.recipientPubkey) || null
      }));

      setPublicZaps(zapsWithProfiles);
    } catch (error) {
      console.error('Failed to load public zaps:', error);
      setPublicZapsError(
        error instanceof Error ? error.message : 'Failed to load public payments'
      );
      setPublicZaps([]);
    } finally {
      setPublicZapsLoading(false);
    }
  }, [isLoggedIn, publicKey, nostrClient]);

  // Initial load and reload when client changes
  useEffect(() => {
    if (nwcClient) {
      loadBalance();
      loadTransactions();
    } else {
      // Clear data when no client
      clearBalance();
      clearTransactions();
    }
  }, [nwcClient, loadBalance, loadTransactions, clearBalance, clearTransactions]);

  // Load public zaps when switching to public view
  useEffect(() => {
    if (paymentView === 'public') {
      loadPublicZaps();
    }
  }, [paymentView, loadPublicZaps]);

  // Balance auto-refresh disabled - balance refreshes on:
  // 1. NWC client initialization/changes
  // 2. After payment events (via handlePaymentSent)
  // 3. Manual refresh button click

  // Handle payment sent callback
  const handlePaymentSent = useCallback(() => {
    loadBalance();
    loadTransactions();
    if (paymentView === 'public') {
      loadPublicZaps();
    }
  }, [loadBalance, loadTransactions, paymentView, loadPublicZaps]);

  // Listen for scanned invoices and Lightning Addresses to open modal
  useEffect(() => {
    // Check sessionStorage first (in case we navigated here and event was missed)
    const scannedInvoice = sessionStorage.getItem(STORAGE_KEYS.SCANNED_INVOICE);
    if (scannedInvoice) {
      sessionStorage.removeItem(STORAGE_KEYS.SCANNED_INVOICE);
      setShowSendModal(true);
      return;
    }

    const scannedAddress = sessionStorage.getItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
    if (scannedAddress) {
      sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
      setShowSendModal(true);
      return;
    }

    const handleScannedInvoice = (e: CustomEvent) => {
      const invoice = e.detail?.invoice;
      if (invoice) {
        sessionStorage.removeItem(STORAGE_KEYS.SCANNED_INVOICE);
        setShowSendModal(true);
      }
    };

    const handleScannedLightningAddress = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        sessionStorage.removeItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS);
        setShowSendModal(true);
      }
    };

    window.addEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
    window.addEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);

    return () => {
      window.removeEventListener('walletScannedInvoice', handleScannedInvoice as EventListener);
      window.removeEventListener('walletScannedLightningAddress', handleScannedLightningAddress as EventListener);
    };
  }, []);

  // Handle generate receive invoice
  const handleGenerateInvoice = async () => {
    if (!nwcClient) {
      useUIStore.getState().openToast('NWC not connected', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return;
    }

    // Validate amount is provided
    if (!receiveAmount.trim()) {
      useUIStore.getState().openToast(
        'Please enter an amount',
        'error',
        false
      );
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return;
    }

    // Validate amount format and limits
    const amountValidation = validatePaymentAmount(receiveAmount);
    if (!amountValidation.valid) {
      useUIStore.getState().openToast(
        amountValidation.error || 'Invalid amount',
        'error',
        false
      );
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return;
    }

    setGeneratingInvoice(true);
    try {
      const amount = parseInt(receiveAmount.trim(), 10);

      useUIStore.getState().openToast('Generating invoice...', 'loading', true);
      const response = await nwcClient.makeInvoice({
        amount: amount * LIGHTNING.MILLISATS_PER_SAT, // Convert to millisats (amount is now required)
        description: receiveDescription.trim() || undefined
      });

      if (response.error) {
        useUIStore.getState().updateToast(
          response.error.message || 'Failed to generate invoice',
          'error',
          true
        );
      } else if (response.result) {
        setReceiveInvoice(response.result.invoice);
        useUIStore.getState().openToast('Invoice generated!', 'success', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      }
    } catch (error) {
      console.error('Generate invoice error:', error);
      useUIStore.getState().openToast(
        'Failed to generate invoice',
        'error',
        true
      );
    } finally {
      setGeneratingInvoice(false);
    }
  };

  // Format balance display
  const formatBalance = (sats: number | null): string => {
    if (sats === null) return '—';
    return sats.toLocaleString();
  };

  // Check if invoice is expired
  const isInvoiceExpired = (invoice: Invoice): boolean => {
    // Use state field from list_transactions if available
    if (invoice.state === 'expired') return true;
    // Fallback to old logic for backwards compatibility
    if (!invoice.expiry || !invoice.created_at) return false;
    const expiryTime = invoice.created_at + invoice.expiry;
    return Date.now() / TIME.MILLISECONDS_PER_SECOND > expiryTime;
  };

  // Check if invoice is paid
  const isInvoicePaid = (invoice: Invoice): boolean => {
    // Use state field from list_transactions if available
    if (invoice.state === 'settled') return true;
    // For outgoing payments, if paid_at exists, it's settled
    if (invoice.type === 'outgoing' && invoice.paid_at) return true;
    // Fallback to old logic for backwards compatibility
    return !!invoice.paid_at && !!invoice.preimage;
  };

  // Get profile data from Kind0Event - memoized to prevent recreation
  const getProfileData = useCallback((profile: Kind0Event | null) => {
    if (!profile || !profile.content) {
      return { name: 'Anonymous', picture: genericUserIcon };
    }

    try {
      const data = JSON.parse(profile.content);
      return {
        name: data.display_name || data.name || 'Anonymous',
        picture: sanitizeImageUrl(data.picture) || genericUserIcon
      };
    } catch {
      return { name: 'Anonymous', picture: genericUserIcon };
    }
  }, []);

  const activeConnection = getActiveNWCConnection();

  return (
    <div className="profilePage">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}
      >
        <div>
          <h1 className="profilePageTitle" style={{ margin: 0 }}>
            Payments
          </h1>
          {activeConnection && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                margin: '4px 0 0 0'
              }}
            >
              Wallet: {activeConnection.label}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="addButton"
            onClick={() => setShowOptionsModal(true)}
            style={{ fontSize: '14px', padding: '8px 16px' }}
          >
            Wallet Settings
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0px' }}>
        <div style={{ width: '100%' }}>
          {/* Balance Card - Always show */}
          <section style={{ marginBottom: '24px' }}>
            <div>
              <div
                style={{
                  position: 'relative',
                  textAlign: 'center',
                  padding: '32px 24px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}
              >
                {/* Refresh button in top right - Only show if NWC is configured */}
                {nwcClient && (
                  <button
                    onClick={loadBalance}
                    disabled={balanceLoading}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: balanceLoading ? 'wait' : 'pointer',
                      transition: 'all 0.2s ease',
                      color: 'var(--text-secondary)',
                      padding: 0
                    }}
                    onMouseEnter={e => {
                      if (!balanceLoading) {
                        e.currentTarget.style.background = 'var(--bg-primary)';
                        e.currentTarget.style.borderColor = COLORS.PRIMARY;
                        e.currentTarget.style.color = COLORS.PRIMARY;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!balanceLoading) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                    title="Refresh balance"
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '20px',
                        animation: balanceLoading ? 'spin 1s linear infinite' : 'none',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      refresh
                    </span>
                  </button>
                )}

                <p
                  className="label"
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px'
                  }}
                >
                  Balance
                </p>
                {!nwcClient ? (
                  <div
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <p
                      style={{
                        fontSize: '14px',
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                        lineHeight: '1.6',
                        margin: 0
                      }}
                    >
                      Connect wallet in Settings to view balance (optional)
                    </p>
                  </div>
                ) : balanceLoading ? (
                  <div
                    className="skeleton"
                    style={{
                      width: '120px',
                      height: '48px',
                      margin: '0 auto',
                      borderRadius: '8px'
                    }}
                  />
                ) : balanceError ? (
                  <div
                    style={{
                      color: COLORS.ERROR,
                      fontSize: '14px',
                      marginTop: '8px',
                      padding: '12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      error_outline
                    </span>
                    {balanceError}
                  </div>
                ) : (
                  <>
                    <h2
                      style={{
                        fontSize: '48px',
                        fontWeight: '500',
                        margin: '8px 0',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {formatBalance(balance)} <span style={{ fontSize: '24px' }}>sats</span>
                    </h2>
                    {lastBalanceUpdate && (
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-tertiary)',
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                          schedule
                        </span>
                        Updated {Math.floor((Date.now() - lastBalanceUpdate.getTime()) / TIME.MILLISECONDS_PER_SECOND)}s
                        ago
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Send/Receive Actions */}
          <section style={{ marginBottom: '24px' }}>
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px'
                }}
              >
                <button
                  className="cta"
                  onClick={() => setShowSendModal(true)}
                  style={{
                    padding: '14px 20px',
                    fontSize: '14px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: '500'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', fontWeight: '300' }}>
                    send
                  </span>
                  Send
                </button>
                <button
                  className="cta"
                  onClick={() => setShowReceiveModal(true)}
                  style={{
                    padding: '14px 20px',
                    fontSize: '14px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: '500'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px', fontWeight: '300' }}>
                    call_received
                  </span>
                  Receive
                </button>
              </div>
            </div>
          </section>

          {/* View Toggle */}
          <section style={{ marginBottom: '24px' }}>
            <div
              id="paymentViewSelector"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                maxWidth: '560px',
                margin: '0 auto 16px auto',
                gap: '18px'
              }}
            >
              <div
                style={{
                  width: '100%',
                  display: 'inline-flex'
                }}
              >
                <a
                  href="#"
                  className={`feedSelectorLink ${paymentView === 'public' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPaymentView('public');
                  }}
                >
                  Public Payments
                </a>
                <a
                  href="#"
                  className={`feedSelectorLink ${paymentView === 'wallet' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPaymentView('wallet');
                  }}
                >
                  Wallet Payments
                </a>
              </div>
            </div>
          </section>

          {/* Payment History */}
          {paymentView === 'wallet' ? (
            <section style={{ marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>
                  Wallet Payments
                </h3>
                {!nwcClient ? (
                  <div
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      padding: '24px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Connect wallet to view payments
                    </p>
                  </div>
                ) : transactionsLoading ? (
                  <div
                    className="skeleton"
                    style={{
                      height: DIMENSIONS.BANNER_HEIGHT,
                      borderRadius: '8px',
                      marginTop: '16px'
                    }}
                  />
                ) : transactionsError ? (
                  <div
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      padding: '24px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '48px',
                        color: COLORS.ERROR,
                        marginBottom: '12px',
                        display: 'block'
                      }}
                    >
                      error_outline
                    </span>
                    <p
                      style={{
                        color: COLORS.ERROR,
                        marginBottom: '16px',
                        fontSize: '14px'
                      }}
                    >
                      {transactionsError}
                    </p>
                    <button
                      onClick={loadTransactions}
                      disabled={transactionsLoading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: COLORS.TEXT_WHITE,
                        background: COLORS.PRIMARY,
                        border: 'none',
                        borderRadius: '8px',
                        cursor: transactionsLoading ? 'wait' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: transactionsLoading ? 0.7 : 1
                      }}
                      onMouseEnter={e => {
                        if (!transactionsLoading) {
                          e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!transactionsLoading) {
                          e.currentTarget.style.background = COLORS.PRIMARY;
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '18px',
                          animation: transactionsLoading ? 'spin 1s linear infinite' : 'none'
                        }}
                      >
                        refresh
                      </span>
                      {transactionsLoading ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                ) : transactions.length === 0 ? (
                  <p
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      fontSize: '14px',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    No transactions yet
                  </p>
                ) : (
                  <div style={{ marginTop: '16px' }}>
                    {transactions.slice(0, visibleTransactionsCount).map((tx, idx) => (
                      <TransactionCard
                        key={idx}
                        amount={tx.amount || 0}
                        type={tx.type || 'incoming'}
                        created_at={tx.created_at}
                        paid_at={tx.paid_at}
                        transaction={tx}
                        isInvoiceExpired={isInvoiceExpired}
                        isInvoicePaid={isInvoicePaid}
                      />
                    ))}
                    {transactions.length > visibleTransactionsCount && (
                      <button
                        onClick={() => setVisibleTransactionsCount(prev => prev + 10)}
                        style={{
                          width: '100%',
                          marginTop: '12px',
                          padding: '12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--bg-primary)';
                          e.currentTarget.style.borderColor = 'var(--text-secondary)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'var(--bg-secondary)';
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                        }}
                      >
                        Show More ({transactions.length - visibleTransactionsCount} remaining)
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section style={{ marginBottom: '24px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Public Payments
                  </h3>
                  <button
                    onClick={loadPublicZaps}
                    disabled={publicZapsLoading}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      cursor: publicZapsLoading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '18px',
                        animation: publicZapsLoading ? 'spin 1s linear infinite' : 'none'
                      }}
                    >
                      refresh
                    </span>
                    Refresh
                  </button>
                </div>
                {!authState?.isLoggedIn ? (
                  <div
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      padding: '24px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      Please log in to view public payments
                    </p>
                  </div>
                ) : publicZapsLoading ? (
                  <div
                    className="skeleton"
                    style={{
                      height: DIMENSIONS.BANNER_HEIGHT,
                      borderRadius: '8px',
                      marginTop: '16px'
                    }}
                  />
                ) : publicZapsError ? (
                  <div
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      padding: '24px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: '48px',
                        color: COLORS.ERROR,
                        marginBottom: '12px',
                        display: 'block'
                      }}
                    >
                      error_outline
                    </span>
                    <p
                      style={{
                        color: COLORS.ERROR,
                        marginBottom: '16px',
                        fontSize: '14px'
                      }}
                    >
                      {publicZapsError}
                    </p>
                    <button
                      onClick={loadPublicZaps}
                      disabled={publicZapsLoading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: COLORS.TEXT_WHITE,
                        background: COLORS.PRIMARY,
                        border: 'none',
                        borderRadius: '8px',
                        cursor: publicZapsLoading ? 'wait' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: publicZapsLoading ? 0.7 : 1
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '18px',
                          animation: publicZapsLoading ? 'spin 1s linear infinite' : 'none'
                        }}
                      >
                        refresh
                      </span>
                      Retry
                    </button>
                  </div>
                ) : publicZaps.length === 0 ? (
                  <p
                    style={{
                      marginTop: '16px',
                      textAlign: 'center',
                      fontSize: '14px',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    No public payments found
                  </p>
                ) : (
                  <PublicZapList
                    zaps={publicZaps}
                    visibleCount={visiblePublicZapsCount}
                    getProfileData={getProfileData}
                    navigate={navigate}
                    onLoadMore={() => setVisiblePublicZapsCount(prev => prev + 20)}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Options Modal */}
      <NWCOptionsModal
        isVisible={showOptionsModal}
        onClose={() => {
          setShowOptionsModal(false);
          // Reload client if connection was added/changed
          const nwcUri = getActiveNWCUri();
          if (nwcUri) {
            try {
              const client = new NwcClient(nwcUri);
              setNwcClient(client);
            } catch (error) {
              console.error('Failed to initialize NWC client:', error);
              setNwcClient(null);
            }
          } else {
            setNwcClient(null);
          }
        }}
      />

      {/* Send Payment Modal */}
      <SendPaymentModal
        isVisible={showSendModal}
        onClose={() => setShowSendModal(false)}
        nwcClient={nwcClient}
        nostrClient={nostrClient}
        authState={authState}
        onPaymentSent={handlePaymentSent}
      />

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        isVisible={showReceiveModal}
        onClose={() => {
          if (!generatingInvoice) {
            setShowReceiveModal(false);
            setReceiveAmount('');
            setReceiveDescription('');
            setReceiveInvoice(null);
            setReceiveOption('create-note');
          }
        }}
        receiveOption={receiveOption}
        setReceiveOption={setReceiveOption}
        userLightningAddress={userLightningAddress}
        isLoggedIn={isLoggedIn}
        nwcClient={nwcClient}
        receiveAmount={receiveAmount}
        setReceiveAmount={setReceiveAmount}
        receiveDescription={receiveDescription}
        setReceiveDescription={setReceiveDescription}
        receiveInvoice={receiveInvoice}
        setReceiveInvoice={setReceiveInvoice}
        generatingInvoice={generatingInvoice}
        handleGenerateInvoice={handleGenerateInvoice}
        onInvoiceGenerated={() => {
          loadBalance();
          loadTransactions();
        }}
        onOpenNWCOptions={() => setShowOptionsModal(true)}
      />
    </div>
  );
};

// Memoized component for public zap list items to prevent unnecessary re-renders
const PublicZapList = React.memo<{
  zaps: PublicZap[];
  visibleCount: number;
  getProfileData: (profile: Kind0Event | null) => { name: string; picture: string };
  navigate: (path: string) => void;
  onLoadMore: () => void;
}>(({ zaps, visibleCount, getProfileData, navigate, onLoadMore }) => {

  const visibleZaps = useMemo(() => zaps.slice(0, visibleCount), [zaps, visibleCount]);

  return (
    <div style={{ marginTop: '16px' }}>
      {visibleZaps.map((zap) => (
        <TransactionCard
          key={zap.id}
          amount={zap.amount}
          type={zap.type}
          created_at={zap.created_at}
          zap={zap}
          getProfileData={getProfileData}
        />
      ))}
      {zaps.length > visibleCount && (
        <button
          onClick={onLoadMore}
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-primary)';
            e.currentTarget.style.borderColor = 'var(--text-secondary)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.borderColor = 'var(--border-color)';
          }}
        >
          Show More ({zaps.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  return (
    prevProps.zaps.length === nextProps.zaps.length &&
    prevProps.visibleCount === nextProps.visibleCount &&
    prevProps.zaps.every((zap, index) => {
      const nextZap = nextProps.zaps[index];
      return (
        zap.id === nextZap.id &&
        zap.amount === nextZap.amount &&
        zap.type === nextZap.type &&
        zap.content === nextZap.content &&
        zap.created_at === nextZap.created_at &&
        zap.preimage === nextZap.preimage
      );
    })
  );
});

PublicZapList.displayName = 'PublicZapList';

export default PaymentsPage;

