import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useUIStore, NwcClient } from '@pubpay/shared-services';
import { nip19 } from 'nostr-tools';
import { InvoiceQR } from '@pubpay/shared-ui';
import { NWCOptionsModal } from '../components/NWCOptionsModal/NWCOptionsModal';
import { SendPaymentModal } from '../components/SendPaymentModal/SendPaymentModal';
import { getActiveNWCUri, getActiveNWCConnection, getActiveNWCConnectionId, migrateOldNWCConnection } from '../utils/nwcStorage';
import { TOAST_DURATION, INTERVAL, LIGHTNING, TIME, COLORS, STORAGE_KEYS, QUERY_LIMITS, DIMENSIONS } from '../constants';

interface Invoice {
  invoice: string;
  payment_hash: string;
  preimage?: string;
  amount?: number;
  paid_at?: number;
  description?: string;
  created_at?: number;
  expiry?: number;
  state?: 'pending' | 'settled' | 'expired' | 'failed';
  type?: 'incoming' | 'outgoing';
  fees_paid?: number;
  metadata?: {
    zap_request?: {
      content?: string;
      pubkey?: string;
      tags?: Array<Array<string>>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  // Get auth state and nostr client from outlet context
  const {
    authState,
    nostrClient
  } = useOutletContext<{
    authState: any;
    nostrClient: any;
  }>();

  const [nwcClient, setNwcClient] = useState<NwcClient | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string>('');
  const [transactions, setTransactions] = useState<Invoice[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string>('');
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveAmount, setReceiveAmount] = useState('');
  const [receiveDescription, setReceiveDescription] = useState('');
  const [receiveInvoice, setReceiveInvoice] = useState<string | null>(null);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<Date | null>(
    null
  );
  const [visibleTransactionsCount, setVisibleTransactionsCount] = useState(5);

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
  }, [nwcClient]);

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
        console.log('First transaction structure:', transactions[0] ? JSON.stringify(transactions[0], null, 2) : 'No transactions');
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
          console.log('Mapping transaction:', {
            original: tx,
            mapped,
            state: tx.state,
            type: tx.type
          });
          return mapped;
        });
        console.log('Mapped transactions:', mappedTransactions);
        console.log('Mapped transactions:', mappedTransactions);
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
  }, [nwcClient]);

  // Initial load and reload when client changes
  useEffect(() => {
    if (nwcClient) {
      loadBalance();
      loadTransactions();
    } else {
      // Clear data when no client
      setBalance(null);
      setTransactions([]);
      setBalanceError('');
      setTransactionsError('');
    }
  }, [nwcClient, loadBalance, loadTransactions]);

  // Auto-refresh balance every 30 seconds
  useEffect(() => {
    if (!nwcClient) return;

    const interval = setInterval(() => {
      loadBalance();
    }, INTERVAL.BALANCE_REFRESH);

    return () => clearInterval(interval);
  }, [nwcClient, loadBalance]);

  // Handle payment sent callback
  const handlePaymentSent = useCallback(() => {
    loadBalance();
    loadTransactions();
  }, [loadBalance, loadTransactions]);

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


  // Common Lightning Address providers for autocomplete (if needed in future)
  // const filteredLnProviders = useMemo(() => {
  //   if (!suggestionQuery) return commonLnProviders;
  //   const query = suggestionQuery.toLowerCase();
  //   return commonLnProviders.filter(provider =>
  //     provider.toLowerCase().includes(query)
  //   );
  // }, [suggestionQuery]);

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

    setGeneratingInvoice(true);
    try {
      const amount = parseInt(receiveAmount.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        useUIStore.getState().openToast(
          'Invalid amount. Please enter a positive number.',
          'error',
          false
        );
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
        setGeneratingInvoice(false);
        return;
      }

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
        useUIStore.getState().updateToast('Invoice generated!', 'success', false);
        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      }
    } catch (error) {
      console.error('Generate invoice error:', error);
      useUIStore.getState().updateToast(
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

  // Format timestamp
  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return '—';
    const date = new Date(timestamp * TIME.MILLISECONDS_PER_SECOND);
    return date.toLocaleString();
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

  if (!nwcClient) {
    return (
      <div className="profilePage">
        <h1 className="profilePageTitle">Wallet</h1>
        <div style={{ maxWidth: DIMENSIONS.MAX_CONTENT_WIDTH, margin: '0 auto', padding: '24px' }}>
          <div style={{ width: '100%' }}>
            <section style={{ marginBottom: '24px' }}>
              <div
                style={{
                  padding: '24px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
                  Connect Your Wallet (Optional)
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.6' }}>
                  Connect your Lightning wallet using Nostr Wallet Connect (NWC) to access advanced wallet features on this page: view your balance, send payments, and receive invoices.
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
                  <strong>Note:</strong> This is optional. PubPay provides you with multiple payment options: QR code, WebLN, NWC (if connected), or your Lightning wallet app.
                </p>
                <button
                  className="cta"
                  onClick={() => setShowOptionsModal(true)}
                  style={{ marginTop: '16px' }}
                >
                  Configure NWC
                </button>
              </div>
            </section>
          </div>
        </div>
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
              }
            } else {
              setNwcClient(null);
            }
          }}
        />
      </div>
    );
  }

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
            Wallet
          </h1>
          {activeConnection && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                margin: '4px 0 0 0'
              }}
            >
              Active: {activeConnection.label}
            </p>
          )}
        </div>
        <button
          className="addButton"
          onClick={() => setShowOptionsModal(true)}
          style={{ fontSize: '14px', padding: '8px 16px' }}
        >
          Settings
        </button>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <div style={{ width: '100%' }}>
          {/* Balance Card */}
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
                {/* Refresh button in top right */}
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
                {balanceLoading ? (
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
                        fontWeight: 'bold',
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
                    padding: '20px',
                    fontSize: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
                    send
                  </span>
                  Send
                </button>
                <button
                  className="cta"
                  onClick={() => setShowReceiveModal(true)}
                  style={{
                    padding: '20px',
                    fontSize: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>
                    call_received
                  </span>
                  Receive
                </button>
              </div>
            </div>
          </section>

          {/* Transaction History */}
          <section style={{ marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: 'var(--text-primary)' }}>
                Latest Payments
              </h3>
              {transactionsLoading ? (
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
                      {transactionsLoading ? 'refresh' : 'refresh'}
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
                    <div
                      key={idx}
                      style={{
                        padding: '16px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        background: 'var(--bg-secondary)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px'
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {tx.amount
                              ? `${(tx.amount / LIGHTNING.MILLISATS_PER_SAT).toLocaleString()} sats`
                              : 'Amount not specified'}
                          </div>
                          {tx.metadata?.zap_request?.content && (
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                                marginTop: '4px',
                                fontStyle: 'italic'
                              }}
                            >
                              "{tx.metadata.zap_request.content}"
                            </div>
                          )}
                          {tx.description && (
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                marginTop: '4px'
                              }}
                            >
                              {tx.description}
                            </div>
                          )}
                          {tx.fees_paid !== undefined && tx.fees_paid > 0 && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                marginTop: '4px'
                              }}
                            >
                              Fees: {(tx.fees_paid / LIGHTNING.MILLISATS_PER_SAT).toLocaleString()} sats
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: '4px'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              flexWrap: 'wrap',
                              justifyContent: 'flex-end'
                            }}
                          >
                            {tx.metadata?.zap_request && (() => {
                              const eTag = tx.metadata.zap_request.tags?.find((t: string[]) => t[0] === 'e');
                              const noteId = eTag?.[1];
                              return (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (noteId) {
                                      try {
                                        const nevent = nip19.noteEncode(noteId);
                                        navigate(`/note/${nevent}`);
                                      } catch (err) {
                                        console.error('Failed to encode note ID:', err);
                                      }
                                    }
                                  }}
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    background: COLORS.PRIMARY,
                                    color: COLORS.TEXT_WHITE,
                                    borderRadius: '4px',
                                    fontWeight: '500',
                                    cursor: noteId ? 'pointer' : 'default',
                                    transition: 'opacity 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (noteId) {
                                      e.currentTarget.style.opacity = '0.8';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (noteId) {
                                      e.currentTarget.style.opacity = '1';
                                    }
                                  }}
                                >
                                  Public
                                </span>
                              );
                            })()}
                            {tx.type === 'outgoing' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  background: 'var(--bg-primary)',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '4px',
                                  fontWeight: '500'
                                }}
                              >
                                Outgoing
                              </span>
                            )}
                            {tx.type === 'incoming' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  background: 'var(--bg-primary)',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '4px',
                                  fontWeight: '500'
                                }}
                              >
                                Incoming
                              </span>
                            )}
                          </div>
                          {(() => {
                            // Only show status if transaction is not settled
                            // A transaction is settled if it has settled_at (paid_at) or state is 'settled'
                            const isSettled = tx.paid_at !== undefined || tx.state === 'settled' || isInvoicePaid(tx);
                            const isExpired = tx.state === 'expired' || isInvoiceExpired(tx);
                            const isFailed = tx.state === 'failed';
                            const isPending = !isSettled && !isExpired && !isFailed;

                            if (isSettled) {
                              return null; // Don't show status for settled transactions
                            }

                            return (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            textAlign: 'right'
                          }}
                        >
                                {isExpired ? (
                            <span style={{ color: COLORS.ERROR }}>Expired</span>
                                ) : isFailed ? (
                                  <span style={{ color: COLORS.ERROR }}>Failed</span>
                                ) : isPending ? (
                            <span style={{ color: COLORS.PENDING }}>Pending</span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                          marginTop: '8px'
                        }}
                      >
                        {tx.paid_at
                          ? `Paid: ${formatTimestamp(tx.paid_at)}`
                          : tx.created_at
                            ? `Created: ${formatTimestamp(tx.created_at)}`
                            : ''}
                      </div>
                    </div>
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

      {/* Receive Invoice Modal */}
      {showReceiveModal && (
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
          onClick={() => {
            if (!generatingInvoice) {
              setShowReceiveModal(false);
              setReceiveAmount('');
              setReceiveDescription('');
              setReceiveInvoice(null);
            }
          }}
        >
          <div
            className="overlayInner"
            onClick={e => e.stopPropagation()}
            style={{
              transform: 'none',
              animation: 'none',
              transition: 'none'
            }}
          >
            <div className="brand">
              PUB<span className="logoPay">PAY</span>
              <span className="logoMe">.me</span>
            </div>
            <p className="label" style={{ marginBottom: '24px' }}>
              Receive Payment
            </p>
            {!receiveInvoice ? (
              <>
                <div style={{ marginBottom: '16px' }}>
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
                    value={receiveAmount}
                    onChange={e => setReceiveAmount(e.target.value)}
                    placeholder="Enter amount in satoshis"
                    className="inputField"
                    required
                    min="1"
                    disabled={generatingInvoice}
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
                <div style={{ marginBottom: '24px' }}>
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
                    value={receiveDescription}
                    onChange={e => setReceiveDescription(e.target.value)}
                    placeholder="Invoice description"
                    className="inputField"
                    disabled={generatingInvoice}
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
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end'
                  }}
                >
                  <button
                    className="label"
                    onClick={() => {
                      if (!generatingInvoice) {
                        setShowReceiveModal(false);
                        setReceiveAmount('');
                        setReceiveDescription('');
                      }
                    }}
                    disabled={generatingInvoice}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: generatingInvoice ? 'not-allowed' : 'pointer',
                      padding: '8px 16px'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="cta"
                    onClick={handleGenerateInvoice}
                    disabled={generatingInvoice || !receiveAmount.trim()}
                  >
                    {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <InvoiceQR bolt11={receiveInvoice} />
                </div>
                <div
                  style={{
                    marginBottom: '16px',
                    position: 'relative'
                  }}
                >
                  <input
                    type="text"
                    readOnly
                    value={receiveInvoice}
                    style={{
                      width: '100%',
                      padding: '12px 48px 12px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                      cursor: 'text'
                    }}
                    onClick={e => {
                      (e.target as HTMLInputElement).select();
                    }}
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(receiveInvoice);
                        useUIStore.getState().openToast(
                          'Invoice copied to clipboard',
                          'success',
                          false
                        );
                        setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
                      } catch (err) {
                        console.error('Failed to copy invoice:', err);
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
                      color: COLORS.TEXT_SECONDARY
                    }}
                    title="Copy invoice"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      content_copy
                    </span>
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end'
                  }}
                >
                  <button
                    className="label"
                    onClick={() => {
                      setReceiveInvoice(null);
                      setReceiveAmount('');
                      setReceiveDescription('');
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px 16px'
                    }}
                  >
                    New Invoice
                  </button>
                  <button
                    className="cta"
                    onClick={() => {
                      setShowReceiveModal(false);
                      setReceiveInvoice(null);
                      setReceiveAmount('');
                      setReceiveDescription('');
                      loadBalance();
                      loadTransactions();
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletPage;
