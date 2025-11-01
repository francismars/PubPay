import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE =
  (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env
    ?.VITE_BACKEND_URL || 'http://localhost:3002';

export const MultiLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidationError, setShowValidationError] = useState(false);

  const login = useCallback(async () => {
    if (!roomId.trim()) {
      setError('Multi LIVE ID is required');
      setShowValidationError(true);
      // Clear validation error after user starts typing
      setTimeout(() => setShowValidationError(false), 3000);
      return;
    }
    setShowValidationError(false);
    setBusy(true);
    setError(null);
    try {
      const url = `${API_BASE}/multi/${roomId}`;
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      // Only include password in body if provided
      const body: { password?: string } = {};
      if (password && password.trim()) {
        body.password = password;
      }

      // Always use POST for consistency and to support password in body
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      let json;
      try {
        json = await res.json();
      } catch (parseError) {
        setError('Invalid response from server');
        return;
      }

      if (res.status === 404) {
        setError('Multi LIVE not found');
        return;
      }

      if (res.status === 401) {
        setError(json?.error || 'Invalid password');
        return;
      }

      if (!res.ok || !json?.success) {
        setError(json?.error || 'Failed to access Multi LIVE');
        return;
      }

      // Store password in sessionStorage temporarily for authenticated requests
      if (password && password.trim()) {
        sessionStorage.setItem(`room_${roomId}_password`, password);
      }

      // Navigate to admin page after successful login
      navigate(`/live/multi/${roomId}/admin`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error accessing Multi LIVE');
    } finally {
      setBusy(false);
    }
  }, [roomId, password, navigate]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !busy) {
        login();
      }
    },
    [login, busy]
  );

  return (
    <div className="live">
      <div id="noteLoaderContainer">
        <div id="noteLoader">
          <div className="note-loader-content">
            <div className="app-header">
              <h1>
                <span style={{ color: '#4a75ff' }}>PUB</span>
                <span style={{ color: '#000' }}>PAY</span>
                <span style={{ color: '#0000001c' }}>.me</span>{' '}
                <span style={{ color: '#5f5f5f' }}>Multi LIVE</span>
              </h1>
              <p className="app-description">
                Access your scheduled multi LIVE
              </p>
            </div>

            <label>MULTI LIVE ID *</label>
            <input
              value={roomId}
              onChange={e => {
                setRoomId(e.target.value);
                if (showValidationError && e.target.value.trim()) {
                  setShowValidationError(false);
                  setError(null);
                }
              }}
              placeholder="Enter Multi LIVE ID"
              onKeyPress={handleKeyPress}
              autoFocus
              required
              style={{
                borderColor: showValidationError ? '#ef4444' : undefined,
                borderWidth: showValidationError ? '2px' : undefined
              }}
            />

            <label style={{ marginTop: 8 }}>Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password if required"
              onKeyPress={handleKeyPress}
            />

            <div className="button-container" style={{ marginTop: 12 }}>
              <button className="button" onClick={login} disabled={busy}>
                {busy ? 'Loading...' : 'Access Multi LIVE'}
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                textAlign: 'center',
                paddingTop: 16,
                borderTop: '1px solid #e5e7eb'
              }}
            >
              <p
                style={{
                  margin: 0,
                  marginBottom: 2,
                  fontSize: '14px',
                  color: '#6b7280'
                }}
              >
                Don't have a Multi LIVE?
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: 0
                }}
              >
                <button
                  className="button outline"
                  onClick={() => navigate('/live/multi/create')}
                  style={{ padding: '4px 12px', fontSize: '14px', margin: 0 }}
                >
                  CREATE NEW
                </button>
              </div>
            </div>

            {error && (
              <div
                className="error-message"
                style={{
                  display: 'block',
                  marginTop: 8,
                  position: 'relative',
                  paddingRight: 28
                }}
              >
                {error}
                <button
                  onClick={() => {
                    setError(null);
                    setShowValidationError(false);
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '18px',
                    lineHeight: 1,
                    padding: '4px 8px',
                    opacity: 0.7
                  }}
                  aria-label="Close error"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
