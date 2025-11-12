import React, { useState, useCallback, useEffect } from 'react';

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

const DEFAULT_STYLES: Required<StyleConfig> = {
  textColor: '#000000',
  bgColor: '#ffffff',
  bgImage: '',
  opacity: 1.0,
  textOpacity: 1.0,
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
  showFiat: false,
  showHistoricalPrice: false,
  showHistoricalChange: false,
  fiatOnly: false,
  lightning: false,
  selectedCurrency: 'USD',
  partnerLogo: ''
};

interface StyleEditorProps {
  initialStyles?: StyleConfig;
  onSave: (styles: StyleConfig) => void;
  onCancel?: () => void;
  renderButtons?: boolean;
  onChange?: (styles: StyleConfig) => void;
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
  onChange
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
  }, []);

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
      const updatedStyles = { ...DEFAULT_STYLES, ...preset };
      setStyles(updatedStyles);
      setShowCustomBg(!!preset.bgImage && !bgImagePresets.includes(preset.bgImage || ''));
      setShowCustomLogo(!!preset.partnerLogo && !partnerLogoPresets.includes(preset.partnerLogo || ''));
      
      // Notify parent component of the change
      if (onChange) {
        // Only include non-default values when calling onChange
        const cleaned: StyleConfig = {};
        Object.entries(updatedStyles).forEach(([k, v]) => {
          const kk = k as keyof StyleConfig;
          if (v !== DEFAULT_STYLES[kk]) {
            (cleaned as any)[kk] = v;
          }
        });
        onChange(cleaned);
      }
    }
  }, [onChange]);

  return (
    <div style={{ padding: 16 }}>
      {/* Style Presets Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Quick Presets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {Object.entries(presets).map(([name, _]) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              style={{
                padding: '10px 12px',
                background: '#f3f4f6',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                textTransform: 'capitalize',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
            >
              {name === 'bitcoinConf' ? 'Bitcoin Conf' : name}
            </button>
          ))}
        </div>
      </div>

      {/* Colors Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Colors</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>Text Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={styles.textColor || DEFAULT_STYLES.textColor}
                onChange={(e) => updateStyle('textColor', e.target.value)}
                style={{ width: 60, height: 36, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
              />
              <input
                type="text"
                value={styles.textColor || DEFAULT_STYLES.textColor}
                onChange={(e) => updateStyle('textColor', e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: '13px',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>Background Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={styles.bgColor || DEFAULT_STYLES.bgColor}
                onChange={(e) => updateStyle('bgColor', e.target.value)}
                style={{ width: 60, height: 36, border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
              />
              <input
                type="text"
                value={styles.bgColor || DEFAULT_STYLES.bgColor}
                onChange={(e) => updateStyle('bgColor', e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: '13px',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>
              Text Opacity: {Math.round((styles.textOpacity ?? DEFAULT_STYLES.textOpacity) * 100)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={styles.textOpacity ?? DEFAULT_STYLES.textOpacity}
              onChange={(e) => updateStyle('textOpacity', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>
              Background Opacity: {Math.round((styles.opacity ?? DEFAULT_STYLES.opacity) * 100)}%
            </label>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.1"
              value={styles.opacity ?? DEFAULT_STYLES.opacity}
              onChange={(e) => updateStyle('opacity', parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Background Image Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Background</h3>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>Background Image</label>
          <select
            value={bgImagePresets.includes(styles.bgImage || '') ? styles.bgImage : showCustomBg ? 'custom' : ''}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setShowCustomBg(true);
              } else {
                setShowCustomBg(false);
                updateStyle('bgImage', e.target.value || undefined);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: '13px',
              marginBottom: showCustomBg ? 8 : 0
            }}
          >
            <option value="">No Background</option>
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
          {showCustomBg && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={styles.bgImage || ''}
                onChange={(e) => updateStyle('bgImage', e.target.value || undefined)}
                placeholder="Enter image URL"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: '13px'
                }}
              />
              <button
                onClick={() => {
                  updateStyle('bgImage', undefined);
                  setShowCustomBg(false);
                }}
                style={{
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Partner Logo Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Partner Logo</h3>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>Partner Logo</label>
          <select
            value={partnerLogoPresets.includes(styles.partnerLogo || '') ? styles.partnerLogo : showCustomLogo ? 'custom' : ''}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setShowCustomLogo(true);
              } else {
                setShowCustomLogo(false);
                updateStyle('partnerLogo', e.target.value || undefined);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: '13px',
              marginBottom: showCustomLogo ? 8 : 0
            }}
          >
            <option value="">None</option>
            <option value="https://adoptingbitcoin.org/images/AB-logo.svg">Adopting Bitcoin</option>
            <option value="https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg">Bitcoin Conference</option>
            <option value="custom">Custom URL</option>
          </select>
          {showCustomLogo && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text"
                value={styles.partnerLogo || ''}
                onChange={(e) => updateStyle('partnerLogo', e.target.value || undefined)}
                placeholder="Enter logo URL"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: '13px'
                }}
              />
              <button
                onClick={() => {
                  updateStyle('partnerLogo', undefined);
                  setShowCustomLogo(false);
                }}
                style={{
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Layout Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Layout</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'layoutInvert' as const, label: 'Invert Layout' },
            { key: 'hideZapperContent' as const, label: 'Hide Zapper Content' },
            { key: 'showTopZappers' as const, label: 'Show All Time Zappers' },
            { key: 'podium' as const, label: 'Top 3 Podium' },
            { key: 'zapGrid' as const, label: 'Grid Layout' },
            { key: 'sectionLabels' as const, label: 'Show Section Labels' },
            { key: 'qrOnly' as const, label: 'QR Only (Hide Everything Else)' }
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={styles[key] ?? DEFAULT_STYLES[key]}
                onChange={(e) => updateStyle(key, e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Fiat Currency Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Fiat Currency</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'showFiat' as const, label: 'Show Fiat Amounts' },
            { key: 'showHistoricalPrice' as const, label: 'Show Historical Prices' },
            { key: 'showHistoricalChange' as const, label: 'Show Historical Change %' },
            { key: 'fiatOnly' as const, label: 'Fiat Only' }
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={styles[key] ?? DEFAULT_STYLES[key]}
                onChange={(e) => updateStyle(key, e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
        </div>
        {(styles.showFiat ?? DEFAULT_STYLES.showFiat) && (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: '13px' }}>Currency</label>
            <select
              value={styles.selectedCurrency || DEFAULT_STYLES.selectedCurrency}
              onChange={(e) => updateStyle('selectedCurrency', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: '13px'
              }}
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
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>QR Code Effects</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'qrInvert' as const, label: 'Invert QR Code' },
            { key: 'qrScreenBlend' as const, label: 'Screen Blend Mode' },
            { key: 'qrMultiplyBlend' as const, label: 'Multiply Blend Mode' }
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={styles[key] ?? DEFAULT_STYLES[key]}
                onChange={(e) => updateStyle(key, e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* QR Slide Visibility Section */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>QR Slide Visibility</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'qrShowWebLink' as const, label: 'Show Web Link' },
            { key: 'qrShowNevent' as const, label: 'Show Nostr Event' },
            { key: 'qrShowNote' as const, label: 'Show Note ID' },
            { key: 'lightning' as const, label: 'Enable Lightning Payments' }
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={styles[key] ?? DEFAULT_STYLES[key]}
                onChange={(e) => updateStyle(key, e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px' }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* URL Import Section - Moved to End */}
      <div style={{ marginBottom: 24, padding: 12, background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: '14px' }}>
          Import from LivePage URL
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={urlImport}
            onChange={(e) => setUrlImport(e.target.value)}
            placeholder="Paste a styled LivePage URL here..."
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: '13px'
            }}
          />
          <button
            onClick={importFromUrl}
            disabled={!urlImport.trim()}
            style={{
              padding: '8px 16px',
              background: urlImport.trim() ? '#4a75ff' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: urlImport.trim() ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            Import
          </button>
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

