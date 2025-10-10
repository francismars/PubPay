import { create } from 'zustand';
export const useUIStore = create((set) => ({
    invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' },
    loginForm: { show: false },
    newPayNoteForm: { show: false },
    openInvoice: ({ bolt11, amount, eventId }) => set({ invoiceOverlay: { show: true, bolt11, amount, eventId } }),
    closeInvoice: () => set({ invoiceOverlay: { show: false, bolt11: '', amount: 0, eventId: '' } }),
    openLogin: () => set({ loginForm: { show: true } }),
    closeLogin: () => set({ loginForm: { show: false } }),
    openNewPayNote: () => set({ newPayNoteForm: { show: true } }),
    closeNewPayNote: () => set({ newPayNoteForm: { show: false } })
}));
