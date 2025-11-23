import React, { useState, useEffect } from 'react';
import { useUIStore } from '@pubpay/shared-services';
import {
  getNWCConnections,
  saveNWCConnection,
  deleteNWCConnection,
  getActiveNWCConnectionId,
  setActiveNWCConnection,
  generateNWCConnectionId,
  migrateOldNWCConnection,
  type NWCConnection
} from '../utils/nwcStorage';

interface NWCOptionsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const NWCOptionsModal: React.FC<NWCOptionsModalProps> = ({
  isVisible,
  onClose
}) => {
  const [connections, setConnections] = useState<NWCConnection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newUri, setNewUri] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [clearNwcOnLogout, setClearNwcOnLogout] = useState<boolean>(false);
  const [nwcAutoPay, setNwcAutoPay] = useState<boolean>(true);

  // Load connections and migrate old format on mount
  useEffect(() => {
    if (!isVisible) return;
    
    // Migrate old single connection format
    migrateOldNWCConnection();
    
    // Load connections
    const conns = getNWCConnections();
    setConnections(conns);
    setActiveId(getActiveNWCConnectionId());

    // Load preferences
    const clearOnLogout = localStorage.getItem('clearNwcOnLogout');
    if (clearOnLogout === 'true') {
      setClearNwcOnLogout(true);
    }

    const autoPay = localStorage.getItem('nwcAutoPay');
    if (autoPay === 'false') {
      setNwcAutoPay(false);
    } else {
      setNwcAutoPay(true);
    }
  }, [isVisible]);

  const handleAddConnection = async () => {
    if (!newLabel.trim() || !newUri.trim()) {
      setError('Please enter both a label and NWC URI');
      return;
    }

    setError('');
    setValidating(true);

    try {
      // Basic format check
      if (
        !newUri.startsWith('nostr+walletconnect://') &&
        !newUri.startsWith('nostrnwc://')
      ) {
        throw new Error('Invalid NWC URI scheme');
      }

      const { NwcClient } = await import('@pubpay/shared-services');
      const ok = await NwcClient.validate(newUri);
      if (!ok) throw new Error('Could not fetch NWC info from the relay');

      // Fetch capabilities
      let capabilities: NWCConnection['capabilities'] | undefined;
      try {
        const client = new NwcClient(newUri);
        const info = await client.getInfo();
        capabilities = {
          methods: info?.methods || [],
          notifications: info?.notifications || []
        };
      } catch (err) {
        console.warn('Failed to fetch NWC capabilities:', err);
      }

      const connection: NWCConnection = {
        id: generateNWCConnectionId(),
        label: newLabel.trim(),
        uri: newUri.trim(),
        capabilities,
        createdAt: Date.now()
      };

      saveNWCConnection(connection);
      const updated = getNWCConnections();
      setConnections(updated);

      // If this is the first connection, make it active
      if (updated.length === 1) {
        setActiveNWCConnection(connection.id);
        setActiveId(connection.id);
      }

      // Clear form
      setNewLabel('');
      setNewUri('');
      useUIStore.getState().openToast('Connection added!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
    } catch (e) {
      console.error('NWC validation failed:', e);
      const message = e instanceof Error ? e.message : 'Invalid NWC URI';
      setError(message);
      useUIStore.getState().openToast(message, 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), 3000);
    } finally {
      setValidating(false);
    }
  };

  const handleEditConnection = (id: string) => {
    const conn = connections.find(c => c.id === id);
    if (conn) {
      setEditingId(id);
      setNewLabel(conn.label);
      setNewUri(conn.uri);
    }
  };

  const handleUpdateConnection = async () => {
    if (!editingId || !newLabel.trim() || !newUri.trim()) {
      setError('Please enter both a label and NWC URI');
      return;
    }

    setError('');
    setValidating(true);

    try {
      // Basic format check
      if (
        !newUri.startsWith('nostr+walletconnect://') &&
        !newUri.startsWith('nostrnwc://')
      ) {
        throw new Error('Invalid NWC URI scheme');
      }

      const { NwcClient } = await import('@pubpay/shared-services');
      const ok = await NwcClient.validate(newUri);
      if (!ok) throw new Error('Could not fetch NWC info from the relay');

      // Fetch capabilities
      let capabilities: NWCConnection['capabilities'] | undefined;
      try {
        const client = new NwcClient(newUri);
        const info = await client.getInfo();
        capabilities = {
          methods: info?.methods || [],
          notifications: info?.notifications || []
        };
      } catch (err) {
        console.warn('Failed to fetch NWC capabilities:', err);
      }

      const connection: NWCConnection = {
        id: editingId,
        label: newLabel.trim(),
        uri: newUri.trim(),
        capabilities,
        createdAt: connections.find(c => c.id === editingId)?.createdAt || Date.now()
      };

      saveNWCConnection(connection);
      const updated = getNWCConnections();
      setConnections(updated);

      // Clear form
      setEditingId(null);
      setNewLabel('');
      setNewUri('');
      useUIStore.getState().openToast('Connection updated!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
    } catch (e) {
      console.error('NWC validation failed:', e);
      const message = e instanceof Error ? e.message : 'Invalid NWC URI';
      setError(message);
      useUIStore.getState().openToast(message, 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), 3000);
    } finally {
      setValidating(false);
    }
  };

  const handleDeleteConnection = (id: string) => {
    if (window.confirm('Are you sure you want to delete this connection?')) {
      deleteNWCConnection(id);
      const updated = getNWCConnections();
      setConnections(updated);
      
      // Update active ID if needed
      const newActiveId = getActiveNWCConnectionId();
      setActiveId(newActiveId);
      
      useUIStore.getState().openToast('Connection deleted', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), 2000);
    }
  };

  const handleSetActive = (id: string) => {
    setActiveNWCConnection(id);
    setActiveId(id);
    useUIStore.getState().openToast('Active connection changed', 'success', false);
    setTimeout(() => useUIStore.getState().closeToast(), 2000);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('nwcActiveConnectionChanged', { detail: { connectionId: id } }));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewLabel('');
    setNewUri('');
    setError('');
  };

  const handleClearNwcOnLogoutChange = (checked: boolean) => {
    setClearNwcOnLogout(checked);
    localStorage.setItem('clearNwcOnLogout', checked.toString());
  };

  const handleNwcAutoPayChange = (checked: boolean) => {
    setNwcAutoPay(checked);
    localStorage.setItem('nwcAutoPay', checked.toString());
  };

  if (!isVisible) return null;

  return (
    <div
      className="overlayContainer"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none'
      }}
      onClick={onClose}
    >
      <div className="overlayInner" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <p className="label" style={{ marginBottom: '24px' }}>
          Nostr Wallet Connect (NWC) Settings
        </p>

        {/* Existing Connections */}
        <div className="featureBlock" style={{ marginBottom: '24px' }}>
          <h3 className="featureTitle" style={{ marginBottom: '12px' }}>
            Connections
          </h3>
          {connections.length === 0 ? (
            <p className="featureDescription descriptionWithMargin">
              No connections yet. Add one below.
            </p>
          ) : (
            <div style={{ marginTop: '16px' }}>
              {connections.map(conn => (
                <div
                  key={conn.id}
                  style={{
                    padding: '16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    background: activeId === conn.id ? 'var(--bg-secondary)' : 'transparent',
                    borderColor: activeId === conn.id ? '#4a75ff' : 'var(--border-color)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '16px',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          marginBottom: '4px'
                        }}
                      >
                        {conn.label}
                        {activeId === conn.id && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '12px',
                              color: '#4a75ff',
                              fontWeight: 'normal'
                            }}
                          >
                            (Active)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          marginBottom: '8px'
                        }}
                      >
                        {conn.uri.substring(0, 60)}...
                      </div>
                      {conn.capabilities?.methods && conn.capabilities.methods.length > 0 && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-tertiary)',
                            marginTop: '4px'
                          }}
                        >
                          Methods: {conn.capabilities.methods.join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                      {activeId !== conn.id && (
                        <button
                          className="addButton"
                          onClick={() => handleSetActive(conn.id)}
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                          Set Active
                        </button>
                      )}
                      <button
                        className="label"
                        onClick={() => handleEditConnection(conn.id)}
                        style={{
                          fontSize: '12px',
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="label"
                        onClick={() => handleDeleteConnection(conn.id)}
                        style={{
                          fontSize: '12px',
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          color: '#ef4444'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Connection Form */}
        <div className="featureBlock" style={{ marginBottom: '24px' }}>
          <h3 className="featureTitle" style={{ marginBottom: '12px' }}>
            {editingId ? 'Edit Connection' : 'Add New Connection'}
          </h3>
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '6px',
                color: 'var(--text-primary)'
              }}
            >
              Label
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="e.g., My Wallet, Work Wallet, etc."
              className="inputField"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '2px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px 16px',
                width: '100%',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                marginBottom: '6px',
                color: 'var(--text-primary)'
              }}
            >
              NWC URI
            </label>
            <input
              type="text"
              value={newUri}
              onChange={e => setNewUri(e.target.value)}
              placeholder="nostr+walletconnect://..."
              className="inputField"
              style={{
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)',
                border: '2px solid var(--border-color)',
                borderRadius: '6px',
                padding: '12px 16px',
                width: '100%',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'monospace'
              }}
              onKeyPress={e => {
                if (e.key === 'Enter' && !validating) {
                  if (editingId) {
                    handleUpdateConnection();
                  } else {
                    handleAddConnection();
                  }
                }
              }}
            />
          </div>
          {error && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#ef4444'
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {editingId ? (
              <>
                <button
                  className="cta"
                  onClick={handleUpdateConnection}
                  disabled={validating || !newLabel.trim() || !newUri.trim()}
                >
                  {validating ? 'Validating...' : 'Update'}
                </button>
                <button
                  className="label"
                  onClick={handleCancelEdit}
                  disabled={validating}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    padding: '8px 16px'
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="cta"
                onClick={handleAddConnection}
                disabled={validating || !newLabel.trim() || !newUri.trim()}
              >
                {validating ? 'Validating...' : 'Add Connection'}
              </button>
            )}
          </div>
        </div>

        {/* Preferences */}
        <div className="featureBlock">
          <h3 className="featureTitle" style={{ marginBottom: '12px' }}>
            Preferences
          </h3>
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
                When enabled, payments automatically use the active NWC connection. When disabled,
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
                Clear NWC connections on logout
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

        <a
          href="#"
          className="label"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
          style={{ display: 'block', textAlign: 'center', marginTop: '24px' }}
        >
          Close
        </a>
      </div>
    </div>
  );
};
