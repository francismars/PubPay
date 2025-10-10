export declare class LocalStorage {
    private prefix;
    constructor(prefix?: string);
    /**
     * Set item in localStorage
     */
    setItem(key: string, value: any): boolean;
    /**
     * Get item from localStorage
     */
    getItem<T>(key: string, defaultValue?: T): T | null;
    /**
     * Remove item from localStorage
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
     * Get storage size in bytes
     */
    getSize(): number;
    /**
     * Get storage quota usage
     */
    getQuotaUsage(): Promise<{
        used: number;
        available: number;
        percentage: number;
    }>;
    /**
     * Set user data
     */
    setUserData(data: {
        publicKey?: string;
        privateKey?: string;
        signInMethod?: string;
    }): boolean;
    /**
     * Get user data
     */
    getUserData(): {
        publicKey: string | null;
        privateKey: string | null;
        signInMethod: string | null;
    };
    /**
     * Clear user data
     */
    clearUserData(): boolean;
    /**
     * Set style options
     */
    setStyleOptions(options: any): boolean;
    /**
     * Get style options
     */
    getStyleOptions(): any;
    /**
     * Set Lightning config
     */
    setLightningConfig(config: any): boolean;
    /**
     * Get Lightning config
     */
    getLightningConfig(): any;
    /**
     * Export all data
     */
    exportData(): {
        [key: string]: any;
    };
    /**
     * Import data
     */
    importData(data: {
        [key: string]: any;
    }): boolean;
}
