import { ApiResponse, PaginatedResponse } from '@pubpay/shared-types';
import { User } from '@pubpay/shared-types';
export declare class ProfileAPI {
    private baseUrl;
    constructor(baseUrl?: string);
    /**
     * Get user profile by public key
     */
    getProfile(pubkey: string): Promise<ApiResponse<User>>;
    /**
     * Get multiple profiles
     */
    getProfiles(pubkeys: string[]): Promise<ApiResponse<User[]>>;
    /**
     * Search profiles
     */
    searchProfiles(query: string, params?: {
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<User>>;
    /**
     * Update user profile
     */
    updateProfile(pubkey: string, profileData: Partial<User>): Promise<ApiResponse<User>>;
    /**
     * Get profile statistics
     */
    getProfileStats(pubkey: string): Promise<ApiResponse<{
        totalEvents: number;
        totalZaps: number;
        totalZapped: number;
        followers: number;
        following: number;
    }>>;
    /**
     * Get user's events
     */
    getUserEvents(pubkey: string, params?: {
        page?: number;
        limit?: number;
        kinds?: number[];
    }): Promise<PaginatedResponse<{
        id: string;
        kind: number;
        content: string;
        created_at: number;
        tags: string[][];
    }>>;
    /**
     * Get user's zaps
     */
    getUserZaps(pubkey: string, params?: {
        page?: number;
        limit?: number;
        direction?: 'sent' | 'received';
    }): Promise<PaginatedResponse<{
        id: string;
        amount: number;
        content: string;
        created_at: number;
        payer?: User;
        recipient?: User;
    }>>;
    /**
     * Follow a user
     */
    followUser(pubkey: string): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Unfollow a user
     */
    unfollowUser(pubkey: string): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Get following list
     */
    getFollowing(pubkey: string, params?: {
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<User>>;
    /**
     * Get followers list
     */
    getFollowers(pubkey: string, params?: {
        page?: number;
        limit?: number;
    }): Promise<PaginatedResponse<User>>;
}
