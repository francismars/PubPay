// LightningPaymentComponent - Handles Lightning payment UI
import { BaseComponent } from './BaseComponent';
export class LightningPaymentComponent extends BaseComponent {
    constructor(element, lightningService, options = {}, errorService) {
        super(element, errorService);
        this.isEnabled = false;
        this.currentLNURL = null;
        this.qrComponent = null;
        this.lightningService = lightningService;
        this.options = {
            showToggle: true,
            showQR: true,
            showStatus: true,
            autoEnable: false,
            className: 'lightning-payment',
            qrSize: 200,
            modalStyle: 'popup',
            ...options
        };
    }
    initialize() {
        this.render();
        this.setupEventListeners();
        if (this.options.autoEnable) {
            this.enableLightning();
        }
    }
    render() {
        this.safeExecute(() => {
            this.clear();
            this.createPaymentUI();
        }, 'Error rendering Lightning payment component');
    }
    update(options) {
        this.options = { ...this.options, ...options };
        this.render();
    }
    /**
     * Create Lightning payment UI
     */
    createPaymentUI() {
        const container = document.createElement('div');
        container.className = `lightning-payment-container ${this.options.className || ''}`;
        // Create toggle button if enabled
        if (this.options.showToggle) {
            const toggle = this.createToggleButton();
            container.appendChild(toggle);
        }
        // Create status display if enabled
        if (this.options.showStatus) {
            const status = this.createStatusDisplay();
            container.appendChild(status);
        }
        // Create QR display if enabled
        if (this.options.showQR) {
            const qrDisplay = this.createQRDisplay();
            container.appendChild(qrDisplay);
        }
        this.element.appendChild(container);
    }
    /**
     * Create toggle button
     */
    createToggleButton() {
        const toggle = document.createElement('button');
        toggle.id = 'lightningToggle';
        toggle.className = 'lightning-toggle';
        toggle.innerHTML = `
      <span class="toggle-icon">⚡</span>
      <span class="toggle-text">Lightning</span>
    `;
        toggle.addEventListener('click', () => {
            this.toggleLightning();
        });
        return toggle;
    }
    /**
     * Create status display
     */
    createStatusDisplay() {
        const status = document.createElement('div');
        status.id = 'paymentStatus';
        status.className = 'payment-status';
        status.innerHTML =
            '<div class="status-disabled">🔒 Lightning disabled</div>';
        return status;
    }
    /**
     * Create QR display
     */
    createQRDisplay() {
        const qrDisplay = document.createElement('div');
        qrDisplay.id = 'lightningQRDisplay';
        qrDisplay.className = 'lightning-qr-display';
        qrDisplay.style.display = 'none';
        return qrDisplay;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Event listeners will be implemented when LightningService supports events
        // For now, we'll handle state changes through direct method calls
    }
    /**
     * Toggle Lightning payments
     */
    async toggleLightning() {
        if (this.isEnabled) {
            await this.disableLightning();
        }
        else {
            await this.enableLightning();
        }
    }
    /**
     * Enable Lightning payments
     */
    async enableLightning() {
        try {
            const eventId = this.getCurrentEventId();
            if (!eventId) {
                this.errorService.warn('No event ID found for Lightning payments');
                return;
            }
            const result = await this.lightningService.enableLightningPayments(eventId);
            if (result.success && result.lnurl) {
                this.isEnabled = true;
                this.currentLNURL = result.lnurl;
                this.updateUI();
                this.showQRCode(result.lnurl);
                this.errorService.info('Lightning payments enabled');
            }
            else {
                this.errorService.error('Failed to enable Lightning payments', new Error(result.error));
            }
        }
        catch (error) {
            this.errorService.error('Error enabling Lightning payments', error);
        }
    }
    /**
     * Disable Lightning payments
     */
    async disableLightning() {
        try {
            const eventId = this.getCurrentEventId();
            if (!eventId)
                return;
            const result = await this.lightningService.disableLightningPayments(eventId);
            if (result.success) {
                this.isEnabled = false;
                this.currentLNURL = null;
                this.updateUI();
                this.hideQRCode();
                this.errorService.info('Lightning payments disabled');
            }
            else {
                this.errorService.error('Failed to disable Lightning payments', new Error(result.error));
            }
        }
        catch (error) {
            this.errorService.error('Error disabling Lightning payments', error);
        }
    }
    /**
     * Update UI based on current state
     */
    updateUI() {
        const toggle = this.find('#lightningToggle');
        const status = this.find('#paymentStatus');
        if (toggle) {
            toggle.classList.toggle('enabled', this.isEnabled);
            toggle.classList.toggle('disabled', !this.isEnabled);
        }
        if (status) {
            if (this.isEnabled) {
                status.innerHTML =
                    '<div class="status-waiting">⚡ Lightning enabled - scan QR to pay</div>';
            }
            else {
                status.innerHTML =
                    '<div class="status-disabled">🔒 Lightning disabled</div>';
            }
        }
    }
    /**
     * Show QR code
     */
    showQRCode(lnurl) {
        if (!this.options.showQR)
            return;
        const qrDisplay = this.find('#lightningQRDisplay');
        if (!qrDisplay)
            return;
        if (this.options.modalStyle === 'popup') {
            this.showQRPopup(lnurl);
        }
        else {
            this.showQRInline(lnurl);
        }
    }
    /**
     * Show QR code in popup
     */
    showQRPopup(lnurl) {
        // Remove existing popup
        const existing = document.getElementById('lightningQRPopup');
        if (existing) {
            existing.remove();
        }
        const popup = document.createElement('div');
        popup.id = 'lightningQRPopup';
        popup.className = 'lightning-qr-popup';
        popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 5px solid #ffd700;
      border-radius: 15px;
      padding: 20px;
      z-index: 9999;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      text-align: center;
    `;
        // Create close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '✕';
        closeButton.style.cssText = `
      position: absolute;
      top: 5px;
      right: 10px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 16px;
    `;
        closeButton.onclick = () => popup.remove();
        // Create title
        const title = document.createElement('h3');
        title.textContent = '⚡ Lightning Payment';
        title.style.cssText = `
      margin: 0 0 10px 0;
      color: #b8860b;
    `;
        // Create QR code container
        const qrContainer = document.createElement('div');
        qrContainer.id = 'lightningQRCodePopup';
        qrContainer.style.cssText = `
      margin: 10px 0;
      display: inline-block;
    `;
        // Create LNURL preview
        const preview = document.createElement('div');
        preview.textContent = `${lnurl.substring(0, 30)}...`;
        preview.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      color: #666;
      margin: 10px 0;
      word-break: break-all;
    `;
        // Assemble popup
        popup.appendChild(closeButton);
        popup.appendChild(title);
        popup.appendChild(qrContainer);
        popup.appendChild(preview);
        document.body.appendChild(popup);
        // Generate QR code
        this.generateQRCode(qrContainer, lnurl);
    }
    /**
     * Show QR code inline
     */
    showQRInline(lnurl) {
        const qrDisplay = this.find('#lightningQRDisplay');
        if (!qrDisplay)
            return;
        qrDisplay.style.display = 'block';
        qrDisplay.innerHTML = `
      <div class="qr-title">⚡ Lightning Payment</div>
      <div id="lightningQRCodeInline" class="qr-code"></div>
      <div class="qr-preview">${lnurl.substring(0, 30)}...</div>
    `;
        const qrContainer = qrDisplay.querySelector('#lightningQRCodeInline');
        if (qrContainer) {
            this.generateQRCode(qrContainer, lnurl);
        }
    }
    /**
     * Hide QR code
     */
    hideQRCode() {
        const qrDisplay = this.find('#lightningQRDisplay');
        if (qrDisplay) {
            qrDisplay.style.display = 'none';
        }
        const popup = document.getElementById('lightningQRPopup');
        if (popup) {
            popup.remove();
        }
    }
    /**
     * Generate QR code
     */
    generateQRCode(container, lnurl) {
        try {
            if (typeof window.QRious === 'undefined') {
                throw new Error('QRious library not loaded');
            }
            new window.QRious({
                element: container,
                value: lnurl,
                size: this.options.qrSize
            });
            this.errorService.debug('Lightning QR code generated', { lnurl });
        }
        catch (error) {
            this.errorService.error('Error generating Lightning QR code', error);
            container.innerHTML = `<div style="padding: 20px; font-family: monospace; word-break: break-all; background: #f0f0f0; border: 2px solid #ccc; border-radius: 8px;">${lnurl}</div>`;
        }
    }
    /**
     * Get current event ID
     */
    getCurrentEventId() {
        // This would get the current event ID from the URL or state
        const path = window.location.pathname;
        const match = path.match(/\/live\/(.+)/);
        return match && match[1] ? match[1] : null;
    }
    /**
     * Handle Lightning enabled event
     */
    handleLightningEnabled(data) {
        this.isEnabled = true;
        this.currentLNURL = data.lnurl;
        this.updateUI();
    }
    /**
     * Handle Lightning disabled event
     */
    handleLightningDisabled() {
        this.isEnabled = false;
        this.currentLNURL = null;
        this.updateUI();
        this.hideQRCode();
    }
    /**
     * Handle Lightning error
     */
    handleLightningError(error) {
        this.errorService.error('Lightning payment error', error);
        this.updateUI();
    }
    /**
     * Get current status
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            lnurl: this.currentLNURL
        };
    }
    /**
     * Check if Lightning is enabled
     */
    isLightningEnabled() {
        return this.isEnabled;
    }
    /**
     * Get current LNURL
     */
    getLNURL() {
        return this.currentLNURL;
    }
}
