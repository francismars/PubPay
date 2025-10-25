// QRCodeComponent - Handles QR code generation and display
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

export class QRCodeComponent extends BaseComponent {
  private qrInstance: any = null;
  private options: QRCodeOptions;
  private canvas: HTMLCanvasElement | null = null;

  constructor(
    element: HTMLElement | string,
    options: QRCodeOptions,
    errorService: ErrorService
  ) {
    super(element, errorService);
    this.options = {
      size: 200,
      showPreview: true,
      showLink: false,
      className: 'qr-code',
      ...options
    };
  }

  initialize(): void {
    this.render();
  }

  render(): void {
    this.safeExecute(() => {
      this.clear();
      this.createQRCode();
    }, 'Error rendering QR code');
  }

  update(options: Partial<QRCodeOptions>): void {
    this.options = { ...this.options, ...options };
    this.render();
  }

  /**
   * Create QR code element
   */
  private createQRCode(): void {
    // Create container
    const container = document.createElement('div');
    container.className = `qr-container ${this.options.className || ''}`;

    // Create title if provided
    if (this.options.title) {
      const title = document.createElement('div');
      title.className = 'qr-title';
      title.textContent = this.options.title;
      container.appendChild(title);
    }

    // Create QR code canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'qr-canvas';
    this.canvas.width = this.options.size!;
    this.canvas.height = this.options.size!;

    // Create link wrapper if needed
    if (this.options.showLink && this.options.linkUrl) {
      const link = document.createElement('a');
      link.href = this.options.linkUrl;
      link.target = '_blank';
      link.appendChild(this.canvas);
      container.appendChild(link);
    } else {
      container.appendChild(this.canvas);
    }

    // Create preview if enabled
    if (this.options.showPreview) {
      const preview = document.createElement('div');
      preview.className = 'qr-preview';
      preview.textContent = this.truncateValue(this.options.value, 30);
      container.appendChild(preview);
    }

    // Create label if provided
    if (this.options.label) {
      const label = document.createElement('div');
      label.className = 'qr-label';
      label.textContent = this.options.label;
      container.appendChild(label);
    }

    this.element.appendChild(container);

    // Generate QR code
    this.generateQRCode();
  }

  /**
   * Generate QR code using QRious
   */
  private generateQRCode(): void {
    if (!this.canvas) return;

    try {
      // Check if QRious is available
      if (typeof (window as any).QRious === 'undefined') {
        throw new Error('QRious library not loaded');
      }

      this.qrInstance = new (window as any).QRious({
        element: this.canvas,
        value: this.options.value,
        size: this.options.size
      });

      this.errorService.debug('QR code generated successfully', {
        value: this.options.value,
        size: this.options.size
      });
    } catch (error) {
      this.errorService.error('Error generating QR code', error as Error);
      this.showFallback();
    }
  }

  /**
   * Show fallback when QR generation fails
   */
  private showFallback(): void {
    if (!this.canvas) return;

    this.canvas.style.display = 'none';

    const fallback = document.createElement('div');
    fallback.className = 'qr-fallback';
    fallback.style.cssText = `
      padding: 20px;
      font-family: monospace;
      word-break: break-all;
      background: #f0f0f0;
      border: 2px solid #ccc;
      border-radius: 8px;
      text-align: center;
      color: #333;
    `;
    fallback.textContent = this.options.value;

    this.canvas.parentNode?.insertBefore(fallback, this.canvas);
  }

  /**
   * Update QR code value
   */
  updateValue(value: string): void {
    this.options.value = value;
    this.render();
  }

  /**
   * Update QR code size
   */
  updateSize(size: number): void {
    this.options.size = size;
    this.render();
  }

  /**
   * Get QR code as data URL
   */
  getDataURL(): string | null {
    if (!this.canvas) return null;
    return this.canvas.toDataURL();
  }

  /**
   * Download QR code as image
   */
  download(filename?: string): void {
    const dataURL = this.getDataURL();
    if (!dataURL) return;

    const link = document.createElement('a');
    link.download = filename || `qr-code-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }

  /**
   * Copy QR code value to clipboard
   */
  async copyToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.options.value);
      this.errorService.info('QR code value copied to clipboard');
      return true;
    } catch (error) {
      this.errorService.error('Failed to copy to clipboard', error as Error);
      return false;
    }
  }

  /**
   * Truncate value for preview
   */
  private truncateValue(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.substring(0, maxLength)}...`;
  }

  /**
   * Get QR code dimensions
   */
  getQRDimensions(): { width: number; height: number } | null {
    if (!this.canvas) return null;
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }

  /**
   * Check if QR code is valid
   */
  isValid(): boolean {
    return this.qrInstance !== null && this.options.value.length > 0;
  }

  /**
   * Get QR code value
   */
  getValue(): string {
    return this.options.value;
  }

  /**
   * Get QR code options
   */
  getOptions(): QRCodeOptions {
    return { ...this.options };
  }

  /**
   * Destroy QR code instance
   */
  destroy(): void {
    if (this.qrInstance) {
      this.qrInstance = null;
    }
    super.destroy();
  }
}
