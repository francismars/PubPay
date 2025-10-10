import { User } from '@pubpay/shared-types';
import { NostrClient } from './NostrClient';
import { EventManager } from './EventManager';
export declare class ProfileService {
    private nostrClient;
    private eventManager;
    private profileCache;
    private cacheExpiry;
    private readonly CACHE_DURATION;
    constructor(nostrClient: NostrClient, eventManager: EventManager);
    /**
     * Get user profile by public key
     */
    getProfile(pubkey: string): Promise<User | null>;
    /**
     * Get multiple profiles at once
     */
    getProfiles(pubkeys: string[]): Promise<Map<string, User>>;
    /**
     * Subscribe to profile updates
     */
    subscribeToProfiles(pubkeys: string[], onProfileUpdate: (profile: User) => void): void;
    /**
     * Update profile cache
     */
    updateProfileCache(profile: User): void;
    /**
     * Get cached profile
     */
    getCachedProfile(pubkey: string): User | null;
    /**
     * Get all cached profiles
     */
    getAllCachedProfiles(): Map<string, User>;
    /**
     * Clear profile cache
     */
    clearProfileCache(): void;
    /**
     * Clear expired profiles from cache
     */
    clearExpiredProfiles(): void;
    /**
     * Get profile display name
     */
    getDisplayName(profile: User): string;
    /**
     * Get profile avatar URL
     */
    getAvatarUrl(profile: User): string;
    /**
     * Check if profile is cached and not expired
     */
    private isProfileCached;
    /**
     * Cache profile with expiry
     */
    private cacheProfile;
    /**
     * Search profiles by name or display name
     */
    searchProfiles(query: string): User[];
    /**
     * Get profile statistics
     */
    getProfileStats(): {
        totalCached: number;
        expiredCount: number;
        cacheHitRate: number;
    };
}
