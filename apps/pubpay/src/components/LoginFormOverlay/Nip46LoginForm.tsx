import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Nip46Service } from '@pubpay/shared-services';

interface Nip46LoginFormProps {
  isVisible: boolean;
  onBack: () => void;
  /** Called with hex pubkey after NIP-46 pairing succeeds */
  // eslint-disable-next-line no-unused-vars -- callback type parameter name
  onComplete: (publicKey: string) => Promise<void>;
}

export const Nip46LoginForm: React.FC<Nip46LoginFormProps> = ({
  isVisible,
  onBack,
  onComplete
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [mobileQrVisible, setMobileQrVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStartedDesktopQrRef = useRef(false);
  const waitTokenRef = useRef(0);

  const isMobileDevice = () => {
    if (typeof window === 'undefined') {
      return false;
    }
    const ua = window.navigator.userAgent;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        ua
      ) ||
      window.matchMedia('(pointer: coarse)').matches
    );
  };

  const mobileDevice = isMobileDevice();

  const resetQr = () => {
    waitTokenRef.current += 1;
    autoStartedDesktopQrRef.current = false;
    setQrDataUrl(null);
    setQrUri(null);
    setMobileQrVisible(false);
    setCopyStatus('idle');
    setError(null);
    setWaiting(false);
  };

  const startQrPairing = async (options?: {
    showQr?: boolean;
    openSignerApp?: boolean;
  }) => {
    setError(null);
    setWaiting(true);
    const waitToken = waitTokenRef.current + 1;
    waitTokenRef.current = waitToken;
    try {
      const { uri, clientSecretKey } = Nip46Service.createNostrConnectPairingRequest({
        includeCallbackRedirects: Boolean(options?.openSignerApp)
      });
      if (options?.showQr) {
        const dataUrl = await QRCode.toDataURL(uri, {
          width: 220,
          margin: 2,
          color: { dark: '#1a1a1a', light: '#ffffff' }
        });
        setQrDataUrl(dataUrl);
        setQrUri(uri);
        setMobileQrVisible(true);
      } else {
        setQrDataUrl(null);
        setQrUri(null);
        setMobileQrVisible(false);
      }
      if (options?.openSignerApp) {
        Nip46Service.savePendingPairing(clientSecretKey, uri);
        Nip46Service.openSignerApp(uri);
      } else {
        Nip46Service.clearPendingPairing();
      }
      const { publicKey } = await Nip46Service.waitForNostrConnectPairing(
        clientSecretKey,
        uri
      );
      if (waitToken !== waitTokenRef.current) {
        return;
      }
      Nip46Service.clearPendingPairing();
      await onComplete(publicKey);
    } catch (e) {
      if (waitToken !== waitTokenRef.current) {
        return;
      }
      setError(
        e instanceof Error ? e.message : 'Nostr Connect pairing failed'
      );
    } finally {
      if (waitToken === waitTokenRef.current) {
        setWaiting(false);
      }
    }
  };

  useEffect(() => {
    if (
      !isVisible ||
      mobileDevice ||
      waiting ||
      qrDataUrl ||
      autoStartedDesktopQrRef.current
    ) {
      return;
    }
    autoStartedDesktopQrRef.current = true;
    void startQrPairing({ showQr: true });
  }, [isVisible, mobileDevice, waiting, qrDataUrl]);

  if (!isVisible) {
    return null;
  }

  const copyQrUri = async () => {
    if (!qrUri) {
      return;
    }
    try {
      await navigator.clipboard.writeText(qrUri);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <div className="nip46LoginForm">
      {error ? (
        <p
          className="nip46Error"
          style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}
        >
          {error}
        </p>
      ) : null}

      <div className="nip46QrSection" style={{ marginTop: 10 }}>
        {mobileDevice ? (
          <button
            type="button"
            className="cta"
            disabled={waiting}
            onClick={() =>
              void startQrPairing({ showQr: false, openSignerApp: true })
            }
          >
            {waiting ? 'Opening signer app…' : 'Open signer app'}
          </button>
        ) : null}
        {!mobileDevice && qrDataUrl ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <img src={qrDataUrl} alt="Nostr Connect QR" />
            </div>
            {qrUri ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                  <button
                    type="button"
                    className="label"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    onClick={() => void copyQrUri()}
                  >
                    {copyStatus === 'copied'
                      ? 'Copied'
                      : copyStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy'}
                  </button>
                </div>
                <textarea
                  value={qrUri}
                  readOnly
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    marginBottom: 0,
                    resize: 'none'
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
        {mobileDevice ? (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="label"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color)',
                cursor: waiting ? 'default' : 'pointer',
                textDecoration: 'underline',
                padding: 0
              }}
              onClick={() => {
                if (qrDataUrl) {
                  setMobileQrVisible(prev => !prev);
                  return;
                }
                void startQrPairing({ showQr: true });
              }}
            >
              {qrDataUrl && mobileQrVisible
                ? 'Hide QR code'
                : 'Use QR code instead'}
            </button>
          </div>
        ) : null}
        {mobileDevice && qrDataUrl && mobileQrVisible ? (
          <>
            <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 8 }}>
              <img src={qrDataUrl} alt="Nostr Connect QR" />
            </div>
            <p
              className="label"
              style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.4 }}
            >
              If app opening fails, scan this QR in your signer app to connect.
            </p>
            {qrUri ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                  <button
                    type="button"
                    className="label"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-color)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    onClick={() => void copyQrUri()}
                  >
                    {copyStatus === 'copied'
                      ? 'Copied'
                      : copyStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy'}
                  </button>
                </div>
                <textarea
                  value={qrUri}
                  readOnly
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    marginBottom: 0,
                    resize: 'none'
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
        {waiting ? (
          <p className="label" style={{ textAlign: 'center', marginTop: 8 }}>
            Waiting for signer…
          </p>
        ) : null}
      </div>

      <a
        href="#"
        className="label"
        id="backFromNip46"
        style={{ display: 'block', marginTop: 10, textAlign: 'center' }}
        onClick={e => {
          e.preventDefault();
          resetQr();
          Nip46Service.clearPendingPairing();
          setError(null);
          onBack();
        }}
      >
        ← Back to sign-in options
      </a>
    </div>
  );
};
