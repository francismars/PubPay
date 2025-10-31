// Rooms Router - Create rooms, set schedules, view state, and SSE events
import { Router, Request, Response } from 'express';
import { RoomsService } from '../services/RoomsService';
import { PretalxService } from '../services/PretalxService';
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
		this.router.post('/:roomId/import/pretalx', this.importPretalx.bind(this));
		this.router.get('/pretalx/health', this.pretalxHealth.bind(this));
		this.router.get('/pretalx/schedules', this.pretalxSchedules.bind(this));
		this.router.get('/pretalx/preview', this.pretalxPreview.bind(this));
		this.router.get('/pretalx/diagnose', this.pretalxDiagnose.bind(this));
		this.router.get('/pretalx/call', this.pretalxCall.bind(this));
		this.router.get('/:roomId', this.getRoom.bind(this));
		this.router.post('/:roomId', this.getRoom.bind(this)); // POST for password authentication
		this.router.get('/:roomId/view', this.getView.bind(this));
		this.router.get('/:roomId/events', this.sseEvents.bind(this));
	}
	private async pretalxSchedules(req: Request, res: Response): Promise<void> {
		try {
			const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken } = req.query as Record<string, string>;
			const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
			const event = bodyEvent || process.env.PRETALX_EVENT;
			const token = bodyToken || process.env.PRETALX_TOKEN;
			if (!baseUrl || !event || !token) {
				res.status(400).json({ success: false, error: 'baseUrl, event and token are required (env PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)' });
				return;
			}
			const pretalx = new PretalxService(baseUrl, event, token);
			const list = await pretalx.fetchSchedulesList();
			res.json({ success: true, data: { schedules: list } });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to list schedules';
			this.logger.error(`Pretalx schedules error: ${message}`);
			res.status(500).json({ success: false, error: message });
		}
	}

	private async pretalxPreview(req: Request, res: Response): Promise<void> {
		try {
			const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken, version, roomId } = req.query as Record<string, string>;
			const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
			const event = bodyEvent || process.env.PRETALX_EVENT;
			const token = bodyToken || process.env.PRETALX_TOKEN;
			if (!baseUrl || !event || !token || !version) {
				res.status(400).json({ success: false, error: 'baseUrl, event, token and version are required' });
				return;
			}
			const pretalx = new PretalxService(baseUrl, event, token);
			const preview = await pretalx.buildPreview(version, roomId);
			res.json({ success: true, data: { slots: preview } });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to build preview';
			this.logger.error(`Pretalx preview error: ${message}`);
			res.status(500).json({ success: false, error: message });
		}
	}

	private createRoom(req: Request, res: Response): void {
		try {
			const { name, slug, timezone, password } = req.body || {};
			if (!name) {
				res.status(400).json({ success: false, error: 'name is required' });
				return;
			}
			const room = this.rooms.createRoom({ name, slug, timezone, password });
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
            } catch (e) {
                this.logger.warn('Failed to broadcast snapshot after config update', e);
            }
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

			// Basic structure validation
			if (!schedule || typeof schedule !== 'object') {
				res.status(400).json({ success: false, error: 'Invalid request: schedule must be an object' });
				return;
			}
			if (!Array.isArray(schedule.slots)) {
				res.status(400).json({ success: false, error: 'Invalid request: schedule.slots must be an array' });
				return;
			}

			// Delegate detailed validation to RoomsService.setSchedule
			const result = this.rooms.setSchedule(roomId, schedule);
			res.json({ success: true, data: result });

			// Broadcast schedule update to connected clients
			this.broadcast(roomId, 'schedule-updated', { version: result.version });
            try {
                const view = this.rooms.getView(roomId);
                this.broadcast(roomId, 'snapshot', { version: result.version, view });
            } catch (e) {
                this.logger.warn('Failed to broadcast snapshot after schedule set', e);
            }
		} catch (error) {
			this.logger.error('Error setting schedule', error);
			// Return validation errors as 400 Bad Request, other errors as 500
			const statusCode = error instanceof Error && (
				error.message.includes('must be') ||
				error.message.includes('required') ||
				error.message.includes('invalid') ||
				error.message.includes('deprecated') ||
				error.message.includes('must start with')
			) ? 400 : 500;
			res.status(statusCode).json({
				success: false,
				error: error instanceof Error ? error.message : 'Failed to set schedule'
			});
		}
	}

    private async importPretalx(req: Request, res: Response): Promise<void> {
		try {
    const { roomId } = req.params;
    const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken, version } = req.body || {};
    const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
    const event = bodyEvent || process.env.PRETALX_EVENT;
    const token = bodyToken || process.env.PRETALX_TOKEN;
    if (!baseUrl || !event || !token) {
        res.status(400).json({ success: false, error: 'baseUrl, event and token are required (env PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)' });
        return;
    }
			this.logger.info(`Pretalx import: baseUrl=${baseUrl} event=${event}`);
			const room = this.rooms.getRoom(roomId);
			if (!room) {
				res.status(404).json({ success: false, error: 'Room not found' });
				return;
			}
            const pretalx = new PretalxService(baseUrl, event, token);
			// Test API connectivity first
			try {
				const healthCheck = await pretalx.checkEventAccessible();
				this.logger.info(`Pretalx connection verified: event "${healthCheck.name}" (${healthCheck.slug})`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Unknown error';
				this.logger.error(`Pretalx connectivity check failed: ${msg}`);
				throw new Error(`Cannot connect to Pretalx event: ${msg}`);
			}
            const slots = version ? await pretalx.buildSlotsFromVersion(version) : await pretalx.buildSlotsFromPretalx();
			this.logger.info(`Pretalx import completed: ${slots.length} slots processed`);
			if (slots.length === 0) {
				this.logger.warn('Pretalx import returned 0 slots - check that slots have start/end times and submissions');
			}
			// Convert Pretalx slots (with 'items') to new format (with 'lives')
			const convertedSlots = slots.map(slot => {
				const slotAny = slot as { startAt: string; endAt: string; items: Array<{ ref: string }>; title?: string; speakers?: string[] };
				return {
					startAt: slotAny.startAt,
					endAt: slotAny.endAt,
					lives: slotAny.items || [],
					...(slotAny.title && { title: slotAny.title }),
					...(slotAny.speakers && { speakers: slotAny.speakers })
				};
			});
			const result = this.rooms.setSchedule(roomId, { slots: convertedSlots });
			res.json({ success: true, data: { imported: slots.length, version: result.version } });
			// Broadcast schedule update + snapshot
			this.broadcast(roomId, 'schedule-updated', { version: result.version });
            try {
                const view = this.rooms.getView(roomId);
                this.broadcast(roomId, 'snapshot', { version: result.version, view });
            } catch (e) {
                this.logger.warn('Failed to broadcast snapshot after pretalx import', e);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to import pretalx schedule';
            this.logger.error(`Error importing from pretalx: ${message}`);
            res.status(500).json({ success: false, error: message });
		}
	}

	private async pretalxHealth(req: Request, res: Response): Promise<void> {
		try {
			const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken } = req.query as Record<string, string>;
			const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
			const event = bodyEvent || process.env.PRETALX_EVENT;
			const token = bodyToken || process.env.PRETALX_TOKEN;
			if (!baseUrl || !event || !token) {
				res.status(400).json({ success: false, error: 'baseUrl, event and token are required (env PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)' });
				return;
			}
			const pretalx = new PretalxService(baseUrl, event, token);
			const info = await pretalx.checkEventAccessible();
			res.json({ success: true, data: info });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Health check failed';
			this.logger.error(`Pretalx health error: ${message}`);
			res.status(500).json({ success: false, error: message });
		}
	}

    private async pretalxDiagnose(req: Request, res: Response): Promise<void> {
        try {
            const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken, version } = req.query as Record<string, string>;
			const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
			const event = bodyEvent || process.env.PRETALX_EVENT;
			const token = bodyToken || process.env.PRETALX_TOKEN;
			if (!baseUrl || !event || !token) {
				res.status(400).json({ success: false, error: 'baseUrl, event and token are required (env PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)' });
				return;
			}
			const pretalx = new PretalxService(baseUrl, event, token);
			const summary: Record<string, unknown> = {};
			// Event health
			try {
				const info = await pretalx.checkEventAccessible();
				summary['event'] = { ok: true, info };
			} catch (e) {
				summary['event'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
            // Schedules list
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const schedulesResp = await (pretalx as any).apiGet(`/api/events/${event}/schedules/`);
                const results = (schedulesResp?.['results'] as unknown[]) || [];
                summary['schedules'] = { ok: true, count: results.length, versions: results.map((r: unknown) => (r as Record<string, unknown>)?.['version']).filter(Boolean).slice(0, 10) };
            } catch (e) {
                summary['schedules'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
            // Latest schedule expanded (shortcut)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const latestSchedule = await (pretalx as any).fetchScheduleExpanded('latest');
                const count = Array.isArray(latestSchedule?.slots) ? latestSchedule.slots.length : 0;
                summary['schedules_latest'] = { ok: true, count, version: latestSchedule?.version };
            } catch (e) {
                summary['schedules_latest'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }

            // WIP schedule expanded (shortcut)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const wipSchedule = await (pretalx as any).fetchScheduleExpanded('wip');
                const count = Array.isArray(wipSchedule?.slots) ? wipSchedule.slots.length : 0;
                summary['schedules_wip'] = { ok: true, count, version: wipSchedule?.version };
            } catch (e) {
                summary['schedules_wip'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }

            // Latest slots via slots list (latest schedule filter)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const latestSlots = await (pretalx as any).fetchScheduleLatestSlots();
                summary['slots_latest'] = { ok: true, count: Array.isArray(latestSlots) ? latestSlots.length : 0 };
            } catch (e) {
                summary['slots_latest'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
            // Optional specific version slots via slots list filter
            if (version) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const vSlots = await (pretalx as any).fetchSlotsByVersion(version);
                    summary['slots_version'] = { ok: true, version, count: Array.isArray(vSlots) ? vSlots.length : 0 };
                } catch (e) {
                    summary['slots_version'] = { ok: false, version, error: e instanceof Error ? e.message : String(e) };
                }
            }
            // Plain slots (no filters)
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const slots = await (pretalx as any).fetchExpandedSlots();
				summary['slots'] = { ok: true, count: Array.isArray(slots) ? slots.length : 0 };
			} catch (e) {
				summary['slots'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
            // Submissions (confirmed)
            try {
                const q = encodeURI('?state=confirmed&expand=speakers,speakers.answers,slot');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const submissions = await (pretalx as any).paginate(`/api/events/${event}/submissions/${q}`);
                const withSlot = (Array.isArray(submissions) ? submissions : []).filter((s: unknown) => !!(s as Record<string, unknown>)?.['slot'])?.length || 0;
                summary['submissions'] = { ok: true, count: Array.isArray(submissions) ? submissions.length : 0, withSlot };
            } catch (e) {
                summary['submissions'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
            // Rooms
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rooms = await (pretalx as any).paginate(`/api/events/${event}/rooms/`);
                summary['rooms'] = { ok: true, count: Array.isArray(rooms) ? rooms.length : 0 };
            } catch (e) {
                summary['rooms'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
            // Speakers
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const speakers = await (pretalx as any).paginate(`/api/events/${event}/speakers/`);
                summary['speakers'] = { ok: true, count: Array.isArray(speakers) ? speakers.length : 0 };
            } catch (e) {
                summary['speakers'] = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
			res.json({ success: true, data: summary });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Diagnosis failed';
			this.logger.error(`Pretalx diagnose error: ${message}`);
			res.status(500).json({ success: false, error: message });
		}
	}

	private async pretalxCall(req: Request, res: Response): Promise<void> {
		try {
			const { baseUrl: bodyBase, event: bodyEvent, token: bodyToken, endpoint, expand } = req.query as Record<string, string>;
			const baseUrl = bodyBase || process.env.PRETALX_BASE_URL;
			const event = bodyEvent || process.env.PRETALX_EVENT;
			const token = bodyToken || process.env.PRETALX_TOKEN;
			if (!baseUrl || !event || !token || !endpoint) {
				res.status(400).json({ success: false, error: 'baseUrl, event, token and endpoint are required' });
				return;
			}
			const pretalx = new PretalxService(baseUrl, event, token);
			// Replace {event} placeholder in endpoint if present
			const apiPath = endpoint.replace('{event}', event);
			// Add expand parameter if provided
			let fullPath = apiPath;
			if (expand) {
				const separator = apiPath.includes('?') ? '&' : '?';
				fullPath = `${apiPath}${separator}expand=${encodeURIComponent(expand)}`;
			}
			// Use apiGet for single page, paginate for multi-page results
			// Treat schedules list as paginated, but schedule shortcuts like latest/wip as single-object
			const schedulesIsObject = /\/schedules\/(latest|wip)\/?(\?|$)/.test(apiPath);
			const schedulesIsList = /\/schedules\/?(\?|$)/.test(apiPath) && !schedulesIsObject;
			const isListEndpoint = schedulesIsList || apiPath.includes('/slots/') || apiPath.includes('/submissions/') || apiPath.includes('/rooms/') || apiPath.includes('/speakers/');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const pretalxApi = pretalx as any;
			const rawData = isListEndpoint
				? await pretalxApi.paginate(fullPath)
				: await pretalxApi.apiGet(fullPath);
			res.json({ success: true, data: rawData, endpoint: fullPath });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to call API';
			this.logger.error(`Pretalx call error: ${message}`);
			res.status(500).json({ success: false, error: message, endpoint: req.query.endpoint });
		}
	}

	private getRoom(req: Request, res: Response): void {
		try {
			const { roomId } = req.params;
			const password = req.body?.password || req.query?.password as string | undefined;
			const room = this.rooms.getRoom(roomId);
			if (!room) {
				res.status(404).json({ success: false, error: 'Room not found' });
				return;
			}
			// Check password if room has one set
			if (room.config.password) {
				// Password is required - check if provided and matches
				if (!password || (typeof password === 'string' && password.trim() === '') || password !== room.config.password) {
					res.status(401).json({ success: false, error: 'Invalid password' });
					return;
				}
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
            } catch (e) {
                this.logger.warn('Broadcast error', e);
            }
        }
	}

	public getRouter(): Router {
		return this.router;
	}
}


