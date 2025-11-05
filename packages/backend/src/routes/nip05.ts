// NIP-05 Routes - Handle name registration and verification
import { Router, Request, Response } from 'express';
import { Nip05Service } from '../services/Nip05Service';
import { Nip05PaymentService } from '../services/Nip05PaymentService';
import { Logger } from '../utils/logger';

// Store pending invoices: checking_id -> {name, pubkey, suffix}
interface PendingInvoice {
  name: string;
  pubkey: string;
  suffix: string; // Generated 4-digit suffix
  createdAt: Date;
}

export class Nip05Router {
  private router: Router;
  private nip05Service: Nip05Service;
  private paymentService: Nip05PaymentService;
  private logger: Logger;
  private pendingInvoices: Map<string, PendingInvoice> = new Map();
  // SSE clients subscribed by checkingId
  private sseClients: Map<string, Set<Response>> = new Map();

  constructor() {
    this.router = Router();
    this.nip05Service = new Nip05Service();
    this.paymentService = new Nip05PaymentService();
    this.logger = new Logger('Nip05Router');
    this.initializeRoutes();
  }

  /**
   * Get the NIP-05 service instance (for sharing with other routes)
   */
  getService(): Nip05Service {
    return this.nip05Service;
  }

  /**
   * Clean up old pending invoices (older than 1 hour)
   */
  private cleanupPendingInvoices(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [checkingId, invoice] of this.pendingInvoices.entries()) {
      if (invoice.createdAt < oneHourAgo) {
        this.pendingInvoices.delete(checkingId);
      }
    }
  }

  private initializeRoutes(): void {
    // SSE stream for payment/registration updates
    this.router.get('/stream/:checkingId', (req: Request, res: Response): void => {
      const { checkingId } = req.params;
      if (!checkingId) {
        res.status(400).json({ success: false, error: 'Checking ID is required' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // Keep connection alive
      const keepAlive = setInterval(() => {
        try {
          res.write(': keep-alive\n\n');
        } catch {
          // ignore
        }
      }, 25000);

      // Register client
      if (!this.sseClients.has(checkingId)) {
        this.sseClients.set(checkingId, new Set());
      }
      this.sseClients.get(checkingId)!.add(res);

      req.on('close', () => {
        clearInterval(keepAlive);
        const set = this.sseClients.get(checkingId);
        if (set) {
          set.delete(res);
          if (set.size === 0) this.sseClients.delete(checkingId);
        }
      });

      // Send initial hello
      res.write(`event: hello\n`);
      res.write(`data: ${JSON.stringify({ success: true, checkingId })}\n\n`);
    });
    // Get service info (price, domain)
    this.router.get('/info', (req: Request, res: Response) => {
      try {
        return res.json({
          success: true,
          price: this.nip05Service.getPrice(),
          domain: this.nip05Service.getDomain(),
          currency: 'sats'
        });
      } catch (error) {
        this.logger.error('Error getting NIP-05 info:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get service info'
        });
      }
    });

    // Validate name (before payment)
    this.router.post('/validate', (req: Request, res: Response) => {
      try {
        const { name } = req.body;

        if (!name) {
          return res.status(400).json({
            success: false,
            error: 'Name is required'
          });
        }

        const validation = this.nip05Service.validateUserChoice(name);
        
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            valid: false,
            error: validation.error
          });
        }

        // Generate a preview of what the name will look like (4-digit suffix)
        const suffix = Math.floor(1000 + Math.random() * 9000).toString();
        const preview = `${name}${suffix}`;

        return res.json({
          success: true,
          valid: true,
          preview: `${preview}@${this.nip05Service.getDomain()}`,
          note: 'Your actual name will have a random 4-digit suffix added'
        });
      } catch (error) {
        this.logger.error('Error validating name:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to validate name'
        });
      }
    });

    // Create payment invoice
    this.router.post('/invoice', async (req: Request, res: Response) => {
      try {
        const { name, pubkey } = req.body;

        if (!name || !pubkey) {
          return res.status(400).json({
            success: false,
            error: 'Name and pubkey are required'
          });
        }

        // Validate name first
        const validation = this.nip05Service.validateUserChoice(name);
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: validation.error
          });
        }

        // Check if user already has maximum registrations (5)
        const existingRegistrations = this.nip05Service.getRegistrationsByPubkey(pubkey);
        if (existingRegistrations.length >= 5) {
          return res.status(400).json({
            success: false,
            error: 'Maximum 5 NIP-05 identifiers per public key. Please use an existing registration.'
          });
        }

        // Generate suffix now so we can include it in the invoice memo
        // We'll use a simple 4-digit generator here (same logic as Nip05Service)
        const suffix = Math.floor(1000 + Math.random() * 9000).toString();
        const fullName = `${name}${suffix}`;

        // Create invoice
        // Normalize webhook URL to avoid double slashes
        const baseUrl = process.env['WEBHOOK_URL']?.trim().replace(/\/+$/, '') || '';
        const webhookUrl = baseUrl ? `${baseUrl}/nip05/webhook` : undefined;

        const invoice = await this.paymentService.createInvoice(
          name,
          pubkey,
          webhookUrl,
          fullName
        );

        // Store pending invoice for webhook auto-registration
        this.pendingInvoices.set(invoice.checking_id, {
          name,
          pubkey,
          suffix,
          createdAt: new Date()
        });

        // Clean up old pending invoices (older than 1 hour)
        this.cleanupPendingInvoices();

        return res.json({
          success: true,
          invoice: {
            payment_hash: invoice.payment_hash,
            payment_request: invoice.payment_request,
            checking_id: invoice.checking_id,
            amount: this.paymentService.getPrice()
          }
        });
      } catch (error: any) {
        this.logger.error('Error creating invoice:', error);
        return res.status(500).json({
          success: false,
          error: error.message || 'Failed to create invoice'
        });
      }
    });

    // Check payment status
    this.router.get('/payment/:checkingId', async (req: Request, res: Response) => {
      // Disable caching for this endpoint to ensure fresh data
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      try {
        const { checkingId } = req.params;

        if (!checkingId) {
          return res.status(400).json({
            success: false,
            error: 'Checking ID is required'
          });
        }

        const status = await this.paymentService.checkPaymentStatus(checkingId);

        // Check if already registered (webhook may have registered it even if API says not paid yet)
        let registration = null;
        const foundReg = this.nip05Service.getRegistrationByPaymentProof(checkingId);
        if (foundReg) {
          registration = {
            fullName: foundReg.fullName,
            nip05: `${foundReg.fullName}@${foundReg.domain}`
          };
        } else {
          // Also check pending invoice in case registration exists but paymentProof doesn't match
          const pendingInvoice = this.pendingInvoices.get(checkingId);
          if (pendingInvoice) {
            const registrations = this.nip05Service.getRegistrationsByPubkey(pendingInvoice.pubkey);
            const recentReg = registrations.find(r => r.paymentProof === checkingId);
            if (recentReg) {
              registration = {
                fullName: recentReg.fullName,
                nip05: `${recentReg.fullName}@${recentReg.domain}`
              };
            }
          }
        }

        // If registered, payment is considered paid (webhook confirmed it)
        const paid = status.paid || !!registration;

        return res.json({
          success: true,
          paid: paid,
          payment_hash: status.payment_hash,
          checking_id: status.checking_id,
          registered: !!registration,
          registration: registration || undefined
        });
      } catch (error: any) {
        this.logger.error('Error checking payment:', error);
        return res.status(500).json({
          success: false,
          error: error.message || 'Failed to check payment'
        });
      }
    });

    // Register name (after payment verified)
    this.router.post('/register', async (req: Request, res: Response) => {
      try {
        const { name, pubkey, paymentProof } = req.body;

        if (!name || !pubkey || !paymentProof) {
          return res.status(400).json({
            success: false,
            error: 'Name, pubkey, and paymentProof are required'
          });
        }

        // Verify payment
        const paymentStatus = await this.paymentService.checkPaymentStatus(
          paymentProof
        );

        if (!paymentStatus.paid) {
          return res.status(402).json({
            success: false,
            error: 'Payment not verified. Please complete payment first.'
          });
        }

        // Register the name
        const registration = await this.nip05Service.registerName(
          name,
          pubkey,
          paymentProof
        );

        const responseBody = {
          success: true,
          registration: {
            id: registration.id,
            fullName: registration.fullName,
            nip05: `${registration.fullName}@${registration.domain}`,
            pubkey: registration.pubkey,
            createdAt: registration.createdAt
          }
        };

        // Notify SSE subscribers for this checkingId
        this.notifySse(paymentProof, { type: 'registered', ...responseBody });

        return res.json(responseBody);
      } catch (error: any) {
        this.logger.error('Error registering name:', error);
        return res.status(400).json({
          success: false,
          error: error.message || 'Failed to register name'
        });
      }
    });

    // Webhook endpoint for payment notifications
    this.router.post('/webhook', async (req: Request, res: Response) => {
      try {
        const webhookData = req.body;

        this.logger.info('Webhook received:', JSON.stringify(webhookData, null, 2));

        // Extract payment_hash from webhook (BOLT11 invoices use payment_hash)
        const checkingId = webhookData.payment_hash || 
                          webhookData.checking_id || 
                          webhookData.id;

        if (!checkingId) {
          this.logger.warn('Webhook missing payment_hash:', webhookData);
          return res.status(400).json({
            success: false,
            error: 'Missing payment_hash in webhook data'
          });
        }

        // Verify payment
        const isValid = this.paymentService.verifyPayment(webhookData);

        if (!isValid) {
          this.logger.warn('Invalid payment data:', webhookData);
          return res.status(400).json({
            success: false,
            error: 'Invalid payment data'
          });
        }

        // Find pending invoice
        const pendingInvoice = this.pendingInvoices.get(checkingId);

        if (!pendingInvoice) {
          this.logger.warn('No pending invoice found for checking_id:', checkingId);
          // Still return success - payment was received, registration might happen via polling
          // Notify paid status anyway
          this.notifySse(checkingId, { type: 'paid', success: true, checkingId });
          return res.json({
            success: true,
            message: 'Payment received, but registration info not found'
          });
        }

        // Trust the webhook - LNbits only sends webhooks after payment is confirmed
        // No need to verify via API (which might have a delay)
        // The webhook itself is proof of payment

        // Check if already registered (to handle duplicate webhook calls)
        const existingRegistrations = this.nip05Service.getRegistrationsByPubkey(pendingInvoice.pubkey);
        const alreadyRegistered = existingRegistrations.find(r => r.paymentProof === checkingId);

        if (alreadyRegistered) {
          // Already registered - return success
          this.logger.info('NIP-05 already registered for this payment:', {
            name: alreadyRegistered.fullName,
            checkingId
          });

          // Remove from pending invoices
          this.pendingInvoices.delete(checkingId);

          const payload = {
            success: true,
            message: 'Payment received and name already registered',
            registration: {
              fullName: alreadyRegistered.fullName,
              nip05: `${alreadyRegistered.fullName}@${alreadyRegistered.domain}`
            }
          };
          this.notifySse(checkingId, { type: 'registered', ...payload });
          return res.json(payload);
        }

        // Auto-register the name using the pre-generated suffix
        try {
          const registration = await this.nip05Service.registerName(
            pendingInvoice.name,
            pendingInvoice.pubkey,
            checkingId,
            pendingInvoice.suffix
          );

          // Remove from pending invoices
          this.pendingInvoices.delete(checkingId);

          this.logger.info('Auto-registered NIP-05:', {
            name: registration.fullName,
            pubkey: pendingInvoice.pubkey.substring(0, 16) + '...'
          });

          const payload = {
            success: true,
            message: 'Payment received and name registered',
            registration: {
              fullName: registration.fullName,
              nip05: `${registration.fullName}@${registration.domain}`
            }
          };
          this.notifySse(checkingId, { type: 'registered', ...payload });
          return res.json(payload);
        } catch (regError: any) {
          this.logger.error('Error auto-registering name:', regError);
          // Payment was received, but registration failed
          // Frontend can still call /register endpoint
          const payload = {
            success: true,
            message: 'Payment received, but registration failed',
            error: regError.message
          };
          this.notifySse(checkingId, { type: 'paid', ...payload });
          return res.json(payload);
        }
      } catch (error: any) {
        this.logger.error('Error processing webhook:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to process webhook'
        });
      }
    });

    // Get user's registrations
    this.router.get('/registrations/:pubkey', (req: Request, res: Response) => {
      try {
        const { pubkey } = req.params;

        if (!pubkey) {
          return res.status(400).json({
            success: false,
            error: 'Pubkey is required'
          });
        }

        const registrations = this.nip05Service.getRegistrationsByPubkey(pubkey);

        return res.json({
          success: true,
          registrations: registrations.map(reg => ({
            id: reg.id,
            fullName: reg.fullName,
            nip05: `${reg.fullName}@${reg.domain}`,
            pubkey: reg.pubkey,
            createdAt: reg.createdAt
          }))
        });
      } catch (error) {
        this.logger.error('Error getting registrations:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get registrations'
        });
      }
    });

    // Serve nostr.json (for .well-known/nostr.json)
    this.router.get('/.well-known/nostr.json', (req: Request, res: Response) => {
      try {
        const json = this.nip05Service.getNostrJson();
        
        // Set proper headers for NIP-05
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        return res.json(json);
      } catch (error) {
        this.logger.error('Error serving nostr.json:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate nostr.json'
        });
      }
    });

    // Get a specific registration
    this.router.get('/registration/:name', (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const registration = this.nip05Service.getRegistration(name);

        if (!registration) {
          return res.status(404).json({
            success: false,
            error: 'Registration not found'
          });
        }

        return res.json({
          success: true,
          registration: {
            id: registration.id,
            fullName: registration.fullName,
            nip05: `${registration.fullName}@${registration.domain}`,
            pubkey: registration.pubkey,
            createdAt: registration.createdAt
          }
        });
      } catch (error) {
        this.logger.error('Error getting registration:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get registration'
        });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }

  private notifySse(checkingId: string, payload: any): void {
    const clients = this.sseClients.get(checkingId);
    if (!clients || clients.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(data);
      } catch {
        // ignore write errors; client likely disconnected
      }
    }
    // If this is a terminal event, close out subscribers
    if (payload && (payload.type === 'registered')) {
      const set = this.sseClients.get(checkingId);
      if (set) {
        for (const res of set) {
          try {
            res.write('event: close\n');
            res.write(`data: ${JSON.stringify({ reason: 'done' })}\n\n`);
            res.end();
          } catch {
            // ignore
          }
        }
        this.sseClients.delete(checkingId);
      }
    }
  }
}

