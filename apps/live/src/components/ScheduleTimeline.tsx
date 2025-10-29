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
	const [dragging, setDragging] = useState<{ type: 'start' | 'end' | 'move'; slotIndex: number; offsetX: number } | null>(null);
	const [zoom, setZoom] = useState<number>(1); // 1 = auto, 2 = 24h, 3 = 48h, 4 = 1 week
	const [newItemRefs, setNewItemRefs] = useState<Record<number, string>>({});
	const timelineRef = useRef<HTMLDivElement>(null);

	const getMinTime = () => {
		if (slots.length === 0) return Date.now();
		const min = Math.min(...slots.map(s => new Date(s.startAt).getTime()));
		const now = Date.now();
		return zoom === 2 ? Math.min(now, min) : zoom === 3 ? now - 24 * 60 * 60 * 1000 : zoom === 4 ? now - 7 * 24 * 60 * 60 * 1000 : Math.min(now - 12 * 60 * 60 * 1000, min);
	};

	const getMaxTime = () => {
		if (slots.length === 0) return Date.now() + 24 * 60 * 60 * 1000;
		const max = Math.max(...slots.map(s => new Date(s.endAt).getTime()));
		const now = Date.now();
		const defaultRange = 24 * 60 * 60 * 1000;
		return zoom === 2 ? now + defaultRange : zoom === 3 ? now + 2 * defaultRange : zoom === 4 ? now + 7 * defaultRange : Math.max(now + defaultRange, max);
	};

	const minTime = getMinTime();
	const maxTime = getMaxTime();
	const timeRange = maxTime - minTime;
	const now = Date.now();

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
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		setDragging({ type, slotIndex, offsetX });
	};

	useEffect(() => {
		if (!dragging || !timelineRef.current) return;

		const handleMouseMove = (e: MouseEvent) => {
			const rect = timelineRef.current!.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const newPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
			const newTime = minTime + (newPercent / 100) * timeRange;
			const slot = slots[dragging.slotIndex];
			if (!slot) return;

			if (dragging.type === 'start') {
				const endTime = new Date(slot.endAt).getTime();
				if (newTime < endTime - 60000) { // min 1 minute
					updateSlot(dragging.slotIndex, { startAt: new Date(newTime).toISOString() });
				}
			} else if (dragging.type === 'end') {
				const startTime = new Date(slot.startAt).getTime();
				if (newTime > startTime + 60000) { // min 1 minute
					updateSlot(dragging.slotIndex, { endAt: new Date(newTime).toISOString() });
				}
			} else if (dragging.type === 'move') {
				const duration = new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime();
				const newStart = newTime;
				const newEnd = newStart + duration;
				if (newStart >= minTime && newEnd <= maxTime) {
					updateSlot(dragging.slotIndex, {
						startAt: new Date(newStart).toISOString(),
						endAt: new Date(newEnd).toISOString()
					});
				}
			}
		};

		const handleMouseUp = () => {
			setDragging(null);
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, [dragging, slots, minTime, maxTime, timeRange, updateSlot]);

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
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<h3 style={{ margin: 0 }}>Schedule Timeline</h3>
				<div style={{ display: 'flex', gap: 4 }}>
					<button onClick={() => setZoom(1)} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 1 ? '#2196f3' : '#eee' }}>Auto</button>
					<button onClick={() => setZoom(2)} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 2 ? '#2196f3' : '#eee' }}>24h</button>
					<button onClick={() => setZoom(3)} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 3 ? '#2196f3' : '#eee' }}>48h</button>
					<button onClick={() => setZoom(4)} style={{ fontSize: '0.75em', padding: '4px 8px', background: zoom === 4 ? '#2196f3' : '#eee' }}>1 week</button>
				</div>
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
			<div ref={timelineRef} style={{ position: 'relative', height: Math.max(200, slots.length * 60), marginBottom: 16, border: '2px solid #ccc', borderRadius: 4, background: '#fff', overflow: 'hidden' }}>
				{/* Time markers */}
				<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, borderBottom: '2px solid #333', background: '#f5f5f5', zIndex: 10 }}>
					{[0, 25, 50, 75, 100].map(pct => {
						const time = new Date(minTime + (pct / 100) * timeRange);
						return (
							<div key={pct} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', fontSize: '11px', fontWeight: 'bold' }}>
								{time.toLocaleTimeString()}
							</div>
						);
					})}
				</div>

				{/* Current time indicator */}
				{now >= minTime && now <= maxTime && (
					<div
						style={{
							position: 'absolute',
							left: `${getPosition(new Date(now).toISOString())}%`,
							top: 24,
							bottom: 0,
							width: 3,
							background: '#ff0000',
							zIndex: 100,
							pointerEvents: 'none'
						}}
					>
						<div style={{ position: 'absolute', top: -20, left: -15, fontSize: '10px', whiteSpace: 'nowrap', background: '#ff0000', color: 'white', padding: '2px 4px', borderRadius: 3, fontWeight: 'bold' }}>NOW</div>
					</div>
				)}

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
									cursor: dragging ? 'grabbing' : 'grab',
									boxSizing: 'border-box',
									display: 'flex',
									flexDirection: 'column',
									justifyContent: 'space-between',
									color: 'white',
									fontSize: '11px',
									userSelect: 'none'
								}}
							>
								{/* Resize handles */}
								<div
									style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', background: 'rgba(255,255,255,0.3)' }}
									onMouseDown={e => handleMouseDown(e, idx, 'start')}
								/>
								<div
									style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', background: 'rgba(255,255,255,0.3)' }}
									onMouseDown={e => handleMouseDown(e, idx, 'end')}
								/>

								<div style={{ fontWeight: 'bold', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={e => handleMouseDown(e, idx, 'move')}>
									{new Date(slot.startAt).toLocaleTimeString()} → {new Date(slot.endAt).toLocaleTimeString()} ({durationMinutes}m)
								</div>
								<div style={{ fontSize: '10px', textAlign: 'center' }}>
									{slot.items.length} item{slot.items.length !== 1 ? 's' : ''}
									{overlaps.length > 0 && ` ⚠ Conflict!`}
								</div>

								{editingSlot === idx && (
									<div
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
											zIndex: 200,
											boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
											color: '#000',
											minWidth: 400
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
