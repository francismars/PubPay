// useLightning - Custom hook for Lightning functionality
// Updated to use the new backend API endpoints
import {
  LightningApiService,
  LightningApiResponse,
  LightningStatus,
  LightningPayment
} from '../services/LightningApiService';

export interface UseLightningOptions {
  autoEnable?: boolean;
  eventId?: string;
  onPayment?: (payment: LightningPayment) => void;
  onInvoiceCreated?: (invoice: any) => void;
}

export class UseLightning {
  private isEnabled: boolean = false;
  private isLoading: boolean = false;
  private error: string | null = null;
  private lnurl: string | null = null;
  private sessionId: string | null = null;
  private options: UseLightningOptions;
  private apiService: LightningApiService;

  constructor(options: UseLightningOptions = {}) {
    this.options = options;
    this.apiService = new LightningApiService();
  }

  // Enable Lightning payments
  async enableLightning(eventId?: string): Promise<boolean> {
    const targetEventId = eventId || this.options.eventId;
    if (!targetEventId) {
      this.error = 'No event ID provided';
      return false;
    }

    this.isLoading = true;
    this.error = null;

    try {
      // Generate a frontend session ID
      const frontendSessionId = this.generateSessionId();

      const result = await this.apiService.enableLightning(
        targetEventId,
        frontendSessionId
      );

      if (result.success && result.lnurl) {
        this.isEnabled = true;
        this.lnurl = result.lnurl;
        this.sessionId = frontendSessionId;
        console.log('✅ Lightning payments enabled:', result.lnurl);
        return true;
      } else {
        this.error = result.error || 'Failed to enable Lightning payments';
        console.error('❌ Failed to enable Lightning payments:', result.error);
        return false;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Error enabling Lightning payments:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // Disable Lightning payments
  async disableLightning(eventId?: string): Promise<boolean> {
    const targetEventId = eventId || this.options.eventId;
    if (!targetEventId) {
      this.error = 'No event ID provided';
      return false;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const frontendSessionId = this.sessionId || this.generateSessionId();
      const result = await this.apiService.disableLightning(
        targetEventId,
        frontendSessionId
      );

      if (result.success) {
        this.isEnabled = false;
        this.lnurl = null;
        this.sessionId = null;
        // Clear session ID from localStorage when disabling
        localStorage.removeItem('lightningSessionId');
        console.log('✅ Lightning payments disabled');
        return true;
      } else {
        this.error = result.error || 'Failed to disable Lightning payments';
        console.error('❌ Failed to disable Lightning payments:', result.error);
        return false;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Error disabling Lightning payments:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // Toggle Lightning payments
  async toggleLightning(eventId?: string): Promise<boolean> {
    if (this.isEnabled) {
      return await this.disableLightning(eventId);
    } else {
      return await this.enableLightning(eventId);
    }
  }

  // Get Lightning status
  async getStatus(): Promise<LightningStatus> {
    try {
      const result = await this.apiService.getStatus();
      if (result.success && result.data) {
        return result.data;
      }
      return {
        enabled: this.isEnabled,
        lnurl: this.lnurl || undefined,
        sessionId: this.sessionId || undefined,
        config: {
          enabled: this.isEnabled,
          lnbitsUrl: '',
          apiKey: '',
          webhookUrl: ''
        }
      };
    } catch (err) {
      console.error('❌ Error getting Lightning status:', err);
      return {
        enabled: this.isEnabled,
        config: {
          enabled: this.isEnabled,
          lnbitsUrl: '',
          apiKey: '',
          webhookUrl: ''
        }
      };
    }
  }

  // Get payment history
  async getPaymentHistory(eventId?: string): Promise<LightningPayment[]> {
    try {
      const result = await this.apiService.getPaymentHistory(eventId);
      if (result.success && result.data) {
        return result.data;
      }
      return [];
    } catch (err) {
      console.error('❌ Error getting payment history:', err);
      return [];
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.apiService.healthCheck();
      return result.success && result.data?.healthy === true;
    } catch (err) {
      console.error('❌ Error checking Lightning health:', err);
      return false;
    }
  }

  // Generate session ID - persist across page refreshes
  private generateSessionId(): string {
    // Try to get existing session ID from localStorage
    const existingSessionId = localStorage.getItem('lightningSessionId');
    if (existingSessionId) {
      return existingSessionId;
    }

    // Generate new session ID and store it
    const newSessionId = `frontend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('lightningSessionId', newSessionId);
    return newSessionId;
  }

  // Getters
  get enabled(): boolean {
    return this.isEnabled;
  }
  get loading(): boolean {
    return this.isLoading;
  }
  get lastError(): string | null {
    return this.error;
  }
  get currentLnurl(): string | null {
    return this.lnurl;
  }
  get currentSessionId(): string | null {
    return this.sessionId;
  }
  get apiServiceInstance(): LightningApiService {
    return this.apiService;
  }
}
