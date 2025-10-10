export declare class SessionStorage {
    private prefix;
    constructor(prefix?: string);
    /**
     * Set item in sessionStorage
     */
    setItem(key: string, value: any): boolean;
    /**
     * Get item from sessionStorage
     */
    getItem<T>(key: string, defaultValue?: T): T | null;
    /**
     * Remove item from sessionStorage
     */
    removeItem(key: string): boolean;
    /**
     * Clear all items with prefix
     */
    clear(): boolean;
    /**
     * Check if item exists
     */
    hasItem(key: string): boolean;
    /**
     * Get all keys with prefix
     */
    getKeys(): string[];
    /**
     * Set session data
     */
    setSessionData(data: {
        sessionId?: string;
        eventId?: string;
        lightningEnabled?: boolean;
        lastActivity?: number;
    }): boolean;
    /**
     * Get session data
     */
    getSessionData(): {
        sessionId: string | null;
        eventId: string | null;
        lightningEnabled: boolean | null;
        lastActivity: number | null;
    };
    /**
     * Clear session data
     */
    clearSessionData(): boolean;
    /**
     * Update last activity timestamp
     */
    updateLastActivity(): boolean;
    /**
     * Check if session is active (within last 30 minutes)
     */
    isSessionActive(): boolean;
    /**
     * Get session age in minutes
     */
    getSessionAge(): number;
    /**
     * Export all session data
     */
    exportSessionData(): {
        [key: string]: any;
    };
    importData(data: {
        [key: string]: any;
    }): boolean;
}
