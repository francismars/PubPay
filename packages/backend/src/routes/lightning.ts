// Lightning Router - Modern TypeScript implementation
import { Router, Request, Response } from 'express';
import { LightningService } from '../services/LightningService.js';
import { WebhookService } from '../services/WebhookService.js';
import { SessionService } from '../services/SessionService.js';
import { Logger } from '../utils/logger.js';
import { verifyWebhookSecret } from '../utils/webhookAuth.js';
import { CreateLinkGuard } from '../utils/createLinkGuard.js';

const SESSION_ID_RE = /^frontend_\d+_[a-z0-9]+$/i;
const EVENT_ID_MAX = 128;
const MAX_ACTIVE_PER_SESSION = 5;
const MAX_ACTIVE_PER_IP = 20;
const MAX_ACTIVE_PER_EVENT = 10;
/** New LNURLp creates (not reuse) per IP / event in this window */
const CREATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_CREATES_PER_IP = 5;
const MAX_CREATES_PER_EVENT = 8;

export class LightningRouter {
  private router: Router;
  private lightningService: LightningService;
  private webhookService: WebhookService;
  private sessionService: SessionService;
  private logger: Logger;
  private createGuard: CreateLinkGuard;

  constructor() {
    this.router = Router();
    this.lightningService = new LightningService();
    this.webhookService = new WebhookService();
    this.sessionService = SessionService.getInstance();
    this.logger = new Logger('LightningRouter');
    this.createGuard = new CreateLinkGuard(
      CREATE_WINDOW_MS,
      MAX_CREATES_PER_IP,
      MAX_CREATES_PER_EVENT
    );

    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post('/enable', this.enableLightningPayments.bind(this));
    this.router.post('/disable', this.disableLightningPayments.bind(this));
    this.router.post('/webhook', this.processWebhook.bind(this));

    if (process.env['NODE_ENV'] !== 'production') {
      this.router.get('/debug/sessions', this.debugSessions.bind(this));
    }

    this.router.get('/health', this.healthCheck.bind(this));
  }

  private clientIp(req: Request): string {
    return (req.ip || req.socket.remoteAddress || 'unknown').trim();
  }

  private parseIds(body: unknown): {
    frontendSessionId?: string;
    eventId?: string;
    error?: string;
  } {
    const b = (body || {}) as {
      frontendSessionId?: unknown;
      eventId?: unknown;
    };
    const frontendSessionId =
      typeof b.frontendSessionId === 'string' ? b.frontendSessionId.trim() : '';
    const eventId = typeof b.eventId === 'string' ? b.eventId.trim() : '';

    if (!frontendSessionId || !eventId) {
      return {
        error:
          'Missing required parameters: frontendSessionId and eventId are both required'
      };
    }
    if (
      !SESSION_ID_RE.test(frontendSessionId) ||
      frontendSessionId.length > 80
    ) {
      return { error: 'Invalid frontendSessionId' };
    }
    if (eventId.length > EVENT_ID_MAX || !/^[\w.:-]+$/.test(eventId)) {
      return { error: 'Invalid eventId' };
    }
    return { frontendSessionId, eventId };
  }

  private async enableLightningPayments(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const parsed = this.parseIds(req.body);
      if (parsed.error || !parsed.frontendSessionId || !parsed.eventId) {
        this.logger.warn('enable rejected: bad params', {
          ip: this.clientIp(req)
        });
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }
      const { frontendSessionId, eventId } = parsed;
      const ip = this.clientIp(req);

      this.logger.info('Lightning enable', {
        frontendSessionId,
        eventId,
        ip
      });

      const existingSession = this.sessionService.getSession(frontendSessionId);

      if (existingSession?.events?.[eventId]?.active) {
        this.sessionService.updateLastSeen(frontendSessionId, eventId);
        this.logger.info('Lightning enable reuse', {
          frontendSessionId,
          eventId
        });
        res.json({
          success: true,
          message: 'Lightning payments enabled (reusing existing link)',
          lnurl: existingSession.events[eventId].lnurl,
          existing: true,
          sessionInfo: {
            frontendSessionId,
            eventId,
            lastSeen: new Date().toISOString(),
            status: 'active'
          }
        });
        return;
      }

      // Caps before creating a new LNbits link
      if (
        this.sessionService.countActiveEventsForSession(frontendSessionId) >=
        MAX_ACTIVE_PER_SESSION
      ) {
        res.status(429).json({
          success: false,
          error: 'Too many active Lightning links for this session'
        });
        return;
      }
      if (this.sessionService.countActiveLinksForIp(ip) >= MAX_ACTIVE_PER_IP) {
        res.status(429).json({
          success: false,
          error: 'Too many active Lightning links from this IP'
        });
        return;
      }
      if (
        this.sessionService.countActiveLinksForEvent(eventId) >=
        MAX_ACTIVE_PER_EVENT
      ) {
        res.status(429).json({
          success: false,
          error: 'Too many active Lightning links for this event'
        });
        return;
      }

      const createBlocked = this.createGuard.check(ip, eventId);
      if (createBlocked) {
        this.logger.warn('Lightning enable rate-limited', { ip, eventId });
        res.status(429).json({ success: false, error: createBlocked });
        return;
      }

      const result = await this.lightningService.enableLightningPayments(
        eventId,
        frontendSessionId
      );

      this.logger.debug('LightningService result', {
        success: result.success,
        hasLnurl: !!result.lnurl,
        id: result.id
      });

      if (result.success && result.lnurl) {
        this.createGuard.record(ip, eventId);
        this.sessionService.createOrUpdateSession(
          frontendSessionId,
          eventId,
          result.lnurl,
          result.id,
          ip
        );

        this.logger.info('Lightning enable created', {
          frontendSessionId,
          eventId,
          lnurlpId: result.id
        });

        res.json({
          success: true,
          message: 'Lightning payments enabled with new payment link',
          lnurl: result.lnurl,
          existing: false,
          sessionInfo: {
            frontendSessionId,
            eventId,
            lastSeen: new Date().toISOString(),
            status: 'active'
          }
        });
      } else {
        this.logger.error('Lightning enable failed', { error: result.error });
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to enable Lightning payments'
        });
      }
    } catch (error) {
      this.logger.error('Error in enableLightningPayments:', error);
      const isDev = process.env['NODE_ENV'] === 'development';
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(isDev
          ? {
              details: error instanceof Error ? error.message : 'Unknown error'
            }
          : {})
      });
    }
  }

  private async disableLightningPayments(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const parsed = this.parseIds(req.body);
      if (parsed.error || !parsed.frontendSessionId || !parsed.eventId) {
        res.status(400).json({ success: false, error: parsed.error });
        return;
      }
      const { frontendSessionId, eventId } = parsed;

      // Only the session that created the link may disable it
      if (!this.sessionService.ownsEvent(frontendSessionId, eventId)) {
        this.logger.warn('Lightning disable denied (no ownership)', {
          frontendSessionId,
          eventId,
          ip: this.clientIp(req)
        });
        res.status(404).json({
          success: false,
          error: 'Session not found for this event'
        });
        return;
      }

      const wasActive = this.sessionService.deactivateSession(
        frontendSessionId,
        eventId
      );

      this.logger.info('Lightning disable', {
        frontendSessionId,
        eventId,
        wasActive
      });

      res.json({
        success: true,
        message: 'Lightning payments disabled successfully',
        sessionInfo: {
          frontendSessionId,
          eventId,
          lastSeen: new Date().toISOString(),
          status: 'inactive',
          wasActive
        }
      });
    } catch (error) {
      this.logger.error('Error in disableLightningPayments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(process.env['NODE_ENV'] === 'development'
          ? {
              details: error instanceof Error ? error.message : 'Unknown error'
            }
          : {})
      });
    }
  }

  private async processWebhook(req: Request, res: Response): Promise<void> {
    try {
      const auth = verifyWebhookSecret(req);
      if (!auth.ok) {
        this.logger.warn('Rejected lightning webhook: invalid secret');
        res.status(401).json({ success: false, error: auth.error });
        return;
      }

      const paymentData = req.body || {};
      this.logger.info('Lightning webhook', {
        lnurlpId: paymentData.lnurlp,
        hasPaymentHash: !!(paymentData.payment_hash || paymentData.checking_id)
      });

      const result = await this.webhookService.processWebhook(paymentData);

      if (result.success) {
        res.json(result);
      } else {
        this.logger.error('Webhook processing failed', {
          error: result.error
        });
        res.status(400).json({
          success: false,
          error: result.error || 'Webhook processing failed'
        });
      }
    } catch (error) {
      this.logger.error('Error in processWebhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  private debugSessions(_req: Request, res: Response): void {
    try {
      const sessions = this.sessionService.getAllSessions();
      const lnurlpMappings = this.sessionService.getAllLNURLMappings();

      res.json({
        success: true,
        data: {
          sessions: sessions.map(([id, session]) => ({
            frontendSessionId: id,
            events: Object.entries(session.events).map(
              ([eventId, eventData]) => ({
                eventId,
                active: eventData.active,
                lastSeen: new Date(eventData.lastSeen).toISOString(),
                ageMinutes: Math.round(
                  (Date.now() - eventData.lastSeen) / 60000
                )
              })
            ),
            totalEvents: Object.keys(session.events).length,
            activeEvents: Object.values(session.events).filter(e => e.active)
              .length
          })),
          lnurlpMappings: lnurlpMappings.map(([lnurlpId, mapping]) => ({
            lnurlpId,
            frontendSessionId: mapping.frontendSessionId,
            eventId: mapping.eventId
          })),
          summary: {
            totalSessions: sessions.length,
            totalActiveEvents: sessions.reduce(
              (sum, [, session]) =>
                sum +
                Object.values(session.events).filter(e => e.active).length,
              0
            ),
            totalLNURLMappings: lnurlpMappings.length
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error in debugSessions:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(process.env['NODE_ENV'] === 'development'
          ? {
              details: error instanceof Error ? error.message : 'Unknown error'
            }
          : {})
      });
    }
  }

  private healthCheck(_req: Request, res: Response): void {
    try {
      const config = {
        LNBITS_URL: !!process.env['LNBITS_URL'],
        LNBITS_API_KEY: !!process.env['LNBITS_API_KEY'],
        WEBHOOK_URL: !!process.env['WEBHOOK_URL']
      };

      const isHealthy = config.LNBITS_URL && config.LNBITS_API_KEY;

      res.json({
        success: true,
        status: isHealthy ? 'healthy' : 'degraded',
        config,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      this.logger.error('Error in healthCheck:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(process.env['NODE_ENV'] === 'development'
          ? {
              details: error instanceof Error ? error.message : 'Unknown error'
            }
          : {})
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}
