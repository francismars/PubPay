// Style management hook
// Handles style saving, loading, URL parameters, and presets

import { useCallback, useRef } from 'react';
import { DEFAULT_STYLES } from '../constants/styles';
import { appLocalStorage } from '../utils/storage';

export interface UseStyleManagementOptions {
  lightningEnabled?: boolean;
  onOrganizeZaps?: () => void;
  onCleanupHierarchicalOrganization?: () => void;
  onUpdateQRSlideVisibility?: (_skipUrlUpdate?: boolean) => void;
  onInitializeQRCodePlaceholders?: (_eventId?: string) => Promise<void>;
}

/**
 * Hook for managing styles (save, load, URL parameters, presets)
 */
export function useStyleManagement(options: UseStyleManagementOptions = {}) {
  const { lightningEnabled = false, onOrganizeZaps, onCleanupHierarchicalOrganization, onUpdateQRSlideVisibility, onInitializeQRCodePlaceholders } = options;

  // Removed unused applyStylesTimeoutRef

  /**
   * Convert color to hex format
   */
  const toHexColor = useCallback((color: string): string => {
    // If color is empty or invalid, return default white
    if (!color || color.trim() === '') {
      return '#ffffff';
    }

    // If it's already a hex color, return it
    if (color.startsWith('#')) {
      return color;
    }

    // If it's an rgb/rgba color, convert to hex
    if (color.startsWith('rgb')) {
      const values = color.match(/\d+/g);
      if (values && values.length >= 3) {
        const r = parseInt(values[0] || '0');
        const g = parseInt(values[1] || '0');
        const b = parseInt(values[2] || '0');
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }

    // If we can't convert, return the default white color instead of black
    return '#ffffff';
  }, []);

  /**
   * Convert hex color to rgba
   */
  const hexToRgba = useCallback((hex: string, opacity: number): string => {
    // Remove the # if present
    hex = hex.replace('#', '');

    // Parse the hex color
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }, []);

  /**
   * Update background image
   */
  const updateBackgroundImage = useCallback((url: string) => {
    const liveZapOverlay = document.querySelector('.liveZapOverlay') as HTMLElement;
    if (liveZapOverlay) {
      if (url) {
        liveZapOverlay.style.backgroundImage = `url(${url})`;
        liveZapOverlay.style.backgroundSize = 'cover';
        liveZapOverlay.style.backgroundPosition = 'center';
        liveZapOverlay.style.backgroundRepeat = 'no-repeat';
      } else {
        liveZapOverlay.style.backgroundImage = '';
      }
    }
  }, []);

  /**
   * Update blend mode for QR codes
   */
  const updateBlendMode = useCallback(() => {
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;

    if (qrScreenBlendToggle?.checked) {
      qrMultiplyBlendToggle.checked = false;
      document.body.classList.add('qr-blend-active');
      document.body.classList.remove('qr-multiply-active');
    } else if (qrMultiplyBlendToggle?.checked) {
      qrScreenBlendToggle.checked = false;
      document.body.classList.add('qr-blend-active');
      document.body.classList.add('qr-multiply-active');
    } else {
      document.body.classList.remove('qr-blend-active');
      document.body.classList.remove('qr-multiply-active');
    }

    // Check if .qr-swiper exists
    const qrSwiper = document.querySelector('.qr-swiper');
    if (qrSwiper) {
      const qrCodes = qrSwiper.querySelectorAll('img, canvas');
      qrCodes.forEach((_qrCode) => {
        // Blend mode is now handled by CSS classes on the body element
      });
    }

    updateStyleURL();
  }, []);

  /**
   * Apply all styles to DOM
   */
  const applyAllStyles = useCallback(() => {
    const textColorElement = document.getElementById('textColorValue') as HTMLInputElement;
    const bgColorElement = document.getElementById('bgColorValue') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;

    if (!textColorElement || !bgColorElement || !opacitySlider || !textOpacitySlider) {
      return;
    }

    const textColor = textColorElement.value;
    const bgColor = bgColorElement.value;
    const opacity = parseFloat(opacitySlider.value);
    const textOpacity = parseFloat(textOpacitySlider.value);

    const mainLayout = document.querySelector('.main-layout') as HTMLElement;

    if (mainLayout) {
      // Apply text color with opacity
      const rgbaTextColor = hexToRgba(textColor, textOpacity);
      mainLayout.style.setProperty('--text-color', rgbaTextColor);

      // Apply color to specific elements that need hardcoded color overrides
      const hardcodedElements = mainLayout.querySelectorAll(`
        .zaps-header-left h2,
        .total-label,
        .total-sats,
        .total-amount,
        .zapperName,
        .zapperMessage,
        .zapperAmount,
        .zapperAmountSats,
        .zapperAmountLabel,
        .authorName,
        .noteContent,
        .qr-slide-title,
        .qr-slide-label,
        .zap-author-name,
        .zap-message,
        .zap-amount,
        .zap-amount-sats,
        .zap-amount-label,
        .zapperProfile .zapperName,
        .zapperProfile .zapperMessage,
        .zapperProfile .zapperAmount,
        .zapperProfile .zapperAmountSats,
        .zapperProfile .zapperAmountLabel
      `);

      hardcodedElements.forEach(element => {
        (element as HTMLElement).style.color = rgbaTextColor;
      });

      // Apply to additional text elements that might be missed
      const additionalTextElements = mainLayout.querySelectorAll(`
        .zap .zapperName,
        .zap .zapperMessage,
        .zap .zapperAmount,
        .zap .zapperAmountSats,
        .zap .zapperAmountLabel,
        .zapperProfile .zapperName,
        .zapperProfile .zapperMessage,
        .zapperProfile .zapperAmount,
        .zapperProfile .zapperAmountSats,
        .zapperProfile .zapperAmountLabel
      `);

      additionalTextElements.forEach(element => {
        (element as HTMLElement).style.color = rgbaTextColor;
      });

      // Apply background color with opacity
      const rgbaColor = hexToRgba(bgColor, opacity);
      mainLayout.style.backgroundColor = rgbaColor;

      // Update preset preview container background to match selected background color
      const presetPreviewContainers = document.querySelectorAll('.preset-preview-container');
      presetPreviewContainers.forEach(container => {
        (container as HTMLElement).style.backgroundColor = rgbaColor;
      });

      // Apply background image
      const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
      if (bgImageUrl && bgImageUrl.value) {
        updateBackgroundImage(bgImageUrl.value);
      } else {
        updateBackgroundImage('');
      }

      // Apply partner logo
      const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
      const partnerLogoImg = document.getElementById('partnerLogo') as HTMLImageElement;
      const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
      const partnerLogoPreview = document.getElementById('partnerLogoPreview') as HTMLImageElement;

      if (partnerLogoSelect && partnerLogoImg) {
        let currentPartnerLogo = '';
        if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
          currentPartnerLogo = partnerLogoUrl.value;
        } else {
          currentPartnerLogo = partnerLogoSelect.value;
        }

        if (currentPartnerLogo) {
          partnerLogoImg.src = currentPartnerLogo;
          partnerLogoImg.style.display = 'inline-block';

          if (partnerLogoPreview) {
            partnerLogoPreview.src = currentPartnerLogo;
            partnerLogoPreview.alt = 'Partner logo preview';
          }
        } else {
          partnerLogoImg.style.display = 'none';
          partnerLogoImg.src = '';

          if (partnerLogoPreview) {
            partnerLogoPreview.src = '';
            partnerLogoPreview.alt = 'No partner logo';
          }
        }
      }
    }

    // Apply zap grid layout
    const zapsList = document.getElementById('zaps');
    if (zapsList) {
      const isGridLayout = (document.getElementById('zapGridToggle') as HTMLInputElement)?.checked;
      zapsList.classList.toggle('grid-layout', isGridLayout);
      if (isGridLayout && onOrganizeZaps) {
        onOrganizeZaps();
      } else if (onCleanupHierarchicalOrganization) {
        onCleanupHierarchicalOrganization();
      }
    }

    // Apply QR blend modes
    updateBlendMode();
  }, [hexToRgba, updateBackgroundImage, updateBlendMode, onOrganizeZaps, onCleanupHierarchicalOrganization]);

  /**
   * Save current styles to localStorage
   */
  const saveCurrentStylesToLocalStorage = useCallback(() => {
    const textColorElement = document.getElementById('textColorValue') as HTMLInputElement;
    const bgColorElement = document.getElementById('bgColorValue') as HTMLInputElement;
    const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
    const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
    const bgImagePreset = document.getElementById('bgImagePreset') as HTMLSelectElement;
    const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;

    if (!textColorElement || !bgColorElement || !opacitySlider || !textOpacitySlider) {
      return;
    }

    let currentPartnerLogo = '';
    if (partnerLogoSelect) {
      if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
        currentPartnerLogo = partnerLogoUrl.value;
      } else {
        currentPartnerLogo = partnerLogoSelect.value;
      }
    }

    let currentBackgroundImage = '';
    if (bgImagePreset) {
      if (bgImagePreset.value === 'custom' && bgImageUrl) {
        currentBackgroundImage = bgImageUrl.value;
      } else {
        currentBackgroundImage = bgImagePreset.value;
      }
    }

    // Get all toggle states using consistent property names
    const toggleMapping = [
      { toggleId: 'layoutInvertToggle', propertyName: 'layoutInvert' },
      { toggleId: 'hideZapperContentToggle', propertyName: 'hideZapperContent' },
      { toggleId: 'showTopZappersToggle', propertyName: 'showTopZappers' },
      { toggleId: 'podiumToggle', propertyName: 'podium' },
      { toggleId: 'zapGridToggle', propertyName: 'zapGrid' },
      { toggleId: 'sectionLabelsToggle', propertyName: 'sectionLabels' },
      { toggleId: 'qrOnlyToggle', propertyName: 'qrOnly' },
      { toggleId: 'showFiatToggle', propertyName: 'showFiat' },
      { toggleId: 'showHistoricalPriceToggle', propertyName: 'showHistoricalPrice' },
      { toggleId: 'showHistoricalChangeToggle', propertyName: 'showHistoricalChange' },
      { toggleId: 'fiatOnlyToggle', propertyName: 'fiatOnly' },
      { toggleId: 'qrInvertToggle', propertyName: 'qrInvert' },
      { toggleId: 'qrScreenBlendToggle', propertyName: 'qrScreenBlend' },
      { toggleId: 'qrMultiplyBlendToggle', propertyName: 'qrMultiplyBlend' },
      { toggleId: 'qrShowWebLinkToggle', propertyName: 'qrShowWebLink' },
      { toggleId: 'qrShowNeventToggle', propertyName: 'qrShowNevent' },
      { toggleId: 'qrShowNoteToggle', propertyName: 'qrShowNote' },
      { toggleId: 'lightningToggle', propertyName: 'lightning' }
    ];

    const toggleStates: { [key: string]: boolean } = {};
    toggleMapping.forEach(({ toggleId, propertyName }) => {
      const toggle = document.getElementById(toggleId) as HTMLInputElement;
      if (toggle) {
        toggleStates[propertyName] = toggle.checked;
      }
    });

    // Get selected currency
    const currencySelector = document.getElementById('currencySelector') as HTMLSelectElement;
    const selectedCurrency = currencySelector ? currencySelector.value : 'USD';

    const styles = {
      textColor: textColorElement.value,
      bgColor: bgColorElement.value,
      textOpacity: parseFloat(textOpacitySlider.value),
      opacity: parseFloat(opacitySlider.value),
      partnerLogo: currentPartnerLogo,
      bgImage: currentBackgroundImage,
      selectedCurrency,
      ...toggleStates
    };

    appLocalStorage.setStyleOptions(styles);
  }, []);

  /**
   * Apply preset styles
   */
  const applyPreset = useCallback((preset: string) => {
    const presets: { [key: string]: any } = {
      lightMode: {
        textColor: '#000000',
        bgColor: '#ffffff',
        bgImage: '',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 1.0,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      darkMode: {
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        opacity: 1.0,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      pubpay: {
        textColor: '#ffffff',
        bgColor: '#ffffff',
        bgImage: '/live/images/gradient_color.gif',
        qrInvert: true,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: true,
        qrShowNevent: true,
        qrShowNote: true,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      cosmic: {
        textColor: '#ffffff',
        bgColor: '#0a0a1a',
        bgImage: '/live/images/bitcoin-space.gif',
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: true,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.4,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      vibrant: {
        textColor: '#ffd700',
        bgColor: '#2d1b69',
        bgImage: '/live/images/nostr-ostriches.gif',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.6,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      electric: {
        textColor: '#00ffff',
        bgColor: '#000033',
        bgImage: '/live/images/send-zaps.gif',
        qrInvert: false,
        qrScreenBlend: true,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      warm: {
        textColor: '#ff8c42',
        bgColor: '#2c1810',
        bgImage: '/live/images/bitcoin-sunset.gif',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.8,
        textOpacity: 1.0,
        partnerLogo: ''
      },
      adopting: {
        textColor: '#eedb5f',
        bgColor: '#05051f',
        bgImage: '/live/images/adopting.webp',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo: 'https://adoptingbitcoin.org/images/AB-logo.svg'
      },
      bitcoinConf: {
        textColor: '#ffffff',
        bgColor: '#000000',
        bgImage: '/live/images/sky.jpg',
        qrInvert: false,
        qrScreenBlend: false,
        qrMultiplyBlend: false,
        qrShowWebLink: false,
        qrShowNevent: true,
        qrShowNote: false,
        layoutInvert: false,
        hideZapperContent: false,
        showTopZappers: false,
        podium: false,
        zapGrid: false,
        sectionLabels: false,
        qrOnly: false,
        opacity: 0.7,
        textOpacity: 1.0,
        partnerLogo:
          'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg'
      }
    };

    const presetData = presets[preset];
    if (presetData) {
      const textColorPicker = document.getElementById('textColorPicker') as HTMLInputElement;
      const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
      const textColorValue = document.getElementById('textColorValue') as HTMLInputElement;
      const bgColorValue = document.getElementById('bgColorValue') as HTMLInputElement;
      const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');
      const opacityValue = document.getElementById('opacityValue');

      if (textColorPicker) textColorPicker.value = presetData.textColor;
      if (textColorValue) textColorValue.value = presetData.textColor;
      if (bgColorPicker) bgColorPicker.value = presetData.bgColor;
      if (bgColorValue) bgColorValue.value = presetData.bgColor;
      if (textOpacitySlider) textOpacitySlider.value = presetData.textOpacity.toString();
      if (textOpacityValue)
        textOpacityValue.textContent = `${Math.round(presetData.textOpacity * 100)}%`;
      if (opacitySlider) opacitySlider.value = presetData.opacity.toString();
      if (opacityValue)
        opacityValue.textContent = `${Math.round(presetData.opacity * 100)}%`;

      // Set background image
      const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
      const bgImagePreset = document.getElementById('bgImagePreset') as HTMLSelectElement;
      if (bgImageUrl) bgImageUrl.value = presetData.bgImage;
      if (bgImagePreset) {
        if (presetData.bgImage) {
          bgImagePreset.value = 'custom';
        } else {
          bgImagePreset.value = '';
        }
      }

      // Set partner logo
      const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
      const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;
      if (partnerLogoSelect) {
        if (presetData.partnerLogo) {
          // Check if it's a predefined option
          const matchingOption = Array.from(partnerLogoSelect.options).find(
            option => option.value === presetData.partnerLogo
          );
          if (matchingOption) {
            partnerLogoSelect.value = presetData.partnerLogo;
          } else {
            partnerLogoSelect.value = 'custom';
            if (partnerLogoUrl) partnerLogoUrl.value = presetData.partnerLogo;
          }
        } else {
          partnerLogoSelect.value = '';
        }
      }

      // Set all toggles
      const toggleMapping = [
        { toggleId: 'qrInvertToggle', value: presetData.qrInvert },
        { toggleId: 'qrScreenBlendToggle', value: presetData.qrScreenBlend },
        { toggleId: 'qrMultiplyBlendToggle', value: presetData.qrMultiplyBlend },
        { toggleId: 'qrShowWebLinkToggle', value: presetData.qrShowWebLink },
        { toggleId: 'qrShowNeventToggle', value: presetData.qrShowNevent },
        { toggleId: 'qrShowNoteToggle', value: presetData.qrShowNote },
        { toggleId: 'layoutInvertToggle', value: presetData.layoutInvert },
        { toggleId: 'hideZapperContentToggle', value: presetData.hideZapperContent },
        { toggleId: 'showTopZappersToggle', value: presetData.showTopZappers },
        { toggleId: 'podiumToggle', value: presetData.podium },
        { toggleId: 'zapGridToggle', value: presetData.zapGrid },
        { toggleId: 'sectionLabelsToggle', value: presetData.sectionLabels !== undefined ? presetData.sectionLabels : false },
        { toggleId: 'qrOnlyToggle', value: presetData.qrOnly !== undefined ? presetData.qrOnly : false }
      ];

      toggleMapping.forEach(({ toggleId, value }) => {
        const toggle = document.getElementById(toggleId) as HTMLInputElement;
        if (toggle) {
          toggle.checked = value;
          // Trigger change event to apply visual effects
          const event = new Event('change', { bubbles: true });
          toggle.dispatchEvent(event);
        }
      });


      // Apply all styles
      applyAllStyles();
      saveCurrentStylesToLocalStorage();

      // Update QR slide visibility after applying preset
      setTimeout(() => {
        if (onUpdateQRSlideVisibility) {
          onUpdateQRSlideVisibility(true);
        }
      }, 100);
    }
  }, [applyAllStyles, saveCurrentStylesToLocalStorage, onUpdateQRSlideVisibility]);

  /**
   * Reset styles to defaults
   */
  const resetToDefaults = useCallback(() => {
    // Clear localStorage to remove saved customizations
    appLocalStorage.removeItem('styleOptions');

    // Reset fiat options to defaults
    const showFiatToggle = document.getElementById('showFiatToggle') as HTMLInputElement;
    const currencySelector = document.getElementById('currencySelector') as HTMLSelectElement;
    const showHistoricalPriceToggle = document.getElementById('showHistoricalPriceToggle') as HTMLInputElement;
    const showHistoricalChangeToggle = document.getElementById('showHistoricalChangeToggle') as HTMLInputElement;
    const fiatOnlyToggle = document.getElementById('fiatOnlyToggle') as HTMLInputElement;

    if (showFiatToggle) showFiatToggle.checked = false;
    if (currencySelector) currencySelector.value = 'USD';
    if (showHistoricalPriceToggle) showHistoricalPriceToggle.checked = false;
    if (showHistoricalChangeToggle) showHistoricalChangeToggle.checked = false;
    if (fiatOnlyToggle) fiatOnlyToggle.checked = false;

    // Hide fiat-related groups
    const currencySelectorGroup = document.getElementById('currencySelectorGroup');
    const historicalPriceGroup = document.getElementById('historicalPriceGroup');
    const historicalChangeGroup = document.getElementById('historicalChangeGroup');
    const fiatOnlyGroup = document.getElementById('fiatOnlyGroup');

    if (currencySelectorGroup) currencySelectorGroup.style.display = 'none';
    if (historicalPriceGroup) historicalPriceGroup.style.display = 'none';
    if (historicalChangeGroup) historicalChangeGroup.style.display = 'none';
    if (fiatOnlyGroup) fiatOnlyGroup.style.display = 'none';

    // Remove fiat amounts from display
    document.querySelectorAll('.fiat-amount').forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });

    // Re-initialize QR codes first (before applying preset)
    // Try to get eventId from URL
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const pathPartsWithoutLive = pathParts.filter(p => p !== 'live');
    const urlEventId = pathPartsWithoutLive[pathPartsWithoutLive.length - 1];

    if (onInitializeQRCodePlaceholders) {
      onInitializeQRCodePlaceholders(urlEventId).then(() => {
        // Apply light mode preset after QR codes are initialized
        applyPreset('lightMode');
      }).catch(() => {
        // If initialization fails, still apply preset
        applyPreset('lightMode');
      });
    } else {
      // If no callback, just apply preset
      applyPreset('lightMode');
    }
  }, [applyPreset, onInitializeQRCodePlaceholders]);

  /**
   * Update style URL - saves styles to localStorage and cleans URL
   */
  const updateStyleURL = useCallback(() => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;

    // Get current style values
    const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
    const partnerLogoUrl = document.getElementById('partnerLogoUrl') as HTMLInputElement;

    // Get the actual partner logo URL
    let currentPartnerLogo = '';
    if (partnerLogoSelect) {
      if (partnerLogoSelect.value === 'custom' && partnerLogoUrl) {
        currentPartnerLogo = partnerLogoUrl.value;
      } else {
        currentPartnerLogo = partnerLogoSelect.value;
      }
    }

    const styles = {
      textColor: toHexColor(
        (mainLayout as HTMLElement).style.getPropertyValue('--text-color') ||
          DEFAULT_STYLES.textColor
      ),
      bgColor: toHexColor(
        (mainLayout as HTMLElement).style.backgroundColor ||
          DEFAULT_STYLES.bgColor
      ),
      bgImage:
        (document.getElementById('bgImageUrl') as HTMLInputElement)?.value ||
        '',
      qrInvert:
        (document.getElementById('qrInvertToggle') as HTMLInputElement)
          ?.checked || false,
      qrScreenBlend:
        (document.getElementById('qrScreenBlendToggle') as HTMLInputElement)
          ?.checked || false,
      qrMultiplyBlend:
        (document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement)
          ?.checked || false,
      qrShowWebLink:
        (document.getElementById('qrShowWebLinkToggle') as HTMLInputElement)
          ?.checked ?? true,
      qrShowNevent:
        (document.getElementById('qrShowNeventToggle') as HTMLInputElement)
          ?.checked ?? true,
      qrShowNote:
        (document.getElementById('qrShowNoteToggle') as HTMLInputElement)
          ?.checked ?? true,
      layoutInvert:
        (document.getElementById('layoutInvertToggle') as HTMLInputElement)
          ?.checked || false,
      hideZapperContent:
        (document.getElementById('hideZapperContentToggle') as HTMLInputElement)
          ?.checked || false,
      showTopZappers:
        (document.getElementById('showTopZappersToggle') as HTMLInputElement)
          ?.checked || false,
      podium:
        (document.getElementById('podiumToggle') as HTMLInputElement)
          ?.checked || false,
      zapGrid:
        (document.getElementById('zapGridToggle') as HTMLInputElement)
          ?.checked || false,
      sectionLabels:
        (document.getElementById('sectionLabelsToggle') as HTMLInputElement)
          ?.checked ?? true,
      qrOnly:
        (document.getElementById('qrOnlyToggle') as HTMLInputElement)
          ?.checked || false,
      showFiat:
        (document.getElementById('showFiatToggle') as HTMLInputElement)
          ?.checked || false,
      showHistoricalPrice:
        (
          document.getElementById(
            'showHistoricalPriceToggle'
          ) as HTMLInputElement
        )?.checked || false,
      showHistoricalChange:
        (
          document.getElementById(
            'showHistoricalChangeToggle'
          ) as HTMLInputElement
        )?.checked || false,
      fiatOnly:
        (document.getElementById('fiatOnlyToggle') as HTMLInputElement)
          ?.checked || false,
      lightning:
        (document.getElementById('lightningToggle') as HTMLInputElement)
          ?.checked || false,
      opacity: parseFloat(
        (document.getElementById('opacitySlider') as HTMLInputElement)?.value ||
          '1'
      ),
      textOpacity: parseFloat(
        (document.getElementById('textOpacitySlider') as HTMLInputElement)
          ?.value || '1'
      ),
      partnerLogo: currentPartnerLogo,
      selectedCurrency:
        (document.getElementById('currencySelector') as HTMLSelectElement)
          ?.value || 'USD'
    };

    // Store styles in localStorage instead of URL
    appLocalStorage.setStyleOptions(styles);

    // Keep URL clean - no style parameters
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const pathPartsWithoutLive = pathParts.filter(p => p !== 'live');
    const noteId = pathPartsWithoutLive[pathPartsWithoutLive.length - 1];
    const cleanUrl =
      noteId && noteId.trim() !== '' ? `/live/${noteId}` : '/live/';

    if (window.location.href !== window.location.origin + cleanUrl) {
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [toHexColor]);

  /**
   * Apply styles from URL parameters (backward compatibility)
   */
  const applyStylesFromURL = useCallback(() => {
    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout) return;

    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return; // No URL parameters

    // Apply text color
    if (params.has('textColor')) {
      const color = params.get('textColor');
      if (color) {
        (mainLayout as HTMLElement).style.setProperty('--text-color', color);
        const textColorInput = document.getElementById('textColorPicker') as HTMLInputElement;
        const textColorValue = document.getElementById('textColorValue') as HTMLInputElement;
        if (textColorInput) textColorInput.value = color;
        if (textColorValue) textColorValue.value = color;
      }
    }

    // Apply background color
    if (params.has('bgColor')) {
      const color = params.get('bgColor');
      if (color) {
        const opacity = params.has('opacity')
          ? parseFloat(params.get('opacity') || '1')
          : DEFAULT_STYLES.opacity;
        const rgbaColor = hexToRgba(color, opacity);
        (mainLayout as HTMLElement).style.backgroundColor = rgbaColor;
        const bgColorInput = document.getElementById('bgColorPicker') as HTMLInputElement;
        const bgColorValue = document.getElementById('bgColorValue') as HTMLInputElement;
        if (bgColorInput) bgColorInput.value = color;
        if (bgColorValue) bgColorValue.value = color;
      }
    }

    // Apply background image
    if (params.has('bgImage')) {
      const imageUrl = params.get('bgImage');
      if (imageUrl) {
        const bgImageUrl = document.getElementById('bgImageUrl') as HTMLInputElement;
        if (bgImageUrl) {
          bgImageUrl.value = imageUrl;
          updateBackgroundImage(imageUrl);
        }
      }
    }

    // Apply QR code invert (set to default if not specified in URL)
    const qrInvert = params.has('qrInvert')
      ? params.get('qrInvert') === 'true'
      : DEFAULT_STYLES.qrInvert;
    const qrInvertToggle = document.getElementById('qrInvertToggle') as HTMLInputElement;
    if (qrInvertToggle) qrInvertToggle.checked = qrInvert;
    const qrCodes = [
      document.getElementById('qrCode'),
      document.getElementById('qrCodeNevent'),
      document.getElementById('qrCodeNote')
    ];

    // Include Lightning QR in invert effect if enabled
    if (lightningEnabled) {
      qrCodes.push(document.getElementById('lightningQRCode'));
    }

    qrCodes.forEach(qrCode => {
      if (qrCode) {
        (qrCode as HTMLElement).style.filter = qrInvert ? 'invert(1)' : 'none';
      }
    });

    // Apply QR code blend modes (set to default if not specified in URL)
    const qrScreenBlend = params.has('qrScreenBlend')
      ? params.get('qrScreenBlend') === 'true'
      : DEFAULT_STYLES.qrScreenBlend;
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle') as HTMLInputElement;
    if (qrScreenBlendToggle) qrScreenBlendToggle.checked = qrScreenBlend;

    const qrMultiplyBlend = params.has('qrMultiplyBlend')
      ? params.get('qrMultiplyBlend') === 'true'
      : DEFAULT_STYLES.qrMultiplyBlend;
    const qrMultiplyBlendToggle = document.getElementById('qrMultiplyBlendToggle') as HTMLInputElement;
    if (qrMultiplyBlendToggle) qrMultiplyBlendToggle.checked = qrMultiplyBlend;

    // Update blend mode after setting toggles
    updateBlendMode();

    // Apply QR slide visibility (set to default if not specified in URL)
    const qrShowWebLink = params.has('qrShowWebLink')
      ? params.get('qrShowWebLink') === 'true'
      : DEFAULT_STYLES.qrShowWebLink;
    const qrShowWebLinkToggle = document.getElementById('qrShowWebLinkToggle') as HTMLInputElement;
    if (qrShowWebLinkToggle) qrShowWebLinkToggle.checked = qrShowWebLink;

    const qrShowNevent = params.has('qrShowNevent')
      ? params.get('qrShowNevent') === 'true'
      : DEFAULT_STYLES.qrShowNevent;
    const qrShowNeventToggle = document.getElementById('qrShowNeventToggle') as HTMLInputElement;
    if (qrShowNeventToggle) qrShowNeventToggle.checked = qrShowNevent;

    const qrShowNote = params.has('qrShowNote')
      ? params.get('qrShowNote') === 'true'
      : DEFAULT_STYLES.qrShowNote;
    const qrShowNoteToggle = document.getElementById('qrShowNoteToggle') as HTMLInputElement;
    if (qrShowNoteToggle) qrShowNoteToggle.checked = qrShowNote;

    // Apply layout invert (set to default if not specified in URL)
    const layoutInvert = params.has('layoutInvert')
      ? params.get('layoutInvert') === 'true'
      : DEFAULT_STYLES.layoutInvert;
    const layoutInvertToggle = document.getElementById('layoutInvertToggle') as HTMLInputElement;
    if (layoutInvertToggle) layoutInvertToggle.checked = layoutInvert;
    document.body.classList.toggle('flex-direction-invert', layoutInvert);

    // Apply hide zapper content (set to default if not specified in URL)
    const hideZapperContent = params.has('hideZapperContent')
      ? params.get('hideZapperContent') === 'true'
      : DEFAULT_STYLES.hideZapperContent;
    const hideZapperContentToggle = document.getElementById('hideZapperContentToggle') as HTMLInputElement;
    if (hideZapperContentToggle)
      hideZapperContentToggle.checked = hideZapperContent;
    document.body.classList.toggle('hide-zapper-content', hideZapperContent);

    // Apply show top zappers (set to default if not specified in URL)
    const showTopZappers = params.has('showTopZappers')
      ? params.get('showTopZappers') === 'true'
      : DEFAULT_STYLES.showTopZappers;
    const showTopZappersToggle = document.getElementById('showTopZappersToggle') as HTMLInputElement;
    if (showTopZappersToggle) showTopZappersToggle.checked = showTopZappers;
    document.body.classList.toggle('show-top-zappers', showTopZappers);

    // Apply podium (set to default if not specified in URL)
    const podium = params.has('podium')
      ? params.get('podium') === 'true'
      : DEFAULT_STYLES.podium;
    const podiumToggle = document.getElementById('podiumToggle') as HTMLInputElement;
    if (podiumToggle) podiumToggle.checked = podium;
    document.body.classList.toggle('podium-enabled', podium);

    // Apply zap grid (set to default if not specified in URL)
    const zapGrid = params.has('zapGrid')
      ? params.get('zapGrid') === 'true'
      : DEFAULT_STYLES.zapGrid;
    const zapGridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
    if (zapGridToggle) zapGridToggle.checked = zapGrid;
    const zapsList = document.getElementById('zaps');
    if (zapsList) {
      // Check if we're in live event mode (has two-column layout)
      const isLiveEvent = zapsList.classList.contains('live-event-two-column');

      if (isLiveEvent) {
        // Apply grid layout ONLY to zaps-only-list, NOT activity-list
        const zapsOnlyList = document.getElementById('zaps-only-list');

        if (zapGrid) {
          if (zapsOnlyList) {
            zapsOnlyList.classList.add('grid-layout');
            // Force reflow
            void zapsOnlyList.offsetHeight;
          }
          // Organize zaps after a brief delay to ensure DOM is ready
          setTimeout(() => {
            if (onOrganizeZaps) {
              onOrganizeZaps();
            }
          }, 100);

          // Start periodic re-organization to catch new zaps during load
          if ((window as any).gridPeriodicCheckInterval) {
            clearInterval((window as any).gridPeriodicCheckInterval);
          }
          (window as any).gridPeriodicCheckInterval = setInterval(() => {
            const gridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
            const container = document.getElementById('zaps-only-list');
            if (gridToggle && gridToggle.checked && container && container.classList.contains('grid-layout')) {
              // Check if there are zaps outside of .zap-row containers
              const allZaps = container.querySelectorAll('.zap, .live-event-zap, .zap-only-item');
              const zapsInRows = container.querySelectorAll('.zap-row .zap, .zap-row .live-event-zap, .zap-row .zap-only-item');

              if (allZaps.length !== zapsInRows.length) {
                // Some zaps are not in rows, re-organize
                console.log('Re-organizing grid on load: found zaps outside rows', allZaps.length, 'total vs', zapsInRows.length, 'in rows');
                if (onOrganizeZaps) {
                  onOrganizeZaps();
                }
              }
            }
          }, 2000); // Check every 2 seconds
        } else {
          // Stop periodic check on load if grid is disabled
          if ((window as any).gridPeriodicCheckInterval) {
            clearInterval((window as any).gridPeriodicCheckInterval);
            (window as any).gridPeriodicCheckInterval = null;
          }

          // Clean up FIRST (this sets inline styles to force row layout)
          if (onCleanupHierarchicalOrganization) {
            onCleanupHierarchicalOrganization();
          }
          // Then remove the class after cleanup
          setTimeout(() => {
            if (zapsOnlyList) {
              zapsOnlyList.classList.remove('grid-layout');
              // Force reflow
              void zapsOnlyList.offsetHeight;
            }
            // Also ensure .zaps-list doesn't have grid-layout
            const zapsListElements = document.querySelectorAll('.zaps-list');
            zapsListElements.forEach(list => list.classList.remove('grid-layout'));
          }, 10);
        }
      } else {
        // Regular kind1 note mode
        if (zapGrid) {
          zapsList.classList.add('grid-layout');
          // Force reflow
          void zapsList.offsetHeight;
          setTimeout(() => {
            if (onOrganizeZaps) {
              onOrganizeZaps();
            }
          }, 100);

          // Start periodic re-organization for kind1 notes on load
          if ((window as any).gridPeriodicCheckInterval) {
            clearInterval((window as any).gridPeriodicCheckInterval);
          }
          (window as any).gridPeriodicCheckInterval = setInterval(() => {
            const gridToggle = document.getElementById('zapGridToggle') as HTMLInputElement;
            const container = document.getElementById('zaps');
            if (gridToggle && gridToggle.checked && container && container.classList.contains('grid-layout')) {
              // Check if there are zaps outside of .zap-row containers
              const allZaps = container.querySelectorAll('.zap');
              const zapsInRows = container.querySelectorAll('.zap-row .zap');

              if (allZaps.length !== zapsInRows.length) {
                // Some zaps are not in rows, re-organize
                console.log('Re-organizing grid on load: found zaps outside rows', allZaps.length, 'total vs', zapsInRows.length, 'in rows');
                if (onOrganizeZaps) {
                  onOrganizeZaps();
                }
              }
            }
          }, 2000); // Check every 2 seconds
        } else {
          // Stop periodic check on load if grid is disabled
          if ((window as any).gridPeriodicCheckInterval) {
            clearInterval((window as any).gridPeriodicCheckInterval);
            (window as any).gridPeriodicCheckInterval = null;
          }

          // Clean up FIRST (this sets inline styles to force row layout)
          if (onCleanupHierarchicalOrganization) {
            onCleanupHierarchicalOrganization();
          }
          // Then remove the class after cleanup
          setTimeout(() => {
            zapsList.classList.remove('grid-layout');
            // Force reflow
            void zapsList.offsetHeight;
            // Also ensure .zaps-list doesn't have grid-layout
            const zapsListElements = document.querySelectorAll('.zaps-list');
            zapsListElements.forEach(list => list.classList.remove('grid-layout'));
          }, 10);
        }
      }
    }

    // Apply lightning toggle (set to default if not specified in URL)
    const lightning = params.has('lightning')
      ? params.get('lightning') === 'true'
      : DEFAULT_STYLES.lightning;
    const lightningToggle = document.getElementById('lightningToggle') as HTMLInputElement;
    if (lightningToggle) lightningToggle.checked = lightning;

    // Apply opacity
    if (params.has('opacity')) {
      const opacity = parseFloat(params.get('opacity') || '1');
      const opacitySlider = document.getElementById('opacitySlider') as HTMLInputElement;
      const opacityValue = document.getElementById('opacityValue');
      if (opacitySlider) opacitySlider.value = opacity.toString();
      if (opacityValue)
        opacityValue.textContent = `${Math.round(opacity * 100)}%`;
    }

    // Apply text opacity
    if (params.has('textOpacity')) {
      const textOpacity = parseFloat(params.get('textOpacity') || '1');
      const textOpacitySlider = document.getElementById('textOpacitySlider') as HTMLInputElement;
      const textOpacityValue = document.getElementById('textOpacityValue');
      if (textOpacitySlider) textOpacitySlider.value = textOpacity.toString();
      if (textOpacityValue)
        textOpacityValue.textContent = `${Math.round(textOpacity * 100)}%`;
    }

    // Apply partner logo from URL
    if (params.has('partnerLogo')) {
      const partnerLogoUrl = decodeURIComponent(
        params.get('partnerLogo') || ''
      );
      const partnerLogoSelect = document.getElementById('partnerLogoSelect') as HTMLSelectElement;
      const partnerLogoImg = document.getElementById('partnerLogo') as HTMLImageElement;
      const partnerLogoUrlInput = document.getElementById('partnerLogoUrl') as HTMLInputElement;
      const customPartnerLogoGroup = document.getElementById('customPartnerLogoGroup');
      const partnerLogoPreview = document.getElementById('partnerLogoPreview') as HTMLImageElement;

      if (partnerLogoUrl) {
        // Check if it's one of the predefined options
        const matchingOption = Array.from(partnerLogoSelect.options).find(
          option => option.value === partnerLogoUrl
        );
        if (matchingOption) {
          // It's a predefined logo
          if (partnerLogoSelect) partnerLogoSelect.value = partnerLogoUrl;
          if (customPartnerLogoGroup)
            customPartnerLogoGroup.style.display = 'none';
        } else {
          // It's a custom URL
          if (partnerLogoSelect) partnerLogoSelect.value = 'custom';
          if (customPartnerLogoGroup)
            customPartnerLogoGroup.style.display = 'block';
          if (partnerLogoUrlInput) partnerLogoUrlInput.value = partnerLogoUrl;
        }

        // Set the actual logo
        if (partnerLogoImg) {
          partnerLogoImg.src = partnerLogoUrl;
          partnerLogoImg.style.display = 'inline-block';
        }

        // Update preview
        if (partnerLogoPreview) {
          partnerLogoPreview.src = partnerLogoUrl;
          partnerLogoPreview.alt = 'Partner logo preview';
        }
      } else {
        // No logo
        if (partnerLogoSelect) partnerLogoSelect.value = '';
        if (customPartnerLogoGroup)
          customPartnerLogoGroup.style.display = 'none';
        if (partnerLogoImg) {
          partnerLogoImg.style.display = 'none';
          partnerLogoImg.src = '';
        }
        if (partnerLogoPreview) {
          partnerLogoPreview.src = '';
          partnerLogoPreview.alt = 'No partner logo';
        }
      }
    }

    // Apply section labels toggle (set to default if not specified in URL)
    const sectionLabels = params.has('sectionLabels')
      ? params.get('sectionLabels') === 'true'
      : DEFAULT_STYLES.sectionLabels;
    const sectionLabelsToggle = document.getElementById('sectionLabelsToggle') as HTMLInputElement;
    if (sectionLabelsToggle) sectionLabelsToggle.checked = sectionLabels;
    const sectionLabelsElements = document.querySelectorAll('.section-label');
    const totalLabelsElements = document.querySelectorAll('.total-label');
    if (sectionLabels) {
      sectionLabelsElements.forEach(
        label => ((label as HTMLElement).style.display = 'block')
      );
      totalLabelsElements.forEach(
        label => ((label as HTMLElement).style.display = 'none')
      );
      document.body.classList.remove('show-total-labels');
    } else {
      sectionLabelsElements.forEach(
        label => ((label as HTMLElement).style.display = 'none')
      );
      totalLabelsElements.forEach(
        label => ((label as HTMLElement).style.display = 'inline')
      );
      document.body.classList.add('show-total-labels');
    }

    // Apply QR only toggle (set to default if not specified in URL)
    const qrOnly = params.has('qrOnly')
      ? params.get('qrOnly') === 'true'
      : false;
    const qrOnlyToggle = document.getElementById('qrOnlyToggle') as HTMLInputElement;
    if (qrOnlyToggle) qrOnlyToggle.checked = qrOnly;
    if (qrOnly) {
      document.body.classList.add('qr-only-mode');
    } else {
      document.body.classList.remove('qr-only-mode');
    }

    // Apply fiat toggle (set to default if not specified in URL)
    const showFiat = params.has('showFiat')
      ? params.get('showFiat') === 'true'
      : DEFAULT_STYLES.showFiat;
    const showFiatToggle = document.getElementById('showFiatToggle') as HTMLInputElement;
    const currencySelectorGroup = document.getElementById('currencySelectorGroup');
    const historicalPriceGroup = document.getElementById('historicalPriceGroup');
    if (showFiatToggle) showFiatToggle.checked = showFiat;
    if (showFiat) {
      document.body.classList.add('show-fiat-amounts');
      if (currencySelectorGroup) currencySelectorGroup.style.display = 'block';
      if (historicalPriceGroup) historicalPriceGroup.style.display = 'block';
    } else {
      document.body.classList.remove('show-fiat-amounts');
      if (currencySelectorGroup) currencySelectorGroup.style.display = 'none';
      if (historicalPriceGroup) historicalPriceGroup.style.display = 'none';
    }

    // Apply historical price toggle (set to default if not specified in URL)
    const showHistoricalPrice = params.has('showHistoricalPrice')
      ? params.get('showHistoricalPrice') === 'true'
      : DEFAULT_STYLES.showHistoricalPrice;
    const showHistoricalPriceToggle = document.getElementById('showHistoricalPriceToggle') as HTMLInputElement;
    if (showHistoricalPriceToggle)
      showHistoricalPriceToggle.checked = showHistoricalPrice;

    // Apply historical change toggle (set to default if not specified in URL)
    const showHistoricalChange = params.has('showHistoricalChange')
      ? params.get('showHistoricalChange') === 'true'
      : DEFAULT_STYLES.showHistoricalChange;
    const showHistoricalChangeToggle = document.getElementById('showHistoricalChangeToggle') as HTMLInputElement;
    const historicalChangeGroup = document.getElementById('historicalChangeGroup');
    if (showHistoricalChangeToggle)
      showHistoricalChangeToggle.checked = showHistoricalChange;

    // Show/hide historical change toggle based on historical price toggle state
    if (showHistoricalPrice && historicalChangeGroup) {
      historicalChangeGroup.style.display = 'block';
    } else if (historicalChangeGroup) {
      historicalChangeGroup.style.display = 'none';
    }

    // Apply fiat only toggle (set to default if not specified in URL)
    const fiatOnly = params.has('fiatOnly')
      ? params.get('fiatOnly') === 'true'
      : DEFAULT_STYLES.fiatOnly;
    const fiatOnlyToggle = document.getElementById('fiatOnlyToggle') as HTMLInputElement;
    const fiatOnlyGroup = document.getElementById('fiatOnlyGroup');
    if (fiatOnlyToggle) fiatOnlyToggle.checked = fiatOnly;

    // Show/hide fiat only toggle based on show fiat toggle state
    if (showFiat && fiatOnlyGroup) {
      fiatOnlyGroup.style.display = 'block';
    } else if (fiatOnlyGroup) {
      fiatOnlyGroup.style.display = 'none';
    }

    // Apply currency selection (set to default if not specified in URL)
    const selectedCurrency = params.has('selectedCurrency')
      ? params.get('selectedCurrency') || 'USD'
      : 'USD';
    const currencySelector = document.getElementById('currencySelector') as HTMLSelectElement;
    if (currencySelector) currencySelector.value = selectedCurrency;

    // Apply all styles to ensure everything is synchronized
    applyAllStyles();

    // Update QR slide visibility after applying styles from URL
    setTimeout(() => {
      // Check if QR codes exist before updating visibility
      const qrCode = document.getElementById('qrCode');
      const qrCodeNevent = document.getElementById('qrCodeNevent');
      const qrCodeNote = document.getElementById('qrCodeNote');

      console.log('QR code elements check:', {
        qrCode: !!qrCode,
        qrCodeNevent: !!qrCodeNevent,
        qrCodeNote: !!qrCodeNote,
        qrCodeContent: qrCode?.innerHTML,
        qrCodeNeventContent: qrCodeNevent?.innerHTML,
        qrCodeNoteContent: qrCodeNote?.innerHTML
      });

      if (onUpdateQRSlideVisibility) {
        onUpdateQRSlideVisibility(true); // Skip URL update during initialization
      }
    }, 500); // Longer delay to ensure QR codes are generated first

    // Save the URL-applied styles to localStorage first, then clean URL
    saveCurrentStylesToLocalStorage();
    updateStyleURL();
  }, [hexToRgba, updateBackgroundImage, updateBlendMode, applyAllStyles, saveCurrentStylesToLocalStorage, updateStyleURL, lightningEnabled, onOrganizeZaps, onCleanupHierarchicalOrganization, onUpdateQRSlideVisibility]);

  /**
   * Copy style URL with parameters
   */
  const copyStyleUrl = useCallback(() => {
    // Get current styles from localStorage
    const savedStyles = appLocalStorage.getStyleOptions();

    let urlToCopy = window.location.origin + window.location.pathname;

    if (savedStyles) {
      try {
        const styles = savedStyles;
        const params = new URLSearchParams();

        // Add style parameters that differ from defaults
        if (styles.textColor && styles.textColor !== DEFAULT_STYLES.textColor) {
          params.set('textColor', styles.textColor);
        }
        if (styles.bgColor && styles.bgColor !== DEFAULT_STYLES.bgColor) {
          params.set('bgColor', styles.bgColor);
        }
        if (styles.bgImage && styles.bgImage !== DEFAULT_STYLES.bgImage) {
          params.set('bgImage', styles.bgImage);
        }
        if (styles.qrInvert !== DEFAULT_STYLES.qrInvert) {
          params.set('qrInvert', styles.qrInvert);
        }
        if (styles.qrScreenBlend !== DEFAULT_STYLES.qrScreenBlend) {
          params.set('qrScreenBlend', styles.qrScreenBlend);
        }
        if (styles.qrMultiplyBlend !== DEFAULT_STYLES.qrMultiplyBlend) {
          params.set('qrMultiplyBlend', styles.qrMultiplyBlend);
        }
        if (styles.qrShowWebLink !== DEFAULT_STYLES.qrShowWebLink) {
          params.set('qrShowWebLink', styles.qrShowWebLink);
        }
        if (styles.qrShowNevent !== DEFAULT_STYLES.qrShowNevent) {
          params.set('qrShowNevent', styles.qrShowNevent);
        }
        if (styles.qrShowNote !== DEFAULT_STYLES.qrShowNote) {
          params.set('qrShowNote', styles.qrShowNote);
        }
        if (styles.layoutInvert !== DEFAULT_STYLES.layoutInvert) {
          params.set('layoutInvert', styles.layoutInvert);
        }
        if (styles.hideZapperContent !== DEFAULT_STYLES.hideZapperContent) {
          params.set('hideZapperContent', styles.hideZapperContent);
        }
        if (styles.showTopZappers !== DEFAULT_STYLES.showTopZappers) {
          params.set('showTopZappers', styles.showTopZappers);
        }
        if (styles.podium !== DEFAULT_STYLES.podium) {
          params.set('podium', styles.podium);
        }
        if (styles.zapGrid !== DEFAULT_STYLES.zapGrid) {
          params.set('zapGrid', styles.zapGrid);
        }
        if (styles.sectionLabels !== DEFAULT_STYLES.sectionLabels) {
          params.set('sectionLabels', styles.sectionLabels);
        }
        if (styles.qrOnly !== DEFAULT_STYLES.qrOnly) {
          params.set('qrOnly', styles.qrOnly);
        }
        if (styles.showFiat !== DEFAULT_STYLES.showFiat) {
          params.set('showFiat', styles.showFiat);
        }
        if (styles.showHistoricalPrice !== DEFAULT_STYLES.showHistoricalPrice) {
          params.set('showHistoricalPrice', styles.showHistoricalPrice);
        }
        if (styles.showHistoricalChange !== DEFAULT_STYLES.showHistoricalChange) {
          params.set('showHistoricalChange', styles.showHistoricalChange);
        }
        if (styles.fiatOnly !== DEFAULT_STYLES.fiatOnly) {
          params.set('fiatOnly', styles.fiatOnly);
        }
        if (styles.lightning !== DEFAULT_STYLES.lightning) {
          params.set('lightning', styles.lightning);
        }
        if (styles.opacity !== DEFAULT_STYLES.opacity) {
          params.set('opacity', styles.opacity.toString());
        }
        if (styles.textOpacity !== DEFAULT_STYLES.textOpacity) {
          params.set('textOpacity', styles.textOpacity.toString());
        }
        if (styles.partnerLogo && styles.partnerLogo !== DEFAULT_STYLES.partnerLogo) {
          params.set('partnerLogo', encodeURIComponent(styles.partnerLogo));
        }
        if (styles.selectedCurrency && styles.selectedCurrency !== DEFAULT_STYLES.selectedCurrency) {
          params.set('selectedCurrency', styles.selectedCurrency);
        }

        if (params.toString() !== '') {
          urlToCopy = `${urlToCopy}?${params.toString()}`;
        }
      } catch (error) {
        console.error('Error parsing saved styles:', error);
      }
    }

    navigator.clipboard
      .writeText(urlToCopy)
      .then(() => {
        const btn = document.getElementById('copyStyleUrl');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.background = '#28a745';
          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
          }, 2000);
        }
      })
      .catch(_err => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = urlToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      });
  }, []);

  return {
    resetToDefaults,
    updateStyleURL,
    applyStylesFromURL,
    copyStyleUrl,
    applyPreset,
    applyAllStyles,
    saveCurrentStylesToLocalStorage,
    updateBlendMode,
    updateBackgroundImage,
    toHexColor,
    hexToRgba
  };
}
