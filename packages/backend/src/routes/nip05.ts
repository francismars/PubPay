// NIP-05 Routes - Handle name registration and verification
import { Router, Request, Response } from 'express';
import { Nip05Service } from '../services/Nip05Service.js';
import { Nip05PaymentService } from '../services/Nip05PaymentService.js';
import { Logger } from '../utils/logger.js';
import { routeParam } from '../utils/requestParams.js';
import { isValidPaymentId, verifyWebhookSecret } from '../utils/webhookAuth.js';

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
    this.router.get(
      '/stream/:checkingId',
      (req: Request, res: Response): void => {
        const checkingId = routeParam(req, 'checkingId');
        if (!checkingId) {
          res
            .status(400)
            .json({ success: false, error: 'Checking ID is required' });
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
        res.write('event: hello\n');
        res.write(`data: ${JSON.stringify({ success: true, checkingId })}\n\n`);
      }
    );
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
        const { name } = req.body || {};

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
        const { name, pubkey } = req.body || {};

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
        const existingRegistrations =
          this.nip05Service.getRegistrationsByPubkey(pubkey);
        if (existingRegistrations.length >= 5) {
          return res.status(400).json({
            success: false,
            error:
              'Maximum 5 NIP-05 identifiers per public key. Please use an existing registration.'
          });
        }

        // Generate suffix now so we can include it in the invoice memo
        const suffix = Math.floor(1000 + Math.random() * 9000).toString();
        const fullName = `${name}${suffix}`;

        const invoice = await this.paymentService.createInvoice(
          name,
          pubkey,
          undefined,
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

    // Register name (after payment verified)
    this.router.post('/register', async (req: Request, res: Response) => {
      try {
        const { name, pubkey, paymentProof } = req.body || {};

        if (!name || !pubkey || !paymentProof) {
          return res.status(400).json({
            success: false,
            error: 'Name, pubkey, and paymentProof are required'
          });
        }

        if (!isValidPaymentId(paymentProof)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid payment proof'
          });
        }

        const pending = this.pendingInvoices.get(paymentProof);
        if (!pending) {
          // Allow re-fetch if already registered with this proof
          const existing =
            this.nip05Service.getRegistrationByPaymentProof(paymentProof);
          if (existing) {
            return res.json({
              success: true,
              registration: {
                id: existing.id,
                fullName: existing.fullName,
                nip05: `${existing.fullName}@${existing.domain}`,
                pubkey: existing.pubkey,
                createdAt: existing.createdAt
              }
            });
          }
          return res.status(400).json({
            success: false,
            error: 'No pending invoice for this payment'
          });
        }

        if (pending.name !== name || pending.pubkey !== pubkey) {
          return res.status(400).json({
            success: false,
            error: 'Payment is bound to a different name or pubkey'
          });
        }

        const confirmed =
          await this.paymentService.confirmPaidInvoice(paymentProof);
        if (!confirmed) {
          return res.status(402).json({
            success: false,
            error: 'Payment not verified. Please complete payment first.'
          });
        }

        if (!this.paymentService.claimProof(confirmed.paymentHash)) {
          const existing =
            this.nip05Service.getRegistrationByPaymentProof(paymentProof);
          if (existing) {
            return res.json({
              success: true,
              registration: {
                id: existing.id,
                fullName: existing.fullName,
                nip05: `${existing.fullName}@${existing.domain}`,
                pubkey: existing.pubkey,
                createdAt: existing.createdAt
              }
            });
          }
          return res.status(409).json({
            success: false,
            error: 'Payment proof already used'
          });
        }

        const registration = await this.nip05Service.registerName(
          pending.name,
          pending.pubkey,
          paymentProof,
          pending.suffix
        );

        this.pendingInvoices.delete(paymentProof);

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

        this.notifySse(paymentProof, { type: 'registered', ...responseBody });

        return res.json(responseBody);
      } catch (error: any) {
        this.logger.error('Error registering name:', error);
        return res.status(400).json({
          success: false,
          error: 'Failed to register name'
        });
      }
    });

    // Webhook endpoint for payment notifications (requires WEBHOOK_SECRET + LNBits confirm)
    this.router.post('/webhook', async (req: Request, res: Response) => {
      try {
        const auth = verifyWebhookSecret(req);
        if (!auth.ok) {
          this.logger.warn('Rejected nip05 webhook: invalid secret');
          return res.status(401).json({ success: false, error: auth.error });
        }

        const webhookData = req.body || {};
        const checkingId =
          webhookData.payment_hash || webhookData.checking_id || webhookData.id;

        if (!checkingId || !isValidPaymentId(String(checkingId))) {
          return res.status(400).json({
            success: false,
            error: 'Missing payment_hash in webhook data'
          });
        }

        const confirmed = await this.paymentService.confirmPaidInvoice(
          String(checkingId)
        );
        if (!confirmed) {
          return res.status(400).json({
            success: false,
            error: 'Payment not confirmed'
          });
        }

        const pendingInvoice = this.pendingInvoices.get(String(checkingId));

        if (!pendingInvoice) {
          this.logger.warn(
            'No pending invoice for confirmed payment:',
            String(checkingId).slice(0, 16)
          );
          this.notifySse(String(checkingId), {
            type: 'paid',
            success: true,
            checkingId
          });
          return res.json({
            success: true,
            message: 'Payment received, but registration info not found'
          });
        }

        const alreadyRegistered =
          this.nip05Service.getRegistrationByPaymentProof(String(checkingId));

        if (alreadyRegistered) {
          this.pendingInvoices.delete(String(checkingId));
          const payload = {
            success: true,
            message: 'Payment received and name already registered',
            registration: {
              fullName: alreadyRegistered.fullName,
              nip05: `${alreadyRegistered.fullName}@${alreadyRegistered.domain}`
            }
          };
          this.notifySse(String(checkingId), {
            type: 'registered',
            ...payload
          });
          return res.json(payload);
        }

        if (!this.paymentService.claimProof(confirmed.paymentHash)) {
          return res.json({
            success: true,
            message: 'Payment already processed'
          });
        }

        try {
          const registration = await this.nip05Service.registerName(
            pendingInvoice.name,
            pendingInvoice.pubkey,
            String(checkingId),
            pendingInvoice.suffix
          );

          this.pendingInvoices.delete(String(checkingId));

          this.logger.info('Auto-registered NIP-05:', {
            name: registration.fullName
          });

          const payload = {
            success: true,
            message: 'Payment received and name registered',
            registration: {
              fullName: registration.fullName,
              nip05: `${registration.fullName}@${registration.domain}`
            }
          };
          this.notifySse(String(checkingId), {
            type: 'registered',
            ...payload
          });
          return res.json(payload);
        } catch (regError: any) {
          this.logger.error('Error auto-registering name:', regError);
          const payload = {
            success: true,
            message: 'Payment received, but registration failed'
          };
          this.notifySse(String(checkingId), { type: 'paid', ...payload });
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
    if (payload && payload.type === 'registered') {
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
