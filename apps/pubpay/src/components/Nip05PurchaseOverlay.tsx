import React, { useState, useEffect } from 'react';
import { GenericQR } from '@pubpay/shared-ui';

interface Nip05PurchaseOverlayProps {
  pubkey: string;
  onSuccess: Function;
  onClose: () => void;
}

interface Nip05ServiceInfo {
  success: boolean;
  price: number;
  domain: string;
  currency: string;
}

interface Nip05Invoice {
  success: boolean;
  invoice?: {
    payment_hash: string;
    payment_request: string;
    checking_id: string;
    amount: number;
  };
  error?: string;
}

// Removed polling-based status type (SSE used instead)

interface Nip05Registration {
  success: boolean;
  registration?: {
    id: string;
    fullName: string;
    nip05: string;
    pubkey: string;
    createdAt: string;
  };
  error?: string;
}

// Get backend URL from environment variable, with fallback
// Normalize to remove trailing slash to avoid double slashes in URLs
const getBackendUrl = () => {
  const url = process.env.REACT_APP_API_BASE_URL ||
              process.env.REACT_APP_BACKEND_URL ||
              'http://localhost:3002';
  return url.replace(/\/$/, ''); // Remove trailing slash
};

const BACKEND_URL = getBackendUrl();

export const Nip05PurchaseOverlay: React.FC<Nip05PurchaseOverlayProps> = ({
  pubkey,
  onSuccess,
  onClose
}) => {
  const [step, setStep] = useState<'name' | 'payment' | 'processing' | 'success'>('name');
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [serviceInfo, setServiceInfo] = useState<Nip05ServiceInfo | null>(null);
  const [invoice, setInvoice] = useState<Nip05Invoice | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [isValidatingName, setIsValidatingName] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error'>('pending');

  // Load service info on mount
  useEffect(() => {
    const loadServiceInfo = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/nip05/info`);
        const data = await response.json();
        if (data.success) {
          setServiceInfo(data);
        }
      } catch (error) {
        console.error('Failed to load NIP-05 service info:', error);
      }
    };
    loadServiceInfo();
  }, []);

  // Subscribe to SSE updates if we have a checking ID
  useEffect(() => {
    if (!checkingId || step !== 'payment') return;

    let es: EventSource | null = null;

    try {
      es = new EventSource(`${BACKEND_URL}/nip05/stream/${checkingId}`);

      es.onmessage = async (evt: MessageEvent) => {
        try {
          const payload = JSON.parse(evt.data || '{}');
          if (payload.type === 'registered' && payload.registration?.nip05) {
            onSuccess(payload.registration.nip05);
            onClose();
            es?.close();
            es = null;
            return;
          }
          if (payload.type === 'paid' || payload.paid === true) {
            setPaymentStatus('paid');
            // If paid but not registered yet, we can attempt registration once
            await registerName();
          }
        } catch {
          // ignore malformed payloads
        }
      };

      es.onerror = () => {
        // Silent error; keep UI as-is. Optional: fallback once to a single check.
      };
    } catch {
      // Ignore EventSource construction failures
    }

    return () => {
      if (es) {
        es.close();
        es = null;
      }
    };
  }, [checkingId, step]);

  const validateName = async (nameToValidate: string): Promise<boolean> => {
    if (!nameToValidate || nameToValidate.trim().length === 0) {
      setNameError('Name is required');
      return false;
    }

    if (!/^[a-zA-Z0-9]{3,20}$/.test(nameToValidate)) {
      setNameError('Name must be 3-20 alphanumeric characters only');
      return false;
    }

    setIsValidatingName(true);
    setNameError('');

    try {
      const response = await fetch(`${BACKEND_URL}/nip05/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameToValidate })
      });

      const data = await response.json();
      setIsValidatingName(false);

      if (!data.success || !data.valid) {
        setNameError(data.error || 'Invalid name');
        return false;
      }

      return true;
    } catch {
      setIsValidatingName(false);
      setNameError('Failed to validate name. Please try again.');
      return false;
    }
  };

  const createInvoice = async () => {
    if (!name.trim()) {
      setNameError('Please enter a name');
      return;
    }

    const isValid = await validateName(name);
    if (!isValid) return;

    setIsCreatingInvoice(true);
    setNameError('');

    try {
      const response = await fetch(`${BACKEND_URL}/nip05/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          pubkey
        })
      });

      const data: Nip05Invoice = await response.json();

      if (data.success && data.invoice) {
        setInvoice(data);
        setCheckingId(data.invoice.checking_id);
        setStep('payment');
      } else {
        setNameError(data.error || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      setNameError('Failed to create invoice. Please try again.');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const registerName = async () => {
    if (!checkingId || !name.trim()) return;

    setStep('processing');

    try {
      const response = await fetch(`${BACKEND_URL}/nip05/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          pubkey,
          paymentProof: checkingId
        })
      });

      const data: Nip05Registration = await response.json();

      if (data.success && data.registration) {
        // Registration successful - close overlay and trigger success callback (toast will be shown)
        onSuccess(data.registration.nip05);
        onClose();
      } else {
        // Check if it's a limit error
        const errorMessage = data.error || 'Failed to register name';
        const isLimitError = errorMessage.includes('Maximum 5') || errorMessage.includes('maximum');

        setPaymentStatus('error');
        setNameError(errorMessage);

        // For limit errors, don't go back to payment step - show error and allow closing
        if (isLimitError) {
          setStep('name'); // Go back to name step so user can close
        } else {
          setStep('payment');
        }
      }
    } catch (error) {
      console.error('Failed to register name:', error);
      setPaymentStatus('error');
      setNameError('Failed to register name. Please try again.');
      setStep('payment');
    }
  };

  const handleBack = () => {
    if (step === 'payment') {
      setStep('name');
      setInvoice(null);
      setCheckingId(null);
      setPaymentStatus('pending');
    } else if (step === 'processing') {
      setStep('name');
      setInvoice(null);
      setCheckingId(null);
      setPaymentStatus('pending');
    }
  };

  return (
    <div
      id="nip05PurchaseOverlay"
      className="overlayContainer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        visibility: 'visible',
        opacity: 1,
        pointerEvents: 'auto',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh'
      }}
      onClick={onClose}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          transform: 'none !important',
          animation: 'none !important'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>

        {step === 'name' && (
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: 'var(--text-primary)' }}>
              Purchase Identifier (nip-05)
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                margin: '0 0 24px 0',
                lineHeight: '1.6'
              }}
            >
              Get a verified identifier (nip-05) for {serviceInfo?.price || 1000} sats.
              Your name will have a 4-digit suffix added (e.g., bob4829@{serviceInfo?.domain || 'domain.com'}).
            </p>

            <div className="formField">
              <label htmlFor="nip05Name" className="label">
                Choose your name prefix
              </label>
              <input
                id="nip05Name"
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setNameError('');
                }}
                placeholder="alice"
                className={nameError ? 'error' : ''}
                maxLength={20}
              />
              {nameError && <div className="errorMessage">{nameError}</div>}
              {isValidatingName && (
                <div className="validatingMessage">Validating name...</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="cta"
                onClick={createInvoice}
                disabled={!name.trim() || isValidatingName || isCreatingInvoice}
              >
                {isCreatingInvoice ? 'Creating Invoice...' : 'Continue to Payment'}
              </button>
            </div>
            <a
              id="cancelNip05Name"
              href="#"
              className="label"
              onClick={e => {
                e.preventDefault();
                if (!isCreatingInvoice) {
                  onClose();
                }
              }}
            >
              cancel
            </a>
          </div>
        )}

        {step === 'payment' && invoice?.invoice && (
          <div>
            <p className="label" style={{ marginBottom: '8px', fontSize: '16px' }}>
              Pay {serviceInfo?.price || 1000} sats to complete your identifier registration.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <GenericQR id="nip05QR" data={invoice.invoice.payment_request} />
            </div>

            <p id="qrcodeTitle" className="label">
              Otherwise:
            </p>

            <div className="formFieldGroup">
              <button
                className="cta"
                onClick={() => {
                  const paymentRequest = invoice.invoice?.payment_request;
                  if (paymentRequest) {
                    try {
                      window.location.href = `lightning:${paymentRequest}`;
                    } catch (error) {
                      console.error('Error opening wallet:', error);
                      window.open(paymentRequest, '_blank');
                    }
                  }
                }}
              >
                Pay with Wallet
              </button>
              <button
                id="nip05CopyInvoice"
                className="cta"
                onClick={async () => {
                  const paymentRequest = invoice.invoice?.payment_request;
                  if (paymentRequest) {
                    try {
                      await navigator.clipboard.writeText(paymentRequest);
                      const button = document.getElementById('nip05CopyInvoice');
                      if (button) {
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        setTimeout(() => {
                          if (button) button.textContent = originalText;
                        }, 1000);
                      }
                    } catch (err) {
                      console.error('Failed to copy:', err);
                      const textArea = document.createElement('textarea');
                      textArea.value = paymentRequest;
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textArea);
                      const button = document.getElementById('nip05CopyInvoice');
                      if (button) {
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        setTimeout(() => {
                          if (button) button.textContent = originalText;
                        }, 1000);
                      }
                    }
                  }
                }}
              >
                Copy Invoice
              </button>
              <button
                className="cta"
                onClick={() => {
                  const paymentRequest = invoice.invoice?.payment_request;
                  if (paymentRequest) {
                    console.log('Paying with extension:', paymentRequest);
                    alert(
                      'Extension payment for BOLT11 not yet implemented. Please scan the QR code or use the "Pay with Wallet" button.'
                    );
                  }
                }}
              >
                Pay with Extension
              </button>
            </div>

            {paymentStatus === 'paid' && (
              <div style={{ textAlign: 'center', marginTop: '20px', color: '#28a745' }}>
                ✓ Payment received! Registering your name...
              </div>
            )}
            {paymentStatus === 'error' && (
              <div style={{ textAlign: 'center', marginTop: '20px', color: '#dc3545' }}>
                {nameError || 'Payment verification failed. Please try again.'}
              </div>
            )}

            <a
              id="cancelNip05Payment"
              href="#"
              className="label"
              onClick={e => {
                e.preventDefault();
                handleBack();
              }}
            >
              cancel
            </a>
          </div>
        )}

        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Registering your identifier (nip-05)...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

