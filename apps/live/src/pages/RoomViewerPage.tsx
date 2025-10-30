import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Fullscreen vendor typings
type VendorFullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

type VendorFullscreenDocument = Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};
import { useNavigate, useParams } from 'react-router-dom';

type ViewPayload = {
	active: { slotStart: string; slotEnd: string } | null;
	items: string[];
	policy: { type: 'round_robin' | 'random' | 'weighted'; intervalSec: number };
	index: number;
	nextSwitchAt: string;
	defaultItems: string[];
	upcomingSlots?: Array<{ startAt: string; endAt: string; items: string[] }>;
	previousSlots?: Array<{ startAt: string; endAt: string; items: string[] }>;
};

const API_BASE = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })?.env?.VITE_BACKEND_URL || 'http://localhost:3002';

export const RoomViewerPage: React.FC = () => {
	const { roomId } = useParams<{ roomId: string }>();
	const [view, setView] = useState<ViewPayload | null>(null);
	const [currentIndex, setCurrentIndex] = useState<number>(0);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [serverNowIso, setServerNowIso] = useState<string | null>(null);
	const esRef = useRef<EventSource | null>(null);
	const navigate = useNavigate();

	// Simulation mode state
	const [isSimulating, setIsSimulating] = useState(false);
	const [simTime, setSimTime] = useState<string>(new Date().toISOString());
	const [isPlaying, setIsPlaying] = useState(false);
	const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 5x, 15x
	const simIntervalRef = useRef<number | null>(null);

	const items = view?.items ?? [];
	const nextRef = useMemo(() => (items.length ? items[(currentIndex + 1) % items.length] : null), [items, currentIndex]);
	const iframeRefs = useRef<Map<string, React.RefObject<HTMLIFrameElement | null>>>(new Map());
	const switchTimerRef = useRef<number | null>(null);
	const swiperContainerRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);

	// Fullscreen controls for the note container
	const enterFullscreen = useCallback(async () => {
    const el = swiperContainerRef.current as VendorFullscreenElement | null;
		if (!el) return;
		try {
			if (el.requestFullscreen) {
				await el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                await el.webkitRequestFullscreen();
            } else if (el.msRequestFullscreen) {
                await el.msRequestFullscreen();
			}
			setIsFullscreen(true);
		} catch { /* ignore */ }
	}, []);

	const exitFullscreen = useCallback(async () => {
    try {
            const doc = document as VendorFullscreenDocument;
            if (doc.exitFullscreen) {
                await doc.exitFullscreen();
            } else if (doc.webkitExitFullscreen) {
                await doc.webkitExitFullscreen();
            } else if (doc.msExitFullscreen) {
                await doc.msExitFullscreen();
            }
			setIsFullscreen(false);
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
    const onChange: EventListener = () => {
            const doc = document as VendorFullscreenDocument;
            const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
            setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    document.addEventListener('MSFullscreenChange', onChange as EventListener);
		return () => {
            document.removeEventListener('fullscreenchange', onChange);
            document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
            document.removeEventListener('MSFullscreenChange', onChange as EventListener);
		};
	}, []);

	// Fetch view with optional simulation time
	const fetchView = useCallback(async (atTime?: string) => {
		if (!roomId) return;
		try {
			const url = `${API_BASE}/rooms/${roomId}/view${atTime ? `?at=${encodeURIComponent(atTime)}` : ''}`;
			const res = await fetch(url);
			if (!res.ok) {
				if (res.status === 404) {
					navigate('/multi', { replace: true });
				} else {
					setError('Failed to load view');
					setView(null);
				}
				return;
			}
			const json = await res.json();
			if (!json?.success || !json?.data) {
				setError('Invalid response');
				setView(null);
				return;
			}
			const payload: ViewPayload = json.data;
			setView(payload);
			setCurrentIndex(typeof payload.index === 'number' ? payload.index : 0);
			setError(null);
		} catch {
			setError('Network error');
			setView(null);
		}
	}, [roomId, navigate]);

	// Initial load - check for URL params
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const atParam = params.get('at');
		if (atParam) {
			setIsSimulating(true);
			setSimTime(atParam);
			fetchView(atParam);
		} else {
			fetchView();
		}
	}, [roomId, fetchView]);

	// SSE connection - only when NOT simulating
	useEffect(() => {
		if (!roomId || isSimulating) {
			if (esRef.current) {
				esRef.current.close();
				esRef.current = null;
			}
			return;
		}
		// Close any existing connection first
		if (esRef.current) {
			esRef.current.close();
			esRef.current = null;
		}
		// open SSE connection
		const es = new EventSource(`${API_BASE}/rooms/${roomId}/events`);
		esRef.current = es;
		const handleSnapshot = (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				const payload: ViewPayload = data.view;
				setView(payload);
				setCurrentIndex(typeof payload.index === 'number' ? payload.index : 0);
			} catch { void 0; }
		};
		const handleTick = (e: MessageEvent) => {
			try {
				const data = JSON.parse(e.data);
				if (typeof data.index === 'number') setCurrentIndex(data.index);
				if (typeof data.at === 'string') setServerNowIso(data.at);
			} catch { void 0; }
		};
		es.addEventListener('snapshot', handleSnapshot);
		es.addEventListener('tick', handleTick);
		es.addEventListener('schedule-updated', () => {
			// no refetch needed; server will emit a fresh snapshot right after update
		});
		es.addEventListener('config-updated', () => {
			// no refetch needed; server will emit a fresh snapshot
		});
		es.onerror = () => {
			// Let EventSource auto-reconnect
		};
		return () => {
			es.removeEventListener('snapshot', handleSnapshot);
			es.removeEventListener('tick', handleTick);
			es.close();
			esRef.current = null;
		};
	}, [roomId, isSimulating]);

	// Simulation controls
	const stepTime = useCallback((minutes: number) => {
		setSimTime(prev => {
			const current = new Date(prev);
			current.setMinutes(current.getMinutes() + minutes);
			const newTime = current.toISOString();
			fetchView(newTime);
			// Update URL to reflect new time
			window.history.pushState({}, '', `${window.location.pathname}?at=${encodeURIComponent(newTime)}`);
			return newTime;
		});
	}, [fetchView]);

	const jumpToSlot = useCallback((direction: 'next' | 'prev') => {
		const current = new Date(simTime);
		let target: { startAt: string; endAt: string; items: string[] } | null = null;

		if (direction === 'next') {
			if (view?.upcomingSlots && view.upcomingSlots.length > 0) {
				target = view.upcomingSlots.find(s => new Date(s.startAt) > current) || view.upcomingSlots[0];
			}
		} else {
			// Try previous slots first
			if (view?.previousSlots && view.previousSlots.length > 0) {
				target = view.previousSlots[0]; // Most recent previous slot
			} else if (view?.upcomingSlots && view.upcomingSlots.length > 0) {
				// Fallback to upcoming if no previous slots
				const prev = view.upcomingSlots.filter(s => new Date(s.endAt) < current);
				target = prev.length > 0 ? prev[prev.length - 1] : view.upcomingSlots[0];
			}
		}
		if (target) {
			const newTime = new Date(target.startAt).toISOString();
			setSimTime(newTime);
			fetchView(newTime);
		}
	}, [simTime, view, fetchView]);

	const toggleSimulation = useCallback(() => {
		if (isSimulating) {
			setIsSimulating(false);
			setIsPlaying(false);
			if (simIntervalRef.current) {
				clearInterval(simIntervalRef.current);
				simIntervalRef.current = null;
			}
			setSimTime(new Date().toISOString());
			fetchView(); // Fetch current time
			// Update URL
			window.history.pushState({}, '', window.location.pathname);
		} else {
			setIsSimulating(true);
			const nowISO = new Date().toISOString();
			setSimTime(nowISO);
			fetchView(nowISO);
			window.history.pushState({}, '', `${window.location.pathname}?at=${encodeURIComponent(nowISO)}`);
		}
	}, [isSimulating, fetchView]);

	const togglePlay = useCallback(() => {
		if (!isSimulating) return;
		setIsPlaying(!isPlaying);
	}, [isSimulating, isPlaying]);

	// Play/pause simulation timer
	useEffect(() => {
		if (!isSimulating || !isPlaying) {
			if (simIntervalRef.current) {
				clearInterval(simIntervalRef.current);
				simIntervalRef.current = null;
			}
			return;
		}

		const intervalMs = (1000 * 60) / simSpeed; // 1 minute per interval at 1x speed
		simIntervalRef.current = window.setInterval(() => {
			stepTime(1); // Step forward 1 minute
		}, intervalMs);

		return () => {
			if (simIntervalRef.current) {
				clearInterval(simIntervalRef.current);
				simIntervalRef.current = null;
			}
		};
	}, [isSimulating, isPlaying, simSpeed, stepTime]);

	// Update when simTime changes manually
	useEffect(() => {
		if (isSimulating && !isPlaying) {
			fetchView(simTime);
		}
	}, [simTime, isSimulating, isPlaying, fetchView]);

	// Helper to get or create a ref for an item
	const getIframeRef = useCallback((item: string): React.RefObject<HTMLIFrameElement | null> => {
		if (!iframeRefs.current.has(item)) {
			iframeRefs.current.set(item, React.createRef<HTMLIFrameElement>());
		}
		return iframeRefs.current.get(item)!;
	}, []);

	// Clean up refs for removed items
	useEffect(() => {
		const currentItems = new Set(items);
		for (const item of iframeRefs.current.keys()) {
			if (!currentItems.has(item)) {
				iframeRefs.current.delete(item);
			}
		}
	}, [items]);

	// Instant switch at boundaries: schedule a precise refresh at nextSwitchAt (only in live mode)
	useEffect(() => {
		if (switchTimerRef.current) {
			window.clearTimeout(switchTimerRef.current);
			switchTimerRef.current = null;
		}
		if (!view?.nextSwitchAt || !roomId || isSimulating) return;
		const delayMs = new Date(view.nextSwitchAt).getTime() - Date.now();
		if (delayMs <= 0 || !isFinite(delayMs)) return;
		switchTimerRef.current = window.setTimeout(async () => {
			try {
				const res = await fetch(`${API_BASE}/rooms/${roomId}/view`);
				if (res.ok) {
					const json = await res.json();
					if (json?.success && json?.data) {
						const payload: ViewPayload = json.data;
						setView(payload);
						setCurrentIndex(typeof payload.index === 'number' ? payload.index : 0);
					}
				}
			} catch {
				/* ignore */
			}
		}, delayMs);
		return () => {
			if (switchTimerRef.current) {
				window.clearTimeout(switchTimerRef.current);
				switchTimerRef.current = null;
			}
		};
	}, [view?.nextSwitchAt, roomId, isSimulating]);

	// Real-time ticker for countdown UI updates (updates every second)
	const [tick, setTick] = useState(Date.now());

	useEffect(() => {
		const id = setInterval(() => {
			setTick(Date.now()); // Update every second to trigger recalculation
		}, 1000);
		return () => clearInterval(id);
	}, []);

	const formatUTC = (iso?: string | null) => (iso ? new Date(iso).toUTCString() : '—');
	// Get current reference time (simulated or real)
	const getCurrentTime = () => isSimulating ? new Date(simTime).getTime() : Date.now();
	// Calculate countdown - recalculates when tick updates
	const nextSwitchIn = useMemo(() => {
		if (!view?.nextSwitchAt) return null;
		const ms = new Date(view.nextSwitchAt).getTime() - getCurrentTime();
		if (isNaN(ms)) return null;
		const s = Math.max(0, Math.floor(ms / 1000));
		const mm = Math.floor(s / 60).toString().padStart(2, '0');
		const ss = (s % 60).toString().padStart(2, '0');
		return `${mm}:${ss}`;
	}, [view?.nextSwitchAt, isSimulating, simTime, tick]);

	// Convert UTC ISO to local datetime-local format
	const utcToLocal = (utcISO: string): string => {
		const date = new Date(utcISO);
		const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
		return local.toISOString().slice(0, 16);
	};

	// Convert local datetime-local to UTC ISO
	const localToUTC = (localStr: string): string => {
		return new Date(localStr).toISOString();
	};

	const copySimUrl = useCallback(() => {
		if (!isSimulating) return;
		const url = `${window.location.origin}${window.location.pathname}?at=${encodeURIComponent(simTime)}`;
		navigator.clipboard.writeText(url);
		setSuccess('Simulation URL copied!');
		setTimeout(() => setSuccess(null), 2000);
	}, [isSimulating, simTime]);

	return (
		<div style={{ padding: 16 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
				<h2 style={{ margin: 0 }}>Room: {roomId}</h2>
				<button
					onClick={toggleSimulation}
					style={{
						padding: '8px 16px',
						background: isSimulating ? '#f44336' : '#4caf50',
						color: 'white',
						border: 'none',
						borderRadius: 4,
						cursor: 'pointer',
						fontWeight: 'bold'
					}}
				>
					{isSimulating ? '🔴 Exit Simulation' : '▶️ Enable Simulation'}
				</button>
			</div>

			{isSimulating && (
				<div style={{ marginBottom: 16, padding: 12, background: '#fff3cd', border: '2px solid #ffc107', borderRadius: 6 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
						<strong style={{ fontSize: '16px' }}>🔴 SIMULATION MODE</strong>
						<button onClick={copySimUrl} style={{ fontSize: '0.85em', padding: '4px 8px' }}>Copy URL</button>
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto', gap: 8, alignItems: 'end' }}>
						<div>
							<label style={{ fontSize: '0.85em', display: 'block', marginBottom: 4 }}>Simulation Time (local):</label>
							<input
								type="datetime-local"
								value={utcToLocal(simTime)}
								onChange={e => {
									const newTime = localToUTC(e.target.value);
									setSimTime(newTime);
									window.history.pushState({}, '', `${window.location.pathname}?at=${encodeURIComponent(newTime)}`);
								}}
								style={{ width: '100%', padding: 6 }}
							/>
						</div>
						<div style={{ display: 'flex', gap: 4 }}>
							<button onClick={() => jumpToSlot('prev')} disabled={!view?.previousSlots?.length && !view?.upcomingSlots?.length} style={{ padding: '6px 12px', fontSize: '0.85em' }}>⏮ Slot</button>
							<button onClick={() => stepTime(-60)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>⏪ 1h</button>
							<button onClick={() => stepTime(-5)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>⏩ 5m</button>
							<button onClick={() => stepTime(-1)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>◀ 1m</button>
						</div>
						<button
							onClick={togglePlay}
							disabled={!isSimulating}
							style={{
								padding: '6px 16px',
								fontSize: '0.9em',
								background: isPlaying ? '#f44336' : '#4caf50',
								color: 'white',
								border: 'none',
								borderRadius: 4,
								cursor: 'pointer'
							}}
						>
							{isPlaying ? '⏸ Pause' : '▶ Play'}
						</button>
						<div style={{ display: 'flex', gap: 4 }}>
							<button onClick={() => stepTime(1)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>1m ▶</button>
							<button onClick={() => stepTime(5)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>5m ⏩</button>
							<button onClick={() => stepTime(60)} style={{ padding: '6px 12px', fontSize: '0.85em' }}>1h ⏩</button>
							<button onClick={() => jumpToSlot('next')} disabled={!view?.upcomingSlots?.length} style={{ padding: '6px 12px', fontSize: '0.85em' }}>Slot ⏭</button>
						</div>
						<div>
							<label style={{ fontSize: '0.85em', display: 'block', marginBottom: 4 }}>Speed:</label>
							<select value={simSpeed} onChange={e => setSimSpeed(Number(e.target.value))} style={{ padding: 6 }}>
								<option value={1}>1x</option>
								<option value={5}>5x</option>
								<option value={15}>15x</option>
							</select>
						</div>
					</div>
					<div style={{ marginTop: 8, fontSize: '0.85em', color: '#666' }}>
						<div>
							<strong>Simulated time (UTC):</strong> {new Date(simTime).toUTCString()}
						</div>
						<div>
							<strong>Simulated time (Local):</strong> {new Date(simTime).toLocaleString()}
						</div>
						{isPlaying && (
							<div style={{
								marginTop: 4,
								padding: '4px 8px',
								background: '#e6ffe6',
								border: '1px solid #4caf50',
								borderRadius: 4,
								color: '#2e7d32',
								fontWeight: 'bold',
								display: 'inline-block'
							}}>
								▶ PLAYING at {simSpeed}x speed
								{(() => {
									const intervalMs = (1000 * 60) / simSpeed;
									const secondsPerStep = intervalMs / 1000;
									return ` (advancing 1 minute every ${secondsPerStep.toFixed(1)}s)`;
								})()}
							</div>
						)}
						{!isPlaying && isSimulating && (
							<div style={{
								marginTop: 4,
								padding: '4px 8px',
								background: '#fff3cd',
								border: '1px solid #ffc107',
								borderRadius: 4,
								color: '#856404',
								fontWeight: 'bold',
								display: 'inline-block'
							}}>
								⏸ PAUSED
							</div>
						)}
					</div>
				</div>
			)}

			{success && <div style={{ padding: 8, background: '#e6ffe6', color: 'green', borderRadius: 4, marginBottom: 8 }}>{success}</div>}
			{error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
			{view ? (
				<div>
				{/* Active window removed to avoid duplication with Slot UTC/Local */}
					<div style={{ marginTop: 8, padding: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 6 }}>
						{isSimulating ? (
							<>
								<div><strong>🔴 Simulated time (UTC):</strong> {new Date(simTime).toUTCString()}</div>
								<div><strong>Simulated time (Local):</strong> {new Date(simTime).toLocaleString()}</div>
							</>
						) : (
							<>
								<div><strong>Client now (UTC):</strong> {new Date().toUTCString()}</div>
								<div><strong>Server tick (UTC):</strong> {formatUTC(serverNowIso)}</div>
							</>
						)}
						<div><strong>Slot UTC:</strong> {view.active ? `${new Date(view.active.slotStart).toUTCString()} → ${new Date(view.active.slotEnd).toUTCString()}` : '—'}</div>
						<div><strong>Slot Local:</strong> {view.active ? `${new Date(view.active.slotStart).toLocaleString()} → ${new Date(view.active.slotEnd).toLocaleString()}` : '—'}</div>
						<div><strong>Next switch at (UTC):</strong> {formatUTC(view.nextSwitchAt)}{nextSwitchIn ? ` (in ${nextSwitchIn})` : ''}</div>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
						<button
							onClick={() => (isFullscreen ? exitFullscreen() : enterFullscreen())}
							style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#f7f7f7', cursor: 'pointer' }}
							title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
						>
							{isFullscreen ? '⤢ Exit Fullscreen' : '⤢ Fullscreen'}
						</button>
					</div>
					<div
						ref={swiperContainerRef}
						style={{
							marginTop: 8,
							height: '70vh',
							border: '1px solid #ddd',
							borderRadius: 8,
							overflow: 'hidden',
							position: 'relative'
						}}
					>
						{items.length > 0 ? (
							items.map((item, idx) => {
								const isActive = idx === currentIndex % items.length;
								const base = window.location.origin;
								return (
									<iframe
										key={item}
										ref={getIframeRef(item)}
										src={`${base}/${encodeURIComponent(item)}`}
										title={`Live Viewer ${idx + 1}`}
										style={{
											position: 'absolute',
											top: 0,
											left: 0,
											width: '100%',
											height: '100%',
											border: '0',
											display: 'block', // Always render to keep loaded
											opacity: isActive ? 1 : 0,
											visibility: isActive ? 'visible' : 'hidden',
											transition: 'opacity 0.3s ease-in-out',
											pointerEvents: isActive ? 'auto' : 'none',
											zIndex: isActive ? 1 : 0
										}}
									/>
								);
							})
						) : (
							<div style={{ padding: 16 }}>(no item)</div>
						)}
					</div>
					<div style={{ marginTop: 8, padding: 8, background: '#f7fbff', border: '1px solid #e3f2ff', borderRadius: 6 }}>
						<div><strong>Next item:</strong> {nextRef || '(none)'}{nextSwitchIn ? ` — switching in ${nextSwitchIn}` : ''}</div>
						<div><strong>Next switch at (local):</strong> {view.nextSwitchAt ? new Date(view.nextSwitchAt).toLocaleString() : '—'}</div>
					</div>
					<hr style={{ margin: '16px 0' }} />
					<div>
						<strong>Current slot</strong>
						{view.active && (
							<div style={{ marginBottom: 8, fontSize: '0.9em', color: '#666' }}>
								{new Date(view.active.slotStart).toLocaleString()} → {new Date(view.active.slotEnd).toLocaleString()}
							</div>
						)}
						<div>
							<strong>Items:</strong>
							<ul>
								{items.map((it, i) => (
									<li key={i} style={{ fontWeight: i === currentIndex ? 'bold' as const : 'normal' }}>
										{i}. {it}
									</li>
								))}
							</ul>
						</div>
						{items.length > 1 && (
							<div style={{ marginTop: 8, fontSize: '0.85em', color: '#999', fontStyle: 'italic' }}>
								Rotation: {view.policy.type} every {view.policy.intervalSec}s
							</div>
						)}
					</div>
					{view.previousSlots && view.previousSlots.length > 0 && (
						<>
							<hr style={{ margin: '16px 0' }} />
							<div>
								<strong>Previous slots</strong>
								<ul>
									{view.previousSlots.map((s, idx) => (
										<li key={`prev-${s.startAt}-${idx}`} style={{ opacity: 0.7 }}>
											{new Date(s.startAt).toLocaleString()} → {new Date(s.endAt).toLocaleString()} — {s.items.join(', ')}
										</li>
									))}
								</ul>
							</div>
						</>
					)}
					{view.upcomingSlots && view.upcomingSlots.length > 0 && (
						<>
							<hr style={{ margin: '16px 0' }} />
							<div>
								<strong>Upcoming slots</strong>
								<ul>
									{view.upcomingSlots.map((s, idx) => (
										<li key={`upcoming-${s.startAt}-${idx}`}>
											{new Date(s.startAt).toLocaleString()} → {new Date(s.endAt).toLocaleString()} — {s.items.join(', ')}
										</li>
									))}
								</ul>
							</div>
						</>
					)}
				</div>
			) : (
				<div>Loading…</div>
			)}
		</div>
	);
};


