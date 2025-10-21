import { Router } from 'express';
export declare class LightningRouter {
    private router;
    private lightningService;
    private webhookService;
    private sessionService;
    private logger;
    constructor();
    private initializeRoutes;
    private enableLightningPayments;
    private disableLightningPayments;
    private processWebhook;
    private debugSessions;
    private healthCheck;
    getRouter(): Router;
}
//# sourceMappingURL=lightning.d.ts.map