import React, { useState, useEffect } from 'react';
import { useUIStore } from '@pubpay/shared-services';

const SettingsPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [relays, setRelays] = useState<string[]>([
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social'
  ]);
  const [newRelay, setNewRelay] = useState('');
  const [nwcUri, setNwcUri] = useState('');
  const [nwcValidating, setNwcValidating] = useState<boolean>(false);
  const [nwcButtonLabel, setNwcButtonLabel] = useState<string>('Save');
  const [nwcMethods, setNwcMethods] = useState<string[]>([]);
  const [nwcNotifications, setNwcNotifications] = useState<string[]>([]);
  const [nwcError, setNwcError] = useState<string>('');

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
    if (savedNwc) setNwcUri(savedNwc);

    // Load previously detected NWC capabilities
    try {
      const savedCaps = localStorage.getItem('nwcCapabilities');
      if (savedCaps) {
        const parsed = JSON.parse(savedCaps) as { methods?: string[]; notifications?: string[] };
        setNwcMethods(parsed.methods || []);
        setNwcNotifications(parsed.notifications || []);
      }
    } catch {}
  }, []);

  // Derive a safe display identifier for the current NWC URI (no secrets)
  const nwcDisplayId = (() => {
    try {
      if (!nwcUri) return '';
      const normalized = nwcUri
        .replace(/^nostr\+walletconnect:\/\//i, 'https://')
        .replace(/^nostrnwc:\/\//i, 'https://');
      const url = new URL(normalized);
      const id = (url.hostname || '').trim() || (url.pathname || '').replace(/^\/+/, '').trim();
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
    if (newRelay && newRelay.startsWith('wss://') && !relays.includes(newRelay)) {
      const updatedRelays = [...relays, newRelay];
      setRelays(updatedRelays);
      localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
      setNewRelay('');
    }
  };

  const handleRemoveRelay = (relayToRemove: string) => {
    const updatedRelays = relays.filter(relay => relay !== relayToRemove);
    setRelays(updatedRelays);
    localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
  };

  const handleSaveNwc = () => {
    // reset button label
    setNwcButtonLabel('Save');
    setNwcError('');
    if (!nwcUri) {
      localStorage.removeItem('nwcConnectionString');
      localStorage.removeItem('nwcCapabilities');
      setNwcMethods([]);
      setNwcNotifications([]);
      setNwcButtonLabel('Cleared');
      setTimeout(() => setNwcButtonLabel('Save'), 1500);
      return;
    }
    (async () => {
      try {
        setNwcValidating(true);
        setNwcButtonLabel('Validating...');
        // Basic format check
        if (!nwcUri.startsWith('nostr+walletconnect://') && !nwcUri.startsWith('nostrnwc://')) {
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
        setTimeout(() => setNwcButtonLabel('Save'), 1500);
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
      <h1 className="profilePageTitle">
        Settings
      </h1>

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
                Manage your Nostr relay connections for sending and receiving paynotes
              </p>
                
              <div className="relayList">
                {relays.map((relay, index) => (
                  <div key={index} className="relayItem">
                    <span className="relayUrl">
                      {relay}
                    </span>
                    <button
                      onClick={() => handleRemoveRelay(relay)}
                      className="removeButton"
                    >
                      Remove
                    </button>
                  </div>
                ))}
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
                  onChange={(e) => setNewRelay(e.target.value)}
                  placeholder="wss://relay.example.com"
                  className="relayInput"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddRelay();
                    }
                  }}
                />
                <button
                  onClick={handleAddRelay}
                  className="addButton"
                >
                  Add
                </button>
              </div>
            </div>
                
        <div className="featureBlock">
          <h3 className="featureTitle">Nostr Wallet Connect (NWC)</h3>
          <p className="featureDescription descriptionWithMargin">
            Paste your NWC connection URI to pay zaps directly via your wallet.
          </p>
          <div className="addRelayContainer">
            <input
              type="text"
              value={nwcUri}
              onChange={(e) => setNwcUri(e.target.value)}
              placeholder="nostr+walletconnect://..."
              className="relayInput"
              onKeyPress={(e) => {
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
            <div className="featureDescription" style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
              {nwcError}
            </div>
          )}
          {(nwcMethods.length > 0 || nwcNotifications.length > 0) && (
            <div className="featureDescription" style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
              <div style={{ marginBottom: '6px' }}>
                These capabilities correspond to your saved NWC connection{nwcDisplayId ? ` (${nwcDisplayId})` : ''}.
              </div>
              {nwcMethods.length > 0 && (
                <div style={{ marginBottom: '6px' }}>
                  <strong>Supported methods:</strong> {nwcMethods.join(', ')}
                </div>
              )}
              {nwcNotifications.length > 0 && (
                <div>
                  <strong>Notifications:</strong> {nwcNotifications.join(', ')}
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

