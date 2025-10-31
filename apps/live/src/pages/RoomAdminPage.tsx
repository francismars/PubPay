import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScheduleTimeline, Slot } from '../components/ScheduleTimeline';

const API_BASE = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env?.VITE_BACKEND_URL || 'http://localhost:3002';

export const RoomAdminPage: React.FC = () => {
	const { roomId } = useParams<{ roomId?: string }>();
	const navigate = useNavigate();
	const [name, setName] = useState('');
	const [rotationIntervalSec, setIntervalSec] = useState(60);
	const [rotationPolicy, setPolicy] = useState<'round_robin' | 'random' | 'weighted'>('round_robin');
	const [defaultItems, setDefaultItems] = useState('');
	const [scheduleJson, setScheduleJson] = useState<string>(`{
  "slots": [
    {
      "startAt": "${new Date(Date.now() + 5 * 60 * 1000).toISOString()}",
      "endAt": "${new Date(Date.now() + 35 * 60 * 1000).toISOString()}",
      "items": [ { "ref": "note1example..." }, { "ref": "nevent1example..." } ]
    }
  ]
}`);
	const [createdRoomId, setCreatedRoomId] = useState<string | null>(roomId || null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [editorMode, setEditorMode] = useState<'json' | 'timeline'>('timeline');
// Deprecated single-field import path retained for compatibility; not used in new UI
// const [pretalxVersion] = useState<string>('');
	const [pretalxSchedules, setPretalxSchedules] = useState<Array<{ id?: string | number; version?: string; published?: string | null }>>([]);
	const [selectedVersion, setSelectedVersion] = useState<string>('');
	const [availableStages, setAvailableStages] = useState<Array<{ id?: string | number; name?: string | number }>>([]);
	const [selectedStageId, setSelectedStageId] = useState<string>('');
	const [rawResponse, setRawResponse] = useState<unknown | null>(null);

	const fetchPretalxSchedules = useCallback(async () => {
		setBusy(true); setError(null); setSuccess(null); setRawResponse(null);
		try {
			const res = await fetch(`${API_BASE}/rooms/pretalx/schedules`);
			const json = await res.json();
			setRawResponse(json); // Store raw response for debugging
			if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch schedules');
			setPretalxSchedules(json.data?.schedules || []);
			if (!selectedVersion && (json.data?.schedules || []).length) {
				setSelectedVersion((json.data.schedules[0].version || '').toString());
			}
			setSuccess('Schedules loaded');
			setTimeout(() => setSuccess(null), 1500);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [selectedVersion]);

	const loadVersionStages = useCallback(async () => {
		if (!selectedVersion) { setError('Select a schedule version first'); return; }
		setBusy(true); setError(null); setSuccess(null); setRawResponse(null);
		try {
			const params = new URLSearchParams({ version: selectedVersion });
			const res = await fetch(`${API_BASE}/rooms/pretalx/preview?${params.toString()}`);
			const json = await res.json();
			setRawResponse(json); // Store raw response for debugging
			if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load preview');
			const slots = (json.data?.slots || []) as Array<{ room?: { id?: string | number; name?: string } }>;
			const stageMap = new Map<string, { id?: string | number; name?: string | number }>();
			for (const s of slots) {
				const rid = s.room?.id;
				if (rid == null) continue;
				const key = String(rid);
				// Extract name - handle multi-language or plain string
				let name: string | number | undefined = s.room?.name;
				if (name && typeof name !== 'string' && typeof name !== 'number' && typeof name === 'object') {
					const ml = name as Record<string, unknown>;
					name = (ml['en'] as string) || (ml[Object.keys(ml)[0]] as string) || String(rid);
				}
				if (!stageMap.has(key)) stageMap.set(key, { id: rid, name: name || rid });
			}
			const stages = Array.from(stageMap.values());
			setAvailableStages(stages);
			if (!selectedStageId && stages.length) setSelectedStageId(String(stages[0].id ?? ''));
			setSuccess(`Found ${stages.length} stage(s)`);
			setTimeout(() => setSuccess(null), 1500);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [selectedVersion, selectedStageId]);

const loadStageToTimeline = useCallback(async () => {
		if (!selectedVersion) { setError('Select a schedule version first'); return; }
		if (!selectedStageId) { setError('Select a stage first'); return; }
		setBusy(true); setError(null); setSuccess(null); setRawResponse(null);
		try {
			const params = new URLSearchParams({ version: selectedVersion, roomId: selectedStageId });
			const res = await fetch(`${API_BASE}/rooms/pretalx/preview?${params.toString()}`);
			const json = await res.json();
			setRawResponse(json); // Store raw response for debugging
			if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load stage slots');
			const slots = (json.data?.slots || []) as Array<{ startAt: string; endAt: string; items: Array<{ ref: string }>; title?: string; speakers?: string[]; code?: string; room?: { name?: string } }>;
	    const timelineSlots: Slot[] = slots.map(s => ({ startAt: s.startAt, endAt: s.endAt, items: s.items, title: s.title, speakers: s.speakers, code: s.code, roomName: (s.room?.name as string | undefined) }));
    // Defer to avoid before-declaration usage warning
    setTimeout(() => updateSlotsFromTimeline(timelineSlots), 0);
			setSuccess(`Loaded ${timelineSlots.length} slots to timeline`);
			setTimeout(() => setSuccess(null), 1500);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
}, [selectedVersion, selectedStageId]);

// Removed unused importFromPretalx handler in favor of version/stage workflow

	// Parse slots from JSON and sync
	const parsedSlots = useMemo<Slot[]>(() => {
		try {
			const parsed = JSON.parse(scheduleJson);
			return parsed.slots || [];
		} catch {
			return [];
		}
	}, [scheduleJson]);

	const updateSlotsFromTimeline = useCallback((newSlots: Slot[]) => {
		try {
			const newSchedule = { slots: newSlots };
			setScheduleJson(JSON.stringify(newSchedule, null, 2));
		} catch {
			// ignore
		}
	}, []);

	// Load room details when navigating after creation
	useEffect(() => {
		if (!roomId) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`${API_BASE}/rooms/${roomId}`);
				if (cancelled) return;
				if (res.status === 404) {
					navigate('/multi', { replace: true });
					return;
				}
				if (!res.ok) throw new Error('Failed to load room');
				const json = await res.json();
				if (json?.success && json?.data?.config) {
					const cfg = json.data.config as {
						id: string; name: string; rotationPolicy: 'round_robin'|'random'|'weighted'; rotationIntervalSec: number; defaultItems: string[];
					};
					setCreatedRoomId(cfg.id);
					setName(cfg.name || '');
					setPolicy(cfg.rotationPolicy);
					setIntervalSec(cfg.rotationIntervalSec || 60);
					setDefaultItems((cfg.defaultItems || []).join('\n'));
					// Preload schedule JSON if present
					if (json.data.schedule) {
						setScheduleJson(JSON.stringify(json.data.schedule, null, 2));
					}
				} else {
					throw new Error('Invalid room response');
				}
			} catch (e: unknown) {
				setError(e instanceof Error ? e.message : 'Error');
			}
		})();
		return () => { cancelled = true; };
	}, [roomId, navigate]);

	const createRoom = useCallback(async () => {
		setBusy(true); setError(null);
		try {
			const payload = {
				name: name || 'Untitled Room',
				rotationPolicy,
				rotationIntervalSec,
				defaultItems: defaultItems.split(/\n|,/) .map(s => s.trim()).filter(Boolean)
			};
			const res = await fetch(`${API_BASE}/rooms`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = await res.json();
			if (!json.success) throw new Error(json.error || 'Failed to create room');
			setCreatedRoomId(json.data.id);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [name, rotationPolicy, rotationIntervalSec, defaultItems]);

	const validateSchedule = useCallback((jsonText: string): { valid: boolean; error?: string } => {
		try {
			const schedule = JSON.parse(jsonText);
			if (!Array.isArray(schedule.slots)) return { valid: false, error: 'schedule.slots must be an array' };
			for (const slot of schedule.slots) {
				if (!slot.startAt || !slot.endAt) return { valid: false, error: 'Each slot must have startAt and endAt (UTC ISO)' };
				if (!Array.isArray(slot.items)) return { valid: false, error: 'Each slot.items must be an array' };
				for (const item of slot.items) {
					if (!item.ref || (!item.ref.startsWith('note1') && !item.ref.startsWith('nevent1'))) {
						return { valid: false, error: 'Each item must have a valid ref (note1... or nevent1...)' };
					}
				}
				const start = new Date(slot.startAt);
				const end = new Date(slot.endAt);
				if (isNaN(start.getTime()) || isNaN(end.getTime())) return { valid: false, error: 'Invalid date format (use ISO UTC)' };
				if (end <= start) return { valid: false, error: 'endAt must be after startAt' };
			}
			return { valid: true };
		} catch (e) {
			return { valid: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
		}
	}, []);

	const uploadSchedule = useCallback(async () => {
		if (!createdRoomId) { setError('Create a room first'); return; }
		const validation = validateSchedule(scheduleJson);
		if (!validation.valid) {
			setError(validation.error || 'Invalid schedule');
			return;
		}
		setBusy(true); setError(null); setSuccess(null);
		try {
			const schedule = JSON.parse(scheduleJson);
			const res = await fetch(`${API_BASE}/rooms/${createdRoomId}/schedule`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(schedule)
			});
			const json = await res.json();
			if (!json.success) throw new Error(json.error || 'Failed to set schedule');
			setSuccess('Schedule uploaded successfully!');
			setTimeout(() => setSuccess(null), 3000);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [createdRoomId, scheduleJson, validateSchedule]);

	const saveSettings = useCallback(async () => {
		if (!createdRoomId) { setError('Create a room first'); return; }
		setBusy(true); setError(null); setSuccess(null);
		try {
			const payload = {
				name: name || 'Untitled Room',
				rotationPolicy,
				rotationIntervalSec,
				defaultItems: defaultItems.split(/\n|,/) .map(s => s.trim()).filter(Boolean)
			};
			const res = await fetch(`${API_BASE}/rooms/${createdRoomId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const json = await res.json();
			if (!json.success) throw new Error(json.error || 'Failed to save settings');
			setSuccess('Settings saved successfully!');
			setTimeout(() => setSuccess(null), 3000);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : 'Error');
		} finally { setBusy(false); }
	}, [createdRoomId, name, rotationPolicy, rotationIntervalSec, defaultItems]);

	const copyRoomId = useCallback(() => {
		if (!createdRoomId) return;
		navigator.clipboard.writeText(createdRoomId);
		setSuccess('Room ID copied!');
		setTimeout(() => setSuccess(null), 2000);
	}, [createdRoomId]);

	const copyViewerUrl = useCallback(() => {
		if (!createdRoomId) return;
		const url = `${window.location.origin}/room/${createdRoomId}`;
		navigator.clipboard.writeText(url);
		setSuccess('Viewer URL copied!');
		setTimeout(() => setSuccess(null), 2000);
	}, [createdRoomId]);

	const exportSchedule = useCallback(() => {
		const blob = new Blob([scheduleJson], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `schedule-${createdRoomId || 'new'}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
		setSuccess('Schedule exported!');
		setTimeout(() => setSuccess(null), 2000);
	}, [scheduleJson, createdRoomId]);

	const importSchedule = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (event) => {
			try {
				const text = event.target?.result as string;
				const parsed = JSON.parse(text);
				setScheduleJson(JSON.stringify(parsed, null, 2));
				setSuccess('Schedule imported!');
				setTimeout(() => setSuccess(null), 2000);
			} catch {
				setError('Invalid JSON file');
			}
		};
		reader.readAsText(file);
	}, []);

	return (
		<div style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
			<div>
				<h2>Room Admin</h2>
				<label>Name</label>
				<input value={name} onChange={e => setName(e.target.value)} placeholder="Room name" />
				<label style={{ marginTop: 8 }}>Rotation policy</label>
					<select value={rotationPolicy} onChange={e => setPolicy(e.target.value as 'round_robin' | 'random' | 'weighted')}>
					<option value="round_robin">round_robin</option>
					<option value="random">random</option>
					<option value="weighted">weighted</option>
				</select>
				<label style={{ marginTop: 8 }}>Rotation interval (sec)</label>
				<input type="number" value={rotationIntervalSec} onChange={e => setIntervalSec(parseInt(e.target.value || '60', 10))} />
				<label style={{ marginTop: 8 }}>Default items (comma or newline separated)</label>
				<textarea rows={5} value={defaultItems} onChange={e => setDefaultItems(e.target.value)} placeholder={'note1...\nnevent1...'} />
				<div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
					{!createdRoomId ? (
						<button onClick={createRoom} disabled={busy}>Create room</button>
					) : (
						<>
						<button onClick={saveSettings} disabled={busy}>Save settings</button>
					<button onClick={() => window.open(`/room/${createdRoomId}`, '_blank')}>Open viewer</button>
					<div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: 6, alignItems: 'center' }}>
						<button onClick={fetchPretalxSchedules} disabled={busy}>Fetch schedules</button>
						<select value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}>
							<option value="">Select version</option>
							<option value="wip">wip (work in progress)</option>
							<option value="latest">latest (published)</option>
							{pretalxSchedules.map((s, i) => (
								<option key={`${s.version || s.id || i}`} value={(s.version || '').toString()}>{(s.version || '').toString()} {s.published ? '(published)' : ''}</option>
							))}
						</select>
						<button onClick={loadVersionStages} disabled={busy || !selectedVersion}>Load version</button>
						<select value={selectedStageId} onChange={e => setSelectedStageId(e.target.value)}>
							<option value="">Select stage</option>
							{availableStages.map((r, i) => (
								<option key={`${r.id || i}`} value={String(r.id ?? '')}>{String(r.name ?? r.id ?? '')}</option>
							))}
						</select>
						<button onClick={loadStageToTimeline} disabled={busy || !selectedStageId}>Load stage → Timeline</button>
					</div>
							<button onClick={copyRoomId} style={{ fontSize: '0.9em', padding: '4px 8px' }}>Copy Room ID</button>
							<button onClick={copyViewerUrl} style={{ fontSize: '0.9em', padding: '4px 8px' }}>Copy URL</button>
						</>
					)}
				</div>
				{createdRoomId && <small style={{ display: 'block', marginTop: 4 }}>Room ID: {createdRoomId}</small>}
				{error && <div style={{ color: 'red', marginTop: 8, padding: 8, background: '#ffe6e6', borderRadius: 4 }}>{error}</div>}
				{success && <div style={{ color: 'green', marginTop: 8, padding: 8, background: '#e6ffe6', borderRadius: 4 }}>{success}</div>}
				{rawResponse !== null && (
					<div style={{ marginTop: 8, padding: 8, background: '#f0f0f0', borderRadius: 4, fontSize: '0.85em', maxHeight: '400px', overflow: 'auto' }}>
						<strong>Raw API Response:</strong>
						{selectedStageId && availableStages.length > 0 && (() => {
							const stage = availableStages.find(s => String(s.id) === selectedStageId);
							if (stage) {
								return (
									<div style={{ marginTop: 4, marginBottom: 4, padding: 4, background: '#e0e0e0', borderRadius: 2 }}>
										<strong>Selected Stage:</strong> {String(stage.name ?? stage.id)} (ID: {stage.id})
									</div>
								);
							}
							return null;
						})()}
						<pre style={{ whiteSpace: 'pre-wrap', marginTop: 4, fontSize: '0.8em' }}>{JSON.stringify(rawResponse, null, 2)}</pre>
					</div>
				)}
			</div>
			<div>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
					<h3 style={{ margin: 0 }}>Schedule</h3>
					<div style={{ display: 'flex', gap: 4 }}>
						<button
							onClick={() => setEditorMode('timeline')}
							disabled={editorMode === 'timeline'}
							style={{ fontSize: '0.85em', padding: '4px 12px', background: editorMode === 'timeline' ? '#2196f3' : '#eee', color: editorMode === 'timeline' ? 'white' : 'black' }}
						>
							Timeline
						</button>
						<button
							onClick={() => setEditorMode('json')}
							disabled={editorMode === 'json'}
							style={{ fontSize: '0.85em', padding: '4px 12px', background: editorMode === 'json' ? '#2196f3' : '#eee', color: editorMode === 'json' ? 'white' : 'black' }}
						>
							JSON
						</button>
					</div>
				</div>

				{editorMode === 'timeline' ? (
					<>
						<ScheduleTimeline slots={parsedSlots} onChange={updateSlotsFromTimeline} />
						<div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
							<button onClick={uploadSchedule} disabled={busy || !createdRoomId}>Upload schedule</button>
							<button onClick={exportSchedule} style={{ fontSize: '0.9em', padding: '4px 8px' }}>Export JSON</button>
							<label style={{ fontSize: '0.9em', padding: '4px 8px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, display: 'inline-block' }}>
								Import JSON
								<input type="file" accept=".json" onChange={importSchedule} style={{ display: 'none' }} />
							</label>
						</div>
					</>
				) : (
					<>
						<textarea rows={22} value={scheduleJson} onChange={e => setScheduleJson(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }} />
						<div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
							<button onClick={uploadSchedule} disabled={busy || !createdRoomId}>Upload schedule</button>
							<button onClick={exportSchedule} style={{ fontSize: '0.9em', padding: '4px 8px' }}>Export JSON</button>
							<label style={{ fontSize: '0.9em', padding: '4px 8px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, display: 'inline-block' }}>
								Import JSON
								<input type="file" accept=".json" onChange={importSchedule} style={{ display: 'none' }} />
							</label>
						</div>
						<p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
							Tip: times must be UTC ISO format (e.g., "2025-10-29T21:00:00Z"). Items accept note1/nevent1 references.
						</p>
					</>
				)}
			</div>
		</div>
	);
};


