import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { NwcClient } from '@pubpay/shared-services';

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

interface WalletStore {
  // Balance state
  balance: number | null;
  balanceLoading: boolean;
  balanceError: string;
  lastBalanceUpdate: Date | null;

  // Transactions state
  transactions: Invoice[];
  transactionsLoading: boolean;
  transactionsError: string;

  // NWC Client
  nwcClient: NwcClient | null;

  // Receive invoice state
  receiveInvoice: string | null;
  generatingInvoice: boolean;

  // Actions - Balance
  setBalance: (balance: number | null) => void;
  setBalanceLoading: (loading: boolean) => void;
  setBalanceError: (error: string) => void;
  setLastBalanceUpdate: (date: Date | null) => void;

  // Actions - Transactions
  setTransactions: (transactions: Invoice[]) => void;
  setTransactionsLoading: (loading: boolean) => void;
  setTransactionsError: (error: string) => void;

  // Actions - NWC Client
  setNwcClient: (client: NwcClient | null) => void;

  // Actions - Receive Invoice
  setReceiveInvoice: (invoice: string | null) => void;
  setGeneratingInvoice: (generating: boolean) => void;

  // Actions - Clear/Reset
  clearBalance: () => void;
  clearTransactions: () => void;
  clearReceiveInvoice: () => void;
  resetWallet: () => void;
}

export const useWalletStore = create<WalletStore>()(
  devtools(
    (set) => ({
  // Initial state
  balance: null,
  balanceLoading: false,
  balanceError: '',
  lastBalanceUpdate: null,
  transactions: [],
  transactionsLoading: false,
  transactionsError: '',
  nwcClient: null,
  receiveInvoice: null,
  generatingInvoice: false,

  // Actions - Balance
  setBalance: (balance) => set({ balance }),
  setBalanceLoading: (loading) => set({ balanceLoading: loading }),
  setBalanceError: (error) => set({ balanceError: error }),
  setLastBalanceUpdate: (date) => set({ lastBalanceUpdate: date }),

  // Actions - Transactions
  setTransactions: (transactions) => set({ transactions }),
  setTransactionsLoading: (loading) => set({ transactionsLoading: loading }),
  setTransactionsError: (error) => set({ transactionsError: error }),

  // Actions - NWC Client
  setNwcClient: (client) => set({ nwcClient: client }),

  // Actions - Receive Invoice
  setReceiveInvoice: (invoice) => set({ receiveInvoice: invoice }),
  setGeneratingInvoice: (generating) => set({ generatingInvoice: generating }),

  // Actions - Clear/Reset
  clearBalance: () =>
    set({
      balance: null,
      balanceError: '',
      lastBalanceUpdate: null
    }),
  clearTransactions: () =>
    set({
      transactions: [],
      transactionsError: ''
    }),
  clearReceiveInvoice: () =>
    set({
      receiveInvoice: null,
      generatingInvoice: false
    }),
  resetWallet: () =>
    set({
      balance: null,
      balanceLoading: false,
      balanceError: '',
      lastBalanceUpdate: null,
      transactions: [],
      transactionsLoading: false,
      transactionsError: '',
      receiveInvoice: null,
      generatingInvoice: false
    })
    }),
    { name: 'WalletStore' }
  )
);

// Type definitions for composite selectors
type WalletStoreData = {
  balance: number | null;
  balanceLoading: boolean;
  balanceError: string;
  lastBalanceUpdate: Date | null;
  transactions: Invoice[];
  transactionsLoading: boolean;
  transactionsError: string;
  nwcClient: NwcClient | null;
  receiveInvoice: string | null;
  generatingInvoice: boolean;
};

type WalletStoreActions = Pick<
  WalletStore,
  | 'setBalance'
  | 'setBalanceLoading'
  | 'setBalanceError'
  | 'setLastBalanceUpdate'
  | 'setTransactions'
  | 'setTransactionsLoading'
  | 'setTransactionsError'
  | 'setNwcClient'
  | 'setReceiveInvoice'
  | 'setGeneratingInvoice'
  | 'clearBalance'
  | 'clearTransactions'
  | 'clearReceiveInvoice'
  | 'resetWallet'
>;

/**
 * Hook to get all wallet-related state in a single subscription
 * Uses shallow equality to prevent re-renders when object reference changes but values are the same
 */
export const useWalletState = (): WalletStoreData =>
  useWalletStore(
    useShallow(state => ({
      balance: state.balance,
      balanceLoading: state.balanceLoading,
      balanceError: state.balanceError,
      lastBalanceUpdate: state.lastBalanceUpdate,
      transactions: state.transactions,
      transactionsLoading: state.transactionsLoading,
      transactionsError: state.transactionsError,
      nwcClient: state.nwcClient,
      receiveInvoice: state.receiveInvoice,
      generatingInvoice: state.generatingInvoice
    }))
  );

/**
 * Hook to get all wallet store actions
 * Actions are stable references, so shallow comparison is still beneficial
 */
export const useWalletActions = (): WalletStoreActions =>
  useWalletStore(
    useShallow(state => ({
      setBalance: state.setBalance,
      setBalanceLoading: state.setBalanceLoading,
      setBalanceError: state.setBalanceError,
      setLastBalanceUpdate: state.setLastBalanceUpdate,
      setTransactions: state.setTransactions,
      setTransactionsLoading: state.setTransactionsLoading,
      setTransactionsError: state.setTransactionsError,
      setNwcClient: state.setNwcClient,
      setReceiveInvoice: state.setReceiveInvoice,
      setGeneratingInvoice: state.setGeneratingInvoice,
      clearBalance: state.clearBalance,
      clearTransactions: state.clearTransactions,
      clearReceiveInvoice: state.clearReceiveInvoice,
      resetWallet: state.resetWallet
    }))
  );

// Individual selector hooks
export const useBalance = () => useWalletStore(state => state.balance);
export const useBalanceLoading = () => useWalletStore(state => state.balanceLoading);
export const useBalanceError = () => useWalletStore(state => state.balanceError);
export const useLastBalanceUpdate = () => useWalletStore(state => state.lastBalanceUpdate);
export const useTransactions = () => useWalletStore(state => state.transactions);
export const useTransactionsLoading = () => useWalletStore(state => state.transactionsLoading);
export const useTransactionsError = () => useWalletStore(state => state.transactionsError);
export const useNwcClient = () => useWalletStore(state => state.nwcClient);
export const useReceiveInvoice = () => useWalletStore(state => state.receiveInvoice);
export const useGeneratingInvoice = () => useWalletStore(state => state.generatingInvoice);

// Composite selector hooks
export const useBalanceState = () =>
  useWalletStore(
    useShallow(state => ({
      balance: state.balance,
      balanceLoading: state.balanceLoading,
      balanceError: state.balanceError,
      lastBalanceUpdate: state.lastBalanceUpdate
    }))
  );

export const useTransactionsState = () =>
  useWalletStore(
    useShallow(state => ({
      transactions: state.transactions,
      transactionsLoading: state.transactionsLoading,
      transactionsError: state.transactionsError
    }))
  );

export const useReceiveInvoiceState = () =>
  useWalletStore(
    useShallow(state => ({
      receiveInvoice: state.receiveInvoice,
      generatingInvoice: state.generatingInvoice
    }))
  );

// Export Invoice type for use in other files
export type { Invoice };

