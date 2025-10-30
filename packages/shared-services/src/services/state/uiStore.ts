import { create } from 'zustand';

type InvoiceOverlayState = {
  show: boolean;
  bolt11: string;
  amount: number;
  eventId: string;
};

type StatusToastState = {
  show: boolean;
  message: string;
  variant: 'info' | 'loading' | 'success' | 'error';
  persist: boolean;
};

type UIState = {
  invoiceOverlay: InvoiceOverlayState;
  processingOverlay: { show: boolean; message: string };
  statusToast: StatusToastState;
  loginForm: { show: boolean };
  newPayNoteForm: { show: boolean };
  openInvoice: (payload: {
    bolt11: string;
    amount: number;
    eventId: string;
  }) => void;
  closeInvoice: () => void;
  openProcessing: (message?: string) => void;
  closeProcessing: () => void;
  openToast: (
    message: string,
    variant?: 'info' | 'loading' | 'success' | 'error',
    persist?: boolean
  ) => void;
  updateToast: (
    message: string,
    variant?: 'info' | 'loading' | 'success' | 'error',
    persist?: boolean
  ) => void;
  closeToast: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  openNewPayNote: () => void;
  closeNewPayNote: () => void;
};

export const useUIStore = create<UIState>(set => ({
  invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' },
  processingOverlay: { show: false, message: '' },
  statusToast: { show: false, message: '', variant: 'info', persist: false },
  loginForm: { show: false },
  newPayNoteForm: { show: false },
  openInvoice: ({ bolt11, amount, eventId }) =>
    set({ invoiceOverlay: { show: true, bolt11, amount, eventId } }),
  closeInvoice: () =>
    set({
      invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' }
    }),
  openProcessing: (message = 'Processing payment...') =>
    set({ processingOverlay: { show: true, message } }),
  closeProcessing: () => set({ processingOverlay: { show: false, message: '' } }),
  openToast: (message, variant = 'info', persist = false) =>
    set({ statusToast: { show: true, message, variant, persist } }),
  updateToast: (message, variant = 'info', persist = false) =>
    set({ statusToast: { show: true, message, variant, persist } }),
  closeToast: () =>
    set({
      statusToast: { show: false, message: '', variant: 'info', persist: false }
    }),
  openLogin: () => set({ loginForm: { show: true } }),
  closeLogin: () => set({ loginForm: { show: false } }),
  openNewPayNote: () => set({ newPayNoteForm: { show: true } }),
  closeNewPayNote: () => set({ newPayNoteForm: { show: false } })
}));
