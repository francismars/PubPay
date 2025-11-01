import { Request, Response, NextFunction } from 'express';
export declare class ErrorHandler {
    private logger;
    constructor();
    getHandler(): (error: Error, req: Request, res: Response, _next: NextFunction) => void;
}
//# sourceMappingURL=errorHandler.d.ts.map