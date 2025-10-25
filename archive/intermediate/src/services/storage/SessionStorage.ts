// SessionStorage - Handles browser sessionStorage operations
export class SessionStorage {
  private prefix: string;

  constructor(prefix: string = 'pubpay_session_') {
    this.prefix = prefix;
  }

  /**
   * Set item in sessionStorage
   */
  setItem(key: string, value: any): boolean {
    try {
      const serializedValue = JSON.stringify(value);
      sessionStorage.setItem(this.prefix + key, serializedValue);
      return true;
    } catch (error) {
      console.error('Error setting sessionStorage item:', error);
      return false;
    }
  }

  /**
   * Get item from sessionStorage
   */
  getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const item = sessionStorage.getItem(this.prefix + key);
      if (item === null) {
        return defaultValue || null;
      }
      return JSON.parse(item);
    } catch (error) {
      console.error('Error getting sessionStorage item:', error);
      return defaultValue || null;
    }
  }

  /**
   * Remove item from sessionStorage
   */
  removeItem(key: string): boolean {
    try {
      sessionStorage.removeItem(this.prefix + key);
      return true;
    } catch (error) {
      console.error('Error removing sessionStorage item:', error);
      return false;
    }
  }

  /**
   * Clear all items with prefix
   */
  clear(): boolean {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          sessionStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing sessionStorage:', error);
      return false;
    }
  }

  /**
   * Check if item exists
   */
  hasItem(key: string): boolean {
    return sessionStorage.getItem(this.prefix + key) !== null;
  }

  /**
   * Get all keys with prefix
   */
  getKeys(): string[] {
    const keys = Object.keys(sessionStorage);
    return keys
      .filter(key => key.startsWith(this.prefix))
      .map(key => key.substring(this.prefix.length));
  }

  /**
   * Set session data
   */
  setSessionData(data: {
    sessionId?: string;
    eventId?: string;
    lightningEnabled?: boolean;
    lastActivity?: number;
  }): boolean {
    if (data.sessionId) {
      this.setItem('sessionId', data.sessionId);
    }
    if (data.eventId) {
      this.setItem('eventId', data.eventId);
    }
    if (data.lightningEnabled !== undefined) {
      this.setItem('lightningEnabled', data.lightningEnabled);
    }
    if (data.lastActivity) {
      this.setItem('lastActivity', data.lastActivity);
    }
    return true;
  }

  /**
   * Get session data
   */
  getSessionData(): {
    sessionId: string | null;
    eventId: string | null;
    lightningEnabled: boolean | null;
    lastActivity: number | null;
  } {
    return {
      sessionId: this.getItem('sessionId'),
      eventId: this.getItem('eventId'),
      lightningEnabled: this.getItem('lightningEnabled'),
      lastActivity: this.getItem('lastActivity')
    };
  }

  /**
   * Clear session data
   */
  clearSessionData(): boolean {
    this.removeItem('sessionId');
    this.removeItem('eventId');
    this.removeItem('lightningEnabled');
    this.removeItem('lastActivity');
    return true;
  }

  /**
   * Update last activity timestamp
   */
  updateLastActivity(): boolean {
    return this.setItem('lastActivity', Date.now());
  }

  /**
   * Check if session is active (within last 30 minutes)
   */
  isSessionActive(): boolean {
    const lastActivity = this.getItem<number>('lastActivity');
    if (!lastActivity) return false;

    const thirtyMinutes = 30 * 60 * 1000;
    return Date.now() - lastActivity < thirtyMinutes;
  }

  /**
   * Get session age in minutes
   */
  getSessionAge(): number {
    const lastActivity = this.getItem<number>('lastActivity');
    if (!lastActivity) return 0;

    return Math.floor((Date.now() - lastActivity) / (60 * 1000));
  }

  /**
   * Export all session data
   */
  exportSessionData(): {
    [key: string]: any;
  } {
    const data: { [key: string]: any } = {};
    const keys = this.getKeys();
    keys.forEach(key => {
      data[key] = this.getItem(key);
    });
    return data;
  }

  importData(data: { [key: string]: any }): boolean {
    try {
      Object.keys(data).forEach(key => {
        this.setItem(key, data[key]);
      });
      return true;
    } catch (error) {
      console.error('Failed to import session data:', error);
      return false;
    }
  }
}
