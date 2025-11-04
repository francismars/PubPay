import React, { useState, useEffect } from 'react';
import { RELAYS, AuthService } from '@pubpay/shared-services';
import { useUIStore } from '@pubpay/shared-services';
import { GenericQR } from '@pubpay/shared-ui';

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
  const [showNsec, setShowNsec] = useState(false);
  const [nsec, setNsec] = useState<string | null>(null);
  const [copiedNsec, setCopiedNsec] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordPromptPassword, setPasswordPromptPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

    // Check if user logged in with nsec and load decrypted nsec
    const loadNsec = async () => {
      try {
        const { encryptedPrivateKey, method } = AuthService.getStoredAuthData();
        
        // Only show nsec if user logged in with nsec method
        if (method !== 'nsec') {
          return;
        }

        if (encryptedPrivateKey) {
          // Check if password is required
          if (AuthService.requiresPassword()) {
            // Don't auto-load if password is required - user needs to enter password
            setNsec(null);
            return;
          }
          
          // Decrypt using device key (automatic)
          try {
            const decryptedNsec = await AuthService.decryptStoredPrivateKey();
            if (decryptedNsec) {
              setNsec(decryptedNsec);
            }
          } catch (error) {
            console.error('Failed to decrypt nsec:', error);
            setNsec(null);
          }
        } else {
          // Legacy plaintext format (for backward compatibility)
          const legacyKey = localStorage.getItem('privateKey') || sessionStorage.getItem('privateKey');
          if (legacyKey && !legacyKey.startsWith('{') && !legacyKey.startsWith('[')) {
            setNsec(legacyKey);
          }
        }
      } catch (error) {
        console.error('Failed to load nsec:', error);
      }
    };

    loadNsec();
  }, []);

  useEffect(() => {
    const savedNwc = localStorage.getItem('nwcConnectionString');

    if (!nwcUri) {
      setNwcButtonLabel(savedNwc ? 'Clear' : 'Save');
      return;
    }

    setNwcButtonLabel(savedNwc && nwcUri === savedNwc ? 'Clear' : 'Save');
  }, [nwcUri]);

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
      } catch {
        if (cancelled) return;
        setRelayInfo(prev => ({
          ...prev,
          [url]: { ok: false, loading: false }
        }));
      }
    };

    relays.forEach(fetchInfo);

    return () => {
      cancelled = true;
    };
  }, [relays]);

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

  const handleCopyNsec = () => {
    if (!nsec) return;

    navigator.clipboard.writeText(nsec);
    setCopiedNsec(true);
    setTimeout(() => setCopiedNsec(false), 2000);

    try {
      useUIStore
        .getState()
        .openToast('Nsec copied to clipboard', 'success', false);
      setTimeout(() => {
        try {
          useUIStore.getState().closeToast();
        } catch {}
      }, 2000);
    } catch {}
  };

  const handleRevealNsec = async () => {
    if (showNsec) {
      setShowNsec(false);
      return;
    }

    // Check if password is required
    if (AuthService.requiresPassword() && !nsec) {
      setShowPasswordPrompt(true);
      setPasswordPromptPassword('');
      setPasswordError('');
      return;
    }

    setShowNsec(true);
  };

  const handlePasswordPromptSubmit = async () => {
    if (!passwordPromptPassword.trim()) {
      setPasswordError('Please enter your password');
      return;
    }

    try {
      const decryptedNsec = await AuthService.decryptStoredPrivateKey(passwordPromptPassword.trim());
      if (decryptedNsec) {
        setNsec(decryptedNsec);
        setShowPasswordPrompt(false);
        setShowNsec(true);
        setPasswordPromptPassword('');
        setPasswordError('');
      } else {
        setPasswordError('Unable to decrypt your private key. Please try again.');
      }
    } catch (error) {
      console.error('Failed to decrypt nsec with password:', error);
      // Extract user-friendly error message
      const errorMessage = error instanceof Error 
        ? (error.message.includes('incorrect') || error.message.includes('password') 
            ? error.message 
            : 'Incorrect password. Please check your password and try again.')
        : 'Incorrect password. Please check your password and try again.';
      setPasswordError(errorMessage);
    }
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
            <div className="featureBlock">
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

            {AuthService.isAuthenticated() && AuthService.getStoredAuthData().method === 'nsec' && (
              <div className="featureBlock">
                <h3 className="featureTitle">Keys</h3>
                <p className="featureDescription descriptionWithMargin">
                  Back up your private key (nsec). You used the nsec login method
                  to sign in. Keep this key safe and secure!
                </p>
                
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      background: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px',
                      fontSize: '13px',
                      color: '#92400e'
                    }}
                  >
                    <strong>⚠️ Security Warning:</strong> Never share your nsec with
                    anyone! Anyone with access to your nsec can control your
                    account and steal your funds.
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleRevealNsec}
                      className="addButton"
                      style={{ flex: 'none' }}
                    >
                      {showNsec ? 'Hide Nsec' : 'Reveal Nsec'}
                    </button>
                    
                    {nsec && (
                      <button
                        onClick={() => setShowQRModal(true)}
                        className="addButton"
                        style={{ flex: 'none' }}
                      >
                        Show QR
                      </button>
                    )}
                    
                    {showNsec && (
                      <button
                        onClick={handleCopyNsec}
                        className="addButton"
                        style={{ flex: 'none' }}
                      >
                        {copiedNsec ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  
                  {showNsec && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {nsec}
                    </div>
                  )}
                </div>
                
                <p
                  className="featureDescription"
                  style={{ fontSize: '12px', opacity: 0.7 }}
                >
                  Store your nsec in a secure password manager or write it down
                  and keep it in a safe place. You'll need it to restore your
                  account if you lose access.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Password Prompt Overlay */}
      <div
        className="overlayContainer"
        style={{
          display: 'flex',
          visibility: showPasswordPrompt ? 'visible' : 'hidden',
          opacity: showPasswordPrompt ? 1 : 0,
          pointerEvents: showPasswordPrompt ? 'auto' : 'none',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={() => {
          setShowPasswordPrompt(false);
          setPasswordPromptPassword('');
          setPasswordError('');
        }}
      >
        <div
          className="overlayInner"
          style={{
            textAlign: 'center',
            maxWidth: '400px',
            margin: 'auto'
          }}
          onClick={e => e.stopPropagation()}
        >
          <h3 style={{ margin: '0 0 16px 0' }}>
            Enter Password
          </h3>

          <p style={{
            fontSize: '13px',
            opacity: 0.8,
            marginBottom: '24px'
          }}>
            Your private key is encrypted with a password. Enter your password to reveal it.
          </p>

          <input
            type="password"
            placeholder="Password"
            className="inputField"
            value={passwordPromptPassword}
            onChange={e => {
              setPasswordPromptPassword(e.target.value);
              setPasswordError('');
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handlePasswordPromptSubmit();
              }
            }}
            autoFocus
            style={{
              width: '100%',
              marginBottom: '12px'
            }}
          />

          {passwordError && (
            <div style={{
              color: '#dc2626',
              fontSize: '13px',
              marginBottom: '12px',
              textAlign: 'left'
            }}>
              {passwordError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              className="addButton"
              onClick={() => {
                setShowPasswordPrompt(false);
                setPasswordPromptPassword('');
                setPasswordError('');
              }}
            >
              Cancel
            </button>
            <button
              className="addButton"
              onClick={handlePasswordPromptSubmit}
            >
              Reveal
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {nsec && (
        <div 
          className="overlayContainer"
          style={{
            display: 'flex',
            visibility: showQRModal ? 'visible' : 'hidden',
            opacity: showQRModal ? 1 : 0,
            pointerEvents: showQRModal ? 'auto' : 'none',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setShowQRModal(false)}
        >
          <div
            className="overlayInner"
            style={{ 
              textAlign: 'center', 
              maxWidth: '400px',
              margin: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0' }}>
              Nsec QR Code
            </h3>
            
            <p style={{
              fontSize: '13px',
              opacity: 0.8,
              marginBottom: '24px'
            }}>
              Scan this QR code to import your nsec into a compatible wallet
            </p>

            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '20px',
                display: 'inline-block'
              }}
            >
              <GenericQR data={nsec} width={280} height={280} />
            </div>

            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                color: '#92400e',
                marginBottom: '16px',
                textAlign: 'left'
              }}
            >
              <strong>⚠️ Warning:</strong> Anyone who scans this QR code will have
              full access to your account. Only use this in a secure, private
              location.
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={handleCopyNsec}
                className="addButton"
              >
                {copiedNsec ? '✓ Copied' : 'Copy Nsec'}
              </button>
              <button
                onClick={() => setShowQRModal(false)}
                className="addButton"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
