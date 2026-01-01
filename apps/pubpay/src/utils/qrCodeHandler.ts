import { nip19 } from 'nostr-tools';
import { STORAGE_KEYS, TIMEOUT, TOAST_DURATION } from '../constants';
import { useUIStore } from '@pubpay/shared-services';

export interface QRCodeHandlerResult {
  handled: boolean;
  shouldCloseScanner?: boolean;
}

/**
 * Handles different QR code formats and routes them appropriately
 * @param decodedText - The scanned QR code text
 * @param navigate - React Router navigate function
 * @returns Object indicating if the QR code was handled and if scanner should close
 */
export const handleQRCodeContent = async (
  decodedText: string,
  navigate: (path: string) => void
): Promise<QRCodeHandlerResult> => {
  try {
    // Check if it's a BOLT11 invoice
    if (decodedText.match(/^(lnbc|lntb|lnbcrt)/i)) {
      // Store in sessionStorage so PaymentsPage can pick it up after navigation
      sessionStorage.setItem(STORAGE_KEYS.SCANNED_INVOICE, decodedText);
      navigate('/payments');
      // Dispatch event after a short delay to ensure PaymentsPage is mounted
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('walletScannedInvoice', { detail: { invoice: decodedText } })
        );
      }, TIMEOUT.SHORT_DELAY);
      useUIStore.getState().openToast('Invoice scanned!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return { handled: true, shouldCloseScanner: true };
    }

    // Check if it's a Lightning Address (user@domain.com format)
    const lightningAddressMatch = decodedText.match(
      /^([a-z0-9_-]+)@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,})$/i
    );
    if (lightningAddressMatch) {
      // Store in sessionStorage so PaymentsPage can pick it up after navigation
      sessionStorage.setItem(STORAGE_KEYS.SCANNED_LIGHTNING_ADDRESS, decodedText);
      navigate('/payments');
      // Dispatch event after a short delay to ensure PaymentsPage is mounted
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('walletScannedLightningAddress', {
            detail: { address: decodedText }
          })
        );
      }, TIMEOUT.SHORT_DELAY);
      useUIStore.getState().openToast('Lightning Address scanned!', 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
      return { handled: true, shouldCloseScanner: true };
    }

    // Check if it's an nsec (for login)
    if (decodedText.startsWith('nsec1')) {
      try {
        // Validate that it's a valid nsec by decoding it
        const decoded = nip19.decode(decodedText);
        if (decoded.type === 'nsec') {
          // Return nsec info - parent component will handle opening login form
          return {
            handled: true,
            shouldCloseScanner: true,
            // We'll use a custom event or callback for nsec handling
          };
        }
      } catch (nsecError) {
        // Invalid nsec, try other formats
        console.error('Invalid nsec format:', nsecError);
      }
    }

    // Accept note/nevent for posts and npub/nprofile for profiles
    const regex =
      /(note1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|nevent1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|npub1[0-9a-z]{58,}|nprofile1[0-9a-z]+)/i;
    const match = decodedText.match(regex);
    if (!match) {
      return { handled: false };
    }

    const token = match[0];
    const decoded = nip19.decode(token);

    if (decoded.type === 'note') {
      navigate(`/note/${token}`);
      return { handled: true, shouldCloseScanner: true };
    } else if (decoded.type === 'nevent') {
      const noteID = (decoded.data as any).id;
      const note1 = nip19.noteEncode(noteID);
      navigate(`/note/${note1}`);
      return { handled: true, shouldCloseScanner: true };
    } else if (decoded.type === 'npub') {
      const pubkeyHex = decoded.data as string;
      navigate(`/profile/${pubkeyHex}`);
      return { handled: true, shouldCloseScanner: true };
    } else if (decoded.type === 'nprofile') {
      const pubkeyHex = (decoded.data as any).pubkey;
      navigate(`/profile/${pubkeyHex}`);
      return { handled: true, shouldCloseScanner: true };
    } else {
      console.error(
        'Invalid QR code content. Expected \'note\', \'nevent\', \'npub\' or \'nprofile\'.'
      );
      return { handled: false };
    }
  } catch (error) {
    console.error('Failed to decode QR code content:', error);
    return { handled: false };
  }
};

/**
 * Checks if scanned text is an nsec and returns it if valid
 * @param decodedText - The scanned QR code text
 * @returns The nsec string if valid, null otherwise
 */
export const extractNsecFromQR = (decodedText: string): string | null => {
  if (decodedText.startsWith('nsec1')) {
    try {
      const decoded = nip19.decode(decodedText);
      if (decoded.type === 'nsec') {
        return decodedText;
      }
    } catch {
      // Invalid nsec
    }
  }
  return null;
};

