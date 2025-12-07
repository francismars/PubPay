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

/**
 * Create a zap batch processor callback function
 * Extracted to utility to remove duplication across hooks
 * 
 * @param zapBatchRef - Ref to the zap batch array
 * @param zapBatchTimeoutRef - Ref to the timeout for delayed processing
 * @param processZapBatchRef - Ref to the processZapBatch function
 * @returns A callback function that processes zap events in batches
 */
export function createZapBatchProcessor(
  zapBatchRef: React.MutableRefObject<Kind9735Event[]>,
  zapBatchTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  processZapBatchRef: React.MutableRefObject<((zapEvents: Kind9735Event[]) => Promise<void>) | null>
): (zapEvent: Kind9735Event) => Promise<void> {
  return async (zapEvent: Kind9735Event) => {
    // Add to batch for processing
    zapBatchRef.current.push(zapEvent);
    console.log(
      'Zap added to batch, batch size:',
      zapBatchRef.current.length,
      'processZapBatchRef available:',
      !!processZapBatchRef.current
    );

    // Clear existing timeout
    if (zapBatchTimeoutRef.current) {
      clearTimeout(zapBatchTimeoutRef.current);
    }

    // Process batch after 500ms delay (or immediately if batch is large)
    if (zapBatchRef.current.length >= 10) {
      // Process immediately if batch is large
      const batchToProcess = [...zapBatchRef.current];
      zapBatchRef.current = [];
      console.log(
        'Processing zap batch immediately, batch size:',
        batchToProcess.length,
        'processZapBatchRef.current:',
        !!processZapBatchRef.current
      );
      if (processZapBatchRef.current) {
        await processZapBatchRef.current(batchToProcess);
      } else {
        console.error('processZapBatchRef.current is null!');
      }
    } else {
      // Process after delay
      console.log(
        'Scheduling zap batch processing, current batch size:',
        zapBatchRef.current.length,
        'processZapBatchRef.current:',
        !!processZapBatchRef.current
      );
      zapBatchTimeoutRef.current = setTimeout(async () => {
        const batchToProcess = [...zapBatchRef.current];
        zapBatchRef.current = [];
        console.log(
          'Processing zap batch after delay, batch size:',
          batchToProcess.length,
          'processZapBatchRef.current:',
          !!processZapBatchRef.current
        );
        if (processZapBatchRef.current) {
          await processZapBatchRef.current(batchToProcess);
        } else {
          console.error('processZapBatchRef.current is null in timeout!');
        }
      }, 500);
    }
  };
}

