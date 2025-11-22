import React, { useState, useEffect } from 'react';
import { useUIStore } from '@pubpay/shared-services';

const WalletPage: React.FC = () => {
  const [nwcUri, setNwcUri] = useState('');
  const [nwcValidating, setNwcValidating] = useState<boolean>(false);
  const [nwcButtonLabel, setNwcButtonLabel] = useState<string>('Save');
  const [nwcMethods, setNwcMethods] = useState<string[]>([]);
  const [nwcNotifications, setNwcNotifications] = useState<string[]>([]);
  const [nwcError, setNwcError] = useState<string>('');
  const [clearNwcOnLogout, setClearNwcOnLogout] = useState<boolean>(false);
  const [nwcAutoPay, setNwcAutoPay] = useState<boolean>(true);

  useEffect(() => {
    // Load NWC connection string
    const savedNwc = localStorage.getItem('nwcConnectionString');
    if (savedNwc) {
      setNwcUri(savedNwc);
    }

    // Load previously detected NWC capabilities
    try {
      const savedCaps = localStorage.getItem('nwcCapabilities');
      if (savedCaps) {
        const parsed = JSON.parse(savedCaps) as {
          methods?: string[];
          notifications?: string[];
        };
        setNwcMethods(parsed.methods || []);
        setNwcNotifications(parsed.notifications || []);
      }
    } catch {}

    // Load clear NWC on logout preference
    const clearOnLogout = localStorage.getItem('clearNwcOnLogout');
    if (clearOnLogout === 'true') {
      setClearNwcOnLogout(true);
    }

    // Load NWC auto-pay preference (defaults to true for backward compatibility)
    const autoPay = localStorage.getItem('nwcAutoPay');
    if (autoPay === 'false') {
      setNwcAutoPay(false);
    } else {
      // Default to true if not set (backward compatibility)
      setNwcAutoPay(true);
    }
  }, []);

  useEffect(() => {
    const savedNwc = localStorage.getItem('nwcConnectionString');

    if (!nwcUri) {
      setNwcButtonLabel(savedNwc ? 'Clear' : 'Save');
      return;
    }

    setNwcButtonLabel(savedNwc && nwcUri === savedNwc ? 'Clear' : 'Save');
  }, [nwcUri]);

  const nwcDisplayId = (() => {
    try {
      if (!nwcUri) return '';

      const normalized = nwcUri
        .replace(/^nostr\+walletconnect:\/\//i, 'https://')
        .replace(/^nostrnwc:\/\//i, 'https://');
      const url = new URL(normalized);
      const id =
        (url.hostname || '').trim() ||
        (url.pathname || '').replace(/^\/+/, '').trim();

      if (!id) return '';
      return id.length > 12 ? `${id.substring(0, 12)}…` : id;
    } catch {
      return '';
    }
  })();

  const handleClearNwcOnLogoutChange = (checked: boolean) => {
    setClearNwcOnLogout(checked);
    localStorage.setItem('clearNwcOnLogout', checked.toString());
  };

  const handleNwcAutoPayChange = (checked: boolean) => {
    setNwcAutoPay(checked);
    localStorage.setItem('nwcAutoPay', checked.toString());
  };

  const handleSaveNwc = () => {
    setNwcError('');

    // If button says "Clear", clear the saved NWC connection
    if (nwcButtonLabel === 'Clear') {
      localStorage.removeItem('nwcConnectionString');
      localStorage.removeItem('nwcCapabilities');
      setNwcUri('');
      setNwcMethods([]);
      setNwcNotifications([]);
      setNwcButtonLabel('Cleared');
      setTimeout(() => setNwcButtonLabel('Save'), 1500);
      return;
    }

    // If empty field, just return to Save state
    if (!nwcUri) {
      setNwcButtonLabel('Save');
      return;
    }

    // Otherwise, validate and save
    (async () => {
      try {
        setNwcValidating(true);
        setNwcButtonLabel('Validating...');
        // Basic format check
        if (
          !nwcUri.startsWith('nostr+walletconnect://') &&
          !nwcUri.startsWith('nostrnwc://')
        ) {
          throw new Error('Invalid NWC URI scheme');
        }
        const { NwcClient } = await import('@pubpay/shared-services');
        const ok = await NwcClient.validate(nwcUri);
        if (!ok) throw new Error('Could not fetch NWC info from the relay');
        // Fetch and persist capabilities for UX
        try {
          const client = new NwcClient(nwcUri);
          const info = await client.getInfo();
          const caps = {
            methods: info?.methods || [],
            notifications: info?.notifications || []
          };
          localStorage.setItem('nwcCapabilities', JSON.stringify(caps));
          setNwcMethods(caps.methods);
          setNwcNotifications(caps.notifications || []);
        } catch (err) {
          console.warn('Failed to fetch NWC capabilities:', err);
          localStorage.removeItem('nwcCapabilities');
          setNwcMethods([]);
          setNwcNotifications([]);
        }
        localStorage.setItem('nwcConnectionString', nwcUri);
        setNwcButtonLabel('Validated!');
        setTimeout(() => setNwcButtonLabel('Clear'), 1500);
      } catch (e) {
        console.error('NWC validation failed:', e);
        const message = e instanceof Error ? e.message : 'Invalid NWC URI';
        setNwcError(message);
        try {
          useUIStore.getState().openToast(message, 'error', false);
          setTimeout(() => {
            try {
              useUIStore.getState().closeToast();
            } catch {}
          }, 2000);
        } catch {}
        setNwcButtonLabel('Failed');
        setTimeout(() => setNwcButtonLabel('Save'), 2000);
      } finally {
        setNwcValidating(false);
      }
    })();
  };

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">Wallet</h1>

      <div className="aboutContainer">
        <div className="aboutContent">
          <section className="aboutSection">
            <div className="featureBlock">
              <h3 className="featureTitle">Nostr Wallet Connect (NWC)</h3>
              <p className="featureDescription descriptionWithMargin">
                Paste your NWC connection URI to pay zaps directly via your
                wallet.
              </p>
              <div className="addRelayContainer">
                <input
                  type="text"
                  value={nwcUri}
                  onChange={e => setNwcUri(e.target.value)}
                  placeholder="nostr+walletconnect://..."
                  className="relayInput"
                  onKeyPress={e => {
                    if (e.key === 'Enter') {
                      handleSaveNwc();
                    }
                  }}
                />
                <button
                  onClick={handleSaveNwc}
                  className="addButton"
                  disabled={nwcValidating}
                >
                  {nwcButtonLabel}
                </button>
              </div>
              {nwcError && (
                <div
                  className="featureDescription"
                  style={{
                    marginTop: '6px',
                    fontSize: '12px',
                    color: '#ef4444'
                  }}
                >
                  {nwcError}
                </div>
              )}
              {(nwcMethods.length > 0 || nwcNotifications.length > 0) && (
                <div
                  className="featureDescription"
                  style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#6b7280'
                  }}
                >
                  <div style={{ marginBottom: '6px' }}>
                    These capabilities correspond to your saved NWC connection
                    {nwcDisplayId ? ` (${nwcDisplayId})` : ''}.
                  </div>
                  {nwcMethods.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Supported methods:</strong>{' '}
                      {nwcMethods.join(', ')}
                    </div>
                  )}
                  {nwcNotifications.length > 0 && (
                    <div>
                      <strong>Notifications:</strong>{' '}
                      {nwcNotifications.join(', ')}
                    </div>
                  )}
                </div>
              )}
              <div className="settingsRow" style={{ marginTop: '16px' }}>
                <div className="settingsRowContent">
                  <p className="featureDescription">
                    Auto-pay with NWC (skip invoice overlay)
                  </p>
                  <p
                    className="featureDescription"
                    style={{
                      fontSize: '11px',
                      color: '#9ca3af',
                      marginTop: '4px',
                      marginBottom: 0
                    }}
                  >
                    When enabled, payments automatically use NWC. When disabled,
                    the invoice overlay will show with a "Pay with NWC" button
                    and other payment options.
                  </p>
                </div>
                <label className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={nwcAutoPay}
                    onChange={e => handleNwcAutoPayChange(e.target.checked)}
                  />
                  <span className="toggleCircle" />
                </label>
              </div>
              <div className="settingsRow" style={{ marginTop: '16px' }}>
                <div className="settingsRowContent">
                  <p className="featureDescription">
                    Clear NWC connection on logout
                  </p>
                </div>
                <label className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={clearNwcOnLogout}
                    onChange={e => handleClearNwcOnLogoutChange(e.target.checked)}
                  />
                  <span className="toggleCircle" />
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WalletPage;

