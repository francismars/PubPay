import React, { useCallback, useState, useRef, useEffect } from 'react';

export interface Slot {
	startAt: string;
	endAt: string;
	items: Array<{ ref: string; weight?: number; title?: string }>;
    title?: string;
    speakers?: string[];
    roomName?: string;
    code?: string;
}

interface ScheduleTimelineProps {
	slots: Slot[];
	onChange: (slots: Slot[]) => void;
	onAddSlotAtTime?: (startTime: string) => void;
	scheduleJson?: string;
	onUpdateJson?: (json: string) => void;
	onOpenAddSlotModal?: () => void;
	onUploadSchedule?: () => void;
	onExportSchedule?: () => void;
	onImportSchedule?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onLoadProvidedSchedule?: () => void;
	onOpenPretalxModal?: () => void;
	createdRoomId?: string | null;
	busy?: boolean;
	scheduleError?: string | null;
	scheduleSuccess?: string | null;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ slots, onChange, onAddSlotAtTime, scheduleJson, onUpdateJson, onOpenAddSlotModal, onUploadSchedule, onExportSchedule, onImportSchedule, onLoadProvidedSchedule, onOpenPretalxModal, createdRoomId, busy, scheduleError, scheduleSuccess }) => {
	const [editorMode, setEditorMode] = useState<'timeline' | 'json'>('timeline');
	const [editingSlot, setEditingSlot] = useState<number | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; time: number } | null>(null);
	const [dragging, setDragging] = useState<{ type: 'start' | 'end' | 'move'; slotIndex: number; initialMouseX: number; initialSlotStart: number; initialSlotEnd: number } | null>(null);
	const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
	const [hasDragged, setHasDragged] = useState(false);
	const [zoom, setZoom] = useState<number>(1); // 1 = auto, 2 = 24h, 3 = 48h, 4 = 1 week
	const [timeOffset, setTimeOffset] = useState<number>(0); // Pan offset in milliseconds
	const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Zoom multiplier (1.0 = normal, 2.0 = 2x zoom, 0.5 = zoomed out)
	const [newItemRefs, setNewItemRefs] = useState<Record<number, string>>({});
	const [snapMinutes, setSnapMinutes] = useState<number>(5); // Snap-to grid in minutes (0 = off)
	const [timeZone, setTimeZone] = useState<string>('America/El_Salvador'); // Default to San Salvador time
	const [timelineHeight, setTimelineHeight] = useState<string>('100%');
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
		// Add minimal padding: just enough to see edges and add new slots
		const beforePadding = Math.max((max - min) * 0.05, 15 * 60 * 1000); // 5% or 15 min before
		const afterPadding = 60 * 60 * 1000; // Fixed 1 hour after last slot (prevents overlap with schedule end)
		return { min: min - beforePadding, max: max + afterPadding };
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

	// Time formatting helpers (respect selected timezone)
	const tzOption: string | undefined = timeZone === 'local' ? undefined : timeZone;
	const timeFmt = useCallback((ms: number, withSeconds = false) => {
		const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
		if (withSeconds) opts.second = '2-digit';
		if (tzOption) opts.timeZone = tzOption;
		return new Intl.DateTimeFormat(undefined, opts).format(new Date(ms));
	}, [tzOption]);

	const dateShortFmt = useCallback((ms: number) => {
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		if (tzOption) opts.timeZone = tzOption;
		return new Intl.DateTimeFormat('en-US', opts).format(new Date(ms));
	}, [tzOption]);

	// Snap helper
	const snapTime = useCallback((timeMs: number) => {
		if (!snapMinutes || snapMinutes <= 0) return timeMs;
		const intervalMs = snapMinutes * 60 * 1000;
		return Math.round(timeMs / intervalMs) * intervalMs;
	}, [snapMinutes]);

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

	// Keyboard shortcuts (zoom + nudge when editing)
	// This effect is intentionally placed AFTER zoom handlers are declared below

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
        setZoomLevel(prev => Math.min(prev * 1.5, 20)); // Max 20x zoom
	}, []);

    const zoomOut = useCallback(() => {
        setZoomLevel(prev => Math.max(prev / 1.5, 1)); // Min 1x (zoomed out)
	}, []);

	const resetZoom = useCallback(() => {
		setZoomLevel(1.0);
		setTimeOffset(0);
	}, []);

// Keyboard shortcuts (zoom + nudge when editing)
useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        const active = document.activeElement as HTMLElement | null;
        if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;

            if (e.key === '+' || e.key === '=' || e.key === ']') { e.preventDefault(); zoomIn(); return; }
            if (e.key === '-' || e.key === '_' || e.key === '[') { e.preventDefault(); zoomOut(); return; }
            if (e.key === '0') { e.preventDefault(); resetZoom(); return; }

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
}, [editingSlot, slots, minTime, maxTime, updateSlot, zoomIn, zoomOut, resetZoom]);

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
        if (e.altKey) {
            // Alt + wheel = zoom around mouse position (suppress scroll)
            e.preventDefault();
            e.stopPropagation();
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const r = rect.width > 0 ? x / rect.width : 0.5; // 0..1 ratio across timeline

        const deltaFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(1, Math.min(20, zoomLevel * deltaFactor));

        // Keep the time under the cursor fixed while zooming
        const base = getBaseTimeRange();
        const baseRange = base.max - base.min;
        const visibleRangeNew = baseRange / newZoom;
        // Cursor time currently displayed at:
        const currentVisible = getVisibleTimeRange();
        const cursorTime = currentVisible.min + r * (currentVisible.max - currentVisible.min);
        const centerNew = cursorTime + (0.5 - r) * visibleRangeNew;
        const baseCenter = (base.min + base.max) / 2;
        const newOffset = centerNew - baseCenter;

        setZoomLevel(newZoom);
        setTimeOffset(newOffset);
        } else if (e.shiftKey) {
			// Shift + wheel = horizontal pan
            e.preventDefault();
            e.stopPropagation();
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

	// Right-click to add slot at time
	const handleTimelineContextMenu = useCallback((e: React.MouseEvent) => {
		if (!onAddSlotAtTime || !timelineRef.current) return;
		
		const target = e.target as HTMLElement;
		// Only show context menu on timeline background, not on slots or controls
		if (target === timelineRef.current || (target.classList.contains('timeline-bg') && !target.closest('[style*="position: absolute"]'))) {
			e.preventDefault();
			const rect = timelineRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const percent = (x / rect.width) * 100;
			
			// Calculate time from position
			const clickedTime = minTime + (percent / 100) * timeRange;
			const snappedTime = snapTime(clickedTime);
			
			setContextMenu({ x: e.clientX, y: e.clientY, time: snappedTime });
		}
	}, [onAddSlotAtTime, minTime, timeRange, snapTime]);

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

    // Single custom template (replaces existing slots)
    const applyCustomTemplate = useCallback(() => {
        const newSlots: Slot[] = [
            { startAt: '2025-11-14T09:00:00Z', endAt: '2025-11-14T09:30:00Z', items: [ { ref: 'note16a7m73en9w4artfclcnhqf8jzngepmg2j2et3l2yk0ksfhftv0ls3hugv7' } ] },
            { startAt: '2025-11-14T09:30:00Z', endAt: '2025-11-14T10:00:00Z', items: [ { ref: 'note1j8fpjg60gkw266lz86ywmyr2mmy5e6kfkhtfu4umaxneff6qeyhqrl37gu' } ] },
            { startAt: '2025-11-14T10:00:00Z', endAt: '2025-11-14T10:30:00Z', items: [ { ref: 'note1lsreglfs5s5zm6e8ssavaak2adsajkad27axp00rvz734u443znqspwhvv' } ] },
            { startAt: '2025-11-14T10:30:00Z', endAt: '2025-11-14T11:00:00Z', items: [ { ref: 'nevent1qqsphk43g2pzpwfr8qcp5zdx8ftgaj7gvxk682y4sedjvscrsm0lpssc96mm3' } ] },
            { startAt: '2025-11-14T11:00:00Z', endAt: '2025-11-14T11:30:00Z', items: [
                { ref: 'nevent1qvzqqqqqqypzqlea4mfml7qvctjsypywae5g5ra8zj6t3f8sqcuj53h9xq9nn6pjqqsffzd548j3gtkck0hemn9jqgqfpdttatwhpg3vd3plhghlhatzw6cpmvz4r' },
                { ref: 'nevent1qvzqqqqqqypzqpxfzhdwlm3cx9l6wdzyft8w8y9gy607tqgtyfq7tekaxs7lhmxfqqsygu0jcvwfp7p3hhe42stxu44dcuz5zt9cy052qfg2ea98gxy2sfq2wh7j0' },
                { ref: 'nevent1qvzqqqqqqypzqy9kvcxtqa2tlwyjv4r46ancxk00ghk9yaudzsnp697s60942p7lqqs0sqpv028v3xy6z27qx8sfukgl5wn2z7j4u8ylrs8w5gfmp44j0rc4avhey' }
            ] },
            { startAt: '2025-11-14T11:30:00Z', endAt: '2025-11-14T12:00:00Z', items: [ { ref: 'nevent1qvzqqqqqqypzpw9fm7ppszzwfyxc3q6z482g3d70p7eqkxseh93mantga44ttjaaqy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qghdehhxarj945kgc369uhkxctrdpjj6un9d3shjqpq04k2daej76pv0nfrefuwp0xm4gjmqqwx0vc6yhsq9jkr956879ds4tsslp' } ] },
            { startAt: '2025-11-14T12:00:00Z', endAt: '2025-11-14T12:30:00Z', items: [ { ref: 'nevent1qqsdz8sqytjeum0utxvkvknyp9a7t0twv976tuuyzf3ngwc3572tltct2ek8j' } ] },
            { startAt: '2025-11-14T12:30:00Z', endAt: '2025-11-14T13:00:00Z', items: [ { ref: 'nevent1qqs0sqpv028v3xy6z27qx8sfukgl5wn2z7j4u8ylrs8w5gfmp44j0rceyfxj5' } ] },
            { startAt: '2025-11-14T14:00:00Z', endAt: '2025-11-14T14:30:00Z', items: [ { ref: 'nevent1qqs8t9m7rcgnjj35ekvcrgpxt78t0u9a7yyp5pkjmmkae4kg7d8s5sqd7u960' } ] },
            { startAt: '2025-11-14T14:30:00Z', endAt: '2025-11-14T15:00:00Z', items: [ { ref: 'nevent1qqsre8grh4vyyhlsnp7wy5r8xrvsffzeg7w4tz5mr0t6fhd6x77fexcrl34gy' } ] },
            { startAt: '2025-11-14T15:00:00Z', endAt: '2025-11-14T15:30:00Z', items: [ { ref: 'nevent1qqsv4jk2xzhkfh6kk3uwfwf2xjvpl4qsne435njml08kr7pnhpcfhxq8k43rt' } ] },
            { startAt: '2025-11-14T15:30:00Z', endAt: '2025-11-14T16:00:00Z', items: [ { ref: 'nevent1qqsf6r5v9n6kj6mhjruylugz55gac44tzfyyh884rdvfasls0yujgqsl9vkqe' } ] },
            { startAt: '2025-11-14T16:00:00Z', endAt: '2025-11-14T16:30:00Z', items: [ { ref: 'nevent1qqsxnzdah0x9sp75ajrzve4aehacqt9rzepjcfkrfrllr65h6v542ksrhyy82' } ] },
            { startAt: '2025-11-14T16:30:00Z', endAt: '2025-11-14T17:00:00Z', items: [ { ref: 'nevent1qqsrc4h3a7063fxn2lwt5ven9dyv949k9yeh3rju0z2p7t2shmp0zfc44nm74' } ] },
            { startAt: '2025-11-14T17:00:00Z', endAt: '2025-11-14T17:30:00Z', items: [ { ref: 'nevent1qqs90rz4e4prc909h6f9cn30872h9rk4etqfqw3xrrgpd7waennjg2s9mc0jn' } ] },
            { startAt: '2025-11-14T17:30:00Z', endAt: '2025-11-14T18:00:00Z', items: [] }
        ];

        onChange(newSlots);
    }, [onChange]);

	const [showAdvancedControls, setShowAdvancedControls] = useState(false);
	const advancedPanelRef = useRef<HTMLDivElement>(null);
	const [panelPosition, setPanelPosition] = useState<{ bottom?: number; top?: number; right?: number; left?: number }>({ bottom: 44, right: 0 });
	const controlsFloaterRef = useRef<HTMLDivElement>(null);
	
	const [editOverlayPosition, setEditOverlayPosition] = useState<{ top?: string; bottom?: string; left?: number | string; right?: number | string; marginTop?: number; marginBottom?: number }>({ top: '100%', left: 0, marginTop: 8 });

	// Calculate panel position to stay within bounds
	const calculatePanelPosition = useCallback(() => {
		if (!showAdvancedControls || !advancedPanelRef.current || !timelineScrollRef.current) return;
		
		const panel = advancedPanelRef.current;
		const container = timelineScrollRef.current;
		
		// Get container dimensions (scrollable area)
		const containerHeight = container.clientHeight;
		const containerWidth = container.clientWidth;
		const scrollTop = container.scrollTop;
		const scrollLeft = container.scrollLeft;
		
		// Get panel dimensions
		const panelHeight = panel.offsetHeight || 300; // Estimate if not rendered
		const panelWidth = panel.offsetWidth || 220;
		
		const buttonHeight = 44; // Height of button row + gap
		const padding = 12; // Padding from edges
		
		const newPosition: { bottom?: number; top?: number; right?: number; left?: number } = {};
		
		// Check if panel would overflow bottom (accounting for visible viewport)
		// When positioned from bottom: panel top = scrollHeight - buttonHeight - panelHeight
		// Panel is visible if: scrollTop <= panelTop <= scrollTop + containerHeight - panelHeight
		const scrollHeight = container.scrollHeight;
		const panelTopIfFromBottom = scrollHeight - buttonHeight - panelHeight;
		const minVisibleTop = scrollTop + padding;
		const maxVisibleTop = scrollTop + containerHeight - panelHeight - padding;
		const wouldOverflowBottom = panelTopIfFromBottom < minVisibleTop;
		
		// Check if panel would overflow right  
		// When positioned from right: panel left = scrollWidth - panelWidth
		// Panel is visible if: scrollLeft <= panelLeft <= scrollLeft + containerWidth - panelWidth
		const scrollWidth = container.scrollWidth;
		const panelLeftIfFromRight = scrollWidth - panelWidth;
		const minVisibleLeft = scrollLeft + padding;
		const maxVisibleLeft = scrollLeft + containerWidth - panelWidth - padding;
		const wouldOverflowRight = panelLeftIfFromRight < minVisibleLeft;
		
		if (wouldOverflowBottom) {
			newPosition.top = buttonHeight;
		} else {
			newPosition.bottom = buttonHeight;
		}
		
		if (wouldOverflowRight) {
			newPosition.left = 0;
		} else {
			newPosition.right = 0;
		}
		
		setPanelPosition(newPosition);
	}, [showAdvancedControls]);

	useEffect(() => {
		if (showAdvancedControls) {
			// Use setTimeout to ensure panel is rendered and measured
			const timeoutId = setTimeout(calculatePanelPosition, 0);
			
			// Recalculate on scroll and resize
			const container = timelineScrollRef.current;
			const handleScroll = () => calculatePanelPosition();
			const handleResize = () => calculatePanelPosition();
			
			if (container) {
				container.addEventListener('scroll', handleScroll);
				window.addEventListener('resize', handleResize);
			}
			
			return () => {
				clearTimeout(timeoutId);
				if (container) {
					container.removeEventListener('scroll', handleScroll);
					window.removeEventListener('resize', handleResize);
				}
			};
		}
	}, [showAdvancedControls, calculatePanelPosition]);

	// Calculate edit overlay position to stay within bounds
	const calculateEditOverlayPosition = useCallback(() => {
		if (editingSlot === null || !editOverlayRef.current || !timelineScrollRef.current || !slotRefs.current.has(editingSlot)) {
			return;
		}

		const overlay = editOverlayRef.current;
		const container = timelineScrollRef.current;
		const slotElement = slotRefs.current.get(editingSlot);
		
		if (!slotElement) return;

		const containerHeight = container.clientHeight;
		const containerWidth = container.clientWidth;
		const scrollTop = container.scrollTop;
		const scrollLeft = container.scrollLeft;
		
		// Get slot position relative to timeline container (not viewport)
		const slotOffsetTop = slotElement.offsetTop;
		const slotOffsetHeight = slotElement.offsetHeight;
		const slotOffsetLeft = slotElement.offsetLeft;
		const slotOffsetWidth = slotElement.offsetWidth;
		
		const slotTop = slotOffsetTop;
		const slotBottom = slotTop + slotOffsetHeight;
		const slotLeft = slotOffsetLeft;
		const slotRight = slotLeft + slotOffsetWidth;
		
		const overlayHeight = overlay.offsetHeight || 400; // Estimate if not measured
		const overlayWidth = overlay.offsetWidth || 400;
		const padding = 12;
		const marginTop = 8;
		
		const newPosition: { top?: string; bottom?: string; left?: number | string; right?: number | string; marginTop?: number; marginBottom?: number } = {};
		
		// Check visible area for slot
		const slotVisibleTop = Math.max(scrollTop, slotTop);
		const slotVisibleBottom = Math.min(scrollTop + containerHeight, slotBottom);
		
		// Check if overlay fits below slot in visible area
		const spaceBelow = (scrollTop + containerHeight) - slotVisibleBottom;
		const spaceAbove = slotVisibleTop - scrollTop;
		
		if (spaceBelow >= overlayHeight + marginTop + padding || (spaceAbove < overlayHeight + padding && spaceBelow >= marginTop + padding)) {
			// Position below slot
			newPosition.top = '100%';
			newPosition.marginTop = marginTop;
			delete newPosition.bottom;
			delete newPosition.marginBottom;
		} else {
			// Position above slot
			newPosition.bottom = '100%';
			newPosition.marginBottom = marginTop;
			delete newPosition.top;
			delete newPosition.marginTop;
		}
		
		// Check horizontal positioning
		const slotVisibleLeft = Math.max(scrollLeft, slotLeft);
		const slotVisibleRight = Math.min(scrollLeft + containerWidth, slotRight);
		
		// Try to align with slot, but adjust if overlay would overflow
		if (slotLeft + overlayWidth <= scrollLeft + containerWidth - padding) {
			// Fits from slot left
			newPosition.left = 0;
			delete newPosition.right;
		} else if (slotRight - overlayWidth >= scrollLeft + padding) {
			// Fits aligned to slot right
			newPosition.right = 0;
			delete newPosition.left;
		} else {
			// Center or align to container
			if (slotLeft < scrollLeft + padding) {
				newPosition.left = padding;
				delete newPosition.right;
			} else if (slotRight > scrollLeft + containerWidth - padding) {
				newPosition.right = padding;
				delete newPosition.left;
			} else {
				// Center it in visible area
				const centerX = scrollLeft + containerWidth / 2;
				newPosition.left = centerX - slotLeft - overlayWidth / 2;
				delete newPosition.right;
			}
		}
		
		setEditOverlayPosition(newPosition);
	}, [editingSlot]);

	useEffect(() => {
		if (editingSlot !== null) {
			// Use setTimeout to ensure overlay is rendered and measured
			const timeoutId = setTimeout(calculateEditOverlayPosition, 0);
			
			// Recalculate on scroll and resize
			const container = timelineScrollRef.current;
			const handleScroll = () => calculateEditOverlayPosition();
			const handleResize = () => calculateEditOverlayPosition();
			
			if (container) {
				container.addEventListener('scroll', handleScroll);
				window.addEventListener('resize', handleResize);
			}
			
			return () => {
				clearTimeout(timeoutId);
				if (container) {
					container.removeEventListener('scroll', handleScroll);
					window.removeEventListener('resize', handleResize);
				}
			};
		}
	}, [editingSlot, calculateEditOverlayPosition]);

	// Calculate timeline height: fill available space, or expand if slots need more
	useEffect(() => {
		if (editorMode !== 'timeline') return;

		const container = timelineScrollRef.current;
		if (!container) return;

		const updateHeight = () => {
			const containerHeight = container.clientHeight;
			const contentHeight = slots.length > 0 ? slots.length * 80 + 120 : 0;
			// Use the larger of container height or content height
			const calculatedHeight = Math.max(containerHeight, contentHeight || containerHeight);
			setTimelineHeight(`${calculatedHeight}px`);
		};

		// Wait for layout to complete
		const timeout = setTimeout(() => {
			requestAnimationFrame(() => {
				updateHeight();
			});
		}, 0);

		// Watch for container size changes
		const resizeObserver = new ResizeObserver(() => {
			updateHeight();
		});
		resizeObserver.observe(container);

		return () => {
			clearTimeout(timeout);
			resizeObserver.disconnect();
		};
	}, [editorMode, slots.length]);

	// Keep floating controls fixed at bottom-right of scroll container viewport

	useEffect(() => {
		// Only position controls when in timeline mode
		if (editorMode !== 'timeline') return;

		const container = timelineScrollRef.current;
		const controls = controlsFloaterRef.current;
		
		if (!container || !controls) return;
		
		const updateControlsPosition = () => {
			const containerRect = container.getBoundingClientRect();
			
			// Position controls at bottom-right of container viewport (12px from bottom, 32px from right to avoid scrollbar)
			controls.style.bottom = `${window.innerHeight - containerRect.bottom + 12}px`;
			controls.style.right = `${window.innerWidth - containerRect.right + 24}px`;
			controls.style.top = 'auto';
			controls.style.left = 'auto';
		};
		
		// Wait for layout to complete before initial positioning
		// Double RAF ensures layout is fully complete, especially when switching back from JSON mode
		const initialPosition = requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				updateControlsPosition();
			});
		});
		
		const handleScroll = () => updateControlsPosition();
		const handleResize = () => updateControlsPosition();
		
		// Watch for container size changes (e.g., when slots change and timeline resizes)
		const resizeObserver = new ResizeObserver(() => {
			updateControlsPosition();
		});
		resizeObserver.observe(container);
		
		container.addEventListener('scroll', handleScroll);
		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleScroll, true); // Capture scroll events from any element
		
		return () => {
			cancelAnimationFrame(initialPosition);
			resizeObserver.disconnect();
			container.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleScroll, true);
		};
	}, [editorMode]);

	// Close context menu on click outside
	useEffect(() => {
		if (!contextMenu) return;
		const handleClick = () => setContextMenu(null);
		window.addEventListener('click', handleClick);
		return () => window.removeEventListener('click', handleClick);
	}, [contextMenu]);

	return (
		<div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, background: '#fafafa', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<h3 style={{ margin: 0 }}>{editorMode === 'timeline' ? 'Schedule Timeline' : 'Schedule JSON'}</h3>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					{(scheduleError || scheduleSuccess) && (
						<div style={{ display: 'flex', gap: 8 }}>
							{scheduleError && <div style={{ padding: '4px 8px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 6, display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 500, lineHeight: '1.2', fontFamily: 'inherit', boxSizing: 'border-box', margin: 0, whiteSpace: 'nowrap' }}>{scheduleError}</div>}
							{scheduleSuccess && <div style={{ padding: '4px 8px', background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6, display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 500, lineHeight: '1.2', fontFamily: 'inherit', boxSizing: 'border-box', margin: 0, whiteSpace: 'nowrap' }}>{scheduleSuccess}</div>}
						</div>
					)}
					<div style={{ fontSize: '0.75em', color: '#666' }}>
						TZ: {timeZone === 'local' ? 'Local' : timeZone}
					</div>
					{onOpenAddSlotModal && (
						<button
							onClick={onOpenAddSlotModal}
							title="Add Slot"
							aria-label="Add Slot"
							style={{
								width: 36,
								height: 36,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								background: '#f9fafb',
								color: '#374151',
								border: '1px solid #e5e7eb',
								borderRadius: 10,
								cursor: 'pointer',
								fontSize: '16px',
								transition: 'all 0.2s ease'
							}}
						>
							➕
						</button>
					)}
					<button
						onClick={() => setEditorMode(editorMode === 'timeline' ? 'json' : 'timeline')}
						title={editorMode === 'timeline' ? 'Edit JSON' : 'View Timeline'}
						aria-label={editorMode === 'timeline' ? 'Edit JSON' : 'View Timeline'}
						style={{
							width: 36,
							height: 36,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: editorMode === 'json' ? '#4a75ff' : '#f9fafb',
							color: editorMode === 'json' ? '#fff' : '#374151',
							border: '1px solid #e5e7eb',
							borderRadius: 10,
							cursor: 'pointer',
							fontSize: '16px',
							transition: 'all 0.2s ease'
						}}
					>
						✏️
					</button>
				</div>
			</div>

			<div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
			{editorMode === 'timeline' ? (
				<>
			{/* Timeline view */}
			<div
				ref={timelineScrollRef}
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: 'auto', // Allow scrolling when content exceeds available space
					overflowX: 'hidden',
					border: '2px solid #e5e7eb',
					borderRadius: 4,
					marginBottom: 16,
					position: 'relative'
				}}
				onWheel={handleWheel}
			>
				{/* Floating controls - positioned relative to scroll container viewport */}
				<div 
					ref={controlsFloaterRef}
					style={{
						position: 'fixed',
						pointerEvents: 'none',
						zIndex: 100
					}}>
					<div style={{ 
						pointerEvents: 'auto', 
						display: 'flex', 
						flexDirection: 'row', 
						gap: 6, 
						alignItems: 'center',
						background: 'rgba(255, 255, 255, 0.98)', 
						backdropFilter: 'blur(12px)', 
						border: '1px solid rgba(229, 231, 235, 0.8)', 
						borderRadius: 12, 
						padding: 10, 
						boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)'
					}}>
					{/* Zoom controls */}
					<div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
						<button 
							onClick={zoomOut} 
							title="Zoom out (-)" 
							onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
							onMouseLeave={(e) => e.currentTarget.style.background = '#f9fafb'}
							style={{ 
								width: 36, 
								height: 36, 
								display: 'inline-flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								background: '#f9fafb', 
								border: '1px solid #e5e7eb', 
								borderRadius: 10, 
								cursor: 'pointer', 
								fontSize: '16px',
								transition: 'all 0.2s ease',
								color: '#374151'
							}}
						>−</button>
						<div style={{ 
							fontSize: '12px', 
							minWidth: '42px', 
							textAlign: 'center', 
							color: '#111827', 
							fontWeight: 700,
							letterSpacing: '0.3px'
						}}>{zoomLevel.toFixed(1)}×</div>
						<button 
							onClick={zoomIn} 
							title="Zoom in (+)" 
							onMouseEnter={(e) => e.currentTarget.style.background = '#e5e7eb'}
							onMouseLeave={(e) => e.currentTarget.style.background = '#f9fafb'}
							style={{ 
								width: 36, 
								height: 36, 
								display: 'inline-flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								background: '#f9fafb', 
								border: '1px solid #e5e7eb', 
								borderRadius: 10, 
								cursor: 'pointer', 
								fontSize: '16px',
								transition: 'all 0.2s ease',
								color: '#374151'
							}}
						>+</button>
						<button 
							onClick={resetZoom} 
							title="Reset zoom & pan (0)" 
							onMouseEnter={(e) => e.currentTarget.style.background = '#4a75ff'}
							onMouseLeave={(e) => e.currentTarget.style.background = '#f9fafb'}
							style={{ 
								width: 36, 
								height: 36, 
								display: 'inline-flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								background: '#f9fafb', 
								border: '1px solid #e5e7eb', 
								borderRadius: 10, 
								cursor: 'pointer', 
								fontSize: '14px',
								transition: 'all 0.2s ease',
								color: '#374151'
							}}
						>↻</button>
					</div>
					{/* Settings button with advanced panel */}
					<div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
						<button 
							onClick={() => setShowAdvancedControls(!showAdvancedControls)} 
							title="Settings" aria-label="Settings" 
							onMouseEnter={(e) => {
								if (snapMinutes === 0) {
									e.currentTarget.style.background = '#4a75ff';
									e.currentTarget.style.color = '#fff';
								} else {
									e.currentTarget.style.background = '#3d66e5';
								}
							}}
							onMouseLeave={(e) => {
								if (snapMinutes === 0) {
									e.currentTarget.style.background = '#f9fafb';
									e.currentTarget.style.color = '#374151';
								} else {
									e.currentTarget.style.background = '#4a75ff';
								}
							}}
							style={{ 
								width: 36, 
								height: 36, 
								display: 'inline-flex', 
								alignItems: 'center', 
								justifyContent: 'center', 
								background: snapMinutes > 0 ? '#4a75ff' : '#f9fafb', 
								color: snapMinutes > 0 ? '#fff' : '#374151', 
								border: '1px solid #e5e7eb', 
								borderRadius: 10, 
								cursor: 'pointer', 
								fontSize: '16px',
								transition: 'all 0.2s ease'
							}}
						>
							⚙️
						</button>
						{showAdvancedControls && (
							<div 
								ref={advancedPanelRef}
								style={{ 
									position: 'absolute', 
									...panelPosition,
									background: 'rgba(255, 255, 255, 0.98)', 
									backdropFilter: 'blur(12px)', 
									border: '1px solid rgba(229, 231, 235, 0.8)', 
									borderRadius: 12, 
									padding: 14, 
									boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)', 
									minWidth: 220, 
									maxWidth: 'calc(100% - 24px)',
									zIndex: 101 
								}}>
								<div style={{ marginBottom: 12 }}>
									<label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: 6, fontWeight: 600 }}>Snap to grid</label>
									<select 
										value={snapMinutes} 
										onChange={e => setSnapMinutes(parseInt(e.target.value, 10))} 
										style={{ 
											width: '100%', 
											fontSize: '13px', 
											padding: '8px 10px', 
											border: '1px solid #e5e7eb', 
											borderRadius: 8,
											background: '#fff',
											cursor: 'pointer',
											transition: 'border-color 0.2s ease'
										}}
										onFocus={(e) => e.currentTarget.style.borderColor = '#4a75ff'}
										onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
									>
										<option value={0}>Off</option>
										<option value={1}>1 minute</option>
										<option value={5}>5 minutes</option>
										<option value={15}>15 minutes</option>
										<option value={30}>30 minutes</option>
										<option value={60}>1 hour</option>
									</select>
								</div>
								<div style={{ paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
									<label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: 6, fontWeight: 600 }}>Timezone</label>
									<select 
										value={timeZone} 
										onChange={e => setTimeZone(e.target.value)} 
										style={{ 
											width: '100%', 
											fontSize: '13px', 
											padding: '8px 10px', 
											border: '1px solid #e5e7eb', 
											borderRadius: 8,
											background: '#fff',
											cursor: 'pointer',
											transition: 'border-color 0.2s ease'
										}}
										onFocus={(e) => e.currentTarget.style.borderColor = '#4a75ff'}
										onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
									>
										<option value="local">Local</option>
										<option value="UTC">UTC</option>
										<option value="America/El_Salvador">America/El_Salvador</option>
										<option value="America/New_York">America/New_York</option>
										<option value="America/Los_Angeles">America/Los_Angeles</option>
										<option value="Europe/London">Europe/London</option>
										<option value="Europe/Berlin">Europe/Berlin</option>
										<option value="Asia/Bangkok">Asia/Bangkok</option>
										<option value="Asia/Tokyo">Asia/Tokyo</option>
										<option value="Australia/Sydney">Australia/Sydney</option>
									</select>
								</div>
							</div>
						)}
					</div>
					</div>
				</div>
				<div
					ref={timelineRef}
					className="timeline-bg"
					style={{
						position: 'relative',
						height: timelineHeight, // Calculated height: fills container or expands for slots
						background: '#fff',
						cursor: panning ? 'grabbing' : 'grab',
						userSelect: 'none'
					}}
					onMouseDown={handleTimelineMouseDown}
					onContextMenu={handleTimelineContextMenu}
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
							const hourMs = grid.time;
							const prevHourMs = idx > 0 ? arr[idx - 1].time : null;
							const thisDay = dateShortFmt(hourMs);
							const prevDay = prevHourMs !== null ? dateShortFmt(prevHourMs!) : null;
							const isNewDay = !prevDay || thisDay !== prevDay;
									
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
												{thisDay}
											</div>
										)}
										{timeFmt(hourMs).slice(0,5)}
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
				<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, borderBottom: '2px solid #e5e7eb', background: '#f5f5f5', zIndex: 10 }}>
					{/* Time range indicator (optional - can show overall range) */}
				</div>

				{/* Current time indicator */}
				{now >= minTime && now <= maxTime && (() => {
					const nowTime = new Date(now);
					const timeStr = timeFmt(nowTime.getTime(), true);
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
							top: 24 + idx * 80,
							height: 70,
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
									overflow: 'hidden',
									minWidth: 0,
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
							<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', minWidth: 0 }}>
								{slot.title ? (
									<div style={{ fontWeight: 'bold', color: '#fff', textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={slot.title}>
										{slot.title}{slot.code ? ` • ${slot.code}` : ''}
									</div>
								) : null}
								{slot.speakers && slot.speakers.length > 0 ? (
									<div style={{ opacity: 0.95, fontSize: '10px', textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={slot.speakers.join(', ')}>
										{slot.speakers.join(', ')}
									</div>
								) : null}
								<div style={{ fontSize: '10px', textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={`${timeFmt(new Date(slot.startAt).getTime())} → ${timeFmt(new Date(slot.endAt).getTime())} (${durationMinutes}m)${slot.roomName ? ` • ${slot.roomName}` : ''}`}>
									{timeFmt(new Date(slot.startAt).getTime())} → {timeFmt(new Date(slot.endAt).getTime())} ({durationMinutes}m){slot.roomName ? ` • ${slot.roomName}` : ''}
								</div>
							</div>
								</div>
						<div style={{ fontSize: '10px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', minWidth: 0 }}>
							{slot.items.length} item{slot.items.length !== 1 ? 's' : ''}
							{overlaps.length > 0 && ' ⚠ Conflict!'}
						</div>

								{editingSlot === idx && (
									<div
										ref={editOverlayRef}
										style={{
											position: 'absolute',
											...editOverlayPosition,
											background: '#fff',
											border: '3px solid #2196f3',
											borderRadius: 6,
											padding: 16,
											zIndex: 10000,
											boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
											color: '#000',
											minWidth: 400,
											maxWidth: 'calc(100vw - 48px)',
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
							{/* Readonly Pretalx info (if available) */}
							{(slot.title || (slot.speakers && slot.speakers.length) || slot.roomName || slot.code) && (
								<div style={{ marginBottom: 12, padding: 8, background: '#f7faff', border: '1px solid #cfe3ff', borderRadius: 6 }}>
									<div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 6, columnGap: 8, alignItems: 'center' }}>
										{slot.title && (
											<>
												<div style={{ fontSize: '0.85em', color: '#555' }}>Title</div>
												<div style={{ fontWeight: 'bold' }}>{slot.title}</div>
											</>
										)}
										{slot.code && (
											<>
												<div style={{ fontSize: '0.85em', color: '#555' }}>Code</div>
												<div style={{ fontFamily: 'monospace' }}>{slot.code}</div>
											</>
										)}
										{slot.speakers && slot.speakers.length > 0 && (
											<>
												<div style={{ fontSize: '0.85em', color: '#555' }}>Speakers</div>
												<div>{slot.speakers.join(', ')}</div>
											</>
										)}
										{slot.roomName && (
											<>
												<div style={{ fontSize: '0.85em', color: '#555' }}>Room</div>
												<div>{slot.roomName}</div>
											</>
										)}
									</div>
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
				
				{/* Right-click context menu floater */}
				{contextMenu && onAddSlotAtTime && (
					<div
						style={{
							position: 'fixed',
							left: contextMenu.x,
							top: contextMenu.y,
							zIndex: 1000,
							background: 'rgba(255, 255, 255, 0.98)',
							backdropFilter: 'blur(12px)',
							border: '1px solid rgba(229, 231, 235, 0.8)',
							borderRadius: 12,
							padding: '8px 12px',
							boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							cursor: 'pointer'
						}}
						onClick={(e) => {
							e.stopPropagation();
							const startTime = new Date(contextMenu.time);
							// Convert to local datetime-local format (YYYY-MM-DDTHH:mm)
							const local = new Date(startTime.getTime() - startTime.getTimezoneOffset() * 60000);
							const localISO = local.toISOString().slice(0, 16);
							onAddSlotAtTime(localISO);
							setContextMenu(null);
						}}
					>
						<span style={{ fontSize: '13px', color: '#374151' }}>Add slot here</span>
						<button
							style={{
								width: 28,
								height: 28,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								background: '#4a75ff',
								color: '#fff',
								border: 'none',
								borderRadius: 8,
								cursor: 'pointer',
								fontSize: '16px',
								fontWeight: 'bold'
							}}
						>
							+
						</button>
					</div>
				)}
				</div>
			</div>

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
					💡 Alt+Wheel = Zoom • Shift+Wheel = Pan • Drag edges to resize, drag middle to move
				</div>
			</div>
				</>
			) : (
				<>
					{scheduleJson !== undefined && onUpdateJson && (
						<>
							<textarea
								value={scheduleJson}
								onChange={e => {
									onUpdateJson(e.target.value);
									// Try to parse and update slots if valid JSON
									try {
										const parsed = JSON.parse(e.target.value);
										if (parsed.slots && Array.isArray(parsed.slots)) {
											onChange(parsed.slots);
										}
									} catch {
										// Invalid JSON, ignore
									}
								}}
								style={{ width: '100%', flex: 1, minHeight: 0, fontFamily: 'monospace', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, resize: 'none' }}
							/>
							<div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
								{onUploadSchedule && (
									<button onClick={onUploadSchedule} disabled={busy || !createdRoomId} style={{ background: '#4a75ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', opacity: busy || !createdRoomId ? 0.7 : 1 }}>Upload schedule</button>
								)}
								{onExportSchedule && (
									<button onClick={onExportSchedule} style={{ fontSize: '0.9em', padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8 }}>Export JSON</button>
								)}
								{onImportSchedule && (
									<label style={{ fontSize: '0.9em', padding: '6px 10px', cursor: 'pointer', border: '1px solid #e5e7eb', background: '#F3F4F6', borderRadius: 8, display: 'inline-block' }}>
										Import JSON
										<input type="file" accept=".json" onChange={onImportSchedule} style={{ display: 'none' }} />
									</label>
								)}
								{onLoadProvidedSchedule && (
									<button onClick={onLoadProvidedSchedule} style={{ fontSize: '0.9em', padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8 }}>Load provided schedule</button>
								)}
								{createdRoomId && onOpenPretalxModal && (
									<button onClick={onOpenPretalxModal} style={{ fontSize: '0.9em', padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Sync with Pretalx…</button>
								)}
							</div>
							<p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
								Tip: times must be UTC ISO format (e.g., "2025-10-29T21:00:00Z"). Items accept note1/nevent1 references.
							</p>
						</>
					)}
				</>
			)}
			</div>
		</div>
	);
};
