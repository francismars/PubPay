import { NostrEvent, Kind0Event, Kind1Event } from '@pubpay/shared-types';
import { LiveEvent, Zap, User } from '@pubpay/shared-types';
import { NostrClient } from './NostrClient';
export declare class EventManager {
    private nostrClient;
    private profileCache;
    constructor(nostrClient: NostrClient);
    /**
     * Handle live event (kind 30311)
     */
    handleLiveEvent(event: NostrEvent): Promise<LiveEvent | null>;
    /**
     * Handle zap event (kind 9735)
     */
    handleZapEvent(event: NostrEvent): Promise<Zap | null>;
    /**
     * Handle profile event (kind 0)
     */
    handleProfileEvent(event: Kind0Event): Promise<User | null>;
    /**
     * Handle note event (kind 1)
     */
    handleNoteEvent(event: Kind1Event): Promise<{
        content: string;
        author: User | null;
    } | null>;
    /**
     * Get profile by public key
     */
    getProfile(pubkey: string): Promise<User | null>;
    /**
     * Subscribe to live event participants' profiles
     */
    subscribeToLiveEventParticipants(liveEvent: LiveEvent, onProfile: (user: User) => void): void;
    /**
     * Extract zap amount from bolt11 invoice
     */
    private extractZapAmount;
    /**
     * Create a new live event
     */
    createLiveEvent(content: string, identifier: string, tags?: string[][]): Promise<NostrEvent | null>;
    /**
     * Create a zap event
     */
    createZapEvent(eventId: string, bolt11: string, preimage: string, content?: string): Promise<NostrEvent | null>;
    /**
     * Get cached profiles
     */
    getCachedProfiles(): Map<string, User>;
    /**
     * Clear profile cache
     */
    clearProfileCache(): void;
}
