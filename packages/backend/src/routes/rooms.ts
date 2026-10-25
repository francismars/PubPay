// Rooms Router - Create rooms, set schedules, view state, and SSE events
import { Router, Request, Response } from 'express';
import { RoomsService } from '../services/RoomsService.js';
import { PretalxService } from '../services/PretalxService.js';
import { Logger } from '../utils/logger.js';
import { routeParam } from '../utils/requestParams.js';

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
    this.router.put('/:roomId/style', this.updateStyleConfig.bind(this));
    this.router.post('/:roomId/import/pretalx', this.importPretalx.bind(this));
    this.router.get('/pretalx/schedules', this.pretalxSchedules.bind(this));
    this.router.get('/pretalx/preview', this.pretalxPreview.bind(this));
    this.router.get('/:roomId', this.getRoom.bind(this));
    this.router.post('/:roomId', this.getRoom.bind(this)); // POST for password authentication
    this.router.get('/:roomId/view', this.getView.bind(this));
    this.router.get('/:roomId/display', this.getPublicDisplay.bind(this));
    this.router.get('/:roomId/events', this.sseEvents.bind(this));
  }

  /** Pretalx credentials come from env only — never from the client (SSRF / token leak). */
  private getPretalxEnvConfig(): {
    baseUrl: string;
    event: string;
    token: string;
  } | null {
    const baseUrl = process.env['PRETALX_BASE_URL']?.trim();
    const event = process.env['PRETALX_EVENT']?.trim();
    const token = process.env['PRETALX_TOKEN']?.trim();
    if (!baseUrl || !event || !token) return null;
    return { baseUrl, event, token };
  }

  private getProvidedPassword(req: Request): string | undefined {
    const header = req.header('x-room-password');
    if (header && header.trim()) return header.trim();
    const bodyPassword = (req.body as { password?: unknown } | undefined)
      ?.password;
    if (typeof bodyPassword === 'string' && bodyPassword.trim()) {
      return bodyPassword.trim();
    }
    return undefined;
  }

  private getProvidedAdminToken(req: Request): string | undefined {
    const header = req.header('x-room-admin-token');
    if (header && header.trim()) return header.trim();
    const bodyToken = (req.body as { adminToken?: unknown } | undefined)
      ?.adminToken;
    if (typeof bodyToken === 'string' && bodyToken.trim()) {
      return bodyToken.trim();
    }
    return undefined;
  }

  private async authorizeRoomWrite(
    req: Request,
    res: Response
  ): Promise<ReturnType<RoomsService['getRoom']>> {
    const roomId = routeParam(req, 'roomId');
    const room = this.rooms.getRoom(roomId);
    if (!room) {
      res.status(404).json({ success: false, error: 'Room not found' });
      return null;
    }
    const ok = await this.rooms.verifyRoomCredential(
      room,
      this.getProvidedPassword(req),
      this.getProvidedAdminToken(req)
    );
    if (!ok) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return null;
    }
    return room;
  }

  private async pretalxSchedules(_req: Request, res: Response): Promise<void> {
    try {
      const cfg = this.getPretalxEnvConfig();
      if (!cfg) {
        res.status(400).json({
          success: false,
          error:
            'Pretalx is not configured (set PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)'
        });
        return;
      }
      const pretalx = new PretalxService(cfg.baseUrl, cfg.event, cfg.token);
      const list = await pretalx.fetchSchedulesList();
      res.json({ success: true, data: { schedules: list } });
    } catch (error) {
      this.logger.error('Pretalx schedules error');
      res.status(500).json({ success: false, error: 'Failed to list schedules' });
    }
  }

  private async pretalxPreview(req: Request, res: Response): Promise<void> {
    try {
      const cfg = this.getPretalxEnvConfig();
      const version =
        typeof req.query.version === 'string' ? req.query.version : '';
      const roomId =
        typeof req.query.roomId === 'string' ? req.query.roomId : undefined;
      if (!cfg || !version) {
        res.status(400).json({
          success: false,
          error: 'Pretalx env config and version are required'
        });
        return;
      }
      const pretalx = new PretalxService(cfg.baseUrl, cfg.event, cfg.token);
      const preview = await pretalx.buildPreview(version, roomId);
      res.json({ success: true, data: { slots: preview } });
    } catch (error) {
      this.logger.error('Pretalx preview error');
      res.status(500).json({ success: false, error: 'Failed to build preview' });
    }
  }

  private async createRoom(req: Request, res: Response): Promise<void> {
    try {
      const { name, slug, timezone, password } = req.body || {};
      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, error: 'name is required' });
        return;
      }
      const { config, adminToken } = await this.rooms.createRoom({
        name: name.trim().slice(0, 120),
        slug: typeof slug === 'string' ? slug.slice(0, 80) : undefined,
        timezone: typeof timezone === 'string' ? timezone.slice(0, 64) : undefined,
        password: typeof password === 'string' ? password : undefined
      });
      res.json({
        success: true,
        data: {
          ...this.rooms.toPublicConfig(config),
          // Returned once — client must store it for subsequent admin writes
          adminToken
        }
      });
    } catch (error) {
      this.logger.error('Error creating room', error);
      res.status(500).json({ success: false, error: 'Failed to create room' });
    }
  }

  private async updateRoom(req: Request, res: Response): Promise<void> {
    try {
      const room = await this.authorizeRoomWrite(req, res);
      if (!room) return;
      const roomId = routeParam(req, 'roomId');
      const {
        name,
        slug,
        timezone,
        rotationPolicy,
        rotationIntervalSec,
        defaultItems
      } = req.body || {};
      const updated = this.rooms.updateConfig(roomId, {
        name,
        slug,
        timezone,
        rotationPolicy,
        rotationIntervalSec,
        defaultItems
      });
      const publicConfig = this.rooms.toPublicConfig(updated);
      res.json({ success: true, data: publicConfig });
      this.broadcast(roomId, 'config-updated', { config: publicConfig });
      try {
        const view = this.rooms.getView(roomId);
        this.broadcast(roomId, 'snapshot', {
          version: this.rooms.getRoom(roomId)?.version,
          view
        });
      } catch (e) {
        this.logger.warn('Failed to broadcast snapshot after config update', e);
      }
    } catch (error) {
      this.logger.error('Error updating room', error);
      const message =
        error instanceof Error ? error.message : 'Failed to update room';
      const status = message === 'Room not found' ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }

  private async updateStyleConfig(req: Request, res: Response): Promise<void> {
    try {
      const room = await this.authorizeRoomWrite(req, res);
      if (!room) return;
      const roomId = routeParam(req, 'roomId');
      const styleConfig = req.body || {};
      const updated = this.rooms.updateStyleConfig(roomId, styleConfig);
      const publicConfig = this.rooms.toPublicConfig(updated);
      res.json({ success: true, data: publicConfig });
      this.broadcast(roomId, 'config-updated', { config: publicConfig });
      try {
        const view = this.rooms.getView(roomId);
        this.broadcast(roomId, 'snapshot', {
          version: this.rooms.getRoom(roomId)?.version,
          view
        });
      } catch (e) {
        this.logger.warn('Failed to broadcast snapshot after style update', e);
      }
    } catch (error) {
      this.logger.error('Error updating style config', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update style config';
      const status = message === 'Room not found' ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }

  private async setSchedule(req: Request, res: Response): Promise<void> {
    try {
      const room = await this.authorizeRoomWrite(req, res);
      if (!room) return;
      const roomId = routeParam(req, 'roomId');
      const schedule = req.body;

      // Basic structure validation
      if (!schedule || typeof schedule !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Invalid request: schedule must be an object'
        });
        return;
      }
      if (!Array.isArray(schedule.slots)) {
        res.status(400).json({
          success: false,
          error: 'Invalid request: schedule.slots must be an array'
        });
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
      const statusCode =
        error instanceof Error &&
        (error.message.includes('must be') ||
          error.message.includes('required') ||
          error.message.includes('invalid') ||
          error.message.includes('deprecated') ||
          error.message.includes('must start with'))
          ? 400
          : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set schedule'
      });
    }
  }

  private async importPretalx(req: Request, res: Response): Promise<void> {
    try {
      const authorized = await this.authorizeRoomWrite(req, res);
      if (!authorized) return;
      const roomId = routeParam(req, 'roomId');
      const { version } = req.body || {};
      const cfg = this.getPretalxEnvConfig();
      if (!cfg) {
        res.status(400).json({
          success: false,
          error:
            'Pretalx is not configured (set PRETALX_BASE_URL, PRETALX_EVENT, PRETALX_TOKEN)'
        });
        return;
      }
      this.logger.info(`Pretalx import: event=${cfg.event}`);
      const room = this.rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ success: false, error: 'Room not found' });
        return;
      }
      const pretalx = new PretalxService(cfg.baseUrl, cfg.event, cfg.token);
      // Test API connectivity first
      try {
        const healthCheck = await pretalx.checkEventAccessible();
        this.logger.info(
          `Pretalx connection verified: event "${healthCheck.name}" (${healthCheck.slug})`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        this.logger.error(`Pretalx connectivity check failed: ${msg}`);
        throw new Error(`Cannot connect to Pretalx event: ${msg}`);
      }
      const slots = version
        ? await pretalx.buildSlotsFromVersion(version)
        : await pretalx.buildSlotsFromPretalx();
      this.logger.info(
        `Pretalx import completed: ${slots.length} slots processed`
      );
      if (slots.length === 0) {
        this.logger.warn(
          'Pretalx import returned 0 slots - check that slots have start/end times and submissions'
        );
      }
      // Convert Pretalx slots (with 'items') to new format (with 'lives')
      const convertedSlots = slots.map(slot => {
        const slotAny = slot as {
          startAt: string;
          endAt: string;
          items: Array<{ ref: string }>;
          title?: string;
          speakers?: string[];
        };
        return {
          startAt: slotAny.startAt,
          endAt: slotAny.endAt,
          lives: slotAny.items || [],
          ...(slotAny.title && { title: slotAny.title }),
          ...(slotAny.speakers && { speakers: slotAny.speakers })
        };
      });
      const result = this.rooms.setSchedule(roomId, { slots: convertedSlots });
      res.json({
        success: true,
        data: { imported: slots.length, version: result.version }
      });
      // Broadcast schedule update + snapshot
      this.broadcast(roomId, 'schedule-updated', { version: result.version });
      try {
        const view = this.rooms.getView(roomId);
        this.broadcast(roomId, 'snapshot', { version: result.version, view });
      } catch (e) {
        this.logger.warn(
          'Failed to broadcast snapshot after pretalx import',
          e
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to import pretalx schedule';
      this.logger.error(`Error importing from pretalx: ${message}`);
      res.status(500).json({ success: false, error: message });
    }
  }

  private async getRoom(req: Request, res: Response): Promise<void> {
    try {
      const roomId = routeParam(req, 'roomId');
      const room = this.rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ success: false, error: 'Room not found' });
        return;
      }
      // Admin login requires password and/or admin token
      const ok = await this.rooms.verifyRoomCredential(
        room,
        this.getProvidedPassword(req),
        this.getProvidedAdminToken(req)
      );
      if (!ok) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        data: {
          config: this.rooms.toPublicConfig(room.config),
          schedule: room.schedule,
          version: room.version
        }
      });
    } catch (error) {
      this.logger.error('Error getting room', error);
      res.status(500).json({ success: false, error: 'Failed to get room' });
    }
  }

  private getView(req: Request, res: Response): void {
    try {
      const roomId = routeParam(req, 'roomId');
      const { at } = req.query as { at?: string };
      const view = this.rooms.getView(roomId, at);
      res.json({ success: true, data: view });
    } catch (error) {
      this.logger.error('Error getting view', error);
      const message =
        error instanceof Error ? error.message : 'Failed to get view';
      const status = message === 'Room not found' ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }

  private getPublicDisplay(req: Request, res: Response): void {
    try {
      const roomId = routeParam(req, 'roomId');
      const room = this.rooms.getRoom(roomId);
      if (!room) {
        res.status(404).json({ success: false, error: 'Room not found' });
        return;
      }
      res.json({
        success: true,
        data: {
          config: this.rooms.toPublicConfig(room.config),
          schedule: room.schedule,
          version: room.version
        }
      });
    } catch (error) {
      this.logger.error('Error getting public display', error);
      res.status(500).json({ success: false, error: 'Failed to load room' });
    }
  }

  private sseEvents(req: Request, res: Response): void {
    try {
      const roomId = routeParam(req, 'roomId');
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
      send('snapshot', {
        version: room.version,
        view: this.rooms.getView(roomId)
      });

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
          send('tick', {
            at: new Date().toISOString(),
            index: view.index,
            nextSwitchAt: view.nextSwitchAt
          });
          // if active window/items signature changed, emit full snapshot (avoids extra client fetches)
          const signature = `${view.active?.slotStart || 'none'}|${view.active?.slotEnd || 'none'}|${view.items.join(',')}|${view.policy.type}|${view.policy.intervalSec}`;
          if (signature !== lastSignature) {
            lastSignature = signature;
            send('snapshot', {
              version: this.rooms.getRoom(roomId)?.version,
              view
            });
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
