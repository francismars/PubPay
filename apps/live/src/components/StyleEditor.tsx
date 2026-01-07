import React, { useState, useCallback, useEffect } from 'react';
import { DEFAULT_STYLES } from '../constants/styles';

export interface StyleConfig {
  textColor?: string;
  bgColor?: string;
  bgImage?: string;
  opacity?: number;
  textOpacity?: number;
  qrInvert?: boolean;
  qrScreenBlend?: boolean;
  qrMultiplyBlend?: boolean;
  qrShowWebLink?: boolean;
  qrShowNevent?: boolean;
  qrShowNote?: boolean;
  layoutInvert?: boolean;
  hideZapperContent?: boolean;
  showTopZappers?: boolean;
  podium?: boolean;
  zapGrid?: boolean;
  sectionLabels?: boolean;
  qrOnly?: boolean;
  showFiat?: boolean;
  showHistoricalPrice?: boolean;
  showHistoricalChange?: boolean;
  fiatOnly?: boolean;
  lightning?: boolean;
  selectedCurrency?: string;
  partnerLogo?: string;
}

interface StyleEditorProps {
  initialStyles?: StyleConfig;
  onSave: (styles: StyleConfig) => void;
  onCancel?: () => void;
  renderButtons?: boolean;
  onChange?: (styles: StyleConfig) => void;
  resetRef?: React.MutableRefObject<(() => void) | null>;
}

const bgImagePresets = [
  '/live/images/adopting.webp',
  '/live/images/sky.jpg',
  '/live/images/lightning.gif',
  '/live/images/bitcoin-rocket.gif',
  '/live/images/bitcoin-astronaut.gif',
  '/live/images/bitcoin-space.gif',
  '/live/images/bitcoin-sunset.gif',
  '/live/images/bitcoin-rotating.gif',
  '/live/images/nostr-ostriches.gif',
  '/live/images/send-zaps.gif',
  '/live/images/gm-nostr.gif'
];

const partnerLogoPresets = [
  'https://adoptingbitcoin.org/images/AB-logo.svg',
  'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg'
];

export const StyleEditor: React.FC<StyleEditorProps> = ({
  initialStyles = {},
  onSave,
  onCancel,
  renderButtons = true,
  onChange,
  resetRef
}) => {
  const [styles, setStyles] = useState<StyleConfig>(() => ({
    ...DEFAULT_STYLES,
    ...initialStyles
  }));
  const [urlImport, setUrlImport] = useState('');
  const [showCustomBg, setShowCustomBg] = useState(!!styles.bgImage && !bgImagePresets.includes(styles.bgImage));
  const [showCustomLogo, setShowCustomLogo] = useState(!!styles.partnerLogo && !partnerLogoPresets.includes(styles.partnerLogo));

  const updateStyle = useCallback((key: keyof StyleConfig, value: unknown) => {
    setStyles(prev => {
      const updated = { ...prev, [key]: value };
      if (onChange) {
        // Only include non-default values when calling onChange
        const cleaned: StyleConfig = {};
        Object.entries(updated).forEach(([k, v]) => {
          const kk = k as keyof StyleConfig;
          if (v !== DEFAULT_STYLES[kk]) {
            (cleaned as any)[kk] = v;
          }
        });
        onChange(cleaned);
      }
      return updated;
    });
  }, [onChange]);

  const importFromUrl = useCallback(() => {
    if (!urlImport.trim()) return;
    
    try {
      const url = new URL(urlImport);
      const params = new URLSearchParams(url.search);
      const imported: StyleConfig = {};
      
      // Parse all style parameters
      if (params.has('textColor')) imported.textColor = params.get('textColor') || undefined;
      if (params.has('bgColor')) imported.bgColor = params.get('bgColor') || undefined;
      if (params.has('bgImage')) {
        const bgImg = params.get('bgImage') || '';
        imported.bgImage = bgImg;
        setShowCustomBg(!bgImagePresets.includes(bgImg) && bgImg !== '');
      }
      if (params.has('opacity')) imported.opacity = parseFloat(params.get('opacity') || '1');
      if (params.has('textOpacity')) imported.textOpacity = parseFloat(params.get('textOpacity') || '1');
      if (params.has('qrInvert')) imported.qrInvert = params.get('qrInvert') === 'true';
      if (params.has('qrScreenBlend')) imported.qrScreenBlend = params.get('qrScreenBlend') === 'true';
      if (params.has('qrMultiplyBlend')) imported.qrMultiplyBlend = params.get('qrMultiplyBlend') === 'true';
      if (params.has('qrShowWebLink')) imported.qrShowWebLink = params.get('qrShowWebLink') === 'true';
      if (params.has('qrShowNevent')) imported.qrShowNevent = params.get('qrShowNevent') === 'true';
      if (params.has('qrShowNote')) imported.qrShowNote = params.get('qrShowNote') === 'true';
      if (params.has('layoutInvert')) imported.layoutInvert = params.get('layoutInvert') === 'true';
      if (params.has('hideZapperContent')) imported.hideZapperContent = params.get('hideZapperContent') === 'true';
      if (params.has('showTopZappers')) imported.showTopZappers = params.get('showTopZappers') === 'true';
      if (params.has('podium')) imported.podium = params.get('podium') === 'true';
      if (params.has('zapGrid')) imported.zapGrid = params.get('zapGrid') === 'true';
      if (params.has('sectionLabels')) imported.sectionLabels = params.get('sectionLabels') === 'true';
      if (params.has('qrOnly')) imported.qrOnly = params.get('qrOnly') === 'true';
      if (params.has('showFiat')) imported.showFiat = params.get('showFiat') === 'true';
      if (params.has('showHistoricalPrice')) imported.showHistoricalPrice = params.get('showHistoricalPrice') === 'true';
      if (params.has('showHistoricalChange')) imported.showHistoricalChange = params.get('showHistoricalChange') === 'true';
      if (params.has('fiatOnly')) imported.fiatOnly = params.get('fiatOnly') === 'true';
      if (params.has('lightning')) imported.lightning = params.get('lightning') === 'true';
      if (params.has('selectedCurrency')) imported.selectedCurrency = params.get('selectedCurrency') || undefined;
      if (params.has('partnerLogo')) {
        const logo = params.get('partnerLogo') || '';
        imported.partnerLogo = logo;
        setShowCustomLogo(!partnerLogoPresets.includes(logo) && logo !== '');
      }
      
      setStyles(prev => ({ ...DEFAULT_STYLES, ...prev, ...imported }));
      setUrlImport('');
    } catch (e) {
      alert('Invalid URL format. Please paste a valid LivePage URL with style parameters.');
    }
  }, [urlImport, bgImagePresets, partnerLogoPresets]);

  const resetToDefaults = useCallback(() => {
    setStyles({ ...DEFAULT_STYLES });
    setShowCustomBg(false);
    setShowCustomLogo(false);
    // Notify parent that styles have been reset to defaults
    if (onChange) {
      onChange({});
    }
  }, [onChange]);

  // Expose reset function via ref if provided
  React.useEffect(() => {
    if (resetRef) {
      resetRef.current = resetToDefaults;
    }
    return () => {
      if (resetRef) {
        resetRef.current = null;
      }
    };
  }, [resetRef, resetToDefaults]);

  const handleSave = useCallback(() => {
    // Only include non-default values to keep config clean
    const cleaned: StyleConfig = {};
    Object.entries(styles).forEach(([key, value]) => {
      const k = key as keyof StyleConfig;
      if (value !== DEFAULT_STYLES[k]) {
        cleaned[k] = value;
      }
    });
    onSave(cleaned);
  }, [styles, onSave]);

  const presets: Record<string, Partial<StyleConfig>> = {
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
      opacity: 0.7,
      textOpacity: 1.0,
      partnerLogo: 'https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg'
    }
  };

  const applyPreset = useCallback((presetName: string) => {
    const preset = presets[presetName];
    if (preset) {
      // Start with DEFAULT_STYLES, then apply preset values (preset overrides defaults)
      const updatedStyles = { ...DEFAULT_STYLES, ...preset };
      setStyles(updatedStyles);
      setShowCustomBg(!!preset.bgImage && !bgImagePresets.includes(preset.bgImage || ''));
      setShowCustomLogo(!!preset.partnerLogo && !partnerLogoPresets.includes(preset.partnerLogo || ''));
      
      // Notify parent component of the change immediately
      if (onChange) {
        // For presets, include all preset values explicitly, even if they match defaults
        // This ensures that previous non-default values are properly overridden
        const cleaned: StyleConfig = {};
        // Include all preset values
        Object.entries(preset).forEach(([k, v]) => {
          const kk = k as keyof StyleConfig;
          // Only include if value is not undefined
          if (v !== undefined) {
            // For empty strings, include them to clear the value
            if (v === '' || v === null) {
              (cleaned as any)[kk] = undefined;
            } else {
              (cleaned as any)[kk] = v;
            }
          }
        });
        onChange(cleaned);
      }
    }
  }, [onChange]);

  return (
    <div>
      {/* Style Presets Section */}
      <div className="style-section">
        <h3 className="section-title">QUICK PRESETS</h3>
        <div className="presets-container">
          {Object.entries(presets).map(([name, _]) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className="preset-btn"
            >
              {name === 'bitcoinConf' ? 'Bitcoin Conf' : name === 'lightMode' ? 'Light Mode' : name === 'darkMode' ? 'Dark Mode' : name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Colors Section */}
      <div className="style-section">
        <h3 className="section-title">COLORS</h3>
        <div className="colors-container">
          <div className="style-option-group">
            <label htmlFor="textColorPicker">Text Color</label>
            <div className="color-picker-container">
              <input
                type="color"
                id="textColorPicker"
                value={styles.textColor || DEFAULT_STYLES.textColor}
                onChange={(e) => updateStyle('textColor', e.target.value)}
              />
              <input
                type="text"
                id="textColorValue"
                value={styles.textColor || DEFAULT_STYLES.textColor}
                onChange={(e) => updateStyle('textColor', e.target.value)}
                placeholder="#000000"
              />
            </div>
          </div>
          <div className="style-option-group">
            <label htmlFor="bgColorPicker">Background Color</label>
            <div className="color-picker-container">
              <input
                type="color"
                id="bgColorPicker"
                value={styles.bgColor || DEFAULT_STYLES.bgColor}
                onChange={(e) => updateStyle('bgColor', e.target.value)}
              />
              <input
                type="text"
                id="bgColorValue"
                value={styles.bgColor || DEFAULT_STYLES.bgColor}
                onChange={(e) => updateStyle('bgColor', e.target.value)}
                placeholder="#ffffff"
              />
            </div>
          </div>
        </div>
        <div className="opacity-container">
          <div className="style-option-group">
            <label htmlFor="textOpacitySlider">Text Opacity</label>
            <div className="slider-container">
              <input
                type="range"
                id="textOpacitySlider"
                min="0.1"
                max="1.0"
                step="0.1"
                value={styles.textOpacity ?? DEFAULT_STYLES.textOpacity}
                onChange={(e) => updateStyle('textOpacity', parseFloat(e.target.value))}
              />
              <span id="textOpacityValue">{Math.round((styles.textOpacity ?? DEFAULT_STYLES.textOpacity) * 100)}%</span>
            </div>
          </div>
          <div className="style-option-group">
            <label htmlFor="opacitySlider">Background Opacity</label>
            <div className="slider-container">
              <input
                type="range"
                id="opacitySlider"
                min="0.0"
                max="1.0"
                step="0.1"
                value={styles.opacity ?? DEFAULT_STYLES.opacity}
                onChange={(e) => updateStyle('opacity', parseFloat(e.target.value))}
              />
              <span id="opacityValue">{Math.round((styles.opacity ?? DEFAULT_STYLES.opacity) * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Background Image Section */}
      <div className="style-section">
        <h3 className="section-title">BACKGROUND</h3>
        <div className="style-option-group full-width">
          <label htmlFor="bgImagePreset">Choose Background</label>
          <div className="bg-preset-controls">
            <div className="preset-inputs">
              <select
                id="bgImagePreset"
                className="bg-preset-select"
                value={bgImagePresets.includes(styles.bgImage || '') ? styles.bgImage : showCustomBg ? 'custom' : ''}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setShowCustomBg(true);
                  } else {
                    setShowCustomBg(false);
                    updateStyle('bgImage', e.target.value || undefined);
                  }
                }}
              >
                <option value="">No Background (Default)</option>
                <option value="/live/images/adopting.webp">Adopting Bitcoin</option>
                <option value="/live/images/sky.jpg">Sky</option>
                <option value="/live/images/lightning.gif">Lightning</option>
                <option value="/live/images/bitcoin-rocket.gif">Bitcoin Rocket</option>
                <option value="/live/images/bitcoin-astronaut.gif">Bitcoin Astronaut</option>
                <option value="/live/images/bitcoin-space.gif">Bitcoin Space</option>
                <option value="/live/images/bitcoin-sunset.gif">Bitcoin Sunset</option>
                <option value="/live/images/bitcoin-rotating.gif">Bitcoin Rotating</option>
                <option value="/live/images/nostr-ostriches.gif">Nostr Ostriches</option>
                <option value="/live/images/send-zaps.gif">Send Zaps</option>
                <option value="/live/images/gm-nostr.gif">GM Nostr</option>
                <option value="custom">Custom URL</option>
              </select>
              <div
                className="url-input-container"
                style={{ display: showCustomBg ? 'flex' : 'none', flexDirection: 'row', gap: 8 }}
              >
                <input
                  type="text"
                  id="bgImageUrl"
                  value={styles.bgImage || ''}
                  onChange={(e) => updateStyle('bgImage', e.target.value || undefined)}
                  placeholder="Enter image URL"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e9ecef',
                    borderRadius: 8,
                    fontSize: '14px'
                  }}
                />
                <button
                  id="clearBgImage"
                  className="clear-button"
                  onClick={() => {
                    updateStyle('bgImage', undefined);
                    setShowCustomBg(false);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="preset-preview-container">
              <img
                id="bgPresetPreview"
                src={styles.bgImage || ''}
                alt={styles.bgImage ? 'Background preview' : 'No background'}
                style={{ display: styles.bgImage ? 'block' : 'none' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Partner Logo Section */}
      <div className="style-section">
        <h3 className="section-title">PARTNER LOGO</h3>
        <div className="style-option-group full-width">
          <label htmlFor="partnerLogoSelect">Partner Logo</label>
          <div className="partner-logo-controls">
            <div className="preset-inputs">
              <select
                id="partnerLogoSelect"
                className="partner-logo-select"
                value={partnerLogoPresets.includes(styles.partnerLogo || '') ? styles.partnerLogo : showCustomLogo ? 'custom' : ''}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setShowCustomLogo(true);
                  } else {
                    setShowCustomLogo(false);
                    updateStyle('partnerLogo', e.target.value || undefined);
                  }
                }}
              >
                <option value="">None (Default)</option>
                <option value="https://adoptingbitcoin.org/images/AB-logo.svg">Adopting Bitcoin</option>
                <option value="https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg">Bitcoin Conference</option>
                <option value="custom">Custom URL</option>
              </select>
              <div
                className="url-input-container"
                style={{ display: showCustomLogo ? 'flex' : 'none', flexDirection: 'row', gap: 8 }}
              >
                <input
                  type="text"
                  id="partnerLogoUrl"
                  value={styles.partnerLogo || ''}
                  onChange={(e) => updateStyle('partnerLogo', e.target.value || undefined)}
                  placeholder="Enter logo URL"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e9ecef',
                    borderRadius: 8,
                    fontSize: '14px'
                  }}
                />
                <button
                  id="clearPartnerLogo"
                  className="clear-button"
                  onClick={() => {
                    updateStyle('partnerLogo', undefined);
                    setShowCustomLogo(false);
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="preset-preview-container">
              <img
                id="partnerLogoPreview"
                src={styles.partnerLogo || '/live/images/gradient_color.gif'}
                alt={styles.partnerLogo ? 'Partner logo' : 'No partner logo'}
                style={{
                  height: '30px',
                  maxWidth: '100px',
                  objectFit: 'contain',
                  display: styles.partnerLogo ? 'block' : 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Layout Section */}
      <div className="style-section">
        <h3 className="section-title">LAYOUT</h3>
        <div className="toggles-container">
          {[
            { key: 'layoutInvert' as const, label: 'Invert Layout' },
            { key: 'hideZapperContent' as const, label: 'Hide Zapper Content' },
            { key: 'showTopZappers' as const, label: 'Show All Time Zappers' },
            { key: 'podium' as const, label: 'Top 3 Podium' },
            { key: 'zapGrid' as const, label: 'Grid Layout' },
            { key: 'sectionLabels' as const, label: 'Show Section Labels' },
            { key: 'qrOnly' as const, label: 'QR Only (Hide Everything Else)' }
          ].map(({ key, label }) => (
            <div key={key} className="style-option-group toggle-group">
              <label className="toggle-label">
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={styles[key] ?? DEFAULT_STYLES[key]}
                    onChange={(e) => updateStyle(key, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </div>
                <span>{label}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Fiat Currency Section */}
      <div className="style-section">
        <h3 className="section-title">FIAT CURRENCY</h3>
        <div className="toggles-container">
          {[
            { key: 'showFiat' as const, label: 'Show Fiat Amounts' },
            { key: 'showHistoricalPrice' as const, label: 'Show Historical Prices' },
            { key: 'showHistoricalChange' as const, label: 'Show Historical Change %' },
            { key: 'fiatOnly' as const, label: 'Fiat Only' }
          ].map(({ key, label }) => (
            <div key={key} className="style-option-group toggle-group">
              <label className="toggle-label">
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={styles[key] ?? DEFAULT_STYLES[key]}
                    onChange={(e) => updateStyle(key, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </div>
                <span>{label}</span>
              </label>
            </div>
          ))}
        </div>
        {(styles.showFiat ?? DEFAULT_STYLES.showFiat) && (
          <div className="style-option-group" style={{ marginTop: 15 }}>
            <label htmlFor="currencySelector">Currency</label>
            <select
              id="currencySelector"
              value={styles.selectedCurrency || DEFAULT_STYLES.selectedCurrency}
              onChange={(e) => updateStyle('selectedCurrency', e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="CHF">CHF</option>
              <option value="AUD">AUD</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
        )}
      </div>

      {/* QR Code Effects Section */}
      <div className="style-section">
        <h3 className="section-title">QR CODE EFFECTS</h3>
        <div className="toggles-container">
          {[
            { key: 'qrInvert' as const, label: 'Invert QR Code' },
            { key: 'qrScreenBlend' as const, label: 'Screen Blend Mode' },
            { key: 'qrMultiplyBlend' as const, label: 'Multiply Blend Mode' }
          ].map(({ key, label }) => (
            <div key={key} className="style-option-group toggle-group">
              <label className="toggle-label">
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={styles[key] ?? DEFAULT_STYLES[key]}
                    onChange={(e) => updateStyle(key, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </div>
                <span>{label}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* QR Slide Visibility Section */}
      <div className="style-section">
        <h3 className="section-title">QR SLIDE VISIBILITY</h3>
        <div className="toggles-container">
          {[
            { key: 'qrShowWebLink' as const, label: 'Show Web Link' },
            { key: 'qrShowNevent' as const, label: 'Show Nostr Event' },
            { key: 'qrShowNote' as const, label: 'Show Note ID' },
            { key: 'lightning' as const, label: 'Enable Lightning Payments' }
          ].map(({ key, label }) => (
            <div key={key} className="style-option-group toggle-group">
              <label className="toggle-label">
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={styles[key] ?? DEFAULT_STYLES[key]}
                    onChange={(e) => updateStyle(key, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </div>
                <span>{label}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* URL Import Section - Moved to End */}
      <div className="style-section">
        <h3 className="section-title">IMPORT FROM URL</h3>
        <div className="style-option-group full-width">
          <label htmlFor="urlImportInput">LivePage URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="urlImportInput"
              type="text"
              value={urlImport}
              onChange={(e) => setUrlImport(e.target.value)}
              placeholder="Paste a styled LivePage URL here..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #e9ecef',
                borderRadius: 8,
                fontSize: '14px'
              }}
            />
            <button
              onClick={importFromUrl}
              disabled={!urlImport.trim()}
              className="action-btn primary"
              style={{
                minWidth: '100px',
                opacity: urlImport.trim() ? 1 : 0.5,
                cursor: urlImport.trim() ? 'pointer' : 'not-allowed'
              }}
            >
              Import
            </button>
          </div>
        </div>
      </div>

      {renderButtons && (
        <>
          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: 12, 
            marginTop: 24, 
            paddingTop: 16, 
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={resetToDefaults}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#f3f4f6',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Reset to Defaults
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#f3f4f6',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#4a75ff',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Save Styles
            </button>
          </div>
        </>
      )}
    </div>
  );
};

