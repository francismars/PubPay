import express from 'express';
export declare class BackendServer {
    private app;
    private port;
    private logger;
    constructor();
    private initializeMiddleware;
    private initializeRoutes;
    private initializeErrorHandling;
    start(): void;
    private logConfiguration;
    getApp(): express.Application;
}
//# sourceMappingURL=index.d.ts.map