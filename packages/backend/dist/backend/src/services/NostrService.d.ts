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
     * Create zap receipt (kind 9735)
     */
    private createZapReceipt;
    /**
     * Sign event with private key
     */
    private signEvent;
    /**
     * Publish event to relays
     */
    private publishToRelays;
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