import React, { useCallback, useState } from 'react';

const API_BASE = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env?.VITE_BACKEND_URL || 'http://localhost:3002';

export const PretalxDiagnosePage: React.FC = () => {
    const [baseUrl, setBaseUrl] = useState('');
    const [event, setEvent] = useState('');
    const [token, setToken] = useState('');
    const [version, setVersion] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [health, setHealth] = useState<unknown | null>(null);
    const [diagnose, setDiagnose] = useState<unknown | null>(null);

    const runHealth = useCallback(async () => {
        setBusy(true); setError(null); setHealth(null);
        try {
            const params = new URLSearchParams();
            if (baseUrl) params.set('baseUrl', baseUrl);
            if (event) params.set('event', event);
            if (token) params.set('token', token);
            const res = await fetch(`${API_BASE}/rooms/pretalx/health?${params.toString()}`);
            const json = await res.json();
            if (!res.ok || !json?.success) throw new Error(json?.error || 'Health failed');
            setHealth(json.data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
        } finally { setBusy(false); }
    }, [baseUrl, event, token]);

    const runDiagnose = useCallback(async () => {
        setBusy(true); setError(null); setDiagnose(null);
        try {
            const params = new URLSearchParams();
            if (baseUrl) params.set('baseUrl', baseUrl);
            if (event) params.set('event', event);
            if (token) params.set('token', token);
            if (version) params.set('version', version);
            const res = await fetch(`${API_BASE}/rooms/pretalx/diagnose?${params.toString()}`);
            const json = await res.json();
            if (!res.ok || !json?.success) throw new Error(json?.error || 'Diagnose failed');
            setDiagnose(json.data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error');
        } finally { setBusy(false); }
    }, [baseUrl, event, token, version]);

    return (
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div className="app-header">
                <h2>Pretalx Diagnose</h2>
                <p className="app-description">Check connectivity and list counts for common endpoints</p>
            </div>
            <label>Pretalx Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://pretalx.example.com" />
            <label>Event Slug</label>
            <input value={event} onChange={e => setEvent(e.target.value)} placeholder="event-2025" />
            <label>API Token</label>
            <input value={token} onChange={e => setToken(e.target.value)} placeholder="Token ..." />
            <label>Schedule Version (optional)</label>
            <input value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g. wip or 2025-10-27" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={runHealth} disabled={busy}>Health</button>
                <button onClick={runDiagnose} disabled={busy}>Diagnose</button>
            </div>
            {error && <div style={{ color: 'red' }}>{error}</div>}
            {health !== null && (
                <div>
                    <h4 style={{ margin: '8px 0' }}>Health</h4>
                    <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8, borderRadius: 4 }}>{JSON.stringify(health, null, 2)}</pre>
                </div>
            )}
            {diagnose !== null && (
                <div>
                    <h4 style={{ margin: '8px 0' }}>Diagnose</h4>
                    <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8, borderRadius: 4 }}>{JSON.stringify(diagnose, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};


