// Global type declarations for external libraries
declare global {
  interface Window {
    nostr: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      nip04: {
        encrypt: (pubkey: string, plaintext: string, sk: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string, sk: string) => Promise<string>;
      };
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
