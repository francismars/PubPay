import React, { useState, useEffect } from 'react';
import { DEFAULT_READ_RELAYS, DEFAULT_WRITE_RELAYS, AuthService } from '@pubpay/shared-services';
import { useUIStore } from '@pubpay/shared-services';
import { GenericQR } from '@pubpay/shared-ui';

interface RelayConfig {
  url: string;
  read: boolean;
  write: boolean;
}

const SettingsPage: React.FC = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [relays, setRelays] = useState<RelayConfig[]>(() => {
    // Initialize with default relays
    // Use DEFAULT_READ_RELAYS for read, DEFAULT_WRITE_RELAYS for write
    const allDefaultRelays = [...new Set([...DEFAULT_READ_RELAYS, ...DEFAULT_WRITE_RELAYS])];
    return allDefaultRelays.map(url => ({
      url,
      read: DEFAULT_READ_RELAYS.includes(url),
      write: DEFAULT_WRITE_RELAYS.includes(url)
    }));
  });
  const [newRelay, setNewRelay] = useState('');
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
        const parsed = JSON.parse(savedRelays);
        // Handle both old format (string[]) and new format (RelayConfig[])
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'string') {
            // Old format: migrate to new format
            const migrated = parsed.map((url: string) => ({ url, read: true, write: true }));
            setRelays(migrated);
            localStorage.setItem('customRelays', JSON.stringify(migrated));
            // Dispatch event to update NostrClient
            try {
              window.dispatchEvent(
                new CustomEvent('relaysUpdated', {
                  detail: {
                    relays: migrated.map(r => r.url),
                    relayConfig: migrated
                  }
                })
              );
            } catch {}
          } else {
            // New format - validate that at least one read and one write relay exists
            const relayConfigs = parsed as RelayConfig[];
            const hasReadRelay = relayConfigs.some(r => r.read);
            const hasWriteRelay = relayConfigs.some(r => r.write);
            
            // If validation fails, reset to default (all enabled)
            if (!hasReadRelay || !hasWriteRelay) {
              console.warn('Invalid relay configuration detected - resetting to defaults');
              const fixed = relayConfigs.map(r => ({ url: r.url, read: true, write: true }));
              setRelays(fixed);
              localStorage.setItem('customRelays', JSON.stringify(fixed));
              useUIStore.getState().openToast('Relay configuration was invalid and has been reset. Please reconfigure your relays.', 'error');
              // Dispatch event to update NostrClient
              try {
                window.dispatchEvent(
                  new CustomEvent('relaysUpdated', {
                    detail: {
                      relays: fixed.map(r => r.url),
                      relayConfig: fixed
                    }
                  })
                );
              } catch {}
            } else {
              setRelays(relayConfigs);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load relays:', e);
      }
    } else {
      // No saved relays - check if useHomeFunctionality already initialized it
      const savedRelaysCheck = localStorage.getItem('customRelays');
      if (savedRelaysCheck) {
        // useHomeFunctionality already initialized, just load it
        try {
          const parsed = JSON.parse(savedRelaysCheck);
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 'url' in parsed[0]) {
            setRelays(parsed as RelayConfig[]);
          }
        } catch (e) {
          console.error('Failed to load relays:', e);
        }
      } else {
        // Initialize from constants and save to localStorage
        const allDefaultRelays = [...new Set([...DEFAULT_READ_RELAYS, ...DEFAULT_WRITE_RELAYS])];
        const initialRelays = allDefaultRelays.map(url => ({
          url,
          read: DEFAULT_READ_RELAYS.includes(url),
          write: DEFAULT_WRITE_RELAYS.includes(url)
        }));
        setRelays(initialRelays);
        localStorage.setItem('customRelays', JSON.stringify(initialRelays));
        // Dispatch event to update NostrClient with initial config
        try {
          window.dispatchEvent(
            new CustomEvent('relaysUpdated', {
              detail: {
                relays: initialRelays.map(r => r.url),
                relayConfig: initialRelays
              }
            })
          );
    } catch {}
      }
    }

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

    relays.forEach(relay => fetchInfo(relay.url));

    return () => {
      cancelled = true;
    };
  }, [relays]);

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
      !relays.some(r => r.url === newRelay)
    ) {
      const updatedRelays = [...relays, { url: newRelay, read: true, write: true }];
      setRelays(updatedRelays);
      localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
      try {
        window.dispatchEvent(
          new CustomEvent('relaysUpdated', {
            detail: { relays: updatedRelays.map(r => r.url) }
          })
        );
      } catch {}
      setNewRelay('');
    }
  };

  const handleRemoveRelay = (relayToRemove: string) => {
    const updatedRelays = relays.filter(relay => relay.url !== relayToRemove);
    setRelays(updatedRelays);
    localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
    try {
      window.dispatchEvent(
        new CustomEvent('relaysUpdated', { 
          detail: { relays: updatedRelays.map(r => r.url) } 
        })
      );
    } catch {}
  };

  const handleRelayTypeChange = (relayUrl: string, type: 'read' | 'write', checked: boolean) => {
    const updatedRelays = relays.map(relay => 
      relay.url === relayUrl ? { ...relay, [type]: checked } : relay
    );
    
    // Validation: Ensure at least one relay has read enabled, and at least one has write enabled
    const hasReadRelay = updatedRelays.some(r => r.read);
    const hasWriteRelay = updatedRelays.some(r => r.write);
    
    if (!checked) {
      // If unchecking, check if this would leave us with no read/write relays
      if (type === 'read' && !hasReadRelay) {
        useUIStore.getState().openToast('At least one relay must be enabled for reading. Cannot disable all read relays.', 'error');
        return;
      }
      if (type === 'write' && !hasWriteRelay) {
        useUIStore.getState().openToast('At least one relay must be enabled for writing. Cannot disable all write relays.', 'error');
        return;
      }
    }
    
    setRelays(updatedRelays);
    localStorage.setItem('customRelays', JSON.stringify(updatedRelays));
    try {
      window.dispatchEvent(
        new CustomEvent('relaysUpdated', { 
          detail: { 
            relays: updatedRelays.map(r => r.url),
            relayConfig: updatedRelays
          } 
        })
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
                Manage your Nostr relay connections. <strong>Read</strong> relays are used to fetch events (posts, profiles, zaps). <strong>Write</strong> relays are used to publish events (when you post or update your profile).
              </p>

              <div className="relayList">
                {relays.map((relay, index) => {
                  const info = relayInfo[relay.url];
                  const statusColor = info?.loading
                    ? '#f59e0b'
                    : info?.ok
                      ? '#10b981'
                      : '#ef4444';
                  const isExpanded = expandedRelay === relay.url;
                  return (
                    <div key={index} className="relayItemCard">
                      <div
                        className="relayItemHeader"
                        onClick={() =>
                          setExpandedRelay(isExpanded ? null : relay.url)
                        }
                      >
                        <span
                          className="relayUrl"
                          title={relay.url}
                        >
                          <span
                            className="relayStatusIndicator"
                            style={{
                              backgroundColor: statusColor
                            }}
                          />
                          {relay.url}
                        </span>
                        <div className="relayControls" onClick={e => e.stopPropagation()}>
                          <label className="relayToggleLabel">
                            <span className="relayToggleText">Read</span>
                            <label className="toggleSwitch">
                              <input
                                type="checkbox"
                                checked={relay.read}
                                onChange={e => handleRelayTypeChange(relay.url, 'read', e.target.checked)}
                                onClick={e => e.stopPropagation()}
                              />
                              <span className="toggleCircle" />
                            </label>
                          </label>
                          <label className="relayToggleLabel">
                            <span className="relayToggleText">Write</span>
                            <label className="toggleSwitch">
                              <input
                                type="checkbox"
                                checked={relay.write}
                                onChange={e => handleRelayTypeChange(relay.url, 'write', e.target.checked)}
                                onClick={e => e.stopPropagation()}
                              />
                              <span className="toggleCircle" />
                            </label>
                          </label>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveRelay(relay.url);
                          }}
                          className="removeButton"
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
                                {info?.name || relay.url}
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
