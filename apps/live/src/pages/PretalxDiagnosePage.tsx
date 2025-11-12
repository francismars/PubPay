import React, { useCallback, useState } from 'react';

import { getApiBase } from '../utils/apiBase';

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

// Helper to safely render multilingual strings or objects
const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    // Handle multilingual objects like {en: "...", es: "..."}
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      // Try to get English first, then any available language
      if (obj.en && typeof obj.en === 'string') return obj.en;
      if (obj.es && typeof obj.es === 'string') return obj.es;
      // Get first string value found
      const firstString = Object.values(obj).find(v => typeof v === 'string');
      if (firstString) return firstString as string;
      // Fallback to JSON stringify
      return JSON.stringify(value, null, 2);
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
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
  
  // Speaker answers section
  const [speakerAnswers, setSpeakerAnswers] = useState<unknown | null>(null);
  const [speakerAnswersError, setSpeakerAnswersError] = useState<string | null>(null);
  const [filterByQuestionId, setFilterByQuestionId] = useState<boolean>(true);
  const [questionIdFilter, setQuestionIdFilter] = useState<string>('6269');
  const [speakerCache, setSpeakerCache] = useState<Record<string, any>>({});

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
        `${getApiBase()}/multi/pretalx/health?${params.toString()}`
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
        `${getApiBase()}/multi/pretalx/diagnose?${params.toString()}`
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
          `${getApiBase()}/multi/pretalx/call?${params.toString()}`
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
        `${getApiBase()}/multi/pretalx/schedules?${params.toString()}`
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
        `${getApiBase()}/multi/pretalx/preview?${params.toString()}`
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
        `${getApiBase()}/multi/pretalx/preview?${params.toString()}`
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

  const fetchSpeakerAnswers = useCallback(async () => {
    setBusy(true);
    setSpeakerAnswersError(null);
    setSpeakerAnswers(null);
    try {
      // Fetch answers first
      const answersRes = await fetch(`${getApiBase()}/multi/pretalx/call?${new URLSearchParams({
        ...(baseUrl && { baseUrl }),
        ...(event && { event }),
        ...(token && { token }),
        endpoint: `/api/events/{event}/answers/`,
        expand: 'submission,speaker,question'
      }).toString()}`);

      const answersJson = await answersRes.json();

      if (!answersRes.ok || !answersJson?.success)
        throw new Error(answersJson?.error || 'Failed to fetch speaker answers');

      const answers = Array.isArray(answersJson.data) ? answersJson.data : [];
      
      // Check if we need to fetch speakers (only if cache doesn't have all needed speakers)
      const personCodes = new Set<string>();
      answers.forEach((answer: any) => {
        if (!answer?.speaker && answer?.person) {
          const personCode = typeof answer.person === 'string' 
            ? answer.person 
            : answer.person?.code || answer.person;
          if (personCode && typeof personCode === 'string' && !speakerCache[personCode]) {
            personCodes.add(personCode);
          }
        }
      });
      
      // Create speakers map starting with cached speakers
      const speakersMap = new Map<string, any>();
      Object.entries(speakerCache).forEach(([code, speaker]) => {
        speakersMap.set(code, speaker);
      });
      
      // Only fetch speakers if we have missing ones
      if (personCodes.size > 0) {
        const speakersRes = await fetch(`${getApiBase()}/multi/pretalx/call?${new URLSearchParams({
          ...(baseUrl && { baseUrl }),
          ...(event && { event }),
          ...(token && { token }),
          endpoint: `/api/events/{event}/speakers/`
        }).toString()}`);

        const speakersJson = await speakersRes.json();
        
        if (speakersRes.ok && speakersJson?.success) {
          const speakers = Array.isArray(speakersJson.data) ? speakersJson.data : [];
          
          // Add all speakers to map
          speakers.forEach((speaker: any) => {
            if (speaker?.code) {
              speakersMap.set(speaker.code, speaker);
            }
          });
          
          // Update cache with all speakers
          const newCache: Record<string, any> = {};
          speakersMap.forEach((speaker, code) => {
            newCache[code] = speaker;
          });
          setSpeakerCache(prev => ({ ...prev, ...newCache }));
        }
      }
      
      // Merge speaker data directly into answer objects
      const enrichedAnswers = answers.map((answer: any) => {
        // If answer doesn't have speaker but has person code, merge it
        if (!answer?.speaker && answer?.person) {
          const personCode = typeof answer.person === 'string' 
            ? answer.person 
            : answer.person?.code || answer.person;
          if (personCode && typeof personCode === 'string') {
            const speaker = speakersMap.get(personCode);
            if (speaker) {
              return { ...answer, speaker };
            }
          }
        }
        return answer;
      });
      
      setSpeakerAnswers(enrichedAnswers);
    } catch (e: unknown) {
      setSpeakerAnswersError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, event, token, speakerCache]);

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
        <h3 style={{ marginTop: 0 }}>Speaker Answers</h3>
        <p style={{ fontSize: '0.9em', color: '#666', marginBottom: 12 }}>
          Fetch all answers provided by each speaker
        </p>
        <button onClick={fetchSpeakerAnswers} disabled={busy} style={{ marginBottom: 12 }}>
          Fetch All Speaker Answers
        </button>
        {speakerAnswersError && (
          <div
            style={{
              color: 'red',
              padding: 8,
              background: '#ffe6e6',
              borderRadius: 4,
              marginBottom: 12
            }}
          >
            {speakerAnswersError}
          </div>
        )}
        {speakerAnswers !== null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterByQuestionId}
                  onChange={(e) => setFilterByQuestionId(e.target.checked)}
                />
                <span>Filter by Question ID:</span>
              </label>
              <input
                type="text"
                value={questionIdFilter}
                onChange={(e) => setQuestionIdFilter(e.target.value)}
                placeholder="6269"
                disabled={!filterByQuestionId}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  width: '100px'
                }}
              />
            </div>
            {(() => {
              const allAnswers = Array.isArray(speakerAnswers) ? speakerAnswers : [];
              const filteredAnswers = filterByQuestionId && questionIdFilter
                ? allAnswers.filter((answer: any) => {
                    const questionId = answer?.question?.id;
                    return questionId && String(questionId) === String(questionIdFilter);
                  })
                : allAnswers;
              
              return (
                <>
                  <h4 style={{ margin: '8px 0' }}>
                    Answers ({filteredAnswers.length} {filterByQuestionId && questionIdFilter ? 'filtered' : 'total'}
                    {filterByQuestionId && questionIdFilter && filteredAnswers.length !== allAnswers.length
                      ? ` of ${allAnswers.length} total`
                      : ''})
                  </h4>
                  {filteredAnswers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {filteredAnswers.map((answer: any, idx: number) => {
                        const speaker = answer?.speaker;
                        const personCode = answer?.person;
                        const question = answer?.question;
                        const submission = answer?.submission;
                        
                        // Determine speaker display
                        let speakerDisplay = 'Unknown';
                        let speakerCode = '';
                        
                        if (speaker && typeof speaker === 'object') {
                          // Speaker is expanded object (either from API or merged by us)
                          speakerDisplay = renderValue(speaker?.name || speaker?.code || 'Unknown');
                          speakerCode = speaker?.code || '';
                        } else if (personCode) {
                          // Fallback: Only have person code - show it
                          const code = typeof personCode === 'string' ? personCode : personCode?.code || personCode;
                          speakerCode = String(code);
                          // Try cache as last resort
                          if (speakerCache[code]) {
                            speakerDisplay = renderValue(speakerCache[code]?.name || code);
                          } else {
                            speakerDisplay = `Speaker Code: ${code}`;
                          }
                        }
                        
                        return (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        padding: 12,
                        background: '#fafafa'
                      }}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <strong style={{ color: '#333' }}>Speaker:</strong>{' '}
                        <span style={{ color: '#666' }}>
                          {speakerDisplay}
                          {speakerCode && speakerDisplay !== speakerCode && ` (${speakerCode})`}
                        </span>
                      </div>
                      {question && (
                        <div style={{ marginBottom: 8 }}>
                          <strong style={{ color: '#333' }}>Question:</strong>{' '}
                          <span style={{ color: '#666' }}>
                            {renderValue(question?.question || question?.slug || 'Unknown question')}
                          </span>
                        </div>
                      )}
                      {submission && (
                        <div style={{ marginBottom: 8 }}>
                          <strong style={{ color: '#333' }}>Submission:</strong>{' '}
                          <span style={{ color: '#666' }}>
                            {renderValue(submission?.title || submission?.code || 'Unknown submission')}
                          </span>
                        </div>
                      )}
                      <div style={{ marginBottom: 8 }}>
                        <strong style={{ color: '#333' }}>Answer:</strong>
                        <div
                          style={{
                            marginTop: 4,
                            padding: 8,
                            background: '#fff',
                            borderRadius: 4,
                            border: '1px solid #eee',
                            whiteSpace: 'pre-wrap',
                            color: '#333'
                          }}
                        >
                          {renderValue(answer?.answer || answer?.answer_file || 'No answer')}
                        </div>
                      </div>
                      <details style={{ marginTop: 8 }}>
                        <summary
                          style={{
                            cursor: 'pointer',
                            fontSize: '0.85em',
                            color: '#666'
                          }}
                        >
                          View Raw Data
                        </summary>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            background: '#fff',
                            padding: 8,
                            borderRadius: 4,
                            fontSize: '0.75em',
                            maxHeight: '200px',
                            overflow: 'auto',
                            marginTop: 8,
                            border: '1px solid #ddd'
                          }}
                        >
                          {JSON.stringify(answer, null, 2)}
                        </pre>
                      </details>
                    </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 12, background: '#f7f7f7', borderRadius: 4, color: '#666' }}>
                      No answers found
                    </div>
                  )}
                </>
              );
            })()}
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
