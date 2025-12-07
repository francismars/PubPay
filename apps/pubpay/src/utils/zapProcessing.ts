import { Kind9735Event, Kind0Event } from '@pubpay/shared-types';
import { processZap, ProcessedZap } from '@pubpay/shared-services';
import { ProcessedZapWithNewFlag } from '../types/postTypes';
import { genericUserIcon } from '../assets/images';

/**
 * Process a new zap event with pre-loaded profiles
 * Adds the isNewZap flag for UI lightning effects
 */
export function processNewZapWithProfiles(
  zapEvent: Kind9735Event,
  profiles: Map<string, Kind0Event>
): ProcessedZapWithNewFlag | null {
  try {
    // Use the shared utility function to process the zap
    const processedZap = processZap(zapEvent, profiles, genericUserIcon);
    
    // Add the isNewZap flag for UI lightning effect
    return {
      ...processedZap,
      isNewZap: true // Mark as new zap for lightning effect
    };
  } catch (error) {
    console.error('Error processing zap:', error);
    return null;
  }
}

/**
 * Check if a zap amount is within the specified limits
 * Matches legacy filtering logic for usage counting
 */
export function isZapWithinLimits(
  amount: number,
  min: number,
  max: number
): boolean {
  // Match legacy filtering logic
  if (min > 0 && max > 0) {
    // Both min and max specified
    return amount >= min && amount <= max;
  } else if (min > 0 && max === 0) {
    // Only min specified
    return amount >= min;
  } else if (min === 0 && max > 0) {
    // Only max specified
    return amount <= max;
  } else {
    // No limits specified
    return true;
  }
}

