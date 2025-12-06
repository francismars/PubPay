import React from 'react';
import { useUIStore } from '@pubpay/shared-services';
import { InvoiceQR } from '@pubpay/shared-ui';
import { getActiveNWCUri, migrateOldNWCConnection } from '../../utils/nwcStorage';
import { TOAST_DURATION, TIMEOUT, COLORS } from '../../constants';
import { genericUserIcon } from '../../assets/images';

interface InvoiceOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  posts: Array<{
    id: string;
    author?: {
      content?: string | null;
    } | null;
  }>;
}

export const InvoiceOverlay: React.FC<InvoiceOverlayProps> = ({
  isVisible,
  onClose,
  posts
}) => {
  const invoiceOverlay = useUIStore(s => s.invoiceOverlay);
  const bolt11 = invoiceOverlay.bolt11;
  const amount = invoiceOverlay.amount;
  const eventId = invoiceOverlay.eventId;

  // Convert from millisats to sats
  const amountInSats = amount > 0 ? Math.floor(amount / 1000) : 0;

  // Find the post by eventId to get author info
  let recipientName = 'Anonymous';
  let recipientPicture = genericUserIcon;

  if (eventId) {
    const post = posts.find(p => p.id === eventId);

    if (post && post.author) {
      try {
        const authorData = JSON.parse(post.author.content || '{}');
        recipientName = authorData?.display_name || authorData?.name || 'Anonymous';
        recipientPicture = authorData?.picture || genericUserIcon;
      } catch {
        // Use defaults
      }
    }
  }

  const handleCopyInvoice = async () => {
    if (!bolt11) return;

    try {
      await navigator.clipboard.writeText(bolt11);
      useUIStore.getState().openToast('Invoice copied to clipboard', 'success', false);
      setTimeout(() => {
        useUIStore.getState().closeToast();
      }, TOAST_DURATION.SHORT);
    } catch (err) {
      console.error('Failed to copy invoice:', err);
      // Fallback: select the text
      const textArea = document.createElement('textarea');
      textArea.value = bolt11;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      useUIStore.getState().openToast('Invoice copied to clipboard', 'success', false);
      setTimeout(() => {
        useUIStore.getState().closeToast();
      }, TOAST_DURATION.SHORT);
    }
  };

  const handlePayWithNWC = async () => {
    if (!bolt11) {
      useUIStore.getState().openToast('No invoice available', 'error', false);
      return;
    }

    try {
      // Migrate old format (safe to call multiple times)
      try {
        migrateOldNWCConnection();
      } catch {
        // Ignore migration errors
      }

      const nwcUri = getActiveNWCUri();
      if (!nwcUri) {
        useUIStore.getState().openToast('No NWC connection configured', 'error', false);
        return;
      }

      useUIStore.getState().openToast('Sending invoice to wallet…', 'loading', true);
      const { NwcClient } = await import('@pubpay/shared-services');
      const client = new NwcClient(nwcUri);

      useUIStore.getState().updateToast('Waiting for wallet…', 'loading', true);

      const timeoutMs = TIMEOUT.PAYMENT_RESPONSE;
      const timeoutPromise = new Promise<any>(resolve => {
        setTimeout(() => {
          resolve({
            error: { code: 'timeout', message: 'Wallet not responding' },
            result: null,
            result_type: 'error'
          });
        }, timeoutMs);
      });

      const resp = await Promise.race([
        client.payInvoice(bolt11),
        timeoutPromise
      ]);

      if (resp && !resp.error && resp.result) {
        useUIStore.getState().updateToast('Paid via NWC', 'success', false);
        setTimeout(() => {
          useUIStore.getState().closeToast();
          useUIStore.getState().closeInvoice();
        }, TOAST_DURATION.SHORT);
      } else {
        const msg =
          resp && resp.error && resp.error.message
            ? resp.error.message
            : 'NWC payment error';
        useUIStore.getState().updateToast(msg, 'error', true);
      }
    } catch (err) {
      console.warn('NWC payment exception:', err);
      useUIStore.getState().updateToast('NWC payment failed', 'error', true);
    }
  };

  const handlePayWithWebLN = async () => {
    if (!bolt11) {
      useUIStore.getState().openToast('No invoice available', 'error', false);
      return;
    }

    // Check if WebLN is available
    if (!window.webln) {
      useUIStore.getState().openToast('WebLN not available', 'error', false);
      return;
    }

    try {
      // Check if WebLN is enabled
      const isEnabled = await window.webln!.isEnabled();

      if (!isEnabled) {
        useUIStore.getState().openToast('Requesting permission…', 'loading', true);
        await window.webln!.enable();
      }

      useUIStore.getState().updateToast('Sending payment…', 'loading', true);

      const result = await window.webln!.sendPayment(bolt11);

      if (result && result.preimage) {
        useUIStore.getState().updateToast('Paid via WebLN', 'success', false);
        setTimeout(() => {
          useUIStore.getState().closeToast();
          useUIStore.getState().closeInvoice();
        }, TOAST_DURATION.SHORT);
      } else {
        useUIStore.getState().updateToast('WebLN payment failed', 'error', true);
      }
    } catch (err: any) {
      console.warn('WebLN payment exception:', err);
      const errorMessage = err?.message || 'WebLN payment failed';
      useUIStore.getState().updateToast(errorMessage, 'error', true);
    }
  };

  const handlePayWithWallet = () => {
    if (!bolt11) {
      console.error('No invoice available to pay');
      return;
    }

    try {
      window.location.href = `lightning:${bolt11}`;
    } catch (error) {
      console.error('Error opening wallet:', error);
    }
  };

  return (
    <div
      className="overlayContainer"
      id="invoiceOverlay"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'none',
        transition: 'none'
      }}
      onClick={onClose}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          transform: 'none',
          animation: 'none'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '8px' }}>
          <span className="label" style={{ fontSize: '16px' }}>Pay</span>
          <img
            src={recipientPicture}
            alt={recipientName}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
          <span className="label" style={{ fontSize: '16px' }}>{recipientName}</span>
          {amountInSats > 0 && (
            <span className="label" style={{ fontSize: '16px' }}>{amountInSats.toLocaleString()} sats</span>
          )}
        </div>
        <InvoiceQR bolt11={bolt11} />
        <div
          style={{
            marginTop: '16px',
            marginBottom: '16px',
            position: 'relative'
          }}
        >
          <input
            type="text"
            readOnly
            value={bolt11}
            style={{
              width: '100%',
              padding: '12px 48px 12px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              backgroundColor: '#f9fafb',
              color: COLORS.TEXT_TERTIARY,
              boxSizing: 'border-box',
              cursor: 'text'
            }}
            onClick={e => {
              (e.target as HTMLInputElement).select();
            }}
          />
          <button
            onClick={handleCopyInvoice}
            style={{
              position: 'absolute',
              right: '3px',
              top: '7px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: COLORS.TEXT_SECONDARY,
              transition: 'color 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = COLORS.PRIMARY;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = COLORS.TEXT_SECONDARY;
            }}
            title="Copy invoice"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              content_copy
            </span>
          </button>
        </div>
        <p id="qrcodeTitle" className="label">
          Otherwise, Pay with:
        </p>
        <div className="formFieldGroup">
          {(() => {
            // Check if NWC is configured
            try {
              migrateOldNWCConnection();
            } catch {
              // Ignore migration errors
            }

            const nwcUri = getActiveNWCUri();

            if (nwcUri) {
              return (
                <button
                  id="payWithNwc"
                  className="cta"
                  onClick={handlePayWithNWC}
                >
                  NWC
                </button>
              );
            }
            return null;
          })()}
          {(() => {
            // Check if WebLN is available
            if (window.webln) {
              return (
                <button
                  id="payWithWebLN"
                  className="cta"
                  onClick={handlePayWithWebLN}
                >
                  WebLN
                </button>
              );
            }
            return null;
          })()}
          <button
            id="payWithWallet"
            className="cta"
            onClick={handlePayWithWallet}
          >
            Wallet
          </button>
        </div>
        <a
          id="closeInvoiceOverlay"
          href="javascript:void(0)"
          className="label"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Close
        </a>
      </div>
    </div>
  );
};

