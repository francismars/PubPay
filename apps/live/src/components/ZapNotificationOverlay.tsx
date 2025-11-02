import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ZapNotification } from '@live/types';

// Constants
const NOTIFICATION_DURATION = 7000; // 7 seconds
const FADE_OUT_DURATION = 300; // 300ms
const COLOR_POLL_INTERVAL = 500; // 500ms
const CHAR_ANIMATION_DELAY = 0.08; // seconds
const BG_OPACITY = 0.9;
const DEFAULT_BG_COLOR = 'rgba(0, 0, 0, 0.9)';
const DEFAULT_TEXT_COLOR = '#000000';
const FALLBACK_IMAGE = '/live/images/gradient_color.gif';

// Helper functions
const getRankLabel = (rank?: number): string | null => {
  if (!rank) return null;
  switch (rank) {
    case 1:
      return 'Top Zap';
    case 2:
      return 'Runner Up';
    case 3:
      return 'Third Place';
    default:
      return null;
  }
};

const getScaleFactor = (rank?: number): number => {
  if (!rank) return 0.7; // Default for unranked
  if (rank === 1) return 1.0; // 100%
  if (rank === 2) return 0.9; // 90%
  if (rank === 3) return 0.8; // 80%
  if (rank === 4) return 0.7; // 70%
  if (rank === 5) return 0.6; // 60%
  if (rank === 6) return 0.5; // 50%
  return 0.4; // 40% for 7th place and below
};

const truncateText = (text: string, maxLength: number = 16): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const getNotificationDuration = (rank?: number): number => {
  if (!rank) return 4000; // Default for unranked: 4 seconds
  if (rank === 1) return 8000; // 1st place: 8 seconds
  if (rank === 2) return 7000; // 2nd place: 7 seconds
  if (rank === 3) return 6000; // 3rd place: 6 seconds
  if (rank === 4) return 5000; // 4th place: 5 seconds
  return 4000; // 5th place and below: 4 seconds
};

interface ZapNotificationOverlayProps {
  notification: ZapNotification | null;
  onDismiss: () => void;
}

export const ZapNotificationOverlay: React.FC<ZapNotificationOverlayProps> = ({
  notification,
  onDismiss
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentNotification, setCurrentNotification] =
    useState<ZapNotification | null>(null);
  const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [isFiatOnly, setIsFiatOnly] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Update colors from mainLayout
  const updateColors = useCallback(() => {
    const mainLayout = document.getElementById('mainLayout');
    if (!mainLayout) return;

    const computedStyle = window.getComputedStyle(mainLayout);
    const bgStyle = computedStyle.backgroundColor;

    if (bgStyle) {
      const match = bgStyle.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/
      );
      if (match) {
        const [, r, g, b] = match;
        setBgColor(`rgba(${r}, ${g}, ${b}, ${BG_OPACITY})`);
      }
    }

    const textColorValue = computedStyle
      .getPropertyValue('--text-color')
      .trim();
    setTextColor(textColorValue || computedStyle.color);
  }, []);

  // Update fiat settings
  const updateFiatSettings = useCallback(() => {
    const fiatOnlyToggle = document.getElementById(
      'fiatOnlyToggle'
    ) as HTMLInputElement;
    const showFiatToggle = document.getElementById(
      'showFiatToggle'
    ) as HTMLInputElement;

    // Only show fiat if both showFiat and fiatOnly are checked
    const shouldShowFiatOnly =
      showFiatToggle?.checked && fiatOnlyToggle?.checked;
    setIsFiatOnly(shouldShowFiatOnly);

    // Get selected currency
    if ((window as any).getSelectedFiatCurrency) {
      const currency = (window as any).getSelectedFiatCurrency();
      setSelectedCurrency(currency);
    }

    // Check if Bitcoin prices are loaded
    if ((window as any).getBitcoinPrices) {
      const prices = (window as any).getBitcoinPrices();
      const loaded = prices && Object.keys(prices).length > 0;
      setPricesLoaded(loaded);
    }
  }, []);

  // Poll for style option changes
  useEffect(() => {
    updateColors();
    updateFiatSettings();
    const interval = setInterval(() => {
      updateColors();
      updateFiatSettings();
    }, COLOR_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [updateColors, updateFiatSettings]);

  // Handle notification display and auto-dismiss
  useEffect(() => {
    if (!notification) return;

    setCurrentNotification(notification);
    setIsVisible(true);
    updateColors();
    updateFiatSettings(); // Update fiat settings immediately when notification arrives

    // Get duration based on zapper's rank
    const duration = getNotificationDuration(notification.zapperRank);

    const hideTimer = setTimeout(() => {
      setIsVisible(false);

      const clearTimer = setTimeout(() => {
        setCurrentNotification(null);
        onDismiss();
      }, FADE_OUT_DURATION);

      return () => clearTimeout(clearTimer);
    }, duration);

    return () => clearTimeout(hideTimer);
  }, [notification, onDismiss, updateColors, updateFiatSettings]);

  // Memoize computed values (must be called before any early returns to follow Rules of Hooks)
  const { displayAmount, displayLabel } = useMemo(() => {
    if (!currentNotification)
      return { displayAmount: '', displayLabel: 'sats' };

    const satsAmount = currentNotification.amount.toLocaleString();

    // Check if Bitcoin prices are loaded
    const bitcoinPrices = (window as any).getBitcoinPrices
      ? (window as any).getBitcoinPrices()
      : {};

    // If fiat-only mode is enabled, convert to fiat
    if (
      isFiatOnly &&
      (window as any).satsToFiat &&
      bitcoinPrices[selectedCurrency]
    ) {
      try {
        const fiatHtml = (window as any).satsToFiat(
          currentNotification.amount,
          selectedCurrency
        );
        // Extract just the number part (remove the HTML span)
        const fiatMatch = fiatHtml.match(/^([\d,\.]+)/);
        if (fiatMatch) {
          return {
            displayAmount: fiatMatch[1],
            displayLabel: selectedCurrency
          };
        }
      } catch (err) {
        console.error('Error converting to fiat:', err);
      }
    }

    return { displayAmount: satsAmount, displayLabel: 'sats' };
  }, [currentNotification?.amount, isFiatOnly, selectedCurrency, pricesLoaded]);

  const rankLabel = useMemo(
    () =>
      currentNotification ? getRankLabel(currentNotification.zapperRank) : null,
    [currentNotification?.zapperRank]
  );

  const scaleFactor = useMemo(
    () =>
      currentNotification ? getScaleFactor(currentNotification.zapperRank) : 1,
    [currentNotification?.zapperRank]
  );

  // Memoize character array for rank label animation
  const rankChars = useMemo(() => {
    if (!rankLabel) return [];
    return rankLabel.split('').map((char, index) => ({
      char: char === ' ' ? '\u00A0' : char,
      index,
      delay: index * CHAR_ANIMATION_DELAY
    }));
  }, [rankLabel]);

  // Memoize truncated name and content
  const truncatedName = useMemo(
    () =>
      currentNotification
        ? truncateText(currentNotification.zapperName, 16)
        : '',
    [currentNotification?.zapperName]
  );

  const truncatedContent = useMemo(
    () =>
      currentNotification?.content
        ? truncateText(currentNotification.content, 16)
        : null,
    [currentNotification?.content]
  );

  // Early return after all hooks have been called
  if (!currentNotification) {
    return null;
  }

  return (
    <div
      className={`zap-notification-overlay ${isVisible ? 'visible' : ''}`}
      style={{ background: bgColor }}
    >
      {rankLabel && (
        <div className="zap-notification-top-copy" style={{ color: textColor }}>
          {rankChars.map(({ char, index, delay }) => (
            <span
              key={index}
              className="zap-notification-char"
              style={{ animationDelay: `${delay}s` }}
            >
              {char}
            </span>
          ))}
        </div>
      )}
      <div
        className="zap-notification-content"
        style={{ color: textColor, transform: `scale(${scaleFactor})` }}
      >
        <img
          src={currentNotification.zapperImage}
          alt={currentNotification.zapperName}
          className="zap-notification-avatar"
          style={{ borderColor: textColor }}
          onError={e => {
            (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
          }}
        />
        <div className="zap-notification-text-container">
          <div className="zap-notification-amount" style={{ color: textColor }}>
            {displayAmount} {displayLabel}
          </div>
          <div className="zap-notification-name">{truncatedName}</div>
          {truncatedContent && (
            <div className="zap-notification-message">{truncatedContent}</div>
          )}
        </div>
      </div>
    </div>
  );
};
