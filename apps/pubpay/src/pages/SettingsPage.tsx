import React, { useState, useEffect } from 'react';

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
  }, []);

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
    if (!nwcUri) {
      localStorage.removeItem('nwcConnectionString');
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
        localStorage.setItem('nwcConnectionString', nwcUri);
        setNwcButtonLabel('Validated!');
        setTimeout(() => setNwcButtonLabel('Save'), 1500);
      } catch (e) {
        console.error('NWC validation failed:', e);
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
        </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

