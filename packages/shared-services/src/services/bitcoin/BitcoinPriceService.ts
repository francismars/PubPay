/**
 * BitcoinPriceService - Handles Bitcoin price fetching and conversion
 *
 * Provides functionality to:
 * - Fetch current Bitcoin prices from Mempool API
 * - Fetch historical Bitcoin prices
 * - Convert sats to fiat currencies
 * - Manage automatic price updates
 */

export interface BitcoinPrices {
  [currency: string]: number;
}

export interface HistoricalPriceData {
  prices: Array<{
    [currency: string]: number;
  }>;
}

export interface PriceUpdateCallback {
  (prices: BitcoinPrices): void;
}

export class BitcoinPriceService {
  private baseUrl: string;
  private currentPrices: BitcoinPrices = {};
  private updateInterval: NodeJS.Timeout | null = null;
  private updateCallbacks: Set<PriceUpdateCallback> = new Set();
  private readonly DEFAULT_UPDATE_INTERVAL = 30000; // 30 seconds

  constructor(baseUrl: string = 'https://mempool.space/api/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch current Bitcoin prices from Mempool API
   */
  async fetchPrices(): Promise<BitcoinPrices | null> {
    try {
      const response = await fetch(`${this.baseUrl}/prices`);
      if (!response.ok) {
        throw new Error(`Failed to fetch prices: ${response.statusText}`);
      }
      const data = (await response.json()) as BitcoinPrices;

      // Check if prices have changed
      const pricesChanged = this.hasPricesChanged(data);

      // Update current prices
      this.currentPrices = data;

      // Notify callbacks if prices changed
      if (pricesChanged && Object.keys(this.currentPrices).length > 0) {
        this.notifyCallbacks(data);
      }

      return data;
    } catch (error) {
      console.error('❌ Failed to fetch Bitcoin prices:', error);
      return null;
    }
  }

  /**
   * Fetch historical Bitcoin prices for a specific timestamp
   */
  async fetchHistoricalPrice(
    timestamp: number,
    currency: string = 'USD'
  ): Promise<HistoricalPriceData | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/historical-price?currency=${currency}&timestamp=${timestamp}`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch historical price: ${response.statusText}`
        );
      }
      const data = (await response.json()) as HistoricalPriceData;
      return data;
    } catch (error) {
      console.error('❌ Failed to fetch historical Bitcoin price:', error);
      return null;
    }
  }

  /**
   * Get current cached prices
   */
  getPrices(): BitcoinPrices {
    return { ...this.currentPrices };
  }

  /**
   * Check if prices have changed
   */
  private hasPricesChanged(newPrices: BitcoinPrices): boolean {
    return Object.keys(newPrices).some(
      currency => this.currentPrices[currency] !== newPrices[currency]
    );
  }

  /**
   * Convert sats to fiat currency
   */
  satsToFiat(
    sats: number,
    currency: string = 'USD',
    includeHtml: boolean = true
  ): string {
    if (!this.currentPrices[currency]) {
      return '';
    }

    const btcAmount = sats / 100000000; // Convert sats to BTC
    const fiatAmount = btcAmount * this.currentPrices[currency];

    // Format based on currency
    if (currency === 'JPY') {
      const formatted = Math.round(fiatAmount).toLocaleString();
      return includeHtml
        ? `${formatted} <span class="currency-code">${currency}</span>`
        : `${formatted} ${currency}`;
    } else {
      const formatted = fiatAmount.toFixed(2);
      return includeHtml
        ? `${formatted} <span class="currency-code">${currency}</span>`
        : `${formatted} ${currency}`;
    }
  }

  /**
   * Convert sats to fiat with historical price comparison
   */
  async satsToFiatWithHistorical(
    sats: number,
    timestamp: number,
    currency: string = 'USD',
    options: {
      showHistoricalChange?: boolean;
      includeHtml?: boolean;
    } = {}
  ): Promise<string> {
    const { showHistoricalChange = false, includeHtml = true } = options;

    if (!this.currentPrices[currency]) {
      return '';
    }

    const btcAmount = sats / 100000000; // Convert sats to BTC
    const currentFiatAmount = btcAmount * this.currentPrices[currency];

    // Format current amount
    let currentFormatted: string;
    if (currency === 'JPY') {
      const formatted = Math.round(currentFiatAmount).toLocaleString();
      currentFormatted = includeHtml
        ? `${formatted} <span class="currency-code">${currency}</span>`
        : `${formatted} ${currency}`;
    } else {
      const formatted = currentFiatAmount.toFixed(2);
      currentFormatted = includeHtml
        ? `${formatted} <span class="currency-code">${currency}</span>`
        : `${formatted} ${currency}`;
    }

    // Fetch historical price
    const historicalData = await this.fetchHistoricalPrice(timestamp, currency);

    if (
      historicalData &&
      historicalData.prices &&
      historicalData.prices.length > 0
    ) {
      const historicalPrice = historicalData.prices[0][currency];

      if (historicalPrice) {
        const historicalFiatAmount = btcAmount * historicalPrice;

        let historicalFormatted: string;
        if (currency === 'JPY') {
          historicalFormatted =
            Math.round(historicalFiatAmount).toLocaleString();
        } else {
          historicalFormatted = historicalFiatAmount.toFixed(2);
        }

        let result = includeHtml
          ? `${currentFormatted} <span class="historical-price">(${historicalFormatted})</span>`
          : `${currentFormatted} (${historicalFormatted})`;

        if (showHistoricalChange) {
          // Calculate percentage change
          const percentageChange =
            ((currentFiatAmount - historicalFiatAmount) /
              historicalFiatAmount) *
            100;
          const changeFormatted =
            percentageChange >= 0
              ? `+${percentageChange.toFixed(1)}%`
              : `${percentageChange.toFixed(1)}%`;

          result += includeHtml
            ? ` <span class="historical-change">${changeFormatted}</span>`
            : ` ${changeFormatted}`;
        }

        return result;
      }
    }

    return currentFormatted;
  }

  /**
   * Start automatic price updates
   */
  startPriceUpdates(intervalMs: number = this.DEFAULT_UPDATE_INTERVAL): void {
    // Clear any existing interval
    this.stopPriceUpdates();

    // Fetch prices immediately
    this.fetchPrices();

    // Set up interval
    this.updateInterval = setInterval(() => {
      this.fetchPrices();
    }, intervalMs);

    console.log(
      `💰 Live Bitcoin price updates started (every ${intervalMs / 1000} seconds)`
    );
  }

  /**
   * Stop automatic price updates
   */
  stopPriceUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('💰 Live Bitcoin price updates stopped');
    }
  }

  /**
   * Manually refresh prices
   */
  async refreshPrices(): Promise<BitcoinPrices | null> {
    console.log('💰 Manually refreshing Bitcoin prices...');
    const newPrices = await this.fetchPrices();
    if (newPrices) {
      console.log('✅ Bitcoin prices refreshed successfully');
      return newPrices;
    } else {
      console.error('❌ Failed to refresh Bitcoin prices');
      return null;
    }
  }

  /**
   * Subscribe to price updates
   */
  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.updateCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.updateCallbacks.delete(callback);
    };
  }

  /**
   * Notify all callbacks of price updates
   */
  private notifyCallbacks(prices: BitcoinPrices): void {
    this.updateCallbacks.forEach(callback => {
      try {
        callback(prices);
      } catch (error) {
        console.error('Error in price update callback:', error);
      }
    });
  }

  /**
   * Get the raw fiat amount (without formatting)
   */
  getFiatAmount(sats: number, currency: string = 'USD'): number | null {
    if (!this.currentPrices[currency]) {
      return null;
    }

    const btcAmount = sats / 100000000;
    return btcAmount * this.currentPrices[currency];
  }

  /**
   * Check if a currency is available
   */
  hasCurrency(currency: string): boolean {
    return currency in this.currentPrices;
  }

  /**
   * Get list of available currencies
   */
  getAvailableCurrencies(): string[] {
    return Object.keys(this.currentPrices);
  }
}
