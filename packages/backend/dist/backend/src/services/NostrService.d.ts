export interface ZapResult {
    success: boolean;
    eventId?: string;
    error?: string;
    relays?: string[];
}
export declare class NostrService {
    private pool;
    private relays;
    private logger;
    constructor();
    /**
     * Send anonymous zap to Nostr relays
     */
    sendAnonymousZap(eventId: string, amount: number, comment: string): Promise<ZapResult>;
    /**
     * Decode event ID from note1... or nevent1... format
     */
    private decodeEventId;
    /**
     * Get recipient public key from event
     */
    private getRecipientPubkey;
    /**
     * Create zap request (kind 9734)
     */
    private createZapRequest;
    /**
     * Sign event with private key
     */
    private signEvent;
    /**
     * Get Lightning address from profile
     */
    private getLightningAddress;
    /**
     * Get LNURL callback URL from Lightning address
     */
    private getLNURLCallback;
    /**
     * Send zap request to LNURL callback and pay the invoice
     */
    private sendZapRequestToCallback;
    /**
     * Get public key from private key
     */
    private getPublicKeyFromPrivate;
    /**
     * Test relay connectivity
     */
    testRelayConnectivity(): Promise<{
        connected: string[];
        failed: string[];
        totalRelays: number;
    }>;
    /**
     * Close pool connections
     */
    close(): void;
}
//# sourceMappingURL=NostrService.d.ts.map