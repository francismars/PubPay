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
    private static lightningValidationCache;
    private static readonly VALIDATION_CACHE_TTL;
    constructor(baseUrl?: string);
    /**
     * Validate if a lightning address supports Nostr zaps
     * Returns true if valid, false if invalid, null if validation is pending
     */
    static validateLightningAddress(lud16: string): Promise<boolean>;
    /**
     * Clear validation cache (useful for testing or manual refresh)
     */
    static clearValidationCache(): void;
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
    signZapEvent(zapEvent: unknown, callbackToZap: string, amountPay: number, lud16ToZap: string, eventoToZapID: string, anonymousZap?: boolean, decryptedPrivateKey?: string | null): Promise<boolean>;
    /**
     * Get invoice and handle payment (matches original getInvoiceandPay)
     */
    getInvoiceandPay(callback: string, amount: number, zapFinalized: unknown, lud16: string, eventID: string): Promise<void>;
    /**
     * Handle fetched invoice (matches original handleFetchedInvoice)
     */
    handleFetchedInvoice(invoice: string, zapEventID: string, amount?: number, zapRequestID?: string): Promise<void>;
}
