// Global type declarations for external libraries
declare global {
  interface Window {
    nostr: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      nip04: {
        encrypt: (
          pubkey: string,
          plaintext: string,
          sk: string
        ) => Promise<string>;
        decrypt: (
          pubkey: string,
          ciphertext: string,
          sk: string
        ) => Promise<string>;
      };
    };
    webln?: {
      isEnabled: () => Promise<boolean>;
      enable: () => Promise<void>;
      sendPayment: (paymentRequest: string) => Promise<{ preimage: string }>;
      sendPaymentAsync?: (paymentRequest: string) => Promise<{ preimage: string }>;
      getInfo: () => Promise<any>;
      makeInvoice: (args: { amount: string | number; defaultMemo?: string }) => Promise<{ paymentRequest: string }>;
      keysend: (args: { destination: string; amount: number; customRecords?: Record<string, string> }) => Promise<{ preimage: string }>;
      signMessage: (message: string) => Promise<{ signature: string }>;
      verifyMessage: (signature: string, message: string) => Promise<boolean>;
      request: (method: string, params?: any) => Promise<any>;
      lnurl: (lnurl: string) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      off: (event: string, callback: (...args: any[]) => void) => void;
      getBalance?: () => Promise<{ balance: number }>;
    };
  }
}

// Type declarations for image files
declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

export {};
