import React, { useEffect, useRef } from 'react';
import { InvoiceQR } from '@pubpay/shared-ui';
import { useUIStore } from '@pubpay/shared-services';
import { COLORS, TOAST_DURATION } from '../../constants';
import QRCode from 'qrcode';

interface ReceivePaymentModalProps {
  isVisible: boolean;
  onClose: () => void;
  receiveOption: 'public-address' | 'create-note' | 'create-invoice';
  setReceiveOption: (option: 'public-address' | 'create-note' | 'create-invoice') => void;
  userLightningAddress: string | null;
  isLoggedIn: boolean;
  nwcClient: any;
  receiveAmount: string;
  setReceiveAmount: (amount: string) => void;
  receiveDescription: string;
  setReceiveDescription: (description: string) => void;
  receiveInvoice: string | null;
  setReceiveInvoice: (invoice: string | null) => void;
  generatingInvoice: boolean;
  handleGenerateInvoice: () => Promise<void>;
  onInvoiceGenerated: () => void;
  onOpenNWCOptions: () => void;
}

// Generic QR code component for any text
const GenericQR: React.FC<{ value: string }> = ({ value }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!value) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Render QR using qrcode npm package
    QRCode.toCanvas(canvas, value, {
      width: 200,
      margin: 2
    }).catch((error: Error) => {
      console.error('Error generating QR code:', error);
    });
  }, [value]);

  return (
    <canvas ref={canvasRef} width="200" height="200" style={{ maxWidth: '100%', height: 'auto' }}></canvas>
  );
};

export const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  isVisible,
  onClose,
  receiveOption,
  setReceiveOption,
  userLightningAddress,
  isLoggedIn,
  nwcClient,
  receiveAmount,
  setReceiveAmount,
  receiveDescription,
  setReceiveDescription,
  receiveInvoice,
  setReceiveInvoice,
  generatingInvoice,
  handleGenerateInvoice,
  onInvoiceGenerated,
  onOpenNWCOptions
}) => {
  if (!isVisible) return null;

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      useUIStore.getState().openToast(`${label} copied to clipboard`, 'success', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
    } catch (err) {
      console.error('Failed to copy:', err);
      useUIStore.getState().openToast('Failed to copy', 'error', false);
      setTimeout(() => useUIStore.getState().closeToast(), TOAST_DURATION.SHORT);
    }
  };

  const handleCreatePayNote = () => {
    onClose();
    // Trigger the new pay note form via custom event
    window.dispatchEvent(new CustomEvent('openNewPayNoteForm'));
  };

  return (
    <div
      className="overlayContainer"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '5vh',
        paddingBottom: '5vh',
        animation: 'none',
        transition: 'none',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        className="overlayInner"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: 'none',
          animation: 'none',
          transition: 'none',
          maxWidth: '500px',
          width: '100%'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <p className="label" style={{ marginBottom: '24px' }}>
          Receive Payment
        </p>

        {/* Option Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            background: 'var(--bg-secondary)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}
        >
          <button
            type="button"
            onClick={() => setReceiveOption('create-note')}
            disabled={generatingInvoice}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              background: receiveOption === 'create-note' ? COLORS.PRIMARY : 'transparent',
              color: receiveOption === 'create-note' ? COLORS.TEXT_WHITE : 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: generatingInvoice ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: generatingInvoice ? 0.5 : 1
            }}
          >
            New PayNote
          </button>
          <button
            type="button"
            onClick={() => setReceiveOption('public-address')}
            disabled={generatingInvoice}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              background: receiveOption === 'public-address' ? COLORS.PRIMARY : 'transparent',
              color: receiveOption === 'public-address' ? COLORS.TEXT_WHITE : 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: generatingInvoice ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: generatingInvoice ? 0.5 : 1
            }}
          >
            Lightning Address
          </button>
          <button
            type="button"
            onClick={() => setReceiveOption('create-invoice')}
            disabled={generatingInvoice}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              background: receiveOption === 'create-invoice' ? COLORS.PRIMARY : 'transparent',
              color: receiveOption === 'create-invoice' ? COLORS.TEXT_WHITE : 'var(--text-secondary)',
              fontSize: '14px',
              fontWeight: '500',
              cursor: generatingInvoice ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: generatingInvoice ? 0.5 : 1
            }}
          >
            New Invoice
          </button>
        </div>

        {/* Lightning Address Option */}
        {receiveOption === 'public-address' && (
          <div>
            {!isLoggedIn ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', marginTop: 0 }}>
                  Please log in to view your public payments address
                </p>
                <button
                  onClick={() => {
                    onClose();
                    useUIStore.getState().openLogin();
                  }}
                  style={{
                    padding: '10px 20px',
                    background: COLORS.PRIMARY,
                    color: COLORS.TEXT_WHITE,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Log In
                </button>
              </div>
            ) : !userLightningAddress ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  No Lightning Address found in your profile. Please add one in your profile settings.
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                  <GenericQR value={userLightningAddress} />
                </div>
                <div
                  style={{
                    padding: '12px',
                    marginBottom: '16px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <input
                    type="text"
                    readOnly
                    value={userLightningAddress}
                    style={{
                      flex: 1,
                      padding: '8px',
                      fontSize: '14px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      cursor: 'text',
                      marginBottom: 0
                    }}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).select();
                    }}
                  />
                  <button
                    onClick={() => handleCopy(userLightningAddress, 'Lightning Address')}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    Copy
                  </button>
                </div>
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    margin: 0
                  }}
                >
                  Share this address to receive payments
                </p>
              </>
            )}
          </div>
        )}

        {/* New PayNote Option */}
        {receiveOption === 'create-note' && (
          <div>
            {!isLoggedIn ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Please log in to create a pay note
                </p>
                <button
                  onClick={() => {
                    onClose();
                    useUIStore.getState().openLogin();
                  }}
                  style={{
                    padding: '10px 20px',
                    background: COLORS.PRIMARY,
                    color: COLORS.TEXT_WHITE,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Log In
                </button>
              </div>
            ) : (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '16px' }}>
                  Create a public payment request that others can pay
                </p>
                <button
                  onClick={handleCreatePayNote}
                  style={{
                    padding: '12px 24px',
                    background: COLORS.PRIMARY,
                    color: COLORS.TEXT_WHITE,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: '500'
                  }}
                >
                  New PayNote
                </button>
              </div>
            )}
          </div>
        )}

        {/* New Invoice Option */}
        {receiveOption === 'create-invoice' && (
          <div>
            {!nwcClient ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', marginTop: 0 }}>
                  To generate BOLT11 invoices, you need to connect a compatible wallet.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onOpenNWCOptions();
                  }}
                  style={{
                    padding: '10px 20px',
                    background: COLORS.PRIMARY,
                    color: COLORS.TEXT_WHITE,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Connect
                </button>
              </div>
            ) : !receiveInvoice ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'var(--text-primary)',
                      marginBottom: '8px'
                    }}
                  >
                    Amount (sats)
                  </label>
                  <input
                    type="number"
                    value={receiveAmount}
                    onChange={(e) => setReceiveAmount(e.target.value)}
                    placeholder="Enter amount"
                    disabled={generatingInvoice}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '16px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'var(--text-primary)',
                      marginBottom: '8px'
                    }}
                  >
                    Description (optional)
                  </label>
                  <textarea
                    value={receiveDescription}
                    onChange={(e) => setReceiveDescription(e.target.value)}
                    placeholder="Enter description"
                    disabled={generatingInvoice}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <button
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice || !receiveAmount}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '500',
                    background:
                      generatingInvoice || !receiveAmount
                        ? 'var(--bg-secondary)'
                        : COLORS.PRIMARY,
                    color:
                      generatingInvoice || !receiveAmount
                        ? 'var(--text-secondary)'
                        : COLORS.TEXT_WHITE,
                    border: 'none',
                    borderRadius: '8px',
                    cursor:
                      generatingInvoice || !receiveAmount
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: generatingInvoice || !receiveAmount ? 0.6 : 1
                  }}
                >
                  {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                  <InvoiceQR bolt11={receiveInvoice} />
                </div>
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <input
                    type="text"
                    readOnly
                    value={receiveInvoice}
                    style={{
                      flex: 1,
                      padding: '8px',
                      marginBottom: 0,
                      fontSize: '12px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      cursor: 'text'
                    }}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).select();
                    }}
                  />
                  <button
                    onClick={() => handleCopy(receiveInvoice, 'Invoice')}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setReceiveInvoice(null);
                      setReceiveAmount('');
                      setReceiveDescription('');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    New Invoice
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onInvoiceGenerated();
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      background: COLORS.PRIMARY,
                      color: COLORS.TEXT_WHITE,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Close button - only show when not displaying generated invoice */}
        {!(receiveOption === 'create-invoice' && receiveInvoice) && (
          <a
            href="#"
            className="label"
            onClick={e => {
              e.preventDefault();
              if (!generatingInvoice) {
                onClose();
              }
            }}
            style={{
              display: 'block',
              textAlign: 'center',
              marginTop: '24px',
              pointerEvents: generatingInvoice ? 'none' : 'auto',
              opacity: generatingInvoice ? 0.5 : 1,
              textDecoration: 'none',
              color: 'var(--text-secondary)'
            }}
          >
            close
          </a>
        )}
      </div>
    </div>
  );
};

