// Lightning API Service - Frontend service that calls the new backend API
export interface LightningApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LightningConfig {
  enabled: boolean;
  lnbitsUrl: string;
  apiKey: string;
  webhookUrl: string;
}

export interface LightningStatus {
  enabled: boolean;
  lnurl?: string;
  sessionId?: string;
  config: LightningConfig;
}

export interface LightningPayment {
  paymentHash: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  comment?: string;
}

export class LightningApiService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3002') {
    this.baseUrl = baseUrl;
  }

  // Enable Lightning payments for an event
  async enableLightning(
    eventId: string,
    frontendSessionId: string
  ): Promise<LightningApiResponse & { lnurl?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/lightning/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventId,
          frontendSessionId
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  // Disable Lightning payments for an event
  async disableLightning(
    eventId: string,
    frontendSessionId: string
  ): Promise<LightningApiResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/lightning/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          eventId,
          frontendSessionId
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  // Get Lightning status
  async getStatus(): Promise<LightningApiResponse<LightningStatus>> {
    try {
      const response = await fetch(`${this.baseUrl}/lightning/status`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  // Get payment history
  async getPaymentHistory(
    eventId?: string
  ): Promise<LightningApiResponse<LightningPayment[]>> {
    try {
      const url = eventId
        ? `${this.baseUrl}/lightning/payments?eventId=${eventId}`
        : `${this.baseUrl}/lightning/payments`;

      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  // Health check
  async healthCheck(): Promise<
    LightningApiResponse<{ healthy: boolean; config: any }>
  > {
    try {
      const response = await fetch(`${this.baseUrl}/lightning/health`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }
}
