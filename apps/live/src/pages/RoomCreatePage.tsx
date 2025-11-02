import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiBase } from '../utils/apiBase';

export const RoomCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('My Multi LIVE');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name || 'Untitled Multi LIVE',
        password: password || undefined
      };
      const res = await fetch(`${getApiBase()}/multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success)
        throw new Error(json.error || 'Failed to create Multi LIVE');

      // Store password in sessionStorage if provided, so admin page can load room data
      if (password && password.trim()) {
        sessionStorage.setItem(`room_${json.data.id}_password`, password);
      }

      navigate(`/live/multi/${json.data.id}/admin`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [name, password, navigate]);

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
              <p className="app-description">Create a scheduled multi LIVE</p>
            </div>

            <label>Multi LIVE name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Multi LIVE name"
            />

            <label style={{ marginTop: 8 }}>Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password to access Multi LIVE"
            />

            <div className="button-container" style={{ marginTop: 12 }}>
              <button className="button" onClick={create} disabled={busy}>
                Create Multi LIVE
              </button>
              <button
                className="button outline"
                onClick={() => navigate('/live/multi')}
              >
                Back to Login
              </button>
            </div>

            {error && (
              <div
                className="error-message"
                style={{ display: 'block', marginTop: 8 }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
