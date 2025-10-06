import { create } from 'zustand';

type InvoiceOverlayState = {
  show: boolean;
  bolt11: string;
  amount: number;
  eventId: string;
};

type UIState = {
  invoiceOverlay: InvoiceOverlayState;
  loginForm: { show: boolean };
  newPayNoteForm: { show: boolean };
  openInvoice: (payload: { bolt11: string; amount: number; eventId: string }) => void;
  closeInvoice: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  openNewPayNote: () => void;
  closeNewPayNote: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' },
  loginForm: { show: false },
  newPayNoteForm: { show: false },
  openInvoice: ({ bolt11, amount, eventId }) => set({ invoiceOverlay: { show: true, bolt11, amount, eventId } }),
  closeInvoice: () => set({ invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' } }),
  openLogin: () => set({ loginForm: { show: true } }),
  closeLogin: () => set({ loginForm: { show: false } }),
  openNewPayNote: () => set({ newPayNoteForm: { show: true } }),
  closeNewPayNote: () => set({ newPayNoteForm: { show: false } }),
}));


