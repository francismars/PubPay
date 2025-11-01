import React, { useCallback, useState } from 'react';

const API_BASE =
  (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env
    ?.VITE_BACKEND_URL || 'http://localhost:3002';

interface ApiEndpoint {
  name: string;
  endpoint: string;
  expand?: string;
  description?: string;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  {
    name: 'Event Info',
    endpoint: '/api/events/{event}/',
    description: 'Get event information'
  },
  {
    name: 'Schedules List',
    endpoint: '/api/events/{event}/schedules/',
    description: 'List all schedule versions'
  },
  {
    name: 'Latest Schedule',
    endpoint: '/api/events/{event}/schedules/latest/',
    expand: 'slots,slots.room,slots.submission.speakers',
    description: 'Get latest schedule with expanded slots'
  },
  {
    name: 'WIP Schedule',
    endpoint: '/api/events/{event}/schedules/wip/',
    expand: 'slots,slots.room,slots.submission.speakers',
    description: 'Get WIP schedule with expanded slots'
  },
  {
    name: 'Slots (all)',
    endpoint: '/api/events/{event}/slots/',
    expand: 'room,submission.speakers',
    description: 'Get all slots with expansions'
  },
  {
    name: 'Submissions',
    endpoint: '/api/events/{event}/submissions/',
    expand: 'speakers,speakers.answers,slot',
    description: 'Get all submissions'
  },
  {
    name: 'Questions',
    endpoint: '/api/events/{event}/questions/',
    description: 'List all questions'
  },
  {
    name: 'Answers',
    endpoint: '/api/events/{event}/answers/',
    expand: 'submission,speaker,question',
    description: 'List all answers with related entities'
  },
  {
    name: 'Rooms',
    endpoint: '/api/events/{event}/rooms/',
    description: 'Get all rooms'
  },
  {
    name: 'Speakers',
    endpoint: '/api/events/{event}/speakers/',
    description: 'Get all speakers'
  }
];

// Helper to get endpoints with version filter
const getVersionFilteredEndpoints = (version?: string): ApiEndpoint[] => {
  if (!version) return [];
  return [
    {
      name: `Slots (version: ${version})`,
      endpoint: `/api/events/{event}/slots/?schedule_version=${encodeURIComponent(version)}`,
      expand: 'room,submission.speakers',
      description: `Get slots filtered by version: ${version}`
    }
  ];
};

export const PretalxDiagnosePage: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState('');
  const [event, setEvent] = useState('');
  const [token, setToken] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<unknown | null>(null);
  const [diagnose, setDiagnose] = useState<unknown | null>(null);
  const [apiResults, setApiResults] = useState<
    Record<string, { data?: unknown; error?: string; endpoint?: string }>
  >({});

  // Schedule/Room drilldown
  const [schedules, setSchedules] = useState<
    Array<{ id?: string | number; version?: string; published?: string | null }>
  >([]);
  const [rooms, setRooms] = useState<
    Array<{ id?: string | number; name?: string | number }>
  >([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [roomPreview, setRoomPreview] = useState<unknown | null>(null);

  const runHealth = useCallback(async () => {
    setBusy(true);
    setError(null);
    setHealth(null);
    try {
      const params = new URLSearchParams();
      // Only include these if provided, backend will use env vars as fallback
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (event) params.set('event', event);
      if (token) params.set('token', token);
      const res = await fetch(
        `${API_BASE}/multi/pretalx/health?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Health failed');
      setHealth(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token]);

  const runDiagnose = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDiagnose(null);
    try {
      const params = new URLSearchParams();
      // Only include these if provided, backend will use env vars as fallback
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (event) params.set('event', event);
      if (token) params.set('token', token);
      if (version) params.set('version', version);
      const res = await fetch(
        `${API_BASE}/multi/pretalx/diagnose?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Diagnose failed');
      setDiagnose(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token, version]);

  const callApiEndpoint = useCallback(
    async (endpoint: ApiEndpoint) => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        // Only include these if provided, backend will use env vars as fallback
        if (baseUrl) params.set('baseUrl', baseUrl);
        if (event) params.set('event', event);
        if (token) params.set('token', token);
        params.set('endpoint', endpoint.endpoint);
        if (endpoint.expand) params.set('expand', endpoint.expand);
        const res = await fetch(
          `${API_BASE}/multi/pretalx/call?${params.toString()}`
        );
        const json = await res.json();
        setApiResults(prev => ({
          ...prev,
          [endpoint.name]: {
            data: json.success ? json.data : undefined,
            error: json.success ? undefined : json.error || 'Request failed',
            endpoint: json.endpoint || endpoint.endpoint
          }
        }));
      } catch (e: unknown) {
        setApiResults(prev => ({
          ...prev,
          [endpoint.name]: {
            error: e instanceof Error ? e.message : 'Error'
          }
        }));
      } finally {
        setBusy(false);
      }
    },
    [baseUrl, event, token]
  );

  // Schedules list → rooms in version → load room preview
  const fetchSchedules = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSchedules([]);
    setRooms([]);
    setRoomPreview(null);
    try {
      const params = new URLSearchParams();
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (event) params.set('event', event);
      if (token) params.set('token', token);
      const res = await fetch(
        `${API_BASE}/multi/pretalx/schedules?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to fetch schedules');
      const list = (json.data?.schedules || []) as Array<{
        id?: string | number;
        version?: string;
        published?: string | null;
      }>;
      setSchedules(list);
      if (!selectedVersion && list.length)
        setSelectedVersion((list[0].version || '').toString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token, selectedVersion]);

  const loadRoomsForVersion = useCallback(async () => {
    if (!selectedVersion) {
      setError('Select a schedule version first');
      return;
    }
    setBusy(true);
    setError(null);
    setRooms([]);
    setRoomPreview(null);
    try {
      const params = new URLSearchParams();
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (event) params.set('event', event);
      if (token) params.set('token', token);
      params.set('version', selectedVersion);
      const res = await fetch(
        `${API_BASE}/multi/pretalx/preview?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to load preview');
      const slots = (json.data?.slots || []) as Array<{
        room?: { id?: string | number; name?: string | number };
      }>;
      const stageMap = new Map<
        string,
        { id?: string | number; name?: string | number }
      >();
      for (const s of slots) {
        const rid = s.room?.id;
        if (rid == null) continue;
        const key = String(rid);
        if (!stageMap.has(key))
          stageMap.set(key, { id: rid, name: s.room?.name });
      }
      const list = Array.from(stageMap.values());
      setRooms(list);
      if (!selectedRoomId && list.length)
        setSelectedRoomId(String(list[0].id ?? ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token, selectedVersion, selectedRoomId]);

  const loadSelectedRoom = useCallback(async () => {
    if (!selectedVersion) {
      setError('Select a schedule version first');
      return;
    }
    if (!selectedRoomId) {
      setError('Select a room first');
      return;
    }
    setBusy(true);
    setError(null);
    setRoomPreview(null);
    try {
      const params = new URLSearchParams();
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (event) params.set('event', event);
      if (token) params.set('token', token);
      params.set('version', selectedVersion);
      params.set('roomId', selectedRoomId);
      const res = await fetch(
        `${API_BASE}/multi/pretalx/preview?${params.toString()}`
      );
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || 'Failed to load room preview');
      setRoomPreview(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token, selectedVersion, selectedRoomId]);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div className="app-header">
        <h2>Pretalx Diagnose</h2>
        <p className="app-description">
          Check connectivity and list counts for common endpoints
        </p>
      </div>
      <label>
        Pretalx Base URL (optional - uses PRETALX_BASE_URL from env if empty)
      </label>
      <input
        value={baseUrl}
        onChange={e => setBaseUrl(e.target.value)}
        placeholder="https://pretalx.example.com"
      />
      <label>
        Event Slug (optional - uses PRETALX_EVENT from env if empty)
      </label>
      <input
        value={event}
        onChange={e => setEvent(e.target.value)}
        placeholder="event-2025"
      />
      <label>API Token (optional - uses PRETALX_TOKEN from env if empty)</label>
      <input
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Token ..."
      />
      <label>Schedule Version (optional)</label>
      <input
        value={version}
        onChange={e => setVersion(e.target.value)}
        placeholder="e.g. wip or 2025-10-27"
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={runHealth} disabled={busy}>
          Health
        </button>
        <button onClick={runDiagnose} disabled={busy}>
          Diagnose
        </button>
        <button onClick={fetchSchedules} disabled={busy}>
          Fetch schedules
        </button>
      </div>
      {error && (
        <div
          style={{
            color: 'red',
            padding: 8,
            background: '#ffe6e6',
            borderRadius: 4
          }}
        >
          {error}
        </div>
      )}

      {/* Version → Room → Preview */}
      <div
        style={{ borderTop: '2px solid #ddd', paddingTop: 16, marginTop: 16 }}
      >
        <h3 style={{ marginTop: 0 }}>Schedule/Room Preview</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 8,
            alignItems: 'end'
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '0.85em' }}>
              Select version
            </label>
            <select
              value={selectedVersion}
              onChange={e => setSelectedVersion(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">-- choose --</option>
              {schedules.map((s, i) => (
                <option
                  key={`${s.id || i}`}
                  value={(s.version || '').toString()}
                >
                  {(s.version || '').toString()}{' '}
                  {s.published ? `(published ${s.published})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85em' }}>
              Select room
            </label>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">-- choose --</option>
              {rooms.map((r, i) => (
                <option key={`${r.id || i}`} value={String(r.id ?? '')}>
                  {String(r.name ?? r.id ?? '')}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={loadRoomsForVersion}
              disabled={busy || !selectedVersion}
            >
              Load rooms
            </button>
            <button
              onClick={loadSelectedRoom}
              disabled={busy || !selectedVersion || !selectedRoomId}
            >
              Load room preview
            </button>
          </div>
        </div>
        {roomPreview !== null && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Raw Room Preview</h4>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: '#f7f7f7',
                padding: 8,
                borderRadius: 4,
                maxHeight: '400px',
                overflow: 'auto'
              }}
            >
              {JSON.stringify(roomPreview, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div
        style={{ borderTop: '2px solid #ddd', paddingTop: 16, marginTop: 16 }}
      >
        <h3 style={{ marginTop: 0 }}>Individual API Endpoints</h3>
        <p style={{ fontSize: '0.9em', color: '#666', marginBottom: 12 }}>
          Click any button below to test a specific Pretalx API endpoint and see
          the raw response
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...API_ENDPOINTS, ...getVersionFilteredEndpoints(version)].map(
            endpoint => {
              const result = apiResults[endpoint.name];
              const hasResult = result !== undefined;
              return (
                <div
                  key={endpoint.name}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    padding: 12,
                    background: hasResult
                      ? result.error
                        ? '#ffe6e6'
                        : '#f0f9f0'
                      : '#fafafa'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8
                    }}
                  >
                    <div>
                      <button
                        onClick={() => callApiEndpoint(endpoint)}
                        disabled={busy}
                        style={{ padding: '6px 12px', fontSize: '0.9em' }}
                      >
                        {endpoint.name}
                      </button>
                      {endpoint.description && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: '0.85em',
                            color: '#666'
                          }}
                        >
                          {endpoint.description}
                        </span>
                      )}
                    </div>
                    {hasResult && (
                      <span
                        style={{
                          fontSize: '0.75em',
                          color: result.error ? 'red' : 'green'
                        }}
                      >
                        {result.error ? '❌ Error' : '✅ Success'}
                      </span>
                    )}
                  </div>
                  {result?.endpoint && (
                    <div
                      style={{
                        fontSize: '0.75em',
                        color: '#666',
                        marginBottom: 4,
                        fontFamily: 'monospace'
                      }}
                    >
                      {result.endpoint}
                    </div>
                  )}
                  {result?.error && (
                    <div
                      style={{
                        color: 'red',
                        fontSize: '0.9em',
                        marginTop: 8,
                        padding: 8,
                        background: '#fff',
                        borderRadius: 2
                      }}
                    >
                      {result.error}
                    </div>
                  )}
                  {result?.data !== undefined && (
                    <details open={hasResult}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          marginBottom: 4
                        }}
                      >
                        Raw Response
                      </summary>
                      <pre
                        style={{
                          whiteSpace: 'pre-wrap',
                          background: '#fff',
                          padding: 12,
                          borderRadius: 4,
                          fontSize: '0.8em',
                          maxHeight: '400px',
                          overflow: 'auto',
                          marginTop: 8,
                          border: '1px solid #ddd'
                        }}
                      >
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      {health !== null && (
        <div
          style={{ borderTop: '2px solid #ddd', paddingTop: 16, marginTop: 16 }}
        >
          <h4 style={{ margin: '8px 0' }}>Health</h4>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#f7f7f7',
              padding: 8,
              borderRadius: 4,
              maxHeight: '300px',
              overflow: 'auto'
            }}
          >
            {JSON.stringify(health, null, 2)}
          </pre>
        </div>
      )}
      {diagnose !== null && (
        <div
          style={{ borderTop: '2px solid #ddd', paddingTop: 16, marginTop: 16 }}
        >
          <h4 style={{ margin: '8px 0' }}>Diagnose</h4>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#f7f7f7',
              padding: 8,
              borderRadius: 4,
              maxHeight: '300px',
              overflow: 'auto'
            }}
          >
            {JSON.stringify(diagnose, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
