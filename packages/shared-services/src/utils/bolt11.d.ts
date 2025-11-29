declare module 'bolt11' {
  export interface DecodedInvoice {
    satoshis?: number;
    [key: string]: any;
  }
  
  export function decode(invoice: string): DecodedInvoice;
}

