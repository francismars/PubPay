// Nostr-specific types

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#j'?: string[];
  '#d'?: string[];
  '#a'?: string[];
  '#t'?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface RelayInfo {
  url: string;
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
}

export interface RelayConnection {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastSeen: number;
  latency?: number;
  error?: string;
}

export interface ProfileData {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  nip05?: string;
}

export interface Kind1Event extends NostrEvent {
  kind: 1;
  // Additional kind 1 specific properties
}

export interface Kind0Event extends NostrEvent {
  kind: 0;
  content: string; // JSON string of ProfileData
}

export interface Kind9735Event extends NostrEvent {
  kind: 9735;
  // Zap receipt event
}

export interface Kind30311Event extends NostrEvent {
  kind: 30311;
  // Live event
}

export type EventKind = 0 | 1 | 9735 | 30311;

export interface EventHandler<T extends NostrEvent = NostrEvent> {
  (event: T): void;
}

export interface Subscription {
  id: string;
  filters: NostrFilter[];
  unsubscribe: () => void;
}
