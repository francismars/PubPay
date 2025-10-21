export interface LightningInvoice {
    payment_hash: string;
    payment_request: string;
    description_hash?: string;
    description?: string;
    amount_msat: number;
    amount_sat: number;
    created_at: number;
    expires_at: number;
    status: 'pending' | 'paid' | 'expired' | 'cancelled';
}
export interface LightningPayment {
    id: string;
    payment_hash: string;
    amount_msat: number;
    amount_sat: number;
    created_at: number;
    status: 'pending' | 'completed' | 'failed';
    description?: string;
    preimage?: string;
}
export interface LNURLPResponse {
    tag: 'payRequest';
    callback: string;
    minSendable: number;
    maxSendable: number;
    metadata: string;
    commentAllowed?: number;
}
export interface LNURLPCallbackResponse {
    pr: string;
    routes: any[];
    successAction?: {
        tag: string;
        description?: string;
        url?: string;
        message?: string;
    };
}
export interface WebhookData {
    lnurlp: string;
    payment_hash: string;
    payment_request: string;
    amount: number;
    description?: string;
    comment?: string;
    created_at: number;
    paid_at: number;
    status: 'paid' | 'expired' | 'cancelled';
}
export interface LightningConfig {
    enabled: boolean;
    lnbitsUrl: string;
    apiKey: string;
    webhookUrl: string;
    frontendSessionId?: string;
    eventId?: string;
}
export interface LightningSession {
    sessionId: string;
    eventId: string;
    lnurlpId: string;
    createdAt: number;
    expiresAt: number;
    status: 'active' | 'expired' | 'cancelled';
}
//# sourceMappingURL=lightning.d.ts.map