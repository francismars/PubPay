// QR code generation and management hook
import { useCallback, useRef } from 'react';
import { nip19 } from 'nostr-tools';

const QRious = require('qrious') as any;

/**
 * Hook for managing QR code generation and display
 */
export function useQRCode() {
  // Progress tracking state for QR swiper
  const progressStartTimeRef = useRef<number | null>(null);
  const progressPauseTimeRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pausedProgressRef = useRef<number>(0);

  // Ref to store initializeQRSwiper function (defined later)
  const initializeQRSwiperRef = useRef<(() => void) | null>(null);

  /**
   * Generate QR code in an element
   */
  const generateQRCode = useCallback((elementId: string, value: string, size: number) => {
    const element = document.getElementById(elementId);
    if (!element || !QRious) {
      if (!element) console.error('❌ QR code element not found:', elementId);
      if (!QRious) console.error('❌ QRious library not available');
      return;
    }

    try {
      const originalDisplay = element.style.display;
      element.style.display = 'block';

      const isImg = element.tagName === 'IMG';
      let targetElement: HTMLElement;

      if (isImg) {
        (element as HTMLImageElement).src = '';
        targetElement = element;
      } else {
        // For div or other elements, create canvas inside
        element.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.className = 'qr-code';
        element.appendChild(canvas);
        targetElement = canvas;
      }

      new QRious({
        element: targetElement,
        size: size * 0.9,
        value
      });

      if (originalDisplay) {
        element.style.display = originalDisplay;
      }
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
    }
  }, []);

  /**
   * Update QR code links
   */
  const updateQRLinks = useCallback((
    njumpUrl: string,
    nostrNaddr: string,
    naddrId: string
  ) => {
    const qrcodeLinkNostr = document.getElementById(
      'qrcodeLinkNostr'
    ) as HTMLAnchorElement;
    const qrcodeNeventLink = document.getElementById(
      'qrcodeNeventLink'
    ) as HTMLAnchorElement;
    const qrcodeNoteLink = document.getElementById(
      'qrcodeNoteLink'
    ) as HTMLAnchorElement;

    if (qrcodeLinkNostr) qrcodeLinkNostr.href = njumpUrl;
    if (qrcodeNeventLink) qrcodeNeventLink.href = nostrNaddr;
    if (qrcodeNoteLink) qrcodeNoteLink.href = naddrId;
  }, []);

  /**
   * Update QR code previews
   */
  const updateQRPreviews = useCallback((
    njumpUrl: string,
    nostrNaddr: string,
    naddrId: string
  ) => {
    const qrDataPreview1 = document.getElementById('qrDataPreview1');
    const qrDataPreview2 = document.getElementById('qrDataPreview2');
    const qrDataPreview3 = document.getElementById('qrDataPreview3');

    // Set preview text in uppercase (max 60 chars to prevent overflow)
    const truncate = (text: string, maxLength: number = 60) => {
      return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
    };

    if (qrDataPreview1) qrDataPreview1.textContent = truncate(njumpUrl.toUpperCase());
    if (qrDataPreview2) qrDataPreview2.textContent = truncate(nostrNaddr.toUpperCase());
    if (qrDataPreview3) qrDataPreview3.textContent = truncate(naddrId.toUpperCase());
  }, []);

  /**
   * Generate QR codes for a live event
   */
  const generateLiveEventQRCodes = useCallback((liveEvent: any) => {
    const identifier = liveEvent.tags.find((tag: any) => tag[0] === 'd')?.[1];
    const pubkey = liveEvent.pubkey;
    const kind = 30311;

    if (!identifier || !pubkey) return;

    try {
      // Generate naddr
      const naddrId = nip19.naddrEncode({
        identifier,
        pubkey,
        kind,
        relays: []
      });

      const njumpUrl = `https://njump.me/${naddrId}`;
      const nostrNaddr = `nostr:${naddrId}`;

      // Calculate QR size
      const qrSize = Math.min(
        window.innerWidth * 0.6,
        window.innerHeight * 0.7
      );

      // Generate QR codes
      generateQRCode('qrCode', njumpUrl, qrSize);
      generateQRCode('qrCodeNevent', nostrNaddr, qrSize);
      generateQRCode('qrCodeNote', naddrId, qrSize);

      // Update links
      updateQRLinks(njumpUrl, nostrNaddr, naddrId);

      // Update previews
      updateQRPreviews(njumpUrl, nostrNaddr, naddrId);

      // Initialize QR swiper after QR codes are generated
      setTimeout(() => {
        if (initializeQRSwiperRef.current) {
          initializeQRSwiperRef.current();
        }
      }, 200);
    } catch (error) {
      console.error('Error generating live event QR codes:', error);
    }
  }, [generateQRCode, updateQRLinks, updateQRPreviews]);

  /**
   * Initialize QR code placeholders or generate QR codes from eventId
   */
  const initializeQRCodePlaceholders = useCallback(async (eventId?: string) => {
    let njumpUrl = '';
    let nostrNevent = '';
    let nostrNote = '';

    // If eventId is provided, parse it and generate QR codes from it
    if (eventId && eventId.trim() !== '' && eventId.trim() !== 'live') {
      try {
        const { parseEventId, getContentType, stripNostrPrefix } = await import('../utils/eventIdParser');
        const cleanId = stripNostrPrefix(eventId);
        const decoded = parseEventId(cleanId);
        const contentType = getContentType(cleanId);

        if (contentType === 'live' && decoded.type === 'naddr') {
          // For live events (naddr1), use the naddr directly
          const naddrId = cleanId;
          njumpUrl = `https://njump.me/${naddrId}`;
          nostrNevent = `nostr:${naddrId}`;
          nostrNote = `nostr:${naddrId}`;
        } else if (decoded.type === 'nevent') {
          // For nevent1, use it directly and also generate note1
          const neventId = cleanId;
          const noteId = decoded.data.id;
          const note1Id = nip19.noteEncode(noteId);
          njumpUrl = `https://njump.me/${neventId}`;
          nostrNevent = `nostr:${neventId}`;
          nostrNote = `nostr:${note1Id}`;
        } else if (decoded.type === 'note') {
          // For note1, use it directly and also generate nevent1
          const note1Id = cleanId;
          const noteId = decoded.data as string; // note type has data as string (the hex event ID)
          const neventId = nip19.neventEncode({ id: noteId, relays: [] });
          njumpUrl = `https://njump.me/${note1Id}`;
          nostrNevent = `nostr:${neventId}`;
          nostrNote = `nostr:${note1Id}`;
        } else {
          // Fallback to placeholder
          throw new Error('Unsupported event type');
        }
      } catch (error) {
        console.warn('Failed to parse eventId, using placeholders:', error);
        // Fall through to placeholder generation
      }
    }

    // If no eventId or parsing failed, use safe placeholder values
    if (!njumpUrl) {
      // Use a valid 64-character hex string for placeholder (all zeros)
      const placeholderNoteId = '0'.repeat(64);
      const note1Id = nip19.noteEncode(placeholderNoteId);
      const neventId = nip19.neventEncode({ id: placeholderNoteId, relays: [] });
      njumpUrl = `https://njump.me/${note1Id}`;
      nostrNevent = `nostr:${neventId}`;
      nostrNote = `nostr:${note1Id}`;
    }

    const qrSize = Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7);

    // Generate QR codes for all formats
    const qrcodeContainers = [
      {
        element: document.getElementById('qrCode'),
        value: njumpUrl,
        link: document.getElementById('qrcodeLinkNostr'),
        preview: document.getElementById('qrDataPreview1')
      },
      {
        element: document.getElementById('qrCodeNevent'),
        value: nostrNevent,
        link: document.getElementById('qrcodeNeventLink'),
        preview: document.getElementById('qrDataPreview2')
      },
      {
        element: document.getElementById('qrCodeNote'),
        value: nostrNote,
        link: document.getElementById('qrcodeNoteLink'),
        preview: document.getElementById('qrDataPreview3')
      }
    ];

    // Truncate function for preview text
    const truncate = (text: string, maxLength: number = 60) => {
      return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
    };

    qrcodeContainers.forEach(({ element, value, link, preview }) => {
      if (element && QRious) {
        generateQRCode(element.id, value, qrSize);

        if (link) {
          (link as HTMLAnchorElement).href = value;
        }

        if (preview) {
          preview.textContent = truncate(value.toUpperCase());
        }
      }
    });

    // Ensure at least one QR toggle is enabled
    const qrShowNeventToggle = document.getElementById('qrShowNeventToggle') as HTMLInputElement;
    if (qrShowNeventToggle && !qrShowNeventToggle.checked) {
      // Check if any QR toggle is enabled
      const qrShowWebLinkToggle = document.getElementById('qrShowWebLinkToggle') as HTMLInputElement;
      const qrShowNoteToggle = document.getElementById('qrShowNoteToggle') as HTMLInputElement;
      const hasAnyEnabled = (qrShowWebLinkToggle?.checked) || (qrShowNoteToggle?.checked);

      // If none are enabled, enable nevent by default
      if (!hasAnyEnabled) {
        qrShowNeventToggle.checked = true;
      }
    }

    // Initialize QR swiper after QR codes are generated
    setTimeout(() => {
      if (initializeQRSwiperRef.current) {
        initializeQRSwiperRef.current();
      }
    }, 200);
  }, [generateQRCode]);

  /**
   * Start progress tracking for QR swiper
   */
  const startProgressTracking = useCallback(() => {
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    const qrSwiper = (window as any).qrSwiper;
    if (!qrSwiper?.el) {
      console.warn('⚠️ QR Swiper not available for progress tracking');
      return;
    }

    // Skip progress tracking if only 1 slide (no autoplay)
    const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
    if (swiperWrapper) {
      const visibleSlides = Array.from(swiperWrapper.children).filter(slide =>
        slide.classList.contains('swiper-slide')
      );
      if (visibleSlides.length <= 1) {
        return; // No need to track progress for single slide
      }
    }

    const activeBullet = qrSwiper.el.querySelector(
      '.swiper-pagination-bullet-active'
    );
    if (!activeBullet) {
      return;
    }

    // Only start if the bullet has the progress-animating class
    if (!activeBullet.classList.contains('progress-animating')) {
      return;
    }

    // Reset progress to 0
    activeBullet.style.setProperty('--progress', '0%');

    progressStartTimeRef.current = Date.now();
    pausedProgressRef.current = 0; // Reset paused progress for new slide
    const autoplayDelay = qrSwiper.params?.autoplay?.delay || 10000;

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - (progressStartTimeRef.current || 0);
      const progress = Math.min((elapsed / autoplayDelay) * 100, 100);

      // Set CSS custom property for progress
      activeBullet.style.setProperty('--progress', `${progress}%`);

      if (progress >= 100) {
        clearInterval(progressIntervalRef.current!);
        progressIntervalRef.current = null;
      }
    }, 16); // ~60fps for smooth animation
  }, []);

  /**
   * Resume progress tracking
   */
  const resumeProgressTracking = useCallback(() => {
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    const qrSwiper = (window as any).qrSwiper;
    if (!qrSwiper?.el) {
      return;
    }

    const activeBullet = qrSwiper.el.querySelector(
      '.swiper-pagination-bullet-active'
    );
    if (!activeBullet) {
      return;
    }

    // Only start if the bullet has the progress-animating class
    if (!activeBullet.classList.contains('progress-animating')) {
      return;
    }

    const autoplayDelay = qrSwiper.params?.autoplay?.delay || 10000;

    // Calculate remaining time based on paused progress
    const remainingTime = ((100 - pausedProgressRef.current) / 100) * autoplayDelay;
    const resumeTime = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - resumeTime;
      const progress =
        pausedProgressRef.current + (elapsed / remainingTime) * (100 - pausedProgressRef.current);
      const finalProgress = Math.min(progress, 100);

      // Set CSS custom property for progress
      activeBullet.style.setProperty('--progress', `${finalProgress}%`);

      if (finalProgress >= 100) {
        clearInterval(progressIntervalRef.current!);
        progressIntervalRef.current = null;
      }
    }, 16); // ~60fps for smooth animation
  }, []);

  /**
   * Setup progress bar events
   */
  const setupProgressBarEvents = useCallback(() => {
    if (!(window as any).qrSwiper?.el) return;

    // Add custom mouse event handlers for progress bar pause/resume
    (window as any).qrSwiper.el.addEventListener('mouseenter', () => {
      // Pause swiper autoplay
      if ((window as any).qrSwiper && (window as any).qrSwiper.autoplay) {
        (window as any).qrSwiper.autoplay.pause();
      }

      // Pause progress animation on hover
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
        progressPauseTimeRef.current = Date.now();

        // Store current progress percentage
        const activeBullet = (window as any).qrSwiper?.el?.querySelector(
          '.swiper-pagination-bullet-active'
        );
        if (activeBullet) {
          const currentProgress =
            activeBullet.style.getPropertyValue('--progress') || '0%';
          pausedProgressRef.current = parseFloat(currentProgress.replace('%', ''));
        }
      }
    });

    (window as any).qrSwiper.el.addEventListener('mouseleave', () => {
      // Resume progress animation on mouse leave
      if (progressPauseTimeRef.current && progressStartTimeRef.current && pausedProgressRef.current < 100) {
        resumeProgressTracking();

        // Calculate remaining time and manually trigger slide change when progress completes
        const autoplayDelay =
          (window as any).qrSwiper?.params?.autoplay?.delay || 10000;
        const remainingTime = ((100 - pausedProgressRef.current) / 100) * autoplayDelay;

        // Set a timeout to trigger slide change when progress completes
        setTimeout(() => {
          if ((window as any).qrSwiper && (window as any).qrSwiper.slideNext) {
            (window as any).qrSwiper.slideNext();
          }
        }, remainingTime);
      } else {
        // If we can't resume progress, just resume normal autoplay
        if ((window as any).qrSwiper && (window as any).qrSwiper.autoplay) {
          (window as any).qrSwiper.autoplay.resume();
        }
      }
    });
  }, [resumeProgressTracking]);

  /**
   * Initialize QR swiper
   */
  const initializeQRSwiper = useCallback(() => {
    console.log('🔄 Initializing QR Swiper...');

    // Remove any existing error messages
    const existingError = document.querySelector('.qr-swiper-error');
    if (existingError) {
      existingError.remove();
    }

    // Destroy existing swiper
    if ((window as any).qrSwiper) {
      (window as any).qrSwiper.destroy(true, true);
      (window as any).qrSwiper = null;
    }

    const swiperWrapper = document.querySelector('.qr-swiper .swiper-wrapper');
    if (!swiperWrapper) {
      console.warn('⚠️ QR Swiper wrapper not found in DOM');
      return;
    }

    // Check if Swiper library is loaded
    if (typeof (window as any).Swiper === 'undefined') {
      console.error('❌ Swiper library not loaded');
      const qrSection = document.querySelector('.qr-section');
      if (qrSection) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'qr-swiper-error';
        errorMsg.style.cssText = 'color: var(--text-color); padding: 20px; text-align: center;';
        errorMsg.textContent = 'Slideshow library failed to load. Please refresh the page.';
        qrSection.appendChild(errorMsg);
      }
      return;
    }

    // Count visible slides
    const visibleSlides = Array.from(swiperWrapper.children).filter(slide =>
      slide.classList.contains('swiper-slide')
    );

    if (visibleSlides.length === 0) {
      console.log('👁️ No visible QR slides, hiding container');
      const qrSwiperContainer = document.querySelector(
        '.qr-swiper'
      ) as HTMLElement;
      if (qrSwiperContainer) {
        qrSwiperContainer.style.display = 'none';
      }
      return;
    }

    // Initialize Swiper with proper configuration
    try {
      (window as any).qrSwiper = new (window as any).Swiper('.qr-swiper', {
        loop: visibleSlides.length > 2, // Only enable loop for 3+ slides to avoid duplication issues with 2 slides
        autoplay:
          visibleSlides.length > 1
            ? {
                delay: 10000,
                disableOnInteraction: false
              }
            : false,
        allowTouchMove: visibleSlides.length > 1,
        pagination: {
          el: '.swiper-pagination',
          clickable: true
        },
        slidesPerView: 1, // Ensure only 1 slide is visible at a time
        centeredSlides: true, // Center the active slide
        spaceBetween: 0, // No space between slides
        on: {
          init() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Reset all progress bars
            swiperEl
              .querySelectorAll('.swiper-pagination-bullet')
              .forEach((bullet: HTMLElement) => {
                bullet.classList.remove('progress-animating');
                bullet.style.setProperty('--progress', '0%');
              });

            // Reset paused progress for initial slide
            pausedProgressRef.current = 0;
            progressPauseTimeRef.current = null;

            // Start animation for active slide immediately
            const activeBullet = swiperEl.querySelector(
              '.swiper-pagination-bullet-active'
            );
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          slideChange() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Reset all progress bars
            swiperEl
              .querySelectorAll('.swiper-pagination-bullet')
              .forEach((bullet: HTMLElement) => {
                bullet.style.setProperty('--progress', '0%');
                bullet.classList.remove('progress-animating');
              });

            // Reset paused progress for new slide
            pausedProgressRef.current = 0;
            progressPauseTimeRef.current = null;

            // Start progress tracking for new slide immediately
            const activeBullet = swiperEl.querySelector(
              '.swiper-pagination-bullet-active'
            );
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          autoplayStart() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Remove paused class and resume progress animation
            swiperEl.classList.remove('swiper-paused');
            const activeBullet = swiperEl.querySelector(
              '.swiper-pagination-bullet-active'
            );
            if (activeBullet) {
              activeBullet.classList.add('progress-animating');
              startProgressTracking();
            }
          },
          autoplayStop() {
            const swiperEl = (this as any).el || (window as any).qrSwiper?.el;
            if (!swiperEl) return;

            // Add paused class to pause progress animation
            swiperEl.classList.add('swiper-paused');
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
          }
        }
      });

      // Setup progress bar events after swiper is initialized
      setupProgressBarEvents();

      console.log('✅ QR Swiper initialized successfully with', visibleSlides.length, 'slides');
    } catch (error) {
      console.error('❌ Failed to initialize QR Swiper:', error);
      // Show error to user if swiper fails
      const qrSection = document.querySelector('.qr-section');
      if (qrSection) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'qr-swiper-error';
        errorMsg.style.cssText = 'color: var(--text-color); padding: 20px; text-align: center;';
        errorMsg.textContent = 'QR slideshow failed to load. Please refresh the page.';
        qrSection.appendChild(errorMsg);
      }
    }
  }, [startProgressTracking, setupProgressBarEvents]);

  // Store the function in ref so it can be called by functions defined earlier
  initializeQRSwiperRef.current = initializeQRSwiper;

  return {
    generateQRCode,
    updateQRLinks,
    updateQRPreviews,
    generateLiveEventQRCodes,
    initializeQRCodePlaceholders,
    initializeQRSwiper
  };
}
