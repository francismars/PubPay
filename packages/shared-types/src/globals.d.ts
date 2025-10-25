// Global type declarations for external libraries

declare global {
  interface Window {
    NostrTools: {
      SimplePool: new () => any;
      nip19: {
        decode: (data: string) => { type: string; data: string };
        npubEncode: (pubkey: string) => string;
        noteEncode: (noteId: string) => string;
      };
      getEventHash: (event: any) => string;
      finalizeEvent: (event: any, privateKey: string) => any;
      verifyEvent: (event: any) => boolean;
    };
    nostr: {
      signEvent: (event: any) => Promise<any>;
    };
    lightningPayReq: {
      decode: (invoice: string) => { satoshis: number };
    };
    QRious: new (options: any) => {
      toDataURL: () => string;
    };
    Html5Qrcode: new (elementId: string) => {
      start: (
        cameraId: any,
        config: any,
        onSuccess: (text: string) => void,
        onError: (error: string) => void
      ) => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

export {};
