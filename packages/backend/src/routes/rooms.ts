// Rooms Router - Create rooms, set schedules, view state, and SSE events
import { Router, Request, Response } from 'express';
import { RoomsService } from '../services/RoomsService';
import { Logger } from '../utils/logger';

export class RoomsRouter {
	private router: Router;
	private logger: Logger;
	private rooms = RoomsService.getInstance();
	private clients: Map<string, Set<Response>> = new Map();

	constructor() {
		this.router = Router();
		this.logger = new Logger('RoomsRouter');
		this.initializeRoutes();
	}

	private initializeRoutes(): void {
		this.router.post('/', this.createRoom.bind(this));
		this.router.put('/:roomId', this.updateRoom.bind(this));
		this.router.put('/:roomId/schedule', this.setSchedule.bind(this));
		this.router.get('/:roomId', this.getRoom.bind(this));
		this.router.get('/:roomId/view', this.getView.bind(this));
		this.router.get('/:roomId/events', this.sseEvents.bind(this));
	}

	private createRoom(req: Request, res: Response): void {
		try {
			const { name, slug, timezone, rotationPolicy, rotationIntervalSec, defaultItems } = req.body || {};
			if (!name) {
				res.status(400).json({ success: false, error: 'name is required' });
				return;
			}
			const room = this.rooms.createRoom({ name, slug, timezone, rotationPolicy, rotationIntervalSec, defaultItems });
			res.json({ success: true, data: room });
		} catch (error) {
			this.logger.error('Error creating room', error);
			res.status(500).json({ success: false, error: 'Failed to create room' });
		}
	}

	private updateRoom(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const { name, slug, timezone, rotationPolicy, rotationIntervalSec, defaultItems } = req.body || {};
			const updated = this.rooms.updateConfig(roomId, {
				name,
				slug,
				timezone,
				rotationPolicy,
				rotationIntervalSec,
				defaultItems
			});
			res.json({ success: true, data: updated });
			// Broadcast config update and fresh snapshot
			this.broadcast(roomId, 'config-updated', { config: updated });
			try {
				const view = this.rooms.getView(roomId);
				this.broadcast(roomId, 'snapshot', { version: this.rooms.getRoom(roomId)?.version, view });
			} catch {}
		} catch (error) {
			this.logger.error('Error updating room', error);
			const message = error instanceof Error ? error.message : 'Failed to update room';
			const status = message === 'Room not found' ? 404 : 500;
			res.status(status).json({ success: false, error: message });
		}
	}

	private setSchedule(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const schedule = req.body;
			if (!schedule || !Array.isArray(schedule.slots)) {
				res.status(400).json({ success: false, error: 'schedule.slots array is required' });
				return;
			}
			const result = this.rooms.setSchedule(roomId, schedule);
			res.json({ success: true, data: result });
			// Broadcast schedule update to connected clients
			this.broadcast(roomId, 'schedule-updated', { version: result.version });
			try {
				const view = this.rooms.getView(roomId);
				this.broadcast(roomId, 'snapshot', { version: result.version, view });
			} catch {}
		} catch (error) {
			this.logger.error('Error setting schedule', error);
			res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to set schedule' });
		}
	}

	private getRoom(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const room = this.rooms.getRoom(roomId);
			if (!room) {
				res.status(404).json({ success: false, error: 'Room not found' });
				return;
			}
			res.json({ success: true, data: room });
		} catch (error) {
			this.logger.error('Error getting room', error);
			res.status(500).json({ success: false, error: 'Failed to get room' });
		}
	}

	private getView(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const { at } = req.query as { at?: string };
			const view = this.rooms.getView(roomId, at);
			res.json({ success: true, data: view });
		} catch (error) {
			this.logger.error('Error getting view', error);
			const message = error instanceof Error ? error.message : 'Failed to get view';
			const status = message === 'Room not found' ? 404 : 500;
			res.status(status).json({ success: false, error: message });
		}
	}

	private sseEvents(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const room = this.rooms.getRoom(roomId);
			if (!room) {
				res.status(404).json({ success: false, error: 'Room not found' });
				return;
			}

			res.setHeader('Content-Type', 'text/event-stream');
			res.setHeader('Cache-Control', 'no-cache');
			res.setHeader('Connection', 'keep-alive');
			res.flushHeaders?.();

			const send = (event: string, data: unknown) => {
				res.write(`event: ${event}\n`);
				res.write(`data: ${JSON.stringify(data)}\n\n`);
			};

			// Initial snapshot
			send('snapshot', { version: room.version, view: this.rooms.getView(roomId) });

			// Track client for this room
			if (!this.clients.has(roomId)) this.clients.set(roomId, new Set());
			this.clients.get(roomId)!.add(res);

			// Deterministic tick every rotationIntervalSec
			const intervalSec = room.config.rotationIntervalSec;
			let lastSignature: string | null = null;
			const tick = () => {
				try {
					const view = this.rooms.getView(roomId);
					// emit lightweight tick for rotation
					send('tick', { at: new Date().toISOString(), index: view.index, nextSwitchAt: view.nextSwitchAt });
					// if active window/items signature changed, emit full snapshot (avoids extra client fetches)
					const signature = `${view.active?.slotStart || 'none'}|${view.active?.slotEnd || 'none'}|${view.items.join(',')}|${view.policy.type}|${view.policy.intervalSec}`;
					if (signature !== lastSignature) {
						lastSignature = signature;
						send('snapshot', { version: this.rooms.getRoom(roomId)?.version, view });
					}
				} catch (e) {
					this.logger.warn('Tick error', e);
				}
			};
			const interval = setInterval(tick, intervalSec * 1000);

			req.on('close', () => {
				clearInterval(interval);
				this.clients.get(roomId)?.delete(res);
				res.end();
			});
		} catch (error) {
			this.logger.error('Error in SSE', error);
			res.status(500).end();
		}
	}

	private broadcast(roomId: string, event: string, data: unknown): void {
		const clients = this.clients.get(roomId);
		if (!clients || clients.size === 0) return;
		for (const res of clients) {
			try {
				res.write(`event: ${event}\n`);
				res.write(`data: ${JSON.stringify(data)}\n\n`);
			} catch {}
		}
	}

	public getRouter(): Router {
		return this.router;
	}
}


