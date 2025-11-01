import React, { useState, useEffect } from 'react';
import { RELAYS } from '@pubpay/shared-services';
import { useUIStore } from '@pubpay/shared-services';

const SettingsPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [relays, setRelays] = useState<string[]>([...RELAYS]);
  const [newRelay, setNewRelay] = useState('');
  const [nwcUri, setNwcUri] = useState('');
  const [nwcValidating, setNwcValidating] = useState<boolean>(false);
  const [nwcButtonLabel, setNwcButtonLabel] = useState<string>('Save');
  const [nwcMethods, setNwcMethods] = useState<string[]>([]);
  const [nwcNotifications, setNwcNotifications] = useState<string[]>([]);
  const [nwcError, setNwcError] = useState<string>('');
  const [relayInfo, setRelayInfo] = useState<
    Record<
      string,
      {
        ok: boolean;
        loading: boolean;
        name?: string;
        description?: string;
        software?: string;
        version?: string;
        supported_nips?: number[];
        icon?: string;
        banner?: string;
        auth_required?: boolean;
        payment_required?: boolean;
        min_pow_difficulty?: number;
      }
    >
  >({});
  const [expandedRelay, setExpandedRelay] = useState<string | null>(null);

  useEffect(() => {
    // Load dark mode preference from localStorage
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);

    // Apply dark mode class on mount
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }

    // Load relays from localStorage
    const savedRelays = localStorage.getItem('customRelays');
    if (savedRelays) {
      try {
        setRelays(JSON.parse(savedRelays));
      } catch (e) {
        console.error('Failed to load relays:', e);
      }
    }

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
  }, []);

  // Watch for changes in nwcUri to update button label
  useEffect(() => {
    const savedNwc = localStorage.getItem('nwcConnectionString');

    // If field is empty
    if (!nwcUri) {
      if (savedNwc) {
        // There's a saved connection but field is empty - should be able to clear
        setNwcButtonLabel('Clear');
      } else {
        setNwcButtonLabel('Save');
      }
      return;
    }

    // If field has content
    if (savedNwc && nwcUri === savedNwc) {
      // Field matches saved connection - button should be "Clear"
      setNwcButtonLabel('Clear');
    } else {
      // Field has been modified or is new - button should be "Save"
      setNwcButtonLabel('Save');
    }
  }, [nwcUri]);

  // Fetch NIP-11 info for relays
  useEffect(() => {
    let cancelled = false;
    const fetchInfo = async (url: string) => {
      setRelayInfo(prev => ({
        ...prev,
        [url]: { ...(prev[url] || {}), loading: true }
      }));
      try {
        const httpUrl = url
          .replace('ws://', 'http://')
          .replace('wss://', 'https://');
        const resp = await fetch(httpUrl, {
          headers: { Accept: 'application/nostr+json' }
        });
        if (!resp.ok) throw new Error(String(resp.status));
        const json = await resp.json();
        if (cancelled) return;
        setRelayInfo(prev => ({
          ...prev,
          [url]: {
            ok: true,
            loading: false,
            name: json.name,
            description: json.description,
            software: json.software,
            version: json.version,
            supported_nips: json.supported_nips,
            icon: json.icon,
            banner: json.banner,
            auth_required:
              json?.limitation?.auth_required ?? json.auth_required,
            payment_required:
              json?.limitation?.payment_required ?? json.payment_required,
            min_pow_difficulty:
              json?.limitation?.min_pow_difficulty ?? json.min_pow_difficulty
          }
        }));
      } catch (_e) {
        if (cancelled) return;
        setRelayInfo(prev => ({
          ...prev,
          [url]: { ok: false, loading: false }
        }));
      }
    };
    // kick off fetches for current list
    relays.forEach(r => fetchInfo(r));
    return () => {
      cancelled = true;
    };
  }, [relays]);

  // Derive a safe display identifier for the current NWC URI (no secrets)
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

  const handleDarkModeToggle = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));

    // Apply or remove dark mode class
    if (newDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  const handleAddRelay = () => {
    if (
      newRelay &&
      newRelay.startsWith('wss://') &&
      !relays.includes(newRelay)
    ) {
      const updatedRelays = [...relays, newRelay];
      setRelays(updatedRelays);
      localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
      try {
        window.dispatchEvent(
          new CustomEvent('relaysUpdated', {
            detail: { relays: updatedRelays }
          })
        );
      } catch {}
      setNewRelay('');
    }
  };

  const handleRemoveRelay = (relayToRemove: string) => {
    const updatedRelays = relays.filter(relay => relay !== relayToRemove);
    setRelays(updatedRelays);
    localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
    try {
      window.dispatchEvent(
        new CustomEvent('relaysUpdated', { detail: { relays: updatedRelays } })
      );
    } catch {}
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
      <h1 className="profilePageTitle">Settings</h1>

      <div className="aboutContainer">
        <div className="aboutContent">
          <section className="aboutSection">
            <div className="featureBlockLast">
              <h3 className="featureTitle">Dark Mode</h3>
              <div className="settingsRow">
                <div className="settingsRowContent">
                  <p className="featureDescription">
                    Switch between light and dark theme
                  </p>
                </div>
                <label className="toggleSwitch">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={handleDarkModeToggle}
                  />
                  <span className="toggleCircle" />
                </label>
              </div>
              <p className="featureDescription comingSoonText">
                Toggle dark mode on/off
              </p>
            </div>
          </section>

          <section className="aboutSection">
            <div className="featureBlock">
              <h3 className="featureTitle">Connected Relays</h3>
              <p className="featureDescription descriptionWithMargin">
                Manage your Nostr relay connections for sending and receiving
                paynotes
              </p>

              <div className="relayList">
                {relays.map((relay, index) => {
                  const info = relayInfo[relay];
                  const statusColor = info?.loading
                    ? '#f59e0b'
                    : info?.ok
                      ? '#10b981'
                      : '#ef4444';
                  const isExpanded = expandedRelay === relay;
                  return (
                    <div key={index} className="relayItemCard">
                      <div
                        className="relayItemHeader"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                        onClick={() =>
                          setExpandedRelay(isExpanded ? null : relay)
                        }
                      >
                        <span
                          className="relayUrl"
                          title={relay}
                          style={{ display: 'flex', alignItems: 'center' }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: statusColor,
                              display: 'inline-block',
                              marginRight: 6
                            }}
                          />
                          {relay}
                        </span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveRelay(relay);
                          }}
                          className="removeButton"
                          style={{ marginLeft: 'auto' }}
                        >
                          Remove
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="relayItemBody">
                          {(info?.name || info?.icon) && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: 8
                              }}
                            >
                              {info?.icon && (
                                <img
                                  src={info.icon}
                                  alt="icon"
                                  style={{
                                    width: 24,
                                    height: 24,
                                    marginRight: 8,
                                    borderRadius: 4
                                  }}
                                  onError={e => {
                                    (
                                      e.currentTarget as HTMLImageElement
                                    ).style.display = 'none';
                                  }}
                                />
                              )}
                              <div style={{ fontWeight: 600 }}>
                                {info?.name || relay}
                              </div>
                            </div>
                          )}
                          {info?.banner && (
                            <div style={{ marginBottom: 8 }}>
                              <img
                                src={info.banner}
                                alt="banner"
                                style={{
                                  width: '100%',
                                  maxHeight: 120,
                                  objectFit: 'cover',
                                  borderRadius: 6
                                }}
                                onError={e => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          {info?.description && (
                            <div
                              style={{
                                marginBottom: 8,
                                fontSize: 14,
                                opacity: 0.8
                              }}
                            >
                              {info.description}
                            </div>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                              fontSize: 12,
                              opacity: 0.7
                            }}
                          >
                            {info?.supported_nips && (
                              <div>
                                <strong>NIPs:</strong>{' '}
                                {info.supported_nips.join(', ')}
                              </div>
                            )}
                            {info?.auth_required !== undefined && (
                              <div>
                                <strong>Auth:</strong>{' '}
                                {info.auth_required
                                  ? 'required'
                                  : 'not required'}
                              </div>
                            )}
                            {info?.payment_required !== undefined && (
                              <div>
                                <strong>Payment:</strong>{' '}
                                {info.payment_required
                                  ? 'required'
                                  : 'not required'}
                              </div>
                            )}
                            {typeof info?.min_pow_difficulty === 'number' &&
                              (info.min_pow_difficulty as number) > 0 && (
                                <div>
                                  <strong>PoW:</strong> difficulty{' '}
                                  {info.min_pow_difficulty}
                                </div>
                              )}
                            {info?.software && (
                              <div>
                                <strong>Software:</strong> {info.software}
                                {info.version ? ` ${info.version}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="featureBlockLast">
              <h5>Add New Relay</h5>
              <p className="featureDescription descriptionSmall">
                Add a custom Nostr relay (must start with wss://)
              </p>

              <div className="addRelayContainer">
                <input
                  type="text"
                  value={newRelay}
                  onChange={e => setNewRelay(e.target.value)}
                  placeholder="wss://relay.example.com"
                  className="relayInput"
                  onKeyPress={e => {
                    if (e.key === 'Enter') {
                      handleAddRelay();
                    }
                  }}
                />
                <button onClick={handleAddRelay} className="addButton">
                  Add
                </button>
              </div>
            </div>

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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
