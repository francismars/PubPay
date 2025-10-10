import { BaseComponent } from './BaseComponent';
import { ErrorService } from './services/ErrorService';
import { LightningService } from './services/LightningService';
export interface LightningPaymentOptions {
    showToggle?: boolean;
    showQR?: boolean;
    showStatus?: boolean;
    autoEnable?: boolean;
    className?: string;
    qrSize?: number;
    modalStyle?: 'popup' | 'inline' | 'slide';
}
export declare class LightningPaymentComponent extends BaseComponent {
    private lightningService;
    private options;
    private isEnabled;
    private currentLNURL;
    private qrComponent;
    constructor(element: HTMLElement | string, lightningService: LightningService, options: LightningPaymentOptions | undefined, errorService: ErrorService);
    initialize(): void;
    render(): void;
    update(options: Partial<LightningPaymentOptions>): void;
    /**
     * Create Lightning payment UI
     */
    private createPaymentUI;
    /**
     * Create toggle button
     */
    private createToggleButton;
    /**
     * Create status display
     */
    private createStatusDisplay;
    /**
     * Create QR display
     */
    private createQRDisplay;
    /**
     * Setup event listeners
     */
    private setupEventListeners;
    /**
     * Toggle Lightning payments
     */
    private toggleLightning;
    /**
     * Enable Lightning payments
     */
    enableLightning(): Promise<void>;
    /**
     * Disable Lightning payments
     */
    disableLightning(): Promise<void>;
    /**
     * Update UI based on current state
     */
    private updateUI;
    /**
     * Show QR code
     */
    private showQRCode;
    /**
     * Show QR code in popup
     */
    private showQRPopup;
    /**
     * Show QR code inline
     */
    private showQRInline;
    /**
     * Hide QR code
     */
    private hideQRCode;
    /**
     * Generate QR code
     */
    private generateQRCode;
    /**
     * Get current event ID
     */
    private getCurrentEventId;
    /**
     * Handle Lightning enabled event
     */
    private handleLightningEnabled;
    /**
     * Handle Lightning disabled event
     */
    private handleLightningDisabled;
    /**
     * Handle Lightning error
     */
    private handleLightningError;
    /**
     * Get current status
     */
    getStatus(): {
        enabled: boolean;
        lnurl: string | null;
    };
    /**
     * Check if Lightning is enabled
     */
    isLightningEnabled(): boolean;
    /**
     * Get current LNURL
     */
    getLNURL(): string | null;
}
