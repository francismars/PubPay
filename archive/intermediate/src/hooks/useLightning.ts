// useLightning - Custom hook for Lightning functionality
// Note: This is a vanilla JS hook, not a React hook
import { useAppStore } from '../stores';
import {
  LightningService,
  InvoiceService,
  WebhookService
} from '../services/lightning';
import { ErrorService } from '../services/ErrorService';
import {
  LightningConfig,
  LightningInvoice,
  LightningPayment
} from '../types/lightning';

export interface UseLightningOptions {
  autoEnable?: boolean;
  eventId?: string;
  onPayment?: (payment: LightningPayment) => void;
  onInvoiceCreated?: (invoice: LightningInvoice) => void;
}

export class UseLightning {
  private isEnabled: boolean = false;
  private isLoading: boolean = false;
  private error: string | null = null;
  private lnurl: string | null = null;
  private sessionId: string | null = null;
  private options: UseLightningOptions;

  private lightningService: LightningService;
  private invoiceService: InvoiceService;
  private webhookService: WebhookService;
  private errorService: ErrorService;

  constructor(options: UseLightningOptions = {}) {
    this.options = options;
    this.lightningService = new LightningService({
      enabled: false,
      lnbitsUrl: '',
      apiKey: '',
      webhookUrl: ''
    });
    this.invoiceService = new InvoiceService();
    this.webhookService = new WebhookService(
      this.lightningService,
      this.invoiceService
    );
    this.errorService = new ErrorService();
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
      const result =
        await this.lightningService.enableLightningPayments(targetEventId);

      if (result.success && result.lnurl) {
        this.isEnabled = true;
        this.lnurl = result.lnurl;
        this.sessionId = this.lightningService.getLightningStatus().sessionId;
        this.errorService.info('Lightning payments enabled', {
          lnurl: result.lnurl
        });
        return true;
      } else {
        this.error = result.error || 'Failed to enable Lightning payments';
        return false;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      this.errorService.error(
        'Failed to enable Lightning payments',
        err as Error
      );
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
      const result =
        await this.lightningService.disableLightningPayments(targetEventId);

      if (result.success) {
        this.isEnabled = false;
        this.lnurl = null;
        this.sessionId = null;
        this.errorService.info('Lightning payments disabled');
        return true;
      } else {
        this.error = result.error || 'Failed to disable Lightning payments';
        return false;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      this.errorService.error(
        'Failed to disable Lightning payments',
        err as Error
      );
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

  // Create invoice
  async createInvoice(
    amount: number,
    description: string,
    comment?: string
  ): Promise<LightningInvoice | null> {
    if (!this.isEnabled) {
      this.error = 'Lightning payments not enabled';
      return null;
    }

    try {
      const invoice = this.invoiceService.createInvoice(amount, description, {
        comment
      });
      this.options.onInvoiceCreated?.(invoice);
      this.errorService.info('Invoice created', { amount, description });
      return invoice;
    } catch (err) {
      this.errorService.error('Failed to create invoice', err as Error);
      return null;
    }
  }

  // Check payment status
  async checkPaymentStatus(
    paymentHash: string
  ): Promise<LightningPayment | null> {
    try {
      const result =
        await this.lightningService.checkPaymentStatus(paymentHash);
      if (result.success && result.payment) {
        this.options.onPayment?.(result.payment);
        return result.payment;
      }
      return null;
    } catch (err) {
      this.errorService.error('Failed to check payment status', err as Error);
      return null;
    }
  }

  // Get Lightning status
  getStatus() {
    return {
      enabled: this.isEnabled,
      loading: this.isLoading,
      error: this.error,
      lnurl: this.lnurl,
      sessionId: this.sessionId,
      config: this.lightningService.getConfig()
    };
  }

  // Get payment history
  getPaymentHistory() {
    return this.invoiceService.getAllPayments();
  }

  // Get invoice statistics
  getInvoiceStats() {
    return this.invoiceService.getInvoiceStats();
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
  get lightningServiceInstance(): LightningService {
    return this.lightningService;
  }
  get invoiceServiceInstance(): InvoiceService {
    return this.invoiceService;
  }
  get webhookServiceInstance(): WebhookService {
    return this.webhookService;
  }
  get errorServiceInstance(): ErrorService {
    return this.errorService;
  }
}
