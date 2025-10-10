import { ApiResponse } from '@pubpay/shared-types';
import { AppConfig, LightningConfig, FeatureFlags } from '@pubpay/shared-types';
export declare class ConfigAPI {
    private baseUrl;
    constructor(baseUrl?: string);
    /**
     * Get application configuration
     */
    getAppConfig(): Promise<ApiResponse<AppConfig>>;
    /**
     * Update application configuration
     */
    updateAppConfig(config: Partial<AppConfig>): Promise<ApiResponse<AppConfig>>;
    /**
     * Get Lightning configuration
     */
    getLightningConfig(): Promise<ApiResponse<LightningConfig>>;
    /**
     * Update Lightning configuration
     */
    updateLightningConfig(config: Partial<LightningConfig>): Promise<ApiResponse<LightningConfig>>;
    /**
     * Get feature flags
     */
    getFeatureFlags(): Promise<ApiResponse<FeatureFlags>>;
    /**
     * Update feature flags
     */
    updateFeatureFlags(flags: Partial<FeatureFlags>): Promise<ApiResponse<FeatureFlags>>;
    /**
     * Get relay configuration
     */
    getRelayConfig(): Promise<ApiResponse<{
        relays: string[];
        recommended: string[];
        custom: string[];
    }>>;
    /**
     * Update relay configuration
     */
    updateRelayConfig(config: {
        relays?: string[];
        custom?: string[];
    }): Promise<ApiResponse<{
        relays: string[];
        recommended: string[];
        custom: string[];
    }>>;
    /**
     * Get system status
     */
    getSystemStatus(): Promise<ApiResponse<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        services: {
            nostr: 'up' | 'down' | 'degraded';
            lightning: 'up' | 'down' | 'degraded';
            database: 'up' | 'down' | 'degraded';
        };
        uptime: number;
        version: string;
    }>>;
    /**
     * Get application version
     */
    getVersion(): Promise<ApiResponse<{
        version: string;
        build: string;
        commit: string;
        timestamp: number;
    }>>;
    /**
     * Test API connectivity
     */
    testConnection(): Promise<{
        success: boolean;
        latency?: number;
        error?: string;
    }>;
}
