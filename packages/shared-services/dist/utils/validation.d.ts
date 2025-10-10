export declare const isValidPublicKey: (pubkey: string) => boolean;
export declare const isValidPrivateKey: (privateKey: string) => boolean;
export declare const isValidEventId: (eventId: string) => boolean;
export declare const isValidNpub: (npub: string) => boolean;
export declare const isValidNsec: (nsec: string) => boolean;
export declare const isValidNevent: (nevent: string) => boolean;
export declare const isValidNaddr: (naddr: string) => boolean;
export declare const isValidNprofile: (nprofile: string) => boolean;
export declare const isValidZapAmount: (amount: number) => boolean;
export declare const isValidEventKind: (kind: number) => boolean;
export declare const isValidUrl: (url: string) => boolean;
export declare const isValidEmail: (email: string) => boolean;
export declare const isValidHexColor: (color: string) => boolean;
export declare const isValidYouTubeId: (id: string) => boolean;
export declare const sanitizeString: (str: string) => string;
export declare const validateEventData: (event: any) => {
    isValid: boolean;
    errors: string[];
};
