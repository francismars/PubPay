export class ProfileAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }
    /**
     * Get user profile by public key
     */
    async getProfile(pubkey) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting profile:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get multiple profiles
     */
    async getProfiles(pubkeys) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pubkeys })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting profiles:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Search profiles
     */
    async searchProfiles(query, params = {}) {
        try {
            const searchParams = new URLSearchParams();
            searchParams.set('q', query);
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            const response = await fetch(`${this.baseUrl}/profiles/search?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error searching profiles:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
    /**
     * Update user profile
     */
    async updateProfile(pubkey, profileData) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error updating profile:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get profile statistics
     */
    async getProfileStats(pubkey) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/stats`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting profile stats:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get user's events
     */
    async getUserEvents(pubkey, params = {}) {
        try {
            const searchParams = new URLSearchParams();
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            if (params.kinds)
                searchParams.set('kinds', params.kinds.join(','));
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/events?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting user events:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
    /**
     * Get user's zaps
     */
    async getUserZaps(pubkey, params = {}) {
        try {
            const searchParams = new URLSearchParams();
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            if (params.direction)
                searchParams.set('direction', params.direction);
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/zaps?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting user zaps:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
    /**
     * Follow a user
     */
    async followUser(pubkey) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/follow`, {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error following user:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Unfollow a user
     */
    async unfollowUser(pubkey) {
        try {
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/follow`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error unfollowing user:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get following list
     */
    async getFollowing(pubkey, params = {}) {
        try {
            const searchParams = new URLSearchParams();
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/following?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting following:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
    /**
     * Get followers list
     */
    async getFollowers(pubkey, params = {}) {
        try {
            const searchParams = new URLSearchParams();
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            const response = await fetch(`${this.baseUrl}/profiles/${pubkey}/followers?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting followers:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
}
