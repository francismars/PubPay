// RoomsService - In-memory rooms, schedules, and rotation logic (MVP)
import { Logger } from '../utils/logger';

export type RotationPolicy = 'round_robin' | 'random' | 'weighted';

export interface RoomConfig {
	id: string;
	name: string;
	slug?: string;
	timezone?: string;
	password?: string;
	rotationPolicy: RotationPolicy;
	rotationIntervalSec: number;
	defaultItems: string[]; // note1/nevent1 refs
}

export interface ScheduleItem {
	ref: string; // note1/nevent1
	weight?: number;
	title?: string;
}

export interface Slot {
	startAt: string; // ISO UTC
	endAt: string; // ISO UTC
	lives: ScheduleItem[]; // Required: array of live references
	title?: string;
	speakers?: string[];
}

export interface Schedule {
	slots: Slot[];
}

export interface RoomState {
	config: RoomConfig;
	schedule: Schedule | null;
	version: number; // increments on schedule/config change
}

export interface ViewPayload {
	active: { slotStart: string; slotEnd: string } | null;
	items: string[]; // flattened refs for current active slot, or default
	policy: { type: RotationPolicy; intervalSec: number };
	index: number; // current item index for rotation
	nextSwitchAt: string; // ISO
	defaultItems: string[];
	upcomingSlots?: Array<{ startAt: string; endAt: string; items: string[] }>; // optional preview
	previousSlots?: Array<{ startAt: string; endAt: string; items: string[] }>; // optional previous slots
}

export class RoomsService {
	private static instance: RoomsService;
	private readonly logger = new Logger('RoomsService');
	private readonly rooms = new Map<string, RoomState>();

	public static getInstance(): RoomsService {
		if (!RoomsService.instance) RoomsService.instance = new RoomsService();
		return RoomsService.instance;
	}

	public createRoom(configInput: Partial<RoomConfig> & { name: string }): RoomConfig {
		const id = configInput.id || this.generateId();
		const config: RoomConfig = {
			id,
			name: configInput.name,
			slug: configInput.slug,
			timezone: configInput.timezone || 'UTC',
			password: configInput.password,
			rotationPolicy: configInput.rotationPolicy || 'round_robin',
			rotationIntervalSec: configInput.rotationIntervalSec || 60,
			defaultItems: configInput.defaultItems || []
		};

		this.rooms.set(id, { config, schedule: null, version: 1 });
		this.logger.info(`Created room ${id}`);
		return config;
	}

	public setSchedule(roomId: string, schedule: Schedule): { version: number } {
		const room = this.rooms.get(roomId);
		if (!room) throw new Error('Room not found');

		// Strict validation
		if (!schedule || !Array.isArray(schedule.slots)) {
			throw new Error('schedule.slots must be an array');
		}

		const validatedSlots: Slot[] = [];
		for (let i = 0; i < schedule.slots.length; i++) {
			const slot = schedule.slots[i];
			const slotIndex = i + 1;

			// Validate required fields
			if (!slot.startAt || typeof slot.startAt !== 'string') {
				throw new Error(`Slot ${slotIndex}: startAt must be a non-empty string (UTC ISO format)`);
			}
			if (!slot.endAt || typeof slot.endAt !== 'string') {
				throw new Error(`Slot ${slotIndex}: endAt must be a non-empty string (UTC ISO format)`);
			}

			// Validate dates
			const start = new Date(slot.startAt);
			const end = new Date(slot.endAt);
			if (isNaN(start.getTime())) {
				throw new Error(`Slot ${slotIndex}: invalid startAt date format (use UTC ISO format, e.g., "2025-10-29T21:00:00Z")`);
			}
			if (isNaN(end.getTime())) {
				throw new Error(`Slot ${slotIndex}: invalid endAt date format (use UTC ISO format, e.g., "2025-10-29T21:00:00Z")`);
			}
			if (end <= start) {
				throw new Error(`Slot ${slotIndex}: endAt must be after startAt`);
			}

			// Strict validation: only accept 'lives', not 'items'
			const slotWithItems = slot as Slot & { items?: unknown };
			if (slotWithItems.items !== undefined) {
				throw new Error(`Slot ${slotIndex}: 'items' field is deprecated. Use 'lives' instead (e.g., "lives": [{"ref": "note1..."}])`);
			}
			if (!slot.lives) {
				throw new Error(`Slot ${slotIndex}: 'lives' field is required (must be an array)`);
			}
			if (!Array.isArray(slot.lives)) {
				throw new Error(`Slot ${slotIndex}: 'lives' must be an array`);
			}

			// Validate each live
			for (let j = 0; j < slot.lives.length; j++) {
				const live = slot.lives[j];
				const liveIndex = j + 1;
				if (!live || typeof live !== 'object') {
					throw new Error(`Slot ${slotIndex}, live ${liveIndex}: must be an object`);
				}
				if (!live.ref || typeof live.ref !== 'string') {
					throw new Error(`Slot ${slotIndex}, live ${liveIndex}: 'ref' is required and must be a string`);
				}
				if (!live.ref.startsWith('note1') && !live.ref.startsWith('nevent1')) {
					throw new Error(`Slot ${slotIndex}, live ${liveIndex}: 'ref' must start with 'note1' or 'nevent1' (got: "${live.ref}")`);
				}
			}

			validatedSlots.push({
				startAt: slot.startAt,
				endAt: slot.endAt,
				lives: slot.lives,
				...(slot.title && { title: slot.title }),
				...(slot.speakers && Array.isArray(slot.speakers) && { speakers: slot.speakers })
			});
		}

		// Sort slots by start time for deterministic selection
		const validatedSchedule: Schedule = {
			slots: validatedSlots.sort(
				(a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
			)
		};

		room.schedule = validatedSchedule;
		room.version += 1;
		return { version: room.version };
	}

	public updateConfig(
		roomId: string,
		updates: Partial<Omit<RoomConfig, 'id'>>
	): RoomConfig {
		const room = this.rooms.get(roomId);
		if (!room) throw new Error('Room not found');
		room.config = {
			...room.config,
			...updates,
			id: room.config.id
		};
		room.version += 1;
		return room.config;
	}

	public getRoom(roomId: string): RoomState | null {
		return this.rooms.get(roomId) || null;
	}

	public getView(roomId: string, at?: string): ViewPayload {
		const room = this.rooms.get(roomId);
		if (!room) throw new Error('Room not found');

		const now = at ? new Date(at) : new Date();
		const schedule = room.schedule;
		const intervalSec = room.config.rotationIntervalSec;
		const policy = room.config.rotationPolicy;

		let activeSlot: Slot | null = null;
		if (schedule && schedule.slots?.length) {
			for (const slot of schedule.slots) {
				const start = new Date(slot.startAt);
				const end = new Date(slot.endAt);
				if (now >= start && now < end) {
					activeSlot = slot;
					break;
				}
			}
		}

		const lives = activeSlot?.lives || [];
		const items = lives.map((i: ScheduleItem) => i.ref);
		const flattenedItems = items.length > 0 ? items : (room.config.defaultItems || []);
		const fallbackStart = activeSlot ? new Date(activeSlot.startAt) : now;
        const rotationIndex = this.computeRotationIndex(policy, fallbackStart, now, flattenedItems, intervalSec, lives);
        // Compute next switch time:
        // - If there is an active slot and it has 0 or 1 item, the next switch is the slot end
        // - If there are multiple items, the next rotation tick occurs at the next interval,
        //   but it should never exceed the slot end (cap to slot end)
        // Next rotation tick should be relative to the active slot start (or now when no slot)
        const anchor = activeSlot ? new Date(activeSlot.startAt) : now;
        const elapsedSec = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 1000));
        const ticksPassed = Math.floor(elapsedSec / intervalSec);
        const nextTickSec = (ticksPassed + 1) * intervalSec;
        const nextRotationTick = new Date(anchor.getTime() + nextTickSec * 1000);
        let nextSwitchDate: Date;
        if (activeSlot) {
            const slotEnd = new Date(activeSlot.endAt);
            if (flattenedItems.length <= 1) {
                nextSwitchDate = slotEnd;
            } else {
                nextSwitchDate = nextRotationTick < slotEnd ? nextRotationTick : slotEnd;
            }
        } else {
            // No active slot - use rotation tick for default items
            nextSwitchDate = nextRotationTick;
        }

		// Build upcoming slots list (next 5)
		let upcomingSlots: Array<{ startAt: string; endAt: string; items: string[] }> | undefined;
		if (schedule?.slots?.length) {
			const future = schedule.slots
				.filter(s => {
					const start = new Date(s.startAt);
					// Exclude the active slot - only include slots that start after now
					return start > now;
				})
				.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
				.slice(0, 5)
				.map(s => ({
					startAt: s.startAt,
					endAt: s.endAt,
					items: (s.lives || []).map((i: ScheduleItem) => i.ref)
				}));
			upcomingSlots = future;
		}

		// Build previous slots list (last 5)
		let previousSlots: Array<{ startAt: string; endAt: string; items: string[] }> | undefined;
		if (schedule?.slots?.length) {
			const past = schedule.slots
				.filter(s => new Date(s.endAt) <= now)
				.sort((a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime()) // Most recent first
				.slice(0, 5)
				.map(s => ({
					startAt: s.startAt,
					endAt: s.endAt,
					items: (s.lives || []).map((i: ScheduleItem) => i.ref)
				}));
			previousSlots = past.length > 0 ? past : undefined;
		}

		return {
			active: activeSlot ? { slotStart: activeSlot.startAt, slotEnd: activeSlot.endAt } : null,
			items: flattenedItems,
			policy: { type: policy, intervalSec },
			index: flattenedItems.length ? rotationIndex % flattenedItems.length : 0,
			nextSwitchAt: nextSwitchDate.toISOString(),
			defaultItems: room.config.defaultItems,
			upcomingSlots,
			previousSlots
		};
	}

	private computeRotationIndex(
		policy: RotationPolicy,
		slotStart: Date,
		now: Date,
		items: string[],
		intervalSec: number,
		scheduleItems?: ScheduleItem[]
	): number {
		if (!items.length) return 0;
		const ticks = Math.floor((now.getTime() - slotStart.getTime()) / 1000 / intervalSec);
		if (policy === 'round_robin') return ticks % items.length;
		if (policy === 'random') {
			const seed = this.hash(`${slotStart.toISOString()}|${items.length}`);
			return this.deterministicRandomIndex(seed, ticks, items.length);
		}
		if (policy === 'weighted') {
			const weights = (scheduleItems || items.map(() => ({ weight: 1 }))).map(i => i.weight || 1);
			return this.weightedIndex(ticks, weights);
		}
		return ticks % items.length;
	}

	private deterministicRandomIndex(seed: number, tick: number, length: number): number {
		// Simple LCG-based deterministic PRNG per tick
		const a = 1664525;
		const c = 1013904223;
		let x = (seed + tick) >>> 0;
		x = (a * x + c) >>> 0;
		return x % length;
	}

	private weightedIndex(tick: number, weights: number[]): number {
		const total = weights.reduce((s, w) => s + Math.max(0, w), 0) || 1;
		const pseudo = (tick % total) + 1;
		let acc = 0;
		for (let i = 0; i < weights.length; i++) {
			acc += Math.max(0, weights[i]);
			if (pseudo <= acc) return i;
		}
		return 0;
	}

	private generateId(): string {
		return Math.random().toString(36).slice(2, 10);
	}

	private hash(s: string): number {
		let h = 2166136261;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
		}
		return h >>> 0;
	}
}


