export interface ZapCallback {
    callbackToZap: string;
    lud16ToZap: string;
}
export interface ZapEventData {
    zapEvent: unknown;
    amountPay: number;
}
export declare class ZapService {
    private baseUrl;
    constructor(baseUrl?: string);
    /**
     * Get Lightning callback URL from author's LUD16 address
     */
    getInvoiceCallBack(eventData: unknown, authorData: unknown): Promise<ZapCallback | null>;
    /**
     * Create a zap event
     */
    createZapEvent(eventData: unknown, rangeValue: number, lud16: string, pubKey?: string | null, comment?: string): Promise<ZapEventData | null>;
    /**
     * Sign and send zap event
     */
    signZapEvent(zapEvent: unknown, callbackToZap: string, amountPay: number, lud16ToZap: string, eventoToZapID: string, anonymousZap?: boolean): Promise<boolean>;
    /**
     * Get invoice and handle payment (matches original getInvoiceandPay)
     */
    getInvoiceandPay(callback: string, amount: number, zapFinalized: unknown, lud16: string, eventID: string): Promise<void>;
    /**
     * Handle fetched invoice (matches original handleFetchedInvoice)
     */
    handleFetchedInvoice(invoice: string, zapEventID: string, amount?: number): Promise<void>;
}
