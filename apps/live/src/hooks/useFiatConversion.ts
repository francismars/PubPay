/**
 * useFiatConversion Hook
 *
 * Manages fiat currency conversion functionality using BitcoinPriceService.
 * Handles:
 * - Currency selection and state management
 * - Satoshi to fiat conversion
 * - Historical price conversion
 * - DOM updates for fiat amounts
 * - Toggle state management
 */

import { useCallback, useRef, useMemo } from 'react';
import { BitcoinPriceService } from '@pubpay/shared-services';

export interface UseFiatConversionOptions {
  bitcoinPriceService?: BitcoinPriceService;
  defaultCurrency?: string;
  debounceMs?: number;
}

export interface UseFiatConversionReturn {
  // State
  selectedCurrency: string;
  setSelectedCurrency: (currency: string) => void;

  // Conversion functions
  satsToFiat: (sats: number, currency?: string) => string;
  satsToFiatWithHistorical: (
    sats: number,
    timestamp: number,
    currency?: string
  ) => Promise<string>;

  // DOM update functions
  updateFiatAmounts: () => Promise<void>;
  debouncedUpdateFiatAmounts: () => void;
  hideFiatAmounts: () => void;
  restoreSatoshiAmounts: () => void;

  // Utility functions
  addMissingTimestamps: () => void;
  setHistoricalPriceLoading: (
    loading: boolean,
    progress?: { current: number; total: number }
  ) => void;

  // Service access
  bitcoinPriceService: BitcoinPriceService;
}

export function useFiatConversion(
  options: UseFiatConversionOptions = {}
): UseFiatConversionReturn {
  const {
    bitcoinPriceService: providedService,
    defaultCurrency = 'USD',
    debounceMs = 500
  } = options;

  // Initialize BitcoinPriceService
  const bitcoinPriceService = useMemo(
    () => providedService || new BitcoinPriceService(),
    [providedService]
  );

  // Currency state
  const selectedCurrencyRef = useRef<string>(defaultCurrency);
  const isUpdatingFiatAmounts = useRef<boolean>(false);
  const fiatUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get selected currency
  const selectedCurrency = selectedCurrencyRef.current;

  // Set selected currency
  const setSelectedCurrency = useCallback((currency: string) => {
    selectedCurrencyRef.current = currency;
  }, []);

  // Convert sats to fiat
  const satsToFiat = useCallback(
    (sats: number, currency?: string): string => {
      const targetCurrency = currency || selectedCurrencyRef.current;
      return bitcoinPriceService.satsToFiat(sats, targetCurrency, true);
    },
    [bitcoinPriceService]
  );

  // Convert sats to fiat with historical price
  const satsToFiatWithHistorical = useCallback(
    async (
      sats: number,
      timestamp: number,
      currency?: string
    ): Promise<string> => {
      const targetCurrency = currency || selectedCurrencyRef.current;

      // Check if historical change toggle is enabled
      const showHistoricalChangeToggle = document.getElementById(
        'showHistoricalChangeToggle'
      ) as HTMLInputElement;
      const showHistoricalChange =
        showHistoricalChangeToggle && showHistoricalChangeToggle.checked;

      return await bitcoinPriceService.satsToFiatWithHistorical(
        sats,
        timestamp,
        targetCurrency,
        {
          showHistoricalChange,
          includeHtml: true
        }
      );
    },
    [bitcoinPriceService]
  );

  // Add missing timestamps to zap elements
  const addMissingTimestamps = useCallback(() => {
    const zapElements = document.querySelectorAll('.zap:not([data-timestamp])');

    zapElements.forEach((zapElement, index) => {
      // Try to get timestamp from dataset if available
      const datasetTimestamp = (zapElement as HTMLElement).dataset.timestamp;
      if (datasetTimestamp) {
        zapElement.setAttribute('data-timestamp', datasetTimestamp);
      } else {
        // Try to get timestamp from the global zaps array if available
        const zapId = (zapElement as HTMLElement).dataset.zapId;
        if (zapId && (window as any).zaps) {
          const zapData = (window as any).zaps.find(
            (zap: { id: string; timestamp?: number; created_at?: number }) =>
              zap.id === zapId
          );
          if (zapData && (zapData.timestamp || zapData.created_at)) {
            const timestamp = zapData.timestamp || zapData.created_at;
            zapElement.setAttribute('data-timestamp', timestamp.toString());
          } else {
            console.log(
              `❌ No timestamp found in zaps array for zap ${index + 1}`
            );
          }
        } else {
          console.log(
            `❌ No dataset timestamp or zaps array available for zap ${index + 1}`
          );
        }
      }
    });
  }, []);

  // Set historical price loading state
  const setHistoricalPriceLoading = useCallback(
    (loading: boolean, progress?: { current: number; total: number }) => {
      const toggleLabel = document
        .querySelector('#showHistoricalPriceToggle')
        ?.closest('.toggle-switch')?.nextElementSibling;

      if (toggleLabel) {
        const labelElement = toggleLabel as HTMLElement;
        if (loading) {
          if (progress) {
            labelElement.textContent = `Loading Historical Prices... (${progress.current}/${progress.total})`;
          } else {
            labelElement.textContent = 'Loading Historical Prices...';
          }
          labelElement.style.opacity = '0.7';
          labelElement.style.fontStyle = 'italic';
        } else {
          labelElement.textContent = 'Show Historical Prices';
          labelElement.style.opacity = '1';
          labelElement.style.fontStyle = 'normal';
        }
      }
    },
    []
  );

  // Update fiat amounts for all sat amounts on the page
  const updateFiatAmounts = useCallback(async () => {
    // Check if fiat toggle is enabled - if not, don't show any fiat amounts
    const showFiatToggle = document.getElementById(
      'showFiatToggle'
    ) as HTMLInputElement;
    if (!showFiatToggle || !showFiatToggle.checked) {
      return;
    }

    if (!bitcoinPriceService.hasCurrency(selectedCurrencyRef.current)) {
      return;
    }

    // Add visual indicator that prices are being updated
    const priceUpdateIndicator = document.getElementById(
      'priceUpdateIndicator'
    );
    if (priceUpdateIndicator) {
      priceUpdateIndicator.style.display = 'inline';
      priceUpdateIndicator.textContent = 'Updating prices...';
    }

    // Check if historical price toggle is enabled
    const showHistoricalPriceToggle = document.getElementById(
      'showHistoricalPriceToggle'
    ) as HTMLInputElement;
    const showHistorical =
      showHistoricalPriceToggle && showHistoricalPriceToggle.checked;

    // Check if fiat only toggle is enabled
    const fiatOnlyToggle = document.getElementById(
      'fiatOnlyToggle'
    ) as HTMLInputElement;
    const fiatOnly = fiatOnlyToggle && fiatOnlyToggle.checked;

    const totalAmountElement = document.querySelector('.total-amount');
    const totalSatsElement = document.querySelector(
      '.zaps-header-left .total-sats'
    );
    const totalValueElement = document.getElementById('zappedTotalValue');

    // Handle total sats display in header
    if (totalSatsElement) {
      if (fiatOnly) {
        (totalSatsElement as HTMLElement).style.display = 'none';
      } else {
        (totalSatsElement as HTMLElement).style.display = 'inline';
      }
    }

    // Try to fix missing timestamps before processing
    if (showHistorical) {
      addMissingTimestamps();
    }

    // Set loading state if historical prices are enabled
    if (showHistorical) {
      setHistoricalPriceLoading(true);
    }

    try {
      // Find all elements with sat amounts
      const satElements = document.querySelectorAll(
        '.total-amount, .zapperAmountSats, .zap-amount-sats'
      );

      let processedCount = 0;
      const totalElements = satElements.length;

      for (const element of satElements) {
        // Store original satoshi amount if not already stored
        if (!(element as HTMLElement).dataset.originalSats) {
          const currentText = element.textContent || '';
          const currentSatMatch = currentText.match(/(\d+(?:,\d{3})*)/);
          if (currentSatMatch && currentSatMatch[1]) {
            // Only store if it looks like a satoshi amount (not a fiat amount)
            if (
              !currentText.includes('CAD') &&
              !currentText.includes('USD') &&
              !currentText.includes('EUR') &&
              !currentText.includes('GBP') &&
              !currentText.includes('JPY') &&
              !currentText.includes('CHF') &&
              !currentText.includes('AUD')
            ) {
              (element as HTMLElement).dataset.originalSats = currentText;
            }
          }
        }

        // If this element has stored original satoshi data, use it for calculation
        const originalSats = (element as HTMLElement).dataset.originalSats;
        let satText: string;
        if (originalSats) {
          satText = originalSats;
        } else {
          satText = element.textContent || '';
        }

        const satMatch = satText.match(/(\d+(?:,\d{3})*)/);

        if (satMatch && satMatch[1]) {
          const sats = parseInt(satMatch[1].replace(/,/g, ''));

          // Check if this is a total amount (no timestamp needed) or individual zap amount
          const isTotalAmount = element.classList.contains('total-amount');

          let fiatAmount: string;
          if (isTotalAmount || !showHistorical) {
            // For total amounts or when historical is disabled, just show current price
            fiatAmount = satsToFiat(sats);
          } else {
            // For individual zap amounts, check if they're in the .zaps-list
            const zapElement = element.closest('.zap');
            if (zapElement) {
              // Only apply historical prices to zaps within .zaps-list
              const isInZapList = zapElement.closest('.zaps-list') !== null;

              if (isInZapList && showHistorical) {
                const timestampAttr = zapElement.getAttribute('data-timestamp');
                if (timestampAttr) {
                  const timestamp = parseInt(timestampAttr);
                  fiatAmount = await satsToFiatWithHistorical(sats, timestamp);
                } else {
                  fiatAmount = satsToFiat(sats);
                }
              } else {
                // For zaps outside .zaps-list or when historical is disabled, show current price
                fiatAmount = satsToFiat(sats);
              }
            } else {
              fiatAmount = satsToFiat(sats);
            }
          }

          if (fiatAmount && element.parentElement) {
            if (fiatOnly) {
              // Original satoshi amount should already be stored above

              // Extract just the fiat amount without the currency span for the main display
              const fiatAmountOnly = fiatAmount
                .replace(/<span class="currency-code">.*?<\/span>/g, '')
                .trim();

              // Replace the satoshi amount with fiat amount and currency
              const newContent = `${fiatAmountOnly} <span class="currency-code">${selectedCurrencyRef.current}</span>`;
              element.innerHTML = newContent;

              // Hide any existing fiat-amount elements
              const existingFiatElement =
                element.parentElement.querySelector('.fiat-amount');
              if (existingFiatElement) {
                (existingFiatElement as HTMLElement).style.display = 'none';
              }

              // Hide the "sats" label element
              const satsLabelElement =
                element.parentElement.querySelector('.zapperAmountLabel');
              if (satsLabelElement) {
                (satsLabelElement as HTMLElement).style.display = 'none';
              }
            } else {
              // Add fiat amount below the satoshi amount
              let fiatElement =
                element.parentElement.querySelector('.fiat-amount');
              if (!fiatElement) {
                fiatElement = document.createElement('div');
                fiatElement.className = 'fiat-amount';
                element.parentElement.appendChild(fiatElement);
              }
              (fiatElement as HTMLElement).style.display = 'block';
              fiatElement.innerHTML = fiatAmount;

              // Show the "sats" label element
              const satsLabelElement =
                element.parentElement.querySelector('.zapperAmountLabel');
              if (satsLabelElement) {
                (satsLabelElement as HTMLElement).style.display = 'inline';
              }
            }
          }
        }

        // Update progress for historical prices
        if (showHistorical) {
          processedCount++;
          setHistoricalPriceLoading(true, {
            current: processedCount,
            total: totalElements
          });
        }
      }
    } finally {
      // Clear loading state
      if (showHistorical) {
        setHistoricalPriceLoading(false);
      }

      // Hide price update indicator
      const priceUpdateIndicator = document.getElementById(
        'priceUpdateIndicator'
      );
      if (priceUpdateIndicator) {
        priceUpdateIndicator.style.display = 'none';
      }
    }
  }, [
    satsToFiat,
    satsToFiatWithHistorical,
    addMissingTimestamps,
    setHistoricalPriceLoading,
    bitcoinPriceService
  ]);

  // Debounced version of updateFiatAmounts to prevent rate limiting
  const debouncedUpdateFiatAmounts = useCallback(() => {
    if (fiatUpdateTimeoutRef.current) {
      clearTimeout(fiatUpdateTimeoutRef.current);
    }

    fiatUpdateTimeoutRef.current = setTimeout(async () => {
      if (!isUpdatingFiatAmounts.current) {
        isUpdatingFiatAmounts.current = true;
        try {
          await updateFiatAmounts();
        } finally {
          isUpdatingFiatAmounts.current = false;
        }
      }
    }, debounceMs);
  }, [updateFiatAmounts, debounceMs]);

  // Hide all fiat amounts
  const hideFiatAmounts = useCallback(() => {
    const fiatElements = document.querySelectorAll('.fiat-amount');
    fiatElements.forEach(element => element.remove());

    // Restore total sats display in header
    const totalSatsElement = document.querySelector(
      '.zaps-header-left .total-sats'
    );
    if (totalSatsElement) {
      (totalSatsElement as HTMLElement).style.display = 'inline';
    }

    // If fiat only was enabled, restore original satoshi amounts
    const satElements = document.querySelectorAll(
      '.total-amount, .zapperAmountSats, .zap-amount-sats'
    );
    satElements.forEach(element => {
      // Check if this element has a data attribute storing the original satoshi amount
      const originalSats = (element as HTMLElement).dataset.originalSats;
      if (originalSats) {
        element.textContent = originalSats;
        (element as HTMLElement).removeAttribute('data-original-sats');
      }

      // Also restore the "sats" label visibility
      const satsLabelElement =
        element.parentElement?.querySelector('.zapperAmountLabel');
      if (satsLabelElement) {
        (satsLabelElement as HTMLElement).style.display = 'inline';
      }
    });
  }, []);

  // Restore satoshi amounts
  const restoreSatoshiAmounts = useCallback(() => {
    // Restore total sats display in header
    const totalSatsElement = document.querySelector(
      '.zaps-header-left .total-sats'
    );
    if (totalSatsElement) {
      (totalSatsElement as HTMLElement).style.display = 'block';
    }

    // Restore original satoshi amounts when fiat only is turned off
    const satElements = document.querySelectorAll(
      '.total-amount, .zapperAmountSats, .zap-amount-sats'
    );
    satElements.forEach(element => {
      const originalSats = (element as HTMLElement).dataset.originalSats;
      if (originalSats) {
        element.textContent = originalSats;
        (element as HTMLElement).removeAttribute('data-original-sats');
      }

      // Also restore the "sats" label visibility
      const satsLabelElement =
        element.parentElement?.querySelector('.zapperAmountLabel');
      if (satsLabelElement) {
        (satsLabelElement as HTMLElement).style.display = 'inline';
      }
    });
  }, []);

  return {
    selectedCurrency,
    setSelectedCurrency,
    satsToFiat,
    satsToFiatWithHistorical,
    updateFiatAmounts,
    debouncedUpdateFiatAmounts,
    hideFiatAmounts,
    restoreSatoshiAmounts,
    addMissingTimestamps,
    setHistoricalPriceLoading,
    bitcoinPriceService
  };
}
