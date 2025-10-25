// LocalStorage - Handles browser localStorage operations
import { STORAGE_KEYS } from '../../utils/constants';

export class LocalStorage {
  private prefix: string;

  constructor(prefix: string = 'pubpay_') {
    this.prefix = prefix;
  }

  /**
   * Set item in localStorage
   */
  setItem(key: string, value: any): boolean {
    try {
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(this.prefix + key, serializedValue);
      return true;
    } catch (error) {
      console.error('Error setting localStorage item:', error);
      return false;
    }
  }

  /**
   * Get item from localStorage
   */
  getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (item === null) {
        return defaultValue || null;
      }
      return JSON.parse(item);
    } catch (error) {
      console.error('Error getting localStorage item:', error);
      return defaultValue || null;
    }
  }

  /**
   * Remove item from localStorage
   */
  removeItem(key: string): boolean {
    try {
      localStorage.removeItem(this.prefix + key);
      return true;
    } catch (error) {
      console.error('Error removing localStorage item:', error);
      return false;
    }
  }

  /**
   * Clear all items with prefix
   */
  clear(): boolean {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  /**
   * Check if item exists
   */
  hasItem(key: string): boolean {
    return localStorage.getItem(this.prefix + key) !== null;
  }

  /**
   * Get all keys with prefix
   */
  getKeys(): string[] {
    const keys = Object.keys(localStorage);
    return keys
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.substring(this.prefix.length));
  }

  /**
   * Get storage size in bytes
   */
  getSize(): number {
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
  async getQuotaUsage(): Promise<{
    used: number;
    available: number;
    percentage: number;
  }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const available = estimate.quota || 0;
        const percentage = available > 0 ? (used / available) * 100 : 0;

        return { used, available, percentage };
      } catch (error) {
        console.error('Error getting storage quota:', error);
        return { used: 0, available: 0, percentage: 0 };
      }
    }

    return { used: 0, available: 0, percentage: 0 };
  }

  /**
   * Set user data
   */
  setUserData(data: {
    publicKey?: string;
    privateKey?: string;
    signInMethod?: string;
  }): boolean {
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
  getUserData(): {
    publicKey: string | null;
    privateKey: string | null;
    signInMethod: string | null;
  } {
    return {
      publicKey: this.getItem(STORAGE_KEYS.PUBLIC_KEY),
      privateKey: this.getItem(STORAGE_KEYS.PRIVATE_KEY),
      signInMethod: this.getItem(STORAGE_KEYS.SIGN_IN_METHOD)
    };
  }

  /**
   * Clear user data
   */
  clearUserData(): boolean {
    this.removeItem(STORAGE_KEYS.PUBLIC_KEY);
    this.removeItem(STORAGE_KEYS.PRIVATE_KEY);
    this.removeItem(STORAGE_KEYS.SIGN_IN_METHOD);
    return true;
  }

  /**
   * Set style options
   */
  setStyleOptions(options: any): boolean {
    return this.setItem(STORAGE_KEYS.STYLE_OPTIONS, options);
  }

  /**
   * Get style options
   */
  getStyleOptions(): any {
    return this.getItem(STORAGE_KEYS.STYLE_OPTIONS, {});
  }

  /**
   * Set Lightning config
   */
  setLightningConfig(config: any): boolean {
    return this.setItem(STORAGE_KEYS.LIGHTNING_CONFIG, config);
  }

  /**
   * Get Lightning config
   */
  getLightningConfig(): any {
    return this.getItem(STORAGE_KEYS.LIGHTNING_CONFIG, {});
  }

  /**
   * Export all data
   */
  exportData(): {
    [key: string]: any;
  } {
    const data: { [key: string]: any } = {};
    const keys = this.getKeys();
    keys.forEach(key => {
      data[key] = this.getItem(key);
    });
    return data;
  }

  /**
   * Import data
   */
  importData(data: { [key: string]: any }): boolean {
    try {
      Object.keys(data).forEach(key => {
        this.setItem(key, data[key]);
      });
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }
}
