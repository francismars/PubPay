export class ConfigAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }
    /**
     * Get application configuration
     */
    async getAppConfig() {
        try {
            const response = await fetch(`${this.baseUrl}/config`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting app config:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Update application configuration
     */
    async updateAppConfig(config) {
        try {
            const response = await fetch(`${this.baseUrl}/config`, {
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
            console.error('Error updating app config:', error);
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
            const response = await fetch(`${this.baseUrl}/config/lightning`);
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
            const response = await fetch(`${this.baseUrl}/config/lightning`, {
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
    /**
     * Get feature flags
     */
    async getFeatureFlags() {
        try {
            const response = await fetch(`${this.baseUrl}/config/features`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting feature flags:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Update feature flags
     */
    async updateFeatureFlags(flags) {
        try {
            const response = await fetch(`${this.baseUrl}/config/features`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flags)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error updating feature flags:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get relay configuration
     */
    async getRelayConfig() {
        try {
            const response = await fetch(`${this.baseUrl}/config/relays`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting relay config:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Update relay configuration
     */
    async updateRelayConfig(config) {
        try {
            const response = await fetch(`${this.baseUrl}/config/relays`, {
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
            console.error('Error updating relay config:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get system status
     */
    async getSystemStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting system status:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Get application version
     */
    async getVersion() {
        try {
            const response = await fetch(`${this.baseUrl}/version`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error('Error getting version:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Test API connectivity
     */
    async testConnection() {
        try {
            const startTime = Date.now();
            const response = await fetch(`${this.baseUrl}/ping`);
            const endTime = Date.now();
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return {
                success: true,
                latency: endTime - startTime
            };
        }
        catch (error) {
            console.error('Error testing connection:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
