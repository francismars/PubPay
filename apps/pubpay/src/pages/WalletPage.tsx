import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUIStore, NwcClient } from '@pubpay/shared-services';
import { InvoiceQR } from '@pubpay/shared-ui';
import { NWCOptionsModal } from '../components/NWCOptionsModal';
import { getActiveNWCUri, getActiveNWCConnection, getActiveNWCConnectionId, migrateOldNWCConnection } from '../utils/nwcStorage';
import * as bolt11 from 'bolt11';

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
  const [sendInvoice, setSendInvoice] = useState('');
  const [sendDescription, setSendDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMode, setSendMode] = useState<'invoice' | 'lightning-address'>('invoice');
  const [lightningAddress, setLightningAddress] = useState('');
  const [lnAddressAmount, setLnAddressAmount] = useState('');
  const [fetchedInvoiceFromLN, setFetchedInvoiceFromLN] = useState<string | null>(null);
  const [fetchingInvoice, setFetchingInvoice] = useState(false);
  const [lnurlError, setLnurlError] = useState<string>('');
  const [parsedInvoice, setParsedInvoice] = useState<{
    amount?: number;
    description?: string;
    expiry?: number;
    timestamp?: number;
  } | null>(null);
  const [invoiceError, setInvoiceError] = useState<string>('');
  const [showLnAddressSuggestions, setShowLnAddressSuggestions] = useState(false);
  const [lnAddressQuery, setLnAddressQuery] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const lightningAddressInputRef = useRef<HTMLInputElement>(null);

  // Common Lightning Address providers
  const commonLnProviders = [
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

        // According to NIP-47, get_balance should return balance in millisats
        // However, some wallet implementations may return sats directly
        // We'll check the value to auto-detect the unit
        // Typical wallet balances: 0-10M sats (0-10B millisats)
        // If value is > 1M, it's likely in millisats (1M millisats = 1k sats)
        let balanceInSats: number;

        if (rawBalance > 1000000) {
          // Large value - likely in millisats (1M+ millisats = 1k+ sats)
          balanceInSats = Math.floor(rawBalance / 1000);
          console.log(`Converted ${rawBalance} millisats to ${balanceInSats} sats`);
        } else {
          // Smaller value - likely already in sats
          balanceInSats = rawBalance;
          console.log(`Using balance as-is: ${balanceInSats} sats`);
        }

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

  // Parse and validate BOLT11 invoice
  const parseInvoice = useCallback((invoice: string) => {
    const trimmedInvoice = invoice.trim();

    // Clear previous errors
    setInvoiceError('');
    setParsedInvoice(null);

    // Check if empty
    if (!trimmedInvoice) {
      setInvoiceError('');
      return false;
    }

    // Basic format check - must start with lnbc, lntb, or lnbcrt
    if (!trimmedInvoice.match(/^(lnbc|lntb|lnbcrt)/i)) {
      setInvoiceError('Invalid invoice format. Must start with lnbc, lntb, or lnbcrt');
      return false;
    }

    try {
      const decoded = bolt11.decode(trimmedInvoice);

      // Check if invoice is expired
      const timestamp = decoded.timestamp || Math.floor(Date.now() / 1000);
      const expiry = decoded.tags?.find((tag: { tagName: string; data?: number }) => tag.tagName === 'expiry')?.data || 3600;
      const expiryTime = timestamp + expiry;
      const currentTime = Math.floor(Date.now() / 1000);

      if (currentTime > expiryTime) {
        setInvoiceError('Invoice has expired');
        return false;
      }

      // Check network (mainnet vs testnet)
      const network = decoded.network;
      if (network && network !== 'bitcoin') {
        // You might want to allow testnet in development
        // For now, we'll just log it but allow it
        console.log('Invoice network:', network);
      }

      const amount = decoded.satoshis || 0;
      const description = decoded.tags?.find((tag: { tagName: string; data?: string }) => tag.tagName === 'description')?.data || '';

      setParsedInvoice({
        amount,
        description,
        expiry,
        timestamp
      });
      setInvoiceError('');
      return true;
    } catch (error) {
      // Provide specific error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Invalid bech32')) {
        setInvoiceError('Invalid invoice format. Check for typos or missing characters.');
      } else if (errorMessage.includes('checksum')) {
        setInvoiceError('Invalid invoice checksum. The invoice may be corrupted.');
      } else if (errorMessage.includes('network')) {
        setInvoiceError('Unsupported network. This invoice is for a different network.');
      } else {
        setInvoiceError(`Invalid invoice: ${errorMessage}`);
      }

      setParsedInvoice(null);
      return false;
    }
  }, []);

  // Validate Lightning Address format
  const validateLightningAddress = useCallback((address: string): { valid: boolean; error?: string } => {
    const trimmed = address.trim();

    if (!trimmed) {
      return { valid: false, error: 'Lightning Address is required' };
    }

    // Check format: must have exactly one @
    const addressParts = trimmed.split('@');
    if (addressParts.length !== 2) {
      return { valid: false, error: 'Invalid format. Must be: user@domain.com' };
    }

    const [username, domain] = addressParts;

    // Validate username
    if (!username || username.length === 0) {
      return { valid: false, error: 'Username cannot be empty' };
    }

    if (username.length > 64) {
      return { valid: false, error: 'Username is too long (max 64 characters)' };
    }

    // Validate domain
    if (!domain || domain.length === 0) {
      return { valid: false, error: 'Domain cannot be empty' };
    }

    // Basic domain format check
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain format' };
    }

    return { valid: true };
  }, []);

  // Fetch invoice from Lightning Address
  const fetchInvoiceFromLN = async (): Promise<string | null> => {
    const address = lightningAddress.trim();
    const amountStr = lnAddressAmount.trim();

    // Validate inputs
    if (!address || !amountStr) {
      setLnurlError('Please enter both Lightning Address and amount');
      return null;
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      setLnurlError('Please enter a valid amount (must be greater than 0)');
      return null;
    }

    // Validate Lightning Address format
    const validation = validateLightningAddress(address);
    if (!validation.valid) {
      setLnurlError(validation.error || 'Invalid Lightning Address');
      return null;
    }

    setFetchingInvoice(true);
    setLnurlError('');
    setFetchedInvoiceFromLN(null);

    try {
      const addressParts = address.split('@');
      const [username, domain] = addressParts;

      // Step 1: Discover LNURL-pay endpoint
      const discoveryUrl = `https://${domain}/.well-known/lnurlp/${username}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      let discoveryResponse: Response;
      try {
        discoveryResponse = await fetch(discoveryUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json'
          }
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out. The domain may be unreachable or slow to respond.');
        }
        throw new Error('Failed to connect to domain. Check your internet connection.');
      }

      if (!discoveryResponse.ok) {
        if (discoveryResponse.status === 404) {
          throw new Error('Lightning Address not found. This address may not exist or the domain does not support Lightning Addresses.');
        } else if (discoveryResponse.status === 500) {
          throw new Error('Server error. The domain may be experiencing issues.');
        } else {
          throw new Error(`Failed to discover Lightning Address (HTTP ${discoveryResponse.status})`);
        }
      }

      const lnurlInfo = await discoveryResponse.json();

      if (!lnurlInfo.callback) {
        throw new Error('This Lightning Address does not support payments (no callback URL found)');
      }

      // Check min/max amounts if provided
      if (lnurlInfo.minSendable && amount * 1000 < lnurlInfo.minSendable) {
        const minSats = Math.ceil(lnurlInfo.minSendable / 1000);
        throw new Error(`Amount too low. Minimum: ${minSats} sats`);
      }

      if (lnurlInfo.maxSendable && amount * 1000 > lnurlInfo.maxSendable) {
        const maxSats = Math.floor(lnurlInfo.maxSendable / 1000);
        throw new Error(`Amount too high. Maximum: ${maxSats} sats`);
      }

      // Step 2: Request invoice from callback
      const amountMillisats = amount * 1000;
      const callbackUrl = new URL(lnurlInfo.callback);
      callbackUrl.searchParams.set('amount', amountMillisats.toString());

      if (sendDescription.trim()) {
        callbackUrl.searchParams.set('comment', sendDescription.trim());
      }

      const invoiceController = new AbortController();
      const invoiceTimeoutId = setTimeout(() => invoiceController.abort(), 10000);

      let invoiceResponse: Response;
      try {
        invoiceResponse = await fetch(callbackUrl.toString(), {
          signal: invoiceController.signal,
          headers: {
            'Accept': 'application/json'
          }
        });
        clearTimeout(invoiceTimeoutId);
      } catch (fetchError) {
        clearTimeout(invoiceTimeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Invoice request timed out. Please try again.');
        }
        throw new Error('Failed to request invoice. Please try again.');
      }

      if (!invoiceResponse.ok) {
        const errorData = await invoiceResponse.json().catch(() => ({}));
        if (errorData.reason) {
          throw new Error(errorData.reason);
        }
        throw new Error(`Failed to get invoice (HTTP ${invoiceResponse.status})`);
      }

      const invoiceData = await invoiceResponse.json();

      if (!invoiceData.pr) {
        throw new Error(invoiceData.reason || 'No invoice returned from server');
      }

      setFetchedInvoiceFromLN(invoiceData.pr);
      parseInvoice(invoiceData.pr);
      return invoiceData.pr;
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

    let invoiceToPay: string | null = null;

    if (sendMode === 'invoice') {
      // Validate invoice
      if (!sendInvoice.trim()) {
        useUIStore.getState().openToast('Please enter an invoice', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      if (invoiceError || !parsedInvoice) {
        useUIStore.getState().openToast(
          invoiceError || 'Please enter a valid invoice',
          'error',
          false
        );
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      invoiceToPay = sendInvoice.trim();
    } else {
      // Lightning Address mode - automatically fetch invoice
      if (!lightningAddress.trim() || !lnAddressAmount.trim()) {
        useUIStore.getState().openToast('Please enter Lightning Address and amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      // Validate Lightning Address format first
      const validation = validateLightningAddress(lightningAddress.trim());
      if (!validation.valid) {
        setLnurlError(validation.error || 'Invalid Lightning Address');
        useUIStore.getState().openToast(validation.error || 'Invalid Lightning Address', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 3000);
        return;
      }

      // Validate amount
      const amount = parseInt(lnAddressAmount.trim(), 10);
      if (isNaN(amount) || amount <= 0) {
        setLnurlError('Please enter a valid amount (must be greater than 0)');
        useUIStore.getState().openToast('Please enter a valid amount', 'error', false);
        setTimeout(() => useUIStore.getState().closeToast(), 2000);
        return;
      }

      // Fetch invoice automatically
      useUIStore.getState().openToast('Fetching invoice...', 'loading', true);
      invoiceToPay = await fetchInvoiceFromLN();

      if (!invoiceToPay) {
        // Error already set by fetchInvoiceFromLN
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
          setShowSendModal(false);
          setSendInvoice('');
          setSendDescription('');
          setLightningAddress('');
          setLnAddressAmount('');
          setFetchedInvoiceFromLN(null);
          setParsedInvoice(null);
          setInvoiceError('');
          setLnurlError('');
          setSendMode('invoice');
          loadBalance();
          loadTransactions();
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

  // Parse invoice when it changes (for invoice mode)
  useEffect(() => {
    if (sendMode === 'invoice' && sendInvoice.trim()) {
      parseInvoice(sendInvoice);
    } else if (sendMode === 'lightning-address') {
      setParsedInvoice(null);
      setInvoiceError('');
    } else if (sendMode === 'invoice' && !sendInvoice.trim()) {
      setParsedInvoice(null);
      setInvoiceError('');
    }
  }, [sendInvoice, sendMode, parseInvoice]);

  // Listen for scanned invoices and Lightning Addresses
  useEffect(() => {
    const handleScannedInvoice = (e: CustomEvent) => {
      const invoice = e.detail?.invoice;
      if (invoice) {
        setSendMode('invoice');
        setSendInvoice(invoice);
        setShowSendModal(true);
      }
    };

    const handleScannedLightningAddress = (e: CustomEvent) => {
      const address = e.detail?.address;
      if (address) {
        setSendMode('lightning-address');
        setLightningAddress(address);
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

  // Function to open QR scanner
  const openQRScanner = () => {
    window.dispatchEvent(new CustomEvent('openQRScanner'));
  };

  // Filter suggestions based on query
  const filteredLnProviders = useMemo(() => {
    if (!lnAddressQuery) return commonLnProviders;
    const query = lnAddressQuery.toLowerCase();
    return commonLnProviders.filter(provider =>
      provider.toLowerCase().includes(query)
    );
  }, [lnAddressQuery]);

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
      {showSendModal && (
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
            if (!sending && !fetchingInvoice) {
              setShowSendModal(false);
              setSendInvoice('');
              setSendDescription('');
              setLightningAddress('');
              setLnAddressAmount('');
              setFetchedInvoiceFromLN(null);
              setParsedInvoice(null);
              setLnurlError('');
              setSendMode('invoice');
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
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

            {/* Mode Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '24px',
                borderBottom: '2px solid var(--border-color)'
              }}
            >
              <button
                onClick={() => {
                  setSendMode('invoice');
                  setFetchedInvoiceFromLN(null);
                  setParsedInvoice(null);
                  setLnurlError('');
                }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: sendMode === 'invoice' ? '2px solid #4a75ff' : '2px solid transparent',
                  color: sendMode === 'invoice' ? '#4a75ff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: sendMode === 'invoice' ? '600' : '400',
                  transition: 'all 0.2s ease',
                  marginBottom: '-2px'
                }}
                disabled={sending || fetchingInvoice}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '6px' }}>
                  receipt_long
                </span>
                Invoice
              </button>
              <button
                onClick={() => {
                  setSendMode('lightning-address');
                  setSendInvoice('');
                  setParsedInvoice(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: sendMode === 'lightning-address' ? '2px solid #4a75ff' : '2px solid transparent',
                  color: sendMode === 'lightning-address' ? '#4a75ff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: sendMode === 'lightning-address' ? '600' : '400',
                  transition: 'all 0.2s ease',
                  marginBottom: '-2px'
                }}
                disabled={sending || fetchingInvoice}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '6px' }}>
                  alternate_email
                </span>
                Lightning Address
              </button>
            </div>

            {sendMode === 'invoice' ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        color: 'var(--text-primary)'
                      }}
                    >
                      Lightning Invoice (BOLT11)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) {
                              setSendInvoice(text.trim());
                              useUIStore.getState().openToast('Invoice pasted from clipboard', 'success', false);
                              setTimeout(() => useUIStore.getState().closeToast(), 2000);
                            }
                          } catch (error) {
                            console.error('Failed to read clipboard:', error);
                            useUIStore.getState().openToast('Failed to read from clipboard', 'error', false);
                            setTimeout(() => useUIStore.getState().closeToast(), 2000);
                          }
                        }}
                        disabled={sending}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          cursor: sending ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          transition: 'all 0.2s ease',
                          opacity: sending ? 0.5 : 1
                        }}
                        onMouseEnter={e => {
                          if (!sending) {
                            e.currentTarget.style.background = 'var(--bg-primary)';
                            e.currentTarget.style.borderColor = '#4a75ff';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!sending) {
                            e.currentTarget.style.background = 'var(--bg-secondary)';
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                          }
                        }}
                        title="Paste from clipboard"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          content_paste
                        </span>
                        Paste
                      </button>
                      {sendInvoice && (
                        <button
                          onClick={() => {
                            setSendInvoice('');
                            setParsedInvoice(null);
                            setInvoiceError('');
                          }}
                          disabled={sending}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: sending ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            transition: 'all 0.2s ease',
                            opacity: sending ? 0.5 : 1
                          }}
                          onMouseEnter={e => {
                            if (!sending) {
                              e.currentTarget.style.background = 'var(--bg-primary)';
                              e.currentTarget.style.borderColor = '#ef4444';
                              e.currentTarget.style.color = '#ef4444';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!sending) {
                              e.currentTarget.style.background = 'var(--bg-secondary)';
                              e.currentTarget.style.borderColor = 'var(--border-color)';
                              e.currentTarget.style.color = 'var(--text-primary)';
                            }
                          }}
                          title="Clear invoice"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                            close
                          </span>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={sendInvoice}
                    onPaste={e => {
                      const pastedText = e.clipboardData.getData('text');
                      if (pastedText && pastedText.trim()) {
                        setSendInvoice(pastedText.trim());
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
                    onChange={() => {}} // Prevent typing
                    onKeyDown={e => {
                      // Allow only Ctrl+V, Ctrl+A, Ctrl+C, Ctrl+X, Delete, Backspace when text is selected
                      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
                        return; // Allow paste
                      }
                      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
                        return; // Allow select all
                      }
                      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                        return; // Allow copy
                      }
                      if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
                        return; // Allow cut
                      }
                      if (e.key === 'Delete' || e.key === 'Backspace') {
                        // Allow delete/backspace only if text is selected
                        const textarea = e.target as HTMLTextAreaElement;
                        if (textarea.selectionStart === textarea.selectionEnd) {
                          e.preventDefault();
                        }
                        return;
                      }
                      // Prevent all other typing
                      e.preventDefault();
                    }}
                    placeholder="Paste invoice here or click Paste button..."
                    readOnly
                    disabled={sending}
                  />
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
                  {parsedInvoice && !invoiceError && (
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
                    value={sendDescription}
                    onChange={e => setSendDescription(e.target.value)}
                    placeholder="Payment description"
                    className="inputField"
                    disabled={sending}
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
              </>
            ) : (
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
                    Lightning Address <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={lightningAddressInputRef}
                      type="text"
                      value={lightningAddress}
                      onChange={e => {
                        const value = e.target.value;
                        setLightningAddress(value);
                        setLnurlError(''); // Clear error when user types
                        setFetchedInvoiceFromLN(null);
                        setParsedInvoice(null);

                        // Check if user typed "@" to show suggestions
                        const atIndex = value.lastIndexOf('@');
                        if (atIndex >= 0) {
                          const query = value.substring(atIndex + 1);
                          setLnAddressQuery(query);
                          setShowLnAddressSuggestions(true);
                          setActiveSuggestionIndex(0);
                        } else {
                          setShowLnAddressSuggestions(false);
                          setLnAddressQuery('');
                        }
                      }}
                      onBlur={() => {
                        // Validate on blur
                        setTimeout(() => {
                          setShowLnAddressSuggestions(false);
                          if (lightningAddress.trim()) {
                            const validation = validateLightningAddress(lightningAddress.trim());
                            if (!validation.valid && validation.error) {
                              setLnurlError(validation.error);
                            } else {
                              setLnurlError('');
                            }
                          } else {
                            setLnurlError('');
                          }
                        }, 200); // Delay to allow click on suggestion
                      }}
                      onFocus={() => {
                        // Show suggestions if "@" is present
                        const atIndex = lightningAddress.lastIndexOf('@');
                        if (atIndex >= 0) {
                          const query = lightningAddress.substring(atIndex + 1);
                          setLnAddressQuery(query);
                          setShowLnAddressSuggestions(true);
                        }
                      }}
                      onKeyDown={e => {
                        if (showLnAddressSuggestions && filteredLnProviders.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveSuggestionIndex(prev =>
                              prev < filteredLnProviders.length - 1 ? prev + 1 : prev
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveSuggestionIndex(prev => prev > 0 ? prev - 1 : 0);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const atIndex = lightningAddress.lastIndexOf('@');
                            if (atIndex >= 0) {
                              const username = lightningAddress.substring(0, atIndex + 1);
                              const selected = filteredLnProviders[activeSuggestionIndex];
                              setLightningAddress(username + selected);
                              setShowLnAddressSuggestions(false);
                              setLnAddressQuery('');
                              lightningAddressInputRef.current?.blur();
                            }
                          } else if (e.key === 'Escape') {
                            setShowLnAddressSuggestions(false);
                          }
                        }
                      }}
                      placeholder="user@domain.com"
                      disabled={sending || fetchingInvoice}
                      style={{
                        backgroundColor: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        border: lnurlError ? '2px solid #ef4444' : lightningAddress.trim() && !lnurlError ? '2px solid #22c55e' : '2px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '12px 16px',
                        width: '100%',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                    {showLnAddressSuggestions && filteredLnProviders.length > 0 && (
                      <div
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
                          maxHeight: '200px',
                          overflowY: 'auto'
                        }}
                      >
                        {filteredLnProviders.map((provider: string, index: number) => {
                          const atIndex = lightningAddress.lastIndexOf('@');
                          const username = atIndex >= 0 ? lightningAddress.substring(0, atIndex + 1) : '';
                          const fullAddress = username + provider;

                          return (
                            <div
                              key={provider}
                              onClick={() => {
                                setLightningAddress(fullAddress);
                                setShowLnAddressSuggestions(false);
                                setLnAddressQuery('');
                                lightningAddressInputRef.current?.focus();
                              }}
                              onMouseEnter={() => setActiveSuggestionIndex(index)}
                              style={{
                                padding: '10px 16px',
                                cursor: 'pointer',
                                background: index === activeSuggestionIndex ? 'var(--bg-secondary)' : 'transparent',
                                borderBottom: index < filteredLnProviders.length - 1 ? '1px solid var(--border-color)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
                                alternate_email
                              </span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
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
                  </div>
                </div>
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
                    value={lnAddressAmount}
                    onChange={e => {
                      setLnAddressAmount(e.target.value);
                      setLnurlError(''); // Clear error when user types
                      setFetchedInvoiceFromLN(null);
                      setParsedInvoice(null);
                    }}
                    placeholder="Enter amount in satoshis"
                    disabled={sending || fetchingInvoice}
                    min="1"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      border: lnurlError && !lightningAddress.trim() ? '2px solid #ef4444' : '2px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      width: '100%',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
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
                {lnurlError && (
                  <div
                    style={{
                      marginBottom: '16px',
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
                {fetchedInvoiceFromLN && parsedInvoice && !lnurlError && (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>
                        check_circle
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        Invoice Ready
                      </span>
                    </div>
                    {parsedInvoice.amount && (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
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
              </>
            )}

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
                  if (!sending && !fetchingInvoice) {
                    setShowSendModal(false);
                    setSendInvoice('');
                    setSendDescription('');
                    setLightningAddress('');
                    setLnAddressAmount('');
                    setFetchedInvoiceFromLN(null);
                    setParsedInvoice(null);
                    setLnurlError('');
                    setSendMode('invoice');
                  }
                }}
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
                  (sendMode === 'invoice' && (!sendInvoice.trim() || !!invoiceError || !parsedInvoice)) ||
                  (sendMode === 'lightning-address' && (!lightningAddress.trim() || !lnAddressAmount.trim()))
                }
              >
                {sending ? 'Sending...' : 'Send Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

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
