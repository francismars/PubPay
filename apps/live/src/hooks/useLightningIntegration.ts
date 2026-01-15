// Lightning integration hook
// Wraps UseLightning class and provides React hook interface

import { useCallback, useRef, useState } from 'react';
import { UseLightning } from './useLightning';
import { useQRCode } from './useQRCode';
import { escapeHtml } from '../utils/sanitization';

export interface UseLightningIntegrationOptions {
  eventId?: string;
  onUpdateBlendMode?: () => void; // Callback for style updates after QR creation
}

/**
 * Hook for managing Lightning payment integration
 */
export function useLightningIntegration(
  options: UseLightningIntegrationOptions = {}
) {
  const { eventId, onUpdateBlendMode } = options;

  const lightningService = useRef<UseLightning | null>(null);
  const [lightningEnabled, setLightningEnabled] = useState(false);
  const [lightningLNURL, setLightningLNURL] = useState<string>('');

  // Get QR code functions from hook
  const { generateQRCode, initializeQRSwiper } = useQRCode();

  /**
   * Initialize Lightning service
   */
  const initializeLightning = useCallback(() => {
    if (!eventId) return;

    lightningService.current = new UseLightning({
      eventId,
      autoEnable: false
    });
  }, [eventId]);

  /**
   * Update payment status display
   */
  const updatePaymentStatus = useCallback(
    (
      message: string,
      type: 'info' | 'success' | 'error' | 'waiting' | 'disabled' = 'info'
    ) => {
      const statusDiv = document.getElementById('paymentStatus');
      if (statusDiv) {
        const iconMap = {
          info: '📱',
          success: '✅',
          error: '❌',
          waiting: '⚡',
          disabled: '🔒'
        };

        const sanitizedMessage = escapeHtml(message);
        statusDiv.innerHTML = `<div class="status-${type}">${iconMap[type]} ${sanitizedMessage}</div>`;
      }
    },
    []
  );

  /**
   * Create Lightning QR slide
   */
  const createLightningQRSlide = useCallback(
    (lnurl: string) => {
      const lightningSlide = document.getElementById('lightningQRSlide');
      if (!lightningSlide) {
        console.error('❌ Lightning QR slide not found in HTML');
        return;
      }

      // Ensure slide structure exists
      let qrElement = lightningSlide.querySelector('#lightningQRCode');
      if (!qrElement) {
        lightningSlide.innerHTML = `
        <a href="" target="_blank" id="lightningQRLink">
          <div id="lightningQRCode" class="qr-code"></div>
        </a>
        <div class="qr-slide-title">
          <span class="qr-data-preview" id="qrDataPreview4"></span>
        </div>
        <div class="qr-slide-label">Scan with Lightning Wallet</div>
      `;
        qrElement = lightningSlide.querySelector('#lightningQRCode');
      }

      if (!qrElement) {
        console.error('❌ Unable to create QR code element');
        return;
      }

      try {
        const qrSize = Math.min(
          window.innerWidth * 0.6,
          window.innerHeight * 0.7
        );

        // Generate QR code after DOM is ready
        requestAnimationFrame(() => {
          generateQRCode('lightningQRCode', lnurl, qrSize);
        });

        // Set Lightning QR link
        const lightningQRLink = document.getElementById(
          'lightningQRLink'
        ) as HTMLAnchorElement;
        if (lightningQRLink) {
          lightningQRLink.href = `lightning:${lnurl}`;
        }

        // Set QR data preview text (uppercase, max 60 chars)
        const qrDataPreview4 = document.getElementById('qrDataPreview4');
        if (qrDataPreview4) {
          const previewText =
            lnurl.length > 60 ? `${lnurl.substring(0, 60)}...` : lnurl;
          qrDataPreview4.textContent = previewText.toUpperCase();
        }

        // Ensure slide is visible and in swiper
        const swiperWrapper = document.querySelector(
          '.qr-swiper .swiper-wrapper'
        ) as HTMLElement;
        if (swiperWrapper && !swiperWrapper.contains(lightningSlide)) {
          swiperWrapper.appendChild(lightningSlide);
        }
        lightningSlide.style.display = 'block';

        const qrSwiper = document.querySelector('.qr-swiper') as HTMLElement;
        if (qrSwiper) {
          qrSwiper.style.display = 'block';
        }

        // Reinitialize swiper and navigate to lightning slide
        setTimeout(() => {
          if (typeof initializeQRSwiper === 'function') {
            initializeQRSwiper();
            const swiperWrapper = document.querySelector(
              '.qr-swiper .swiper-wrapper'
            ) as HTMLElement;
            if (swiperWrapper && (window as any).qrSwiper) {
              const slides = Array.from(swiperWrapper.children);
              const lightningSlideIndex = slides.findIndex(
                slide => slide.id === 'lightningQRSlide'
              );
              if (lightningSlideIndex >= 0) {
                (window as any).qrSwiper.slideTo(lightningSlideIndex, 0);
              }
            }
          }
        }, 100);

        // Call blend mode update if provided
        if (onUpdateBlendMode) {
          onUpdateBlendMode();
        }
      } catch (error) {
        console.error('❌ Error creating Lightning QR code:', error);
      }
    },
    [onUpdateBlendMode]
  );

  /**
   * Enable Lightning payments
   */
  const enableLightning = useCallback(
    async (targetEventId?: string): Promise<boolean> => {
      const eventIdToUse = targetEventId || eventId;
      if (!eventIdToUse || !lightningService.current) {
        updatePaymentStatus('No event ID provided', 'error');
        return false;
      }

      try {
        updatePaymentStatus('Enabling Lightning payments...', 'waiting');

        const success =
          await lightningService.current.enableLightning(eventIdToUse);

        if (success) {
          const lnurl = lightningService.current.currentLnurl || '';
          setLightningLNURL(lnurl);
          setLightningEnabled(true);

          if (lnurl) {
            createLightningQRSlide(lnurl);
            updatePaymentStatus(
              'Lightning enabled - scan QR to pay',
              'success'
            );
          } else {
            updatePaymentStatus(
              'Lightning enabled but no QR code available',
              'error'
            );
          }
          return true;
        } else {
          const errorMsg =
            lightningService.current.lastError || 'Unknown error';
          updatePaymentStatus(
            `Failed to enable Lightning: ${errorMsg}`,
            'error'
          );
          return false;
        }
      } catch (error) {
        updatePaymentStatus('Failed to enable Lightning payments', 'error');
        console.error('❌ Error enabling Lightning:', error);
        return false;
      }
    },
    [eventId, createLightningQRSlide, updatePaymentStatus]
  );

  /**
   * Disable Lightning payments
   */
  const disableLightning = useCallback(
    async (targetEventId?: string): Promise<boolean> => {
      const eventIdToUse = targetEventId || eventId;
      if (!eventIdToUse || !lightningService.current) {
        updatePaymentStatus('No event ID provided', 'error');
        return false;
      }

      try {
        const success =
          await lightningService.current.disableLightning(eventIdToUse);

        if (success) {
          setLightningEnabled(false);
          setLightningLNURL('');
          updatePaymentStatus('Lightning disabled', 'disabled');
          return true;
        } else {
          const errorMsg =
            lightningService.current.lastError || 'Unknown error';
          updatePaymentStatus(
            `Failed to disable Lightning: ${errorMsg}`,
            'error'
          );
          return false;
        }
      } catch (error) {
        updatePaymentStatus('Failed to disable Lightning payments', 'error');
        console.error('❌ Error disabling Lightning:', error);
        return false;
      }
    },
    [eventId, updatePaymentStatus]
  );

  /**
   * Handle Lightning toggle change
   */
  const handleLightningToggle = useCallback(
    async (checked: boolean, targetEventId?: string) => {
      const eventIdToUse = targetEventId || eventId;
      if (!eventIdToUse || !lightningService.current) {
        return;
      }

      try {
        if (!checked) {
          // Disable Lightning payments
          await disableLightning(eventIdToUse);
        } else {
          // Enable Lightning payments
          await enableLightning(eventIdToUse);
        }
      } catch (error) {
        console.error('❌ Error toggling Lightning:', error);
      }
    },
    [eventId, enableLightning, disableLightning]
  );

  return {
    lightningEnabled,
    lightningLNURL,
    lightningService: lightningService.current,
    initializeLightning,
    enableLightning,
    disableLightning,
    handleLightningToggle,
    updatePaymentStatus,
    createLightningQRSlide
  };
}
