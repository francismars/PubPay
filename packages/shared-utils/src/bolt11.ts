import { decode } from 'light-bolt11-decoder';

export interface DecodedBolt11 {
  /** Whole sats; null when the invoice is amount-less */
  satoshis: number | null;
  millisatoshis: number | null;
  timestamp: number;
  /** Absolute lifetime from payment request (seconds); default 3600 if omitted */
  expirySeconds: number;
  description: string;
  /** BOLT11 HRP network code, e.g. `bc`, `tb`, `bcrt` */
  networkBech32: string | null;
}

type NamedSection = { name: string; value?: unknown };

function section<T extends NamedSection>(
  sections: NamedSection[],
  name: string
): T | undefined {
  return sections.find(s => s.name === name) as T | undefined;
}

/**
 * Decode a BOLT11 payment request without pulling in elliptic/secp256k1
 * (uses light-bolt11-decoder → @scure/base only).
 */
export function decodeBolt11(invoice: string): DecodedBolt11 {
  const decoded = decode(invoice.trim());
  const sections = decoded.sections as NamedSection[];

  const amountSec = section<{ name: 'amount'; value?: string }>(
    sections,
    'amount'
  );
  let millisatoshis: number | null = null;
  let satoshis: number | null = null;
  if (amountSec?.value != null && amountSec.value !== '') {
    const msats = Number(amountSec.value);
    if (Number.isFinite(msats)) {
      millisatoshis = msats;
      satoshis = Math.floor(msats / 1000);
    }
  }

  const tsSec = section<{ name: 'timestamp'; value?: number }>(
    sections,
    'timestamp'
  );
  const descSec = section<{ name: 'description'; value?: string }>(
    sections,
    'description'
  );
  const netSec = section<{
    name: 'coin_network';
    value?: { bech32?: string };
  }>(sections, 'coin_network');

  return {
    satoshis,
    millisatoshis,
    timestamp:
      typeof tsSec?.value === 'number'
        ? tsSec.value
        : Math.floor(Date.now() / 1000),
    expirySeconds:
      typeof decoded.expiry === 'number' && decoded.expiry > 0
        ? decoded.expiry
        : 3600,
    description: typeof descSec?.value === 'string' ? descSec.value : '',
    networkBech32: netSec?.value?.bech32 ?? null
  };
}

/** Zap/UI helper: amount in sats, or 0 if missing/unparseable. */
export function bolt11AmountSats(invoice: string): number {
  try {
    return decodeBolt11(invoice).satoshis ?? 0;
  } catch {
    return 0;
  }
}
