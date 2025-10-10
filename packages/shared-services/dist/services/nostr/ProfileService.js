import { isValidPublicKey } from '../../utils/validation';
export class ProfileService {
    constructor(nostrClient, eventManager) {
        this.profileCache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.nostrClient = nostrClient;
        this.eventManager = eventManager;
    }
    /**
     * Get user profile by public key
     */
    async getProfile(pubkey) {
        if (!isValidPublicKey(pubkey)) {
            console.error('Invalid public key:', pubkey);
            return null;
        }
        // Check cache first
        if (this.isProfileCached(pubkey)) {
            return this.profileCache.get(pubkey);
        }
        try {
            // Fetch profile from relays
            const events = await this.nostrClient.getEvents([{
                    authors: [pubkey],
                    kinds: [0]
                }]);
            if (events.length > 0) {
                const event = events[0];
                if (event && event.kind === 0) {
                    const profile = await this.eventManager.handleProfileEvent(event);
                    if (profile) {
                        this.cacheProfile(profile);
                        return profile;
                    }
                }
            }
            // Create a minimal profile if none found
            const minimalProfile = {
                id: pubkey,
                publicKey: pubkey,
                name: '',
                displayName: '',
                picture: '',
                about: ''
            };
            this.cacheProfile(minimalProfile);
            return minimalProfile;
        }
        catch (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
    }
    /**
     * Get multiple profiles at once
     */
    async getProfiles(pubkeys) {
        const profiles = new Map();
        const uncachedPubkeys = [];
        // Check cache for each pubkey
        pubkeys.forEach(pubkey => {
            if (this.isProfileCached(pubkey)) {
                profiles.set(pubkey, this.profileCache.get(pubkey));
            }
            else {
                uncachedPubkeys.push(pubkey);
            }
        });
        // Fetch uncached profiles
        if (uncachedPubkeys.length > 0) {
            try {
                const events = await this.nostrClient.getEvents([{
                        authors: uncachedPubkeys,
                        kinds: [0]
                    }]);
                // Process each event
                for (const event of events) {
                    if (event.kind === 0) {
                        const profile = await this.eventManager.handleProfileEvent(event);
                        if (profile) {
                            profiles.set(profile.publicKey, profile);
                            this.cacheProfile(profile);
                        }
                    }
                }
                // Create minimal profiles for missing ones
                uncachedPubkeys.forEach(pubkey => {
                    if (!profiles.has(pubkey)) {
                        const minimalProfile = {
                            id: pubkey,
                            publicKey: pubkey,
                            name: '',
                            displayName: '',
                            picture: '',
                            about: ''
                        };
                        profiles.set(pubkey, minimalProfile);
                        this.cacheProfile(minimalProfile);
                    }
                });
            }
            catch (error) {
                console.error('Error fetching profiles:', error);
            }
        }
        return profiles;
    }
    /**
     * Subscribe to profile updates
     */
    subscribeToProfiles(pubkeys, onProfileUpdate) {
        this.nostrClient.subscribeToProfiles(pubkeys, async (event) => {
            if (event.kind === 0) {
                const profile = await this.eventManager.handleProfileEvent(event);
                if (profile) {
                    this.cacheProfile(profile);
                    onProfileUpdate(profile);
                }
            }
        });
    }
    /**
     * Update profile cache
     */
    updateProfileCache(profile) {
        this.cacheProfile(profile);
    }
    /**
     * Get cached profile
     */
    getCachedProfile(pubkey) {
        if (this.isProfileCached(pubkey)) {
            return this.profileCache.get(pubkey);
        }
        return null;
    }
    /**
     * Get all cached profiles
     */
    getAllCachedProfiles() {
        return new Map(this.profileCache);
    }
    /**
     * Clear profile cache
     */
    clearProfileCache() {
        this.profileCache.clear();
        this.cacheExpiry.clear();
    }
    /**
     * Clear expired profiles from cache
     */
    clearExpiredProfiles() {
        const now = Date.now();
        this.cacheExpiry.forEach((expiry, pubkey) => {
            if (now > expiry) {
                this.profileCache.delete(pubkey);
                this.cacheExpiry.delete(pubkey);
            }
        });
    }
    /**
     * Get profile display name
     */
    getDisplayName(profile) {
        return profile.displayName || profile.name || `${profile.publicKey.slice(0, 8)}...`;
    }
    /**
     * Get profile avatar URL
     */
    getAvatarUrl(profile) {
        if (profile.picture) {
            return profile.picture;
        }
        // Return default avatar or generate one
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.getDisplayName(profile))}&background=random`;
    }
    /**
     * Check if profile is cached and not expired
     */
    isProfileCached(pubkey) {
        const expiry = this.cacheExpiry.get(pubkey);
        return this.profileCache.has(pubkey) &&
            expiry !== undefined &&
            Date.now() < expiry;
    }
    /**
     * Cache profile with expiry
     */
    cacheProfile(profile) {
        this.profileCache.set(profile.publicKey, profile);
        this.cacheExpiry.set(profile.publicKey, Date.now() + this.CACHE_DURATION);
    }
    /**
     * Search profiles by name or display name
     */
    searchProfiles(query) {
        const results = [];
        const lowercaseQuery = query.toLowerCase();
        this.profileCache.forEach(profile => {
            const name = profile.name?.toLowerCase() || '';
            const displayName = profile.displayName?.toLowerCase() || '';
            const about = profile.about?.toLowerCase() || '';
            if (name.includes(lowercaseQuery) ||
                displayName.includes(lowercaseQuery) ||
                about.includes(lowercaseQuery)) {
                results.push(profile);
            }
        });
        return results;
    }
    /**
     * Get profile statistics
     */
    getProfileStats() {
        const now = Date.now();
        let expiredCount = 0;
        this.cacheExpiry.forEach(expiry => {
            if (now > expiry) {
                expiredCount++;
            }
        });
        return {
            totalCached: this.profileCache.size,
            expiredCount,
            cacheHitRate: this.profileCache.size / (this.profileCache.size + expiredCount)
        };
    }
}
