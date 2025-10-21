// Lightning Router - Modern TypeScript implementation
import { Router, Request, Response } from 'express';
import { LightningService } from '../services/LightningService';
import { WebhookService } from '../services/WebhookService';
import { SessionService } from '../services/SessionService';
import { Logger } from '../utils/logger';
// import { ApiResponse } from '@pubpay/shared-types'; // Unused for now

export class LightningRouter {
  private router: Router;
  private lightningService: LightningService;
  private webhookService: WebhookService;
  private sessionService: SessionService;
  private logger: Logger;

  constructor() {
    this.router = Router();
    this.lightningService = new LightningService();
    this.webhookService = new WebhookService();
    this.sessionService = new SessionService();
    this.logger = new Logger('LightningRouter');
    
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Enable Lightning payments
    this.router.post('/enable', this.enableLightningPayments.bind(this));
    
    // Disable Lightning payments
    this.router.post('/disable', this.disableLightningPayments.bind(this));
    
    // Webhook endpoint for payment notifications
    this.router.post('/webhook', this.processWebhook.bind(this));
    
    // Debug endpoint
    this.router.get('/debug/sessions', this.debugSessions.bind(this));
    
    // Health check for Lightning service
    this.router.get('/health', this.healthCheck.bind(this));
  }

  private async enableLightningPayments(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('⚡ Lightning enable endpoint called:', {
        frontendSessionId: req.body.frontendSessionId,
        eventId: req.body.eventId,
        timestamp: new Date().toISOString()
      });

      const { frontendSessionId, eventId } = req.body;

      // Validate required parameters
      if (!frontendSessionId || !eventId) {
        const errorMsg = 'Missing required parameters: frontendSessionId and eventId are both required';
        this.logger.warn('❌ Validation failed:', { frontendSessionId, eventId });
        
        res.status(400).json({
          success: false,
          error: errorMsg,
          details: 'Please provide both frontendSessionId and eventId in the request body'
        });
        return;
      }

      // Check if session already has active Lightning for this event
      const existingSession = this.sessionService.getSession(frontendSessionId);
      if (existingSession?.events[eventId]?.active) {
        // Update last seen and return existing LNURL
        this.sessionService.updateLastSeen(frontendSessionId, eventId);
        
        this.logger.info(`✅ Returning existing LNURL for session: ${frontendSessionId}, event: ${eventId}`);
        
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

      // Create new Lightning session
      const result = await this.lightningService.enableLightningPayments(eventId, frontendSessionId);
      
      if (result.success && result.lnurl) {
        // Store session data
        this.sessionService.createOrUpdateSession(frontendSessionId, eventId, result.lnurl);
        
        this.logger.info(`✅ Successfully created new LNURL for session: ${frontendSessionId}, event: ${eventId}`);
        
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
        this.logger.error('❌ Failed to enable Lightning payments:', result.error);
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to enable Lightning payments',
          troubleshooting: {
            checkLNBitsConfig: 'Verify LNBITS_URL and LNBITS_API_KEY are set',
            checkNetwork: 'Ensure server can reach LNBits API'
          }
        });
      }
    } catch (error) {
      this.logger.error('💥 Error in enableLightningPayments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async disableLightningPayments(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('🔌 Lightning disable endpoint called:', {
        frontendSessionId: req.body.frontendSessionId,
        eventId: req.body.eventId,
        timestamp: new Date().toISOString()
      });

      const { frontendSessionId, eventId } = req.body;

      // Validate required parameters
      if (!frontendSessionId || !eventId) {
        const errorMsg = 'Missing required parameters: frontendSessionId and eventId are both required';
        this.logger.warn('❌ Validation failed:', { frontendSessionId, eventId });
        
        res.status(400).json({
          success: false,
          error: errorMsg,
          details: 'Please provide both frontendSessionId and eventId in the request body'
        });
        return;
      }

      // Deactivate session
      const wasActive = this.sessionService.deactivateSession(frontendSessionId, eventId);
      
      this.logger.info(`🔌 Disabled Lightning payments for session: ${frontendSessionId}, event: ${eventId} (was active: ${wasActive})`);

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
      this.logger.error('💥 Error in disableLightningPayments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processWebhook(req: Request, res: Response): Promise<void> {
    try {
      const paymentData = req.body;
      this.logger.info('🔔 Webhook received:', {
        lnurlpId: paymentData.lnurlp,
        amount: paymentData.amount,
        comment: paymentData.comment,
        timestamp: new Date().toISOString()
      });

      // Process webhook through WebhookService
      const result = await this.webhookService.processWebhook(paymentData);
      
      if (result.success) {
        this.logger.info('✅ Webhook processed successfully:', result.message);
        res.json(result);
      } else {
        this.logger.error('❌ Webhook processing failed:', result.error);
        res.status(400).json(result);
      }
    } catch (error) {
      this.logger.error('💥 Error in processWebhook:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private debugSessions(_req: Request, res: Response): void {
    try {
      this.logger.info('🔍 Debug sessions endpoint called');
      
      const sessions = this.sessionService.getAllSessions();
      const lnurlpMappings = this.sessionService.getAllLNURLMappings();
      
      res.json({
        success: true,
        data: {
          sessions: sessions.map(([id, session]) => ({
            frontendSessionId: id,
            events: Object.entries(session.events).map(([eventId, eventData]) => ({
              eventId,
              lnurl: eventData.lnurl,
              active: eventData.active,
              lastSeen: new Date(eventData.lastSeen).toISOString(),
              ageMinutes: Math.round((Date.now() - eventData.lastSeen) / 60000)
            })),
            totalEvents: Object.keys(session.events).length,
            activeEvents: Object.values(session.events).filter(e => e.active).length
          })),
          lnurlpMappings: lnurlpMappings.map(([lnurlpId, mapping]) => ({
            lnurlpId,
            frontendSessionId: mapping.frontendSessionId,
            eventId: mapping.eventId
          })),
          summary: {
            totalSessions: sessions.length,
            totalActiveEvents: sessions.reduce((sum, [, session]) => 
              sum + Object.values(session.events).filter(e => e.active).length, 0),
            totalLNURLMappings: lnurlpMappings.length
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('💥 Error in debugSessions:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
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
      this.logger.error('💥 Error in healthCheck:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}
