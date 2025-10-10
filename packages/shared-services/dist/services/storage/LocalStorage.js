// LocalStorage - Handles browser localStorage operations
import { STORAGE_KEYS } from '../../utils/constants';
export class LocalStorage {
    constructor(prefix = 'pubpay_') {
        this.prefix = prefix;
    }
    /**
     * Set item in localStorage
     */
    setItem(key, value) {
        try {
            const serializedValue = JSON.stringify(value);
            localStorage.setItem(this.prefix + key, serializedValue);
            return true;
        }
        catch (error) {
            console.error('Error setting localStorage item:', error);
            return false;
        }
    }
    /**
     * Get item from localStorage
     */
    getItem(key, defaultValue) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (item === null) {
                return defaultValue || null;
            }
            return JSON.parse(item);
        }
        catch (error) {
            console.error('Error getting localStorage item:', error);
            return defaultValue || null;
        }
    }
    /**
     * Remove item from localStorage
     */
    removeItem(key) {
        try {
            localStorage.removeItem(this.prefix + key);
            return true;
        }
        catch (error) {
            console.error('Error removing localStorage item:', error);
            return false;
        }
    }
    /**
     * Clear all items with prefix
     */
    clear() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        }
        catch (error) {
            console.error('Error clearing localStorage:', error);
            return false;
        }
    }
    /**
     * Check if item exists
     */
    hasItem(key) {
        return localStorage.getItem(this.prefix + key) !== null;
    }
    /**
     * Get all keys with prefix
     */
    getKeys() {
        const keys = Object.keys(localStorage);
        return keys
            .filter(key => key.startsWith(this.prefix))
            .map(key => key.substring(this.prefix.length));
    }
    /**
     * Get storage size in bytes
     */
    getSize() {
        let size = 0;
        const keys = this.getKeys();
        keys.forEach(key => {
            const item = localStorage.getItem(this.prefix + key);
            if (item) {
                size += item.length;
            }
        });
        return size;
    }
    /**
     * Get storage quota usage
     */
    async getQuotaUsage() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const estimate = await navigator.storage.estimate();
                const used = estimate.usage || 0;
                const available = estimate.quota || 0;
                const percentage = available > 0 ? (used / available) * 100 : 0;
                return { used, available, percentage };
            }
            catch (error) {
                console.error('Error getting storage quota:', error);
                return { used: 0, available: 0, percentage: 0 };
            }
        }
        return { used: 0, available: 0, percentage: 0 };
    }
    /**
     * Set user data
     */
    setUserData(data) {
        if (data.publicKey) {
            this.setItem(STORAGE_KEYS.PUBLIC_KEY, data.publicKey);
        }
        if (data.privateKey) {
            this.setItem(STORAGE_KEYS.PRIVATE_KEY, data.privateKey);
        }
        if (data.signInMethod) {
            this.setItem(STORAGE_KEYS.SIGN_IN_METHOD, data.signInMethod);
        }
        return true;
    }
    /**
     * Get user data
     */
    getUserData() {
        return {
            publicKey: this.getItem(STORAGE_KEYS.PUBLIC_KEY),
            privateKey: this.getItem(STORAGE_KEYS.PRIVATE_KEY),
            signInMethod: this.getItem(STORAGE_KEYS.SIGN_IN_METHOD)
        };
    }
    /**
     * Clear user data
     */
    clearUserData() {
        this.removeItem(STORAGE_KEYS.PUBLIC_KEY);
        this.removeItem(STORAGE_KEYS.PRIVATE_KEY);
        this.removeItem(STORAGE_KEYS.SIGN_IN_METHOD);
        return true;
    }
    /**
     * Set style options
     */
    setStyleOptions(options) {
        return this.setItem(STORAGE_KEYS.STYLE_OPTIONS, options);
    }
    /**
     * Get style options
     */
    getStyleOptions() {
        return this.getItem(STORAGE_KEYS.STYLE_OPTIONS, {});
    }
    /**
     * Set Lightning config
     */
    setLightningConfig(config) {
        return this.setItem(STORAGE_KEYS.LIGHTNING_CONFIG, config);
    }
    /**
     * Get Lightning config
     */
    getLightningConfig() {
        return this.getItem(STORAGE_KEYS.LIGHTNING_CONFIG, {});
    }
    /**
     * Export all data
     */
    exportData() {
        const data = {};
        const keys = this.getKeys();
        keys.forEach(key => {
            data[key] = this.getItem(key);
        });
        return data;
    }
    /**
     * Import data
     */
    importData(data) {
        try {
            Object.keys(data).forEach(key => {
                this.setItem(key, data[key]);
            });
            return true;
        }
        catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }
}
