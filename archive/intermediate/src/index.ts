// Main entry point for the application
import { AppConfig } from './types/common';
import { RELAYS, DEFAULT_STYLES } from './utils/constants';

// Initialize the application
class PubPayApp {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
    this.initialize();
  }

  private loadConfig(): AppConfig {
    return {
      relays: RELAYS,
      lightning: {
        enabled: false,
        lnbitsUrl: process.env.LNBITS_URL || '',
        apiKey: process.env.LNBITS_API_KEY || '',
        webhookUrl: process.env.WEBHOOK_URL || ''
      },
      features: {
        liveDisplay: true,
        jukebox: true,
        payments: true,
        auth: true
      }
    };
  }

  private initialize(): void {
    console.log('PubPay App initialized');
    console.log('Configuration:', this.config);

    // Initialize features based on configuration
    if (this.config.features.liveDisplay) {
      this.initializeLiveDisplay();
    }

    if (this.config.features.jukebox) {
      this.initializeJukebox();
    }

    if (this.config.features.payments) {
      this.initializePayments();
    }
  }

  private initializeLiveDisplay(): void {
    console.log('Live display feature initialized');
    // TODO: Initialize live display components
  }

  private initializeJukebox(): void {
    console.log('Jukebox feature initialized');
    // TODO: Initialize jukebox components
  }

  private initializePayments(): void {
    console.log('Payments feature initialized');
    // TODO: Initialize payment components
  }

  public getConfig(): AppConfig {
    return this.config;
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new PubPayApp();

  // Make app available globally for debugging
  (window as any).pubPayApp = app;
});

export default PubPayApp;
