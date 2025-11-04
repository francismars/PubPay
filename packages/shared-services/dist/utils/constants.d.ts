export declare const RELAYS: string[];
export declare const DEFAULT_STYLES: {
    textColor: string;
    bgColor: string;
    bgImage: string;
    qrInvert: boolean;
    qrScreenBlend: boolean;
    qrMultiplyBlend: boolean;
    qrShowWebLink: boolean;
    qrShowNevent: boolean;
    qrShowNote: boolean;
    layoutInvert: boolean;
    hideZapperContent: boolean;
    showTopZappers: boolean;
    podium: boolean;
    zapGrid: boolean;
    opacity: number;
    textOpacity: number;
    partnerLogo: string;
};
export declare const ZAP_AMOUNTS: {
    MIN: number;
    MAX: number;
    DEFAULT: number;
};
export declare const GOAL_MAX = 2100000000000000;
export declare const EVENT_KINDS: {
    readonly PROFILE: 0;
    readonly NOTE: 1;
    readonly ZAP_RECEIPT: 9735;
    readonly LIVE_EVENT: 30311;
};
export declare const STORAGE_KEYS: {
    readonly PUBLIC_KEY: "publicKey";
    readonly PRIVATE_KEY: "privateKey";
    readonly SIGN_IN_METHOD: "signInMethod";
    readonly STYLE_OPTIONS: "styleOptions";
    readonly LIGHTNING_CONFIG: "lightningConfig";
};
export declare const API_ENDPOINTS: {
    readonly LIGHTNING_ENABLE: "/lightning/enable";
    readonly LIGHTNING_DISABLE: "/lightning/disable";
    readonly LIGHTNING_WEBHOOK: "/lightning/webhook";
    readonly LIGHTNING_DEBUG: "/lightning/debug/sessions";
};
export declare const ERROR_MESSAGES: {
    readonly NETWORK_ERROR: "Network error. Please check your connection.";
    readonly INVALID_EVENT: "Invalid event format.";
    readonly PAYMENT_FAILED: "Payment failed. Please try again.";
    readonly AUTH_REQUIRED: "Authentication required.";
    readonly INVALID_AMOUNT: "Invalid amount specified.";
    readonly RELAY_CONNECTION_FAILED: "Failed to connect to relay.";
    readonly LIGHTNING_DISABLED: "Lightning payments are disabled.";
};
export declare const SUCCESS_MESSAGES: {
    readonly PAYMENT_SUCCESS: "Payment successful!";
    readonly EVENT_PUBLISHED: "Event published successfully.";
    readonly LIGHTNING_ENABLED: "Lightning payments enabled.";
    readonly LIGHTNING_DISABLED: "Lightning payments disabled.";
    readonly STYLES_APPLIED: "Styles applied successfully.";
};
