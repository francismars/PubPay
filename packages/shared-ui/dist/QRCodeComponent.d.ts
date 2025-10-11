import { BaseComponent } from './BaseComponent';
import { ErrorService } from '@pubpay/shared-services';
export interface QRCodeOptions {
    size?: number;
    value: string;
    title?: string;
    label?: string;
    showPreview?: boolean;
    showLink?: boolean;
    linkUrl?: string;
    className?: string;
}
export declare class QRCodeComponent extends BaseComponent {
    private qrInstance;
    private options;
    private canvas;
    constructor(element: HTMLElement | string, options: QRCodeOptions, errorService: ErrorService);
    initialize(): void;
    render(): void;
    update(options: Partial<QRCodeOptions>): void;
    /**
     * Create QR code element
     */
    private createQRCode;
    /**
     * Generate QR code using QRious
     */
    private generateQRCode;
    /**
     * Show fallback when QR generation fails
     */
    private showFallback;
    /**
     * Update QR code value
     */
    updateValue(value: string): void;
    /**
     * Update QR code size
     */
    updateSize(size: number): void;
    /**
     * Get QR code as data URL
     */
    getDataURL(): string | null;
    /**
     * Download QR code as image
     */
    download(filename?: string): void;
    /**
     * Copy QR code value to clipboard
     */
    copyToClipboard(): Promise<boolean>;
    /**
     * Truncate value for preview
     */
    private truncateValue;
    /**
     * Get QR code dimensions
     */
    getQRDimensions(): {
        width: number;
        height: number;
    } | null;
    /**
     * Check if QR code is valid
     */
    isValid(): boolean;
    /**
     * Get QR code value
     */
    getValue(): string;
    /**
     * Get QR code options
     */
    getOptions(): QRCodeOptions;
    /**
     * Destroy QR code instance
     */
    destroy(): void;
}
