// Common types used throughout the application
import { LightningConfig } from './lightning';

export interface AppConfig {
  relays: string[];
  lightning: LightningConfig;
  features: FeatureFlags;
}

export interface FeatureFlags {
  liveDisplay: boolean;
  jukebox: boolean;
  payments: boolean;
  auth: boolean;
}

export interface User {
  id: string;
  publicKey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
}

export interface LiveEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  sig: string;
  identifier?: string;
}

export interface Zap {
  id: string;
  eventId: string;
  payerPubkey: string;
  amount: number;
  content?: string;
  created_at: number;
  profile?: User;
}

export interface Zapper {
  pubkey: string;
  amount: number;
  profile: User;
  name: string;
  picture: string;
}

export interface StyleOptions {
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
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  youtubeId: string;
  duration: number;
  requestedBy: string;
  amount: number;
  createdAt: number;
}

export interface JukeboxTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
  requester: User;
  requestedAt: number;
  played: boolean;
  zapAmount?: number;
}

export interface QueueItem {
  track: Track;
  position: number;
  totalAmount: number;
}

export type SignInMethod = 'extension' | 'external' | 'privateKey';

export interface SignInData {
  method: SignInMethod;
  publicKey: string;
  privateKey?: string;
  rememberMe: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
