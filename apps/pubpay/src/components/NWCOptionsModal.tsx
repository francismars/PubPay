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
import { TOAST_DURATION, COLORS, Z_INDEX, PROTOCOLS, STORAGE_KEYS, DIMENSIONS } from '../constants';

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

    const autoPay = localStorage.getItem(STORAGE_KEYS.NWC_AUTO_PAY);
    if (autoPay === 'false') {
      setNwcAutoPay(false);
    } else {
      setNwcAutoPay(true);
    }

    // Reset form state when modal opens
    setShowAddForm(false);
    setEditingId(null);
    setNewLabel('');
    setNewUri('');
    setError('');
    setDeleteConfirmId(null);
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
        !newUri.startsWith(PROTOCOLS.NWC)
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

      // Clear form and close
      setNewLabel('');
      setNewUri('');
      setShowAddForm(false);
      useUIStore.getState().openToast('Connection added!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
    } catch (e) {
      console.error('NWC validation failed:', e);
      const message = e instanceof Error ? e.message : 'Invalid NWC URI';
      setError(message);
      useUIStore.getState().openToast(message, 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
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
        !newUri.startsWith(PROTOCOLS.NWC)
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
      setShowAddForm(false);
      useUIStore.getState().openToast('Connection updated!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
    } catch (e) {
      console.error('NWC validation failed:', e);
      const message = e instanceof Error ? e.message : 'Invalid NWC URI';
      setError(message);
      useUIStore.getState().openToast(message, 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.MEDIUM);
    } finally {
      setValidating(false);
    }
  };

  const handleDeleteConnection = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    
    deleteNWCConnection(deleteConfirmId);
    const updated = getNWCConnections();
    setConnections(updated);
    
    // Update active ID if needed
    const newActiveId = getActiveNWCConnectionId();
    setActiveId(newActiveId);
    
    setDeleteConfirmId(null);
    useUIStore.getState().openToast('Connection deleted', 'success', false);
    setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
  };

  const cancelDelete = () => {
    setDeleteConfirmId(null);
  };

  const handleSetActive = (id: string) => {
    setActiveNWCConnection(id);
    setActiveId(id);
    useUIStore.getState().openToast('Active connection changed', 'success', false);
    setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('nwcActiveConnectionChanged', { detail: { connectionId: id } }));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNewLabel('');
    setNewUri('');
    setError('');
    setShowAddForm(false);
  };

  const handleOpenAddForm = () => {
    setShowAddForm(true);
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
    localStorage.setItem(STORAGE_KEYS.NWC_AUTO_PAY, checked.toString());
  };

  if (!isVisible) return null;

  return (
    <div
      className="overlayContainer"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        alignItems: 'flex-start',
        justifyContent: 'center',
        animation: 'none',
        transition: 'none',
        padding: '20px',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarGutter: 'stable',
        width: '100vw',
        boxSizing: 'border-box'
      }}
      onClick={(e) => {
        // Don't close settings modal if delete confirmation is open
        if (!deleteConfirmId) {
          onClose();
        }
      }}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          transform: 'none',
          animation: 'none',
          margin: '20px auto',
          display: 'flex',
          flexDirection: 'column',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--border-color) transparent',
          scrollbarGutter: 'stable'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <p className="label" style={{ marginBottom: '24px' }}>
          Nostr Wallet Connect (NWC) Settings
        </p>

        {/* Existing Connections */}
        <div className="featureBlock" style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: connections.length > 0 ? '16px' : '12px'
            }}
          >
            <h3 className="featureTitle" style={{ margin: 0 }}>
              Connections
            </h3>
            {connections.length > 0 && (
              <button
                onClick={handleOpenAddForm}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: COLORS.PRIMARY,
                  color: COLORS.TEXT_WHITE,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = COLORS.PRIMARY;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  add
                </span>
                Add
              </button>
            )}
          </div>
          {connections.length === 0 && !showAddForm ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)'
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '48px',
                  color: 'var(--text-tertiary)',
                  marginBottom: '16px',
                  display: 'block'
                }}
              >
                account_balance_wallet
              </span>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                No connections yet. Add your first wallet connection to get started.
              </p>
              <button
                onClick={handleOpenAddForm}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: COLORS.PRIMARY,
                  color: COLORS.TEXT_WHITE,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = COLORS.PRIMARY;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  add_circle
                </span>
                Add Connection
              </button>
            </div>
          ) : connections.length === 0 && showAddForm ? (
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'var(--bg-secondary)'
              }}
            >
              <div style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                  }}
                >
                  <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px' }}>
                      add_circle
                    </span>
                    Add New Connection
                  </h3>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-primary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    title="Close"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      close
                    </span>
                  </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginBottom: '8px',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      label
                    </span>
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
                      borderRadius: '8px',
                      padding: '12px 16px',
                      width: '100%',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s ease'
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = COLORS.PRIMARY;
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                    }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginBottom: '8px',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      link
                    </span>
                    NWC Connection URI
                  </label>
                  <textarea
                    value={newUri}
                    onChange={e => setNewUri(e.target.value)}
                    placeholder="nostr+walletconnect://..."
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      width: '100%',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                      minHeight: DIMENSIONS.AVATAR_SIZE,
                      resize: 'vertical',
                      transition: 'border-color 0.2s ease'
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = COLORS.PRIMARY;
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                    }}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', marginBottom: 0 }}>
                    Paste your complete NWC connection string here
                  </p>
                </div>

                {error && (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: COLORS.ERROR
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      error_outline
                    </span>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button
                    onClick={handleAddConnection}
                    disabled={validating || !newLabel.trim() || !newUri.trim()}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      background: validating || !newLabel.trim() || !newUri.trim() ? COLORS.BG_DISABLED : COLORS.PRIMARY,
                      color: COLORS.TEXT_WHITE,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: validating || !newLabel.trim() || !newUri.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      if (!validating && newLabel.trim() && newUri.trim()) {
                        e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!validating && newLabel.trim() && newUri.trim()) {
                        e.currentTarget.style.background = COLORS.PRIMARY;
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    {validating ? (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>
                          refresh
                        </span>
                        Validating...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          add_circle
                        </span>
                        Add Connection
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : connections.length > 0 ? (
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
                    borderColor: activeId === conn.id ? COLORS.PRIMARY : 'var(--border-color)'
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
                              color: COLORS.PRIMARY,
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
                          color: COLORS.ERROR
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          
          {/* Add/Edit Connection Form */}
          {((showAddForm && connections.length > 0) || editingId) && (
            <div
              style={{
                marginTop: '16px',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'var(--bg-secondary)'
              }}
            >
            {/* Form (shown when adding or editing) */}
            <div style={{ padding: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px'
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
                  {editingId ? (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px' }}>
                        edit
                      </span>
                      Edit Connection
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px', verticalAlign: 'middle', marginRight: '8px' }}>
                        add_circle
                      </span>
                      Add New Connection
                    </>
                  )}
                </h3>
                <button
                  onClick={handleCancelEdit}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--bg-primary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  title="Close"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    close
                  </span>
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    label
                  </span>
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
                    borderRadius: '8px',
                    padding: '12px 16px',
                    width: '100%',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = COLORS.PRIMARY;
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    link
                  </span>
                  NWC Connection URI
                </label>
                <textarea
                  value={newUri}
                  onChange={e => setNewUri(e.target.value)}
                  placeholder="nostr+walletconnect://..."
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    border: '2px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    width: '100%',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    minHeight: '80px',
                    resize: 'vertical',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = COLORS.PRIMARY;
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px', marginBottom: 0 }}>
                  Paste your complete NWC connection string here
                </p>
              </div>

              {error && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: COLORS.ERROR
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    error_outline
                  </span>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                {editingId ? (
                  <>
                    <button
                      onClick={handleUpdateConnection}
                      disabled={validating || !newLabel.trim() || !newUri.trim()}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '12px 20px',
                        background: validating || !newLabel.trim() || !newUri.trim() ? COLORS.BG_DISABLED : COLORS.PRIMARY,
                        color: COLORS.TEXT_WHITE,
                        border: 'none',
                        borderRadius: '8px',
                        cursor: validating || !newLabel.trim() || !newUri.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={e => {
                        if (!validating && newLabel.trim() && newUri.trim()) {
                          e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                        }
                      }}
                      onMouseLeave={e => {
                        if (!validating && newLabel.trim() && newUri.trim()) {
                          e.currentTarget.style.background = COLORS.PRIMARY;
                        }
                      }}
                    >
                      {validating ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>
                            refresh
                          </span>
                          Validating...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                            check_circle
                          </span>
                          Update Connection
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={validating}
                      style={{
                        padding: '12px 20px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: validating ? 'not-allowed' : 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={e => {
                        if (!validating) {
                          e.currentTarget.style.background = 'var(--bg-primary)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!validating) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAddConnection}
                    disabled={validating || !newLabel.trim() || !newUri.trim()}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      background: validating || !newLabel.trim() || !newUri.trim() ? COLORS.BG_DISABLED : COLORS.PRIMARY,
                      color: COLORS.TEXT_WHITE,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: validating || !newLabel.trim() || !newUri.trim() ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => {
                      if (!validating && newLabel.trim() && newUri.trim()) {
                        e.currentTarget.style.background = COLORS.PRIMARY_HOVER;
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!validating && newLabel.trim() && newUri.trim()) {
                        e.currentTarget.style.background = COLORS.PRIMARY;
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    {validating ? (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>
                          refresh
                        </span>
                        Validating...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          add_circle
                        </span>
                        Add Connection
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            </div>
          )}
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
                  color: COLORS.BG_DISABLED,
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

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div
          className="overlayContainer"
          style={{
            display: 'flex',
            visibility: 'visible',
            opacity: 1,
            pointerEvents: 'auto',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'none',
            transition: 'none',
            padding: '20px',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarGutter: 'stable',
            width: '100vw',
            boxSizing: 'border-box',
            zIndex: Z_INDEX.MODAL_OVERLAY,
            position: 'fixed',
            top: 0,
            left: 0
          }}
          onClick={(e) => {
            e.stopPropagation();
            cancelDelete();
          }}
        >
          <div
            className="overlayInner"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '400px',
              width: '100%',
              transform: 'none',
              animation: 'none',
              margin: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '32px'
            }}
          >
            <div className="brand" style={{ marginBottom: '20px' }}>
              PUB<span className="logoPay">PAY</span>
              <span className="logoMe">.me</span>
            </div>
            
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '48px',
                  color: COLORS.ERROR,
                  marginBottom: '16px',
                  display: 'block'
                }}
              >
                warning
              </span>
              <h3 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                Delete Connection?
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                Are you sure you want to delete this connection? This action cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={cancelDelete}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: COLORS.ERROR,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: COLORS.TEXT_WHITE,
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = COLORS.ERROR_DARK;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = COLORS.ERROR;
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  delete
                </span>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
