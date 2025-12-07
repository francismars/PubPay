import { Kind1Event, Kind0Event } from '@pubpay/shared-types';
import { ProcessedZap } from '@pubpay/shared-services';

/**
 * Local extension for ProcessedZap with isNewZap flag
 * Used to indicate if a zap is newly detected for UI lightning effects
 */
export interface ProcessedZapWithNewFlag extends ProcessedZap {
  isNewZap?: boolean; // Flag to indicate if this is a newly detected zap
}

/**
 * Types for PubPay posts
 */
export interface PubPayPost {
  id: string;
  event: Kind1Event;
  author: Kind0Event | null;
  zaps: ProcessedZap[];
  zapAmount: number;
  zapMin: number;
  zapMax: number;
  zapUses: number;
  zapUsesCurrent: number;
  zapGoal?: number;
  zapPayer?: string;
  zapPayerPicture?: string;
  zapPayerName?: string;
  content: string;
  isPayable: boolean;
  hasZapTags?: boolean;
  zapLNURL?: string;
  createdAt: number;
  lightningValid?: boolean; // true if valid, false if invalid, undefined if not validated yet
  lightningValidating?: boolean; // true if validation is in progress
  nip05Valid?: boolean; // true if valid, false if invalid, undefined if not validated yet
  nip05Validating?: boolean; // true if validation is in progress
  profileLoading?: boolean; // true if profile is still loading (show skeleton instead of "Anonymous"/"Unverified")
  zapLoading?: boolean; // true if zaps are still loading (show skeleton instead of zap info)
}

/**
 * Authentication state interface
 */
export interface AuthState {
  isLoggedIn: boolean;
  publicKey: string | null;
  privateKey: string | null;
  signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
  userProfile: Kind0Event | null;
  displayName: string | null;
}

/**
 * Feed type for post loading
 */
export type FeedType = 'global' | 'following' | 'replies';

