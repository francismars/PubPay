import React, { useCallback, useState, useRef, useEffect } from 'react';

export interface Slot {
	startAt: string;
	endAt: string;
	items: Array<{ ref: string; weight?: number; title?: string }>;
}

interface ScheduleTimelineProps {
	slots: Slot[];
	onChange: (slots: Slot[]) => void;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ slots, onChange }) => {
	const [editingSlot, setEditingSlot] = useState<number | null>(null);
	const [newSlotStart, setNewSlotStart] = useState('');
	const [newSlotEnd, setNewSlotEnd] = useState('');
	const [dragging, setDragging] = useState<{ type: 'start' | 'end' | 'move'; slotIndex: number; initialMouseX: number; initialSlotStart: number; initialSlotEnd: number } | null>(null);
	const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
	const [hasDragged, setHasDragged] = useState(false);
	const [zoom, setZoom] = useState<number>(1); // 1 = auto, 2 = 24h, 3 = 48h, 4 = 1 week
	const [timeOffset, setTimeOffset] = useState<number>(0); // Pan offset in milliseconds
	const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Zoom multiplier (1.0 = normal, 2.0 = 2x zoom, 0.5 = zoomed out)
	const [newItemRefs, setNewItemRefs] = useState<Record<number, string>>({});
	const [snapMinutes, setSnapMinutes] = useState<number>(5); // Snap-to grid in minutes (0 = off)
	const timelineRef = useRef<HTMLDivElement>(null);
	const timelineScrollRef = useRef<HTMLDivElement>(null);
	const [panning, setPanning] = useState(false);
	const [panStart, setPanStart] = useState<{ x: number; time: number } | null>(null);
	const clickActionRef = useRef<{ slotIndex: number | null; shouldOpen: boolean }>({ slotIndex: null, shouldOpen: false });
	const editOverlayRef = useRef<HTMLDivElement>(null);
	const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	// Base time range calculation
	const getBaseTimeRange = () => {
		if (slots.length === 0) {
			const defaultRange = 24 * 60 * 60 * 1000; // 24 hours
			return { min: Date.now() - defaultRange / 2, max: Date.now() + defaultRange / 2 };
		}
		const min = Math.min(...slots.map(s => new Date(s.startAt).getTime()));
		const max = Math.max(...slots.map(s => new Date(s.endAt).getTime()));
		const padding = Math.max((max - min) * 0.1, 60 * 60 * 1000); // 10% padding or 1 hour min
		return { min: min - padding, max: max + padding };
	};

	// Calculate visible time range with zoom and pan
	const getVisibleTimeRange = () => {
		const base = getBaseTimeRange();
		const baseRange = base.max - base.min;
		const visibleRange = baseRange / zoomLevel; // Zoomed range
		const center = (base.min + base.max) / 2 + timeOffset; // Center point with pan offset
		return {
			min: center - visibleRange / 2,
			max: center + visibleRange / 2
		};
	};

	const visibleRange = getVisibleTimeRange();
	const minTime = visibleRange.min;
	const maxTime = visibleRange.max;
	const timeRange = maxTime - minTime;
	
	// Real-time current time that updates every second
	const [now, setNow] = useState(Date.now());
	
	useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Check for overlapping slots
	const getOverlaps = useCallback((slotIndex: number) => {
		const slot = slots[slotIndex];
		if (!slot) return [];
		const start = new Date(slot.startAt).getTime();
		const end = new Date(slot.endAt).getTime();
		return slots
			.map((s, idx) => {
				if (idx === slotIndex) return null;
				const sStart = new Date(s.startAt).getTime();
				const sEnd = new Date(s.endAt).getTime();
				if ((sStart < end && sEnd > start)) return idx;
				return null;
			})
			.filter((i): i is number => i !== null);
	}, [slots]);

	const addSlot = useCallback(() => {
		if (!newSlotStart || !newSlotEnd) return;
		const start = new Date(newSlotStart);
		const end = new Date(newSlotEnd);
		if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return;

		const newSlot: Slot = {
			startAt: start.toISOString(),
			endAt: end.toISOString(),
			items: [{ ref: 'note1example...' }]
		};
		onChange([...slots, newSlot].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
		setNewSlotStart('');
		setNewSlotEnd('');
	}, [slots, onChange, newSlotStart, newSlotEnd]);

	const duplicateSlot = useCallback((index: number) => {
		const slot = slots[index];
		if (!slot) return;
		const duration = new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime();
		const newStart = new Date(slot.endAt);
		const newSlot: Slot = {
			startAt: newStart.toISOString(),
			endAt: new Date(newStart.getTime() + duration).toISOString(),
			items: slot.items.map(i => ({ ...i }))
		};
		onChange([...slots, newSlot].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
	}, [slots, onChange]);

	const updateSlot = useCallback((index: number, updates: Partial<Slot>) => {
		const updated = [...slots];
		updated[index] = { ...updated[index], ...updates };
		onChange(updated.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
	}, [slots, onChange]);

	const removeSlot = useCallback((index: number) => {
		onChange(slots.filter((_, i) => i !== index));
		setEditingSlot(null);
	}, [slots, onChange]);

	const addItemToSlot = useCallback((slotIndex: number, itemRef: string) => {
		if (!itemRef.trim()) return;
		const slot = slots[slotIndex];
		if (!slot) return;
		updateSlot(slotIndex, { items: [...slot.items, { ref: itemRef.trim() }] });
	}, [slots, updateSlot]);

	const removeItemFromSlot = useCallback((slotIndex: number, itemIndex: number) => {
		const slot = slots[slotIndex];
		if (!slot) return;
		updateSlot(slotIndex, { items: slot.items.filter((_, i) => i !== itemIndex) });
	}, [slots, updateSlot]);

	const getPosition = (timeStr: string) => {
		const time = new Date(timeStr).getTime();
		return ((time - minTime) / timeRange) * 100;
	};

	const getWidth = (slot: Slot) => {
		const start = new Date(slot.startAt).getTime();
		const end = new Date(slot.endAt).getTime();
		return ((end - start) / timeRange) * 100;
	};

	// Snap helper
	const snapTime = useCallback((timeMs: number) => {
		if (!snapMinutes || snapMinutes <= 0) return timeMs;
		const intervalMs = snapMinutes * 60 * 1000;
		return Math.round(timeMs / intervalMs) * intervalMs;
	}, [snapMinutes]);

	const insertCurrentTime = (isStart: boolean) => {
		const now = new Date();
		const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
		const localISO = local.toISOString().slice(0, 16);
		if (isStart) setNewSlotStart(localISO);
		else setNewSlotEnd(localISO);
	};

	// Drag handlers for resizing/moving slots
	const handleMouseDown = (e: React.MouseEvent, slotIndex: number, type: 'start' | 'end' | 'move') => {
		e.preventDefault();
		e.stopPropagation();
		if (!timelineRef.current) return;
		const slot = slots[slotIndex];
		if (!slot) return;
		
		const initialMouseX = e.clientX;
		const initialSlotStart = new Date(slot.startAt).getTime();
		const initialSlotEnd = new Date(slot.endAt).getTime();
		
		setDragStart({ x: e.clientX, y: e.clientY });
		setHasDragged(false);
		setDragging({ type, slotIndex, initialMouseX, initialSlotStart, initialSlotEnd });
		
		// Track click action for this slot - will open edit if no drag happens
		if (type === 'move') {
			clickActionRef.current = { slotIndex, shouldOpen: true };
		} else {
			clickActionRef.current = { slotIndex: null, shouldOpen: false };
		}
	};

	// Handle slot click (only if not dragging)
	const handleSlotClick = (e: React.MouseEvent, slotIndex: number) => {
		// Only open edit panel if this was a click, not a drag
		if (!dragStart) {
			setEditingSlot(editingSlot === slotIndex ? null : slotIndex);
			return;
		}
		const dx = Math.abs(e.clientX - dragStart.x);
		const dy = Math.abs(e.clientY - dragStart.y);
		// If mouse moved less than 5px, treat as click
		if (dx < 5 && dy < 5 && !dragging) {
			setEditingSlot(editingSlot === slotIndex ? null : slotIndex);
		}
	};

	useEffect(() => {
		if (!dragging || !timelineRef.current) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!dragStart || !dragging) return;
			
			const dx = Math.abs(e.clientX - dragStart.x);
			const dy = Math.abs(e.clientY - dragStart.y);
			// If moved more than 5px, it's a drag
			if (dx > 5 || dy > 5) {
				setHasDragged(true);
			}

			const rect = timelineRef.current!.getBoundingClientRect();
			// Calculate how much the mouse moved in pixels
			const deltaX = e.clientX - dragging.initialMouseX;
			// Convert pixel movement to time delta
			const timePerPixel = timeRange / rect.width;
			const timeDelta = deltaX * timePerPixel;

			if (dragging.type === 'start') {
				let newStart = dragging.initialSlotStart + timeDelta;
				newStart = snapTime(newStart);
				const endTime = dragging.initialSlotEnd;
				if (newStart < endTime - 60000 && newStart >= minTime) { // min 1 minute
					updateSlot(dragging.slotIndex, { startAt: new Date(newStart).toISOString() });
				}
			} else if (dragging.type === 'end') {
				let newEnd = dragging.initialSlotEnd + timeDelta;
				newEnd = snapTime(newEnd);
				const startTime = dragging.initialSlotStart;
				if (newEnd > startTime + 60000 && newEnd <= maxTime) { // min 1 minute
					updateSlot(dragging.slotIndex, { endAt: new Date(newEnd).toISOString() });
				}
			} else if (dragging.type === 'move') {
				const duration = dragging.initialSlotEnd - dragging.initialSlotStart;
				let newStart = dragging.initialSlotStart + timeDelta;
				newStart = snapTime(newStart);
				const newEnd = newStart + duration;
				if (newStart >= minTime && newEnd <= maxTime) {
					updateSlot(dragging.slotIndex, {
						startAt: new Date(newStart).toISOString(),
						endAt: new Date(newEnd).toISOString()
					});
				}
			}

			// Auto-pan when dragging near edges
			const edgeThreshold = 30; // px
			if (e.clientX - rect.left < edgeThreshold) {
				const base = getBaseTimeRange();
				const panAmount = (base.max - base.min) / (zoomLevel * 200); // gentle
				setTimeOffset(prev => prev - panAmount);
			} else if (rect.right - e.clientX < edgeThreshold) {
				const base = getBaseTimeRange();
				const panAmount = (base.max - base.min) / (zoomLevel * 200);
				setTimeOffset(prev => prev + panAmount);
			}
		};

		const handleMouseUp = () => {
			// Capture values before clearing state
			const wasClick = clickActionRef.current.shouldOpen && !hasDragged;
			const slotIdx = clickActionRef.current.slotIndex;
			
			// Clear drag state first
			setDragging(null);
			setDragStart(null);
			setHasDragged(false);
			
			// Only open edit panel if it was a click (not a drag) and was in the middle area
			if (wasClick && slotIdx !== null) {
				// Use setTimeout to ensure state updates are processed first
				setTimeout(() => {
					setEditingSlot(prev => prev === slotIdx ? null : slotIdx);
				}, 10);
			}
			
			clickActionRef.current = { slotIndex: null, shouldOpen: false };
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [dragging, dragStart, slots, minTime, maxTime, timeRange, updateSlot]);

	// Keyboard nudge for selected slot when editing panel is open
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (editingSlot === null) return;
			const slot = slots[editingSlot];
			if (!slot) return;
			const stepMinutes = e.shiftKey ? 15 : 1;
			const delta = (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0) * stepMinutes * 60 * 1000;
			if (!delta) return;
			e.preventDefault();
			const start = new Date(slot.startAt).getTime() + delta;
			const end = new Date(slot.endAt).getTime() + delta;
			if (start >= minTime && end <= maxTime) {
				updateSlot(editingSlot, { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
			}
		};
		document.addEventListener('keydown', handleKey);
		return () => document.removeEventListener('keydown', handleKey);
	}, [editingSlot, slots, minTime, maxTime, updateSlot]);

	// Click outside to close edit overlay
	useEffect(() => {
		if (editingSlot === null) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			
			// Don't close if clicking inside the overlay
			if (editOverlayRef.current?.contains(target)) {
				return;
			}
			
			// Don't close if clicking on another slot (slots have zIndex 50)
			const clickedSlot = target.closest('[style*="zIndex: 50"]');
			if (clickedSlot) {
				return;
			}
			
			// Close if clicking elsewhere (timeline background, outside component, etc.)
			setEditingSlot(null);
		};

		// Use a small delay to avoid closing immediately after opening
		const timeoutId = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [editingSlot]);

	// Zoom controls
	const zoomIn = useCallback(() => {
		setZoomLevel(prev => Math.min(prev * 1.5, 10)); // Max 10x zoom
	}, []);

	const zoomOut = useCallback(() => {
		setZoomLevel(prev => Math.max(prev / 1.5, 0.1)); // Min 0.1x (zoomed out)
	}, []);

	const resetZoom = useCallback(() => {
		setZoomLevel(1.0);
		setTimeOffset(0);
	}, []);

	// Pan controls
	const panLeft = useCallback(() => {
		const base = getBaseTimeRange();
		const panAmount = (base.max - base.min) / (zoomLevel * 4); // Pan by 1/4 of visible range
		setTimeOffset(prev => prev - panAmount);
	}, [zoomLevel]);

	const panRight = useCallback(() => {
		const base = getBaseTimeRange();
		const panAmount = (base.max - base.min) / (zoomLevel * 4);
		setTimeOffset(prev => prev + panAmount);
	}, [zoomLevel]);

	// Wheel event for zoom/pan
	const handleWheel = useCallback((e: React.WheelEvent) => {
		if (e.ctrlKey || e.metaKey) {
			// Ctrl/Cmd + wheel = zoom
			e.preventDefault();
			const delta = e.deltaY > 0 ? 0.9 : 1.1;
			setZoomLevel(prev => Math.max(0.1, Math.min(10, prev * delta)));
		} else if (e.shiftKey) {
			// Shift + wheel = horizontal pan
			e.preventDefault();
			const base = getBaseTimeRange();
			const panAmount = (base.max - base.min) / (zoomLevel * 10) * (e.deltaY > 0 ? 1 : -1);
			setTimeOffset(prev => prev + panAmount);
		}
	}, [zoomLevel]);

	// Pan by dragging on timeline background
	const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		// Only pan if clicking directly on the timeline background, not on slots or controls
		if (target === timelineRef.current || (target.classList.contains('timeline-bg') && !target.closest('[style*="position: absolute"]'))) {
			e.preventDefault();
			setPanning(true);
			setPanStart({ x: e.clientX, time: timeOffset });
		}
	}, [timeOffset]);

	useEffect(() => {
		if (!panning || !panStart || !timelineRef.current) return;

		const handleMouseMove = (e: MouseEvent) => {
			const rect = timelineRef.current!.getBoundingClientRect();
			const dx = e.clientX - panStart.x;
			const base = getBaseTimeRange();
			const timePerPixel = (base.max - base.min) / (rect.width * zoomLevel);
			const timeDelta = -dx * timePerPixel;
			setTimeOffset(panStart.time + timeDelta);
		};

		const handleMouseUp = () => {
			setPanning(false);
			setPanStart(null);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [panning, panStart, zoomLevel]);

	// Template presets
	const applyTemplate = useCallback((template: 'hourly' | 'daily' | 'weekly') => {
		const now = new Date();
		now.setMinutes(0, 0, 0);
		const newSlots: Slot[] = [];

		if (template === 'hourly') {
			for (let i = 0; i < 24; i++) {
				const start = new Date(now);
				start.setHours(now.getHours() + i);
				const end = new Date(start);
				end.setHours(end.getHours() + 1);
				newSlots.push({
					startAt: start.toISOString(),
					endAt: end.toISOString(),
					items: [{ ref: 'note1example...' }]
				});
			}
		} else if (template === 'daily') {
			for (let i = 0; i < 7; i++) {
				const start = new Date(now);
				start.setDate(start.getDate() + i);
				start.setHours(12, 0, 0, 0);
				const end = new Date(start);
				end.setHours(14, 0, 0, 0);
				newSlots.push({
					startAt: start.toISOString(),
					endAt: end.toISOString(),
					items: [{ ref: 'note1example...' }]
				});
			}
		} else if (template === 'weekly') {
			for (let i = 0; i < 4; i++) {
				const start = new Date(now);
				start.setDate(start.getDate() + i * 7);
				start.setHours(18, 0, 0, 0);
				const end = new Date(start);
				end.setHours(20, 0, 0, 0);
				newSlots.push({
					startAt: start.toISOString(),
					endAt: end.toISOString(),
					items: [{ ref: 'note1example...' }]
				});
			}
		}

		onChange([...slots, ...newSlots].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
	}, [slots, onChange]);

	return (
		<div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
				<h3 style={{ margin: 0 }}>Schedule Timeline</h3>
				<div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
					{/* Zoom controls */}
					<div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '2px 8px', background: '#f0f0f0', borderRadius: 4 }}>
						<button onClick={zoomOut} title="Zoom out" style={{ fontSize: '0.9em', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>➖</button>
						<span style={{ fontSize: '0.8em', minWidth: '40px', textAlign: 'center' }}>{zoomLevel.toFixed(1)}x</span>
						<button onClick={zoomIn} title="Zoom in" style={{ fontSize: '0.9em', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>➕</button>
						<button onClick={resetZoom} title="Reset zoom & pan" style={{ fontSize: '0.75em', padding: '4px 6px', marginLeft: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}>🔄</button>
					</div>
				{/* Snap controls */}
				<div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 8px', background: '#f0f0f0', borderRadius: 4 }}>
					<span style={{ fontSize: '0.75em', color: '#666' }}>Snap</span>
					<select value={snapMinutes} onChange={e => setSnapMinutes(parseInt(e.target.value, 10))} style={{ fontSize: '0.85em' }}>
						<option value={0}>Off</option>
						<option value={1}>1m</option>
						<option value={5}>5m</option>
						<option value={15}>15m</option>
						<option value={30}>30m</option>
						<option value={60}>1h</option>
					</select>
				</div>
					{/* Pan controls */}
					<div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '2px 8px', background: '#f0f0f0', borderRadius: 4 }}>
						<button onClick={panLeft} title="Pan left (Shift+Wheel)" style={{ fontSize: '0.9em', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>◀</button>
						<span style={{ fontSize: '0.75em', color: '#666' }}>Pan</span>
						<button onClick={panRight} title="Pan right (Shift+Wheel)" style={{ fontSize: '0.9em', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>▶</button>
					</div>
					{/* Preset ranges */}
					<div style={{ display: 'flex', gap: 2 }}>
						<button onClick={() => { setZoom(1); resetZoom(); }} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 1 ? '#2196f3' : '#eee' }}>Auto</button>
						<button onClick={() => { setZoom(2); resetZoom(); }} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 2 ? '#2196f3' : '#eee' }}>24h</button>
						<button onClick={() => { setZoom(3); resetZoom(); }} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 3 ? '#2196f3' : '#eee' }}>48h</button>
						<button onClick={() => { setZoom(4); resetZoom(); }} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 4 ? '#2196f3' : '#eee' }}>1 week</button>
					</div>
				</div>
			</div>
			<div style={{ fontSize: '0.75em', color: '#666', marginBottom: 8 }}>
				💡 Ctrl+Wheel = Zoom | Shift+Wheel = Pan | Drag background = Pan | Arrows = Nudge (Shift=15m) | Snap editable
			</div>

			{/* Templates */}
			<div style={{ marginBottom: 12, padding: 8, background: '#fff', borderRadius: 4, fontSize: '0.85em' }}>
				<strong>Quick templates:</strong>
				<button onClick={() => applyTemplate('hourly')} style={{ marginLeft: 8, fontSize: '0.8em', padding: '4px 8px' }}>Hourly (24 slots)</button>
				<button onClick={() => applyTemplate('daily')} style={{ marginLeft: 4, fontSize: '0.8em', padding: '4px 8px' }}>Daily (7 slots)</button>
				<button onClick={() => applyTemplate('weekly')} style={{ marginLeft: 4, fontSize: '0.8em', padding: '4px 8px' }}>Weekly (4 slots)</button>
			</div>

			{/* Add new slot */}
			<div style={{ marginBottom: 16, padding: 12, background: '#fff', borderRadius: 4 }}>
				<strong>Add Slot:</strong>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginTop: 8 }}>
					<div>
						<label style={{ fontSize: '0.85em' }}>Start (local)</label>
						<div style={{ display: 'flex', gap: 4 }}>
							<input
								type="datetime-local"
								value={newSlotStart}
								onChange={e => setNewSlotStart(e.target.value)}
								style={{ flex: 1 }}
							/>
							<button onClick={() => insertCurrentTime(true)} style={{ fontSize: '0.75em', padding: '4px 8px' }}>Now</button>
						</div>
					</div>
					<div>
						<label style={{ fontSize: '0.85em' }}>End (local)</label>
						<div style={{ display: 'flex', gap: 4 }}>
							<input
								type="datetime-local"
								value={newSlotEnd}
								onChange={e => setNewSlotEnd(e.target.value)}
								style={{ flex: 1 }}
							/>
							<button onClick={() => insertCurrentTime(false)} style={{ fontSize: '0.75em', padding: '4px 8px' }}>Now</button>
						</div>
					</div>
					<button onClick={addSlot} disabled={!newSlotStart || !newSlotEnd} style={{ alignSelf: 'flex-end' }}>Add</button>
				</div>
			</div>

			{/* Timeline view */}
			<div
				ref={timelineScrollRef}
				style={{
					maxHeight: '600px',
					overflowY: 'auto',
					overflowX: 'hidden',
					border: '2px solid #ccc',
					borderRadius: 4,
					marginBottom: 16,
					position: 'relative'
				}}
				onWheel={handleWheel}
			>
				<div
					ref={timelineRef}
					className="timeline-bg"
					style={{
						position: 'relative',
						minHeight: Math.max(200, slots.length * 60),
						height: Math.max(200, slots.length * 60),
						background: '#fff',
						cursor: panning ? 'grabbing' : 'grab',
						userSelect: 'none'
					}}
					onMouseDown={handleTimelineMouseDown}
				>
				{/* Hour and half-hour gridlines */}
				{(() => {
					const gridlines: Array<{ time: number; isHour: boolean }> = [];
					const startHour = new Date(minTime);
					startHour.setMinutes(0, 0, 0);
					if (startHour.getTime() < minTime) {
						startHour.setHours(startHour.getHours() + 1);
					}

					// Generate hour and half-hour markers within visible range
					let current = startHour.getTime();
					while (current <= maxTime) {
						// Hour marker
						if (current >= minTime) {
							gridlines.push({ time: current, isHour: true });
						}
						
						// Half-hour marker (between hours)
						const halfHour = current + 30 * 60 * 1000;
						if (halfHour >= minTime && halfHour <= maxTime) {
							gridlines.push({ time: halfHour, isHour: false });
						}
						
						current += 60 * 60 * 1000; // Move to next hour
					}

					return (
						<>
							{/* Hour labels */}
							{gridlines
								.filter(g => g.isHour)
								.map((grid, idx, arr) => {
									const pos = getPosition(new Date(grid.time).toISOString());
									if (pos < 0 || pos > 100) return null;
									const hourTime = new Date(grid.time);
									const prevHour = idx > 0 ? new Date(arr[idx - 1].time) : null;
									const isNewDay = !prevHour || hourTime.getDate() !== prevHour.getDate();
									
									return (
										<div
											key={`label-${grid.time}-${idx}`}
											style={{
												position: 'absolute',
												left: `${pos}%`,
												top: isNewDay ? 0 : 2,
												transform: 'translateX(-50%)',
												fontSize: isNewDay ? '9px' : '10px',
												color: isNewDay ? '#333' : '#666',
												fontWeight: 'bold',
												zIndex: 12,
												pointerEvents: 'none',
												background: '#f5f5f5',
												padding: '0 2px',
												whiteSpace: 'nowrap'
											}}
										>
											{isNewDay && (
												<div style={{ fontSize: '8px', color: '#999', lineHeight: '1' }}>
													{hourTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
												</div>
											)}
											{hourTime.getHours().toString().padStart(2, '0')}:00
										</div>
									);
								})}
							{/* Grid lines */}
							{gridlines.map((grid, idx) => {
								const pos = getPosition(new Date(grid.time).toISOString());
								if (pos < 0 || pos > 100) return null;
								return (
									<div
										key={`grid-${grid.time}-${idx}`}
										style={{
											position: 'absolute',
											left: `${pos}%`,
											top: 24,
											bottom: 0,
											width: grid.isHour ? 2 : 1,
											background: grid.isHour ? '#999' : '#ddd',
											zIndex: 1,
											pointerEvents: 'none',
											opacity: grid.isHour ? 0.6 : 0.4
										}}
									/>
								);
							})}
						</>
					);
				})()}

				{/* Timeline header bar */}
				<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, borderBottom: '2px solid #333', background: '#f5f5f5', zIndex: 10 }}>
					{/* Time range indicator (optional - can show overall range) */}
				</div>

				{/* Current time indicator */}
				{now >= minTime && now <= maxTime && (() => {
					const nowTime = new Date(now);
					const timeStr = nowTime.toLocaleTimeString();
					const nowPos = getPosition(nowTime.toISOString());
					return (
						<div
							style={{
								position: 'absolute',
								left: `${nowPos}%`,
								top: 24,
								bottom: 0,
								width: 3,
								background: '#ff0000',
								zIndex: 100,
								pointerEvents: 'none'
							}}
						>
							<div style={{ position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)', fontSize: '10px', whiteSpace: 'nowrap', background: '#ff0000', color: 'white', padding: '2px 6px', borderRadius: 3, fontWeight: 'bold' }}>
								{timeStr}
							</div>
							<div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: '10px', whiteSpace: 'nowrap', background: '#ff0000', color: 'white', padding: '2px 4px', borderRadius: 3, fontWeight: 'bold' }}>
								NOW
							</div>
						</div>
					);
				})()}

				{/* Slots */}
				<div style={{ marginTop: 24 }}>
					{slots.map((slot, idx) => {
						const pos = getPosition(slot.startAt);
						const width = getWidth(slot);
						const isActive = now >= new Date(slot.startAt).getTime() && now < new Date(slot.endAt).getTime();
						const overlaps = getOverlaps(idx);
						const duration = new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime();
						const durationMinutes = Math.round(duration / 60000);

						return (
							<div
								key={idx}
								data-slot-index={idx}
								ref={el => {
									if (el) slotRefs.current.set(idx, el);
									else slotRefs.current.delete(idx);
								}}
								style={{
									position: 'absolute',
									left: `${pos}%`,
									width: `${width}%`,
									top: 24 + idx * 60,
									height: 50,
									background: isActive ? '#4caf50' : overlaps.length > 0 ? '#ff9800' : '#2196f3',
									border: overlaps.length > 0 ? '2px solid #f44336' : '1px solid #1976d2',
									borderRadius: 4,
									padding: 4,
									cursor: dragging ? 'grabbing' : 'pointer',
									boxSizing: 'border-box',
									display: 'flex',
									flexDirection: 'column',
									justifyContent: 'space-between',
									color: 'white',
									fontSize: '11px',
									userSelect: 'none',
									zIndex: editingSlot === idx ? 999 : (editingSlot !== null ? 30 : 50)
								}}
								onMouseDown={e => {
									// Stop event from triggering pan on timeline background
									e.stopPropagation();
								}}
								onClick={e => {
									// Prevent default click behavior if we're handling via mouseUp
									// This onClick is mainly for stopping propagation
									const target = e.target as HTMLElement;
									if (target.style.cursor === 'ew-resize') return;
									e.stopPropagation();
									// Don't handle click here - let mouseUp handle it
								}}
								title={`Slot ${idx + 1} - Click to edit`}
							>
								{/* Resize handles */}
								<div
									style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', background: 'rgba(255,255,255,0.3)' }}
									onMouseDown={e => {
										e.stopPropagation();
										handleMouseDown(e, idx, 'start');
									}}
									onClick={e => e.stopPropagation()}
								/>
								<div
									style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', background: 'rgba(255,255,255,0.3)' }}
									onMouseDown={e => {
										e.stopPropagation();
										handleMouseDown(e, idx, 'end');
									}}
									onClick={e => e.stopPropagation()}
								/>

								<div
									style={{ fontWeight: 'bold', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none' }}
									onMouseDown={e => {
										e.stopPropagation();
										// Only start drag if not clicking near edges
										const rect = e.currentTarget.getBoundingClientRect();
										const clickX = e.clientX - rect.left;
										const width = rect.width;
										if (clickX > 10 && clickX < width - 10) {
											handleMouseDown(e, idx, 'move');
										}
									}}
									onClick={e => {
										e.stopPropagation();
										// Click is handled by mouseUp, just stop propagation
									}}
									title="Click to edit slot"
								>
									{new Date(slot.startAt).toLocaleTimeString()} → {new Date(slot.endAt).toLocaleTimeString()} ({durationMinutes}m)
								</div>
								<div style={{ fontSize: '10px', textAlign: 'center' }}>
									{slot.items.length} item{slot.items.length !== 1 ? 's' : ''}
									{overlaps.length > 0 && ` ⚠ Conflict!`}
								</div>

								{editingSlot === idx && (
									<div
										ref={editOverlayRef}
										style={{
											position: 'absolute',
											top: '100%',
											left: 0,
											right: 0,
											background: '#fff',
											border: '3px solid #2196f3',
											borderRadius: 6,
											padding: 16,
											marginTop: 8,
											zIndex: 10000,
											boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
											color: '#000',
											minWidth: 400,
											isolation: 'isolate'
										}}
										onClick={e => e.stopPropagation()}
									>
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
											<strong>Slot {idx + 1}</strong>
											<div style={{ display: 'flex', gap: 4 }}>
												<button onClick={() => { duplicateSlot(idx); setEditingSlot(null); }} style={{ fontSize: '0.85em', padding: '4px 8px' }}>Duplicate</button>
												<button onClick={() => { removeSlot(idx); }} style={{ fontSize: '0.85em', padding: '4px 8px', background: '#f44336', color: 'white' }}>Delete</button>
												<button onClick={() => setEditingSlot(null)} style={{ fontSize: '0.85em', padding: '4px 8px' }}>Close</button>
											</div>
										</div>
										{overlaps.length > 0 && (
											<div style={{ padding: 8, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, marginBottom: 12, fontSize: '0.9em' }}>
												⚠️ Warning: This slot overlaps with slot{overlaps.length !== 1 ? 's' : ''} {overlaps.map(i => i + 1).join(', ')}
											</div>
										)}
										<div style={{ marginBottom: 12 }}>
											<label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Start (UTC ISO):</label>
											<input
												type="text"
												value={slot.startAt}
												onChange={e => updateSlot(idx, { startAt: e.target.value })}
												style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', padding: 4, border: '1px solid #ccc' }}
											/>
										</div>
										<div style={{ marginBottom: 12 }}>
											<label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>End (UTC ISO):</label>
											<input
												type="text"
												value={slot.endAt}
												onChange={e => updateSlot(idx, { endAt: e.target.value })}
												style={{ width: '100%', fontFamily: 'monospace', fontSize: '11px', padding: 4, border: '1px solid #ccc' }}
											/>
										</div>
										<div style={{ marginBottom: 8 }}>
											<label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Items ({slot.items.length}):</label>
											<div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #ccc', borderRadius: 4, padding: 8, background: '#f9f9f9' }}>
												{slot.items.map((item, itemIdx) => (
													<div key={itemIdx} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
														<input
															type="text"
															value={item.ref}
															onChange={e => {
																const newItems = [...slot.items];
																newItems[itemIdx] = { ...newItems[itemIdx], ref: e.target.value };
																updateSlot(idx, { items: newItems });
															}}
															style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px', padding: 4 }}
															placeholder="note1... or nevent1..."
														/>
														<button onClick={() => removeItemFromSlot(idx, itemIdx)} style={{ padding: '4px 8px', background: '#f44336', color: 'white', fontSize: '0.8em' }}>×</button>
													</div>
												))}
											</div>
											<div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
												<input
													type="text"
													value={newItemRefs[idx] || ''}
													onChange={e => setNewItemRefs({ ...newItemRefs, [idx]: e.target.value })}
													placeholder="Add new item (note1... or nevent1...)"
													onKeyDown={e => {
														if (e.key === 'Enter' && newItemRefs[idx]) {
															addItemToSlot(idx, newItemRefs[idx]);
															setNewItemRefs({ ...newItemRefs, [idx]: '' });
														}
													}}
													style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px', padding: 4 }}
												/>
												<button
													onClick={() => {
														if (newItemRefs[idx]) {
															addItemToSlot(idx, newItemRefs[idx]);
															setNewItemRefs({ ...newItemRefs, [idx]: '' });
														}
													}}
													style={{ padding: '4px 12px', fontSize: '0.85em' }}
												>
													Add Item
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
				</div>
			</div>

			{slots.length === 0 && (
				<div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
					No slots scheduled. Add a slot above or use a template to get started.
				</div>
			)}

			{/* Legend */}
			<div style={{ fontSize: '0.8em', color: '#666', display: 'flex', gap: 16, marginTop: 8 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
					<div style={{ width: 16, height: 16, background: '#4caf50', borderRadius: 2 }}></div>
					<span>Active now</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
					<div style={{ width: 16, height: 16, background: '#2196f3', borderRadius: 2 }}></div>
					<span>Scheduled</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
					<div style={{ width: 16, height: 16, background: '#ff9800', border: '2px solid #f44336', borderRadius: 2 }}></div>
					<span>Conflict (overlap)</span>
				</div>
				<div style={{ marginLeft: 'auto' }}>
					💡 Drag edges to resize, drag middle to move
				</div>
			</div>
		</div>
	);
};
