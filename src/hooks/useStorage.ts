// useStorage - Custom hook for storage functionality
// Note: This is a vanilla JS hook, not a React hook
import { LocalStorage, SessionStorage } from '../services/storage';
import { ErrorService } from '../services/ErrorService';

export interface UseStorageOptions {
  prefix?: string;
  sessionPrefix?: string;
  autoSave?: boolean;
  saveInterval?: number;
}

export class UseStorage {
  private isReady: boolean = false;
  private error: string | null = null;
  private options: UseStorageOptions;
  private saveInterval: NodeJS.Timeout | null = null;

  private localStorage: LocalStorage;
  private sessionStorage: SessionStorage;
  private errorService: ErrorService;

  constructor(options: UseStorageOptions = {}) {
    this.options = options;
    this.localStorage = new LocalStorage(options.prefix);
    this.sessionStorage = new SessionStorage(options.sessionPrefix);
    this.errorService = new ErrorService();
    this.initialize();
  }

  // Initialize storage
  private initialize(): void {
    try {
      // Test storage availability
      this.localStorage.setItem('test', 'test');
      this.localStorage.removeItem('test');
      this.isReady = true;
    } catch (err) {
      this.error = 'Storage not available';
      this.errorService.error('Storage initialization failed', err as Error);
    }
  }

  // Local storage operations
  setLocalItem<T>(key: string, value: T): boolean {
    try {
      return this.localStorage.setItem(key, value);
    } catch (err) {
      this.errorService.error('Failed to set local storage item', err as Error);
      return false;
    }
  }

  getLocalItem<T>(key: string, defaultValue?: T): T | null {
    try {
      return this.localStorage.getItem(key, defaultValue);
    } catch (err) {
      this.errorService.error('Failed to get local storage item', err as Error);
      return defaultValue || null;
    }
  }

  removeLocalItem(key: string): boolean {
    try {
      return this.localStorage.removeItem(key);
    } catch (err) {
      this.errorService.error('Failed to remove local storage item', err as Error);
      return false;
    }
  }

  // Session storage operations
  setSessionItem<T>(key: string, value: T): boolean {
    try {
      return this.sessionStorage.setItem(key, value);
    } catch (err) {
      this.errorService.error('Failed to set session storage item', err as Error);
      return false;
    }
  }

  getSessionItem<T>(key: string, defaultValue?: T): T | null {
    try {
      return this.sessionStorage.getItem(key, defaultValue);
    } catch (err) {
      this.errorService.error('Failed to get session storage item', err as Error);
      return defaultValue || null;
    }
  }

  removeSessionItem(key: string): boolean {
    try {
      return this.sessionStorage.removeItem(key);
    } catch (err) {
      this.errorService.error('Failed to remove session storage item', err as Error);
      return false;
    }
  }

  // User data operations
  setUserData(data: {
    publicKey?: string;
    privateKey?: string;
    signInMethod?: string;
  }): boolean {
    try {
      return this.localStorage.setUserData(data);
    } catch (err) {
      this.errorService.error('Failed to set user data', err as Error);
      return false;
    }
  }

  getUserData() {
    try {
      return this.localStorage.getUserData();
    } catch (err) {
      this.errorService.error('Failed to get user data', err as Error);
      return {
        publicKey: null,
        privateKey: null,
        signInMethod: null
      };
    }
  }

  clearUserData(): boolean {
    try {
      return this.localStorage.clearUserData();
    } catch (err) {
      this.errorService.error('Failed to clear user data', err as Error);
      return false;
    }
  }

  // Style options operations
  setStyleOptions(options: any): boolean {
    try {
      return this.localStorage.setStyleOptions(options);
    } catch (err) {
      this.errorService.error('Failed to set style options', err as Error);
      return false;
    }
  }

  getStyleOptions() {
    try {
      return this.localStorage.getStyleOptions();
    } catch (err) {
      this.errorService.error('Failed to get style options', err as Error);
      return {};
    }
  }

  // Session data operations
  setSessionData(data: {
    sessionId?: string;
    eventId?: string;
    lightningEnabled?: boolean;
    lastActivity?: number;
  }): boolean {
    try {
      return this.sessionStorage.setSessionData(data);
    } catch (err) {
      this.errorService.error('Failed to set session data', err as Error);
      return false;
    }
  }

  getSessionData() {
    try {
      return this.sessionStorage.getSessionData();
    } catch (err) {
      this.errorService.error('Failed to get session data', err as Error);
      return {
        sessionId: null,
        eventId: null,
        lightningEnabled: null,
        lastActivity: null
      };
    }
  }

  clearSessionData(): boolean {
    try {
      return this.sessionStorage.clearSessionData();
    } catch (err) {
      this.errorService.error('Failed to clear session data', err as Error);
      return false;
    }
  }

  updateLastActivity(): boolean {
    try {
      return this.sessionStorage.updateLastActivity();
    } catch (err) {
      this.errorService.error('Failed to update last activity', err as Error);
      return false;
    }
  }

  isSessionActive(): boolean {
    try {
      return this.sessionStorage.isSessionActive();
    } catch (err) {
      this.errorService.error('Failed to check session status', err as Error);
      return false;
    }
  }

  // Get storage statistics
  getStorageStats() {
    try {
      return {
        local: {
          size: this.localStorage.getSize(),
          keys: this.localStorage.getKeys()
        },
        session: {
          keys: this.sessionStorage.getKeys()
        }
      };
    } catch (err) {
      this.errorService.error('Failed to get storage stats', err as Error);
      return {
        local: { size: 0, keys: [] },
        session: { keys: [] }
      };
    }
  }

  // Export/Import data
  exportData() {
    try {
      return {
        local: this.localStorage.exportData(),
        session: this.sessionStorage.exportSessionData()
      };
    } catch (err) {
      this.errorService.error('Failed to export data', err as Error);
      return { local: {}, session: {} };
    }
  }

  importData(data: { local: any; session: any }): boolean {
    try {
      const localSuccess = this.localStorage.importData(data.local);
      const sessionSuccess = this.sessionStorage.importData(data.session);
      return localSuccess && sessionSuccess;
    } catch (err) {
      this.errorService.error('Failed to import data', err as Error);
      return false;
    }
  }

  // Clear all data
  clearAll(): boolean {
    try {
      const localSuccess = this.localStorage.clear();
      const sessionSuccess = this.sessionStorage.clear();
      return localSuccess && sessionSuccess;
    } catch (err) {
      this.errorService.error('Failed to clear all data', err as Error);
      return false;
    }
  }

  // Start auto-save
  startAutoSave(): void {
    if (this.options.autoSave && this.options.saveInterval) {
      this.saveInterval = setInterval(() => {
        this.updateLastActivity();
      }, this.options.saveInterval);
    }
  }

  // Stop auto-save
  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  // Getters
  get ready(): boolean { return this.isReady; }
  get lastError(): string | null { return this.error; }
  get local(): LocalStorage { return this.localStorage; }
  get session(): SessionStorage { return this.sessionStorage; }
  get errorServiceInstance(): ErrorService { return this.errorService; }

  // Cleanup
  destroy(): void {
    this.stopAutoSave();
  }
}
