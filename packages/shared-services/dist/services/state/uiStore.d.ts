type InvoiceOverlayState = {
    show: boolean;
    bolt11: string;
    amount: number;
    eventId: string;
    zapRequestId?: string;
};
type StatusToastState = {
    show: boolean;
    message: string;
    variant: 'info' | 'loading' | 'success' | 'error';
    persist: boolean;
};
type FollowSuggestion = {
    pubkey: string;
    npub: string;
    displayName: string;
    picture?: string;
};
type UIState = {
    invoiceOverlay: InvoiceOverlayState;
    processingOverlay: {
        show: boolean;
        message: string;
    };
    statusToast: StatusToastState;
    followSuggestions: FollowSuggestion[];
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
        zapRequestId?: string;
    }) => void;
    closeInvoice: () => void;
    openProcessing: (message?: string) => void;
    closeProcessing: () => void;
    openToast: (message: string, variant?: 'info' | 'loading' | 'success' | 'error', persist?: boolean) => void;
    updateToast: (message: string, variant?: 'info' | 'loading' | 'success' | 'error', persist?: boolean) => void;
    closeToast: () => void;
    setFollowSuggestions: (items: FollowSuggestion[]) => void;
    appendFollowSuggestion: (item: FollowSuggestion) => void;
    openLogin: () => void;
    closeLogin: () => void;
    openNewPayNote: () => void;
    closeNewPayNote: () => void;
};
export declare const useUIStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UIState>>;
export {};
