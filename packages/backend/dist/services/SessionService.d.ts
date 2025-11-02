export interface LightningEvent {
    lnurl: string;
    lastSeen: number;
    active: boolean;
}
export interface LightningSession {
    events: Record<string, LightningEvent>;
}
export interface LNURLMapping {
    frontendSessionId: string;
    eventId: string;
}
export declare class SessionService {
    private static instance;
    private sessions;
    private lnurlpMappings;
    private logger;
    private cleanupInterval;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): SessionService;
    /**
     * Create or update a Lightning session
     */
    createOrUpdateSession(frontendSessionId: string, eventId: string, lnurl: string, lnurlpId?: string): void;
    /**
     * Get session by frontend session ID
     */
    getSession(frontendSessionId: string): LightningSession | undefined;
    /**
     * Get LNURL mapping by LNURL-pay ID
     */
    getLNURLMapping(lnurlpId: string): LNURLMapping | undefined;
    /**
     * Update last seen timestamp for a session event
     */
    updateLastSeen(frontendSessionId: string, eventId: string): void;
    /**
     * Deactivate a session event
     */
    deactivateSession(frontendSessionId: string, eventId: string): boolean;
    /**
     * Get all sessions (for debugging)
     */
    getAllSessions(): Array<[string, LightningSession]>;
    /**
     * Get all LNURL mappings (for debugging)
     */
    getAllLNURLMappings(): Array<[string, LNURLMapping]>;
    /**
     * Extract LNURL-pay ID from LNURL
     */
    private extractLNURLPayId;
    /**
     * Cleanup inactive sessions
     */
    private cleanupInactiveSessions;
    /**
     * Get session statistics
     */
    getStats(): {
        totalSessions: number;
        totalEvents: number;
        activeEvents: number;
        totalMappings: number;
        oldestEvent: number;
        newestEvent: number;
    };
    /**
     * Destroy service and cleanup
     */
    destroy(): void;
}
//# sourceMappingURL=SessionService.d.ts.map