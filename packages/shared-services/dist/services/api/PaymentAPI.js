export class PaymentAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }
    /**
     * Enable Lightning payments
     */
    async enableLightningPayments(data) {
        try {
            const response = await fetch(`${this.baseUrl}/lightning/enable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error enabling Lightning payments:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Disable Lightning payments
     */
    async disableLightningPayments(data) {
        try {
            const response = await fetch(`${this.baseUrl}/lightning/disable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error disabling Lightning payments:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get Lightning payment status
     */
    async getLightningStatus(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/lightning/status/${sessionId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting Lightning status:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get payment history
     */
    async getPaymentHistory(params = {}) {
        try {
            const searchParams = new URLSearchParams();
            if (params.page)
                searchParams.set('page', params.page.toString());
            if (params.limit)
                searchParams.set('limit', params.limit.toString());
            if (params.eventId)
                searchParams.set('eventId', params.eventId);
            const response = await fetch(`${this.baseUrl}/payments?${searchParams}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting payment history:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                data: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }
    /**
     * Create payment request
     */
    async createPaymentRequest(data) {
        try {
            const response = await fetch(`${this.baseUrl}/payments/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error creating payment request:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Check payment status
     */
    async checkPaymentStatus(paymentHash) {
        try {
            const response = await fetch(`${this.baseUrl}/payments/status/${paymentHash}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error checking payment status:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get Lightning configuration
     */
    async getLightningConfig() {
        try {
            const response = await fetch(`${this.baseUrl}/lightning/config`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting Lightning config:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Update Lightning configuration
     */
    async updateLightningConfig(config) {
        try {
            const response = await fetch(`${this.baseUrl}/lightning/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error updating Lightning config:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
