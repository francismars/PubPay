import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useUIStore, NwcClient } from '@pubpay/shared-services';
import { InvoiceQR } from '@pubpay/shared-ui';
import { NWCOptionsModal } from '../components/NWCOptionsModal';
import { SendPaymentModal } from '../components/SendPaymentModal';
import { getActiveNWCUri, getActiveNWCConnection, getActiveNWCConnectionId, migrateOldNWCConnection } from '../utils/nwcStorage';

interface Invoice {
  invoice: string;
  payment_hash: string;
  preimage?: string;
  amount?: number;
  paid_at?: number;
  description?: string;
  created_at?: number;
  expiry?: number;
}

const WalletPage: React.FC = () => {
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
    const interval = setInterval(reloadClient, 1000);

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
        // Always convert from millisats to sats by dividing by 1000
        const balanceInSats = Math.floor(rawBalance / 1000);
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

    // Check if wallet supports list_invoices
    let supportsListInvoices = true;
    try {
      const connection = getActiveNWCConnection();
      if (connection?.capabilities?.methods) {
        if (!connection.capabilities.methods.includes('list_invoices')) {
          supportsListInvoices = false;
          console.log('Wallet does not support list_invoices method');
        }
      }
    } catch (err) {
      console.warn('Failed to check NWC capabilities:', err);
    }

    if (!supportsListInvoices) {
      setTransactions([]);
      setTransactionsError('Wallet does not support listing invoices');
      setTransactionsLoading(false);
      return;
    }

    setTransactionsLoading(true);
    setTransactionsError('');
    try {
      console.log('Loading transactions...');
      const response = await nwcClient.listInvoices({ limit: 20 });
      console.log('listInvoices response:', response);

      if (response.error) {
        console.error('listInvoices error:', response.error);
        setTransactionsError(response.error.message || 'Failed to load transactions');
        setTransactions([]);
      } else if (response.result) {
        const invoices = response.result.invoices || [];
        console.log(`Loaded ${invoices.length} transactions:`, invoices);
        setTransactions(invoices);
        if (invoices.length === 0) {
          setTransactionsError(''); // Clear error if we got an empty list (that's valid)
        }
      } else {
        console.warn('listInvoices returned no result');
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
    }, 30000);

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
    const scannedInvoice = sessionStorage.getItem('scannedInvoice');
    if (scannedInvoice) {
      sessionStorage.removeItem('scannedInvoice');
      setShowSendModal(true);
      return;
    }

    const scannedAddress = sessionStorage.getItem('scannedLightningAddress');
    if (scannedAddress) {
      sessionStorage.removeItem('scannedLightningAddress');
      setShowSendModal(true);
      return;
    }

    const handleScannedInvoice = (e: CustomEvent) => {
      const invoice = e.detail?.invoice;
      if (invoice) {
        sessionStorage.removeItem('scannedInvoice');
        setShowSendModal(true);
      }
    };

    const handleScannedLightningAddress = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        sessionStorage.removeItem('scannedLightningAddress');
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
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
      return;
    }

    // Validate amount is provided
    if (!receiveAmount.trim()) {
      useUIStore.getState().openToast(
        'Please enter an amount',
        'error',
        false
      );
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
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
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        setGeneratingInvoice(false);
        return;
      }

      useUIStore.getState().openToast('Generating invoice...', 'loading', true);
      const response = await nwcClient.makeInvoice({
        amount: amount * 1000, // Convert to millisats (amount is now required)
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
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
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
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  // Check if invoice is expired
  const isInvoiceExpired = (invoice: Invoice): boolean => {
    if (!invoice.expiry || !invoice.created_at) return false;
    const expiryTime = invoice.created_at + invoice.expiry;
    return Date.now() / 1000 > expiryTime;
  };

  // Check if invoice is paid
  const isInvoicePaid = (invoice: Invoice): boolean => {
    return !!invoice.paid_at && !!invoice.preimage;
  };

  if (!nwcClient) {
    return (
      <div className="profilePage">
        <h1 className="profilePageTitle">Wallet</h1>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
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
                      e.currentTarget.style.borderColor = '#4a75ff';
                      e.currentTarget.style.color = '#4a75ff';
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
                      color: '#ef4444',
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
                        Updated {Math.floor((Date.now() - lastBalanceUpdate.getTime()) / 1000)}s
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
                Recent Transactions
              </h3>
              {transactionsLoading ? (
                <div
                  className="skeleton"
                  style={{
                    height: '200px',
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
                      color: '#ef4444',
                      marginBottom: '12px',
                      display: 'block'
                    }}
                  >
                    error_outline
                  </span>
                  <p
                    style={{
                      color: '#ef4444',
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
                      color: '#fff',
                      background: '#4a75ff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: transactionsLoading ? 'wait' : 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: transactionsLoading ? 0.7 : 1
                    }}
                    onMouseEnter={e => {
                      if (!transactionsLoading) {
                        e.currentTarget.style.background = '#3d62e0';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!transactionsLoading) {
                        e.currentTarget.style.background = '#4a75ff';
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
                  {transactions.map((tx, idx) => (
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
                              ? `${(tx.amount / 1000).toLocaleString()} sats`
                              : 'Amount not specified'}
                          </div>
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
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            textAlign: 'right'
                          }}
                        >
                          {isInvoicePaid(tx) ? (
                            <span style={{ color: '#22c55e' }}>Paid</span>
                          ) : isInvoiceExpired(tx) ? (
                            <span style={{ color: '#ef4444' }}>Expired</span>
                          ) : (
                            <span style={{ color: '#fbbf24' }}>Pending</span>
                          )}
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
                    Amount (sats) <span style={{ color: '#ef4444' }}>*</span>
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
                        setTimeout(() => useUIStore.getState().closeToast(), 2000);
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
                      color: '#6b7280'
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