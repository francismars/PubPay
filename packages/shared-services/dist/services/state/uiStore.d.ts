type InvoiceOverlayState = {
    show: boolean;
    bolt11: string;
    amount: number;
    eventId: string;
};
type UIState = {
    invoiceOverlay: InvoiceOverlayState;
    processingOverlay: {
        show: boolean;
        message: string;
    };
    statusToast: {
        show: boolean;
        message: string;
        variant: 'info' | 'loading' | 'success' | 'error';
        persist: boolean;
    };
    loginForm: {
        show: boolean;
    };
    newPayNoteForm: {
        show: boolean;
    };
    openInvoice: (payload: {
        bolt11: string;
        amount: number;
        eventId: string;
    }) => void;
    closeInvoice: () => void;
    openProcessing: (message?: string) => void;
    closeProcessing: () => void;
    openToast: (message: string, variant?: 'info' | 'loading' | 'success' | 'error', persist?: boolean) => void;
    updateToast: (message: string, variant?: 'info' | 'loading' | 'success' | 'error', persist?: boolean) => void;
    closeToast: () => void;
    openLogin: () => void;
    closeLogin: () => void;
    openNewPayNote: () => void;
    closeNewPayNote: () => void;
};
export declare const useUIStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UIState>>;
export {};
