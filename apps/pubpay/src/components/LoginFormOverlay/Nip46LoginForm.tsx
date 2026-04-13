import React, { useState } from 'react';
import QRCode from 'qrcode';
import { Nip46Service } from '@pubpay/shared-services';

type Nip46Mode = 'qr' | 'bunker';

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
  const [mode, setMode] = useState<Nip46Mode>('qr');
  const [bunkerInput, setBunkerInput] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isVisible) {
    return null;
  }

  const resetQr = () => {
    setQrDataUrl(null);
    setError(null);
    setWaiting(false);
  };

  const startQrPairing = async () => {
    setError(null);
    setWaiting(true);
    try {
      const { uri, clientSecretKey } =
        Nip46Service.createNostrConnectPairingRequest();
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 220,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' }
      });
      setQrDataUrl(dataUrl);
      const { publicKey } = await Nip46Service.waitForNostrConnectPairing(
        clientSecretKey,
        uri
      );
      await onComplete(publicKey);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Nostr Connect pairing failed'
      );
    } finally {
      setWaiting(false);
    }
  };

  const submitBunker = async () => {
    setError(null);
    setWaiting(true);
    try {
      const { publicKey } = await Nip46Service.pairWithBunkerInput(bunkerInput);
      await onComplete(publicKey);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not connect to bunker URL'
      );
    } finally {
      setWaiting(false);
    }
  };

  return (
    <div className="nip46LoginForm">
      <p className="label" id="titleNip46">
        Nostr Connect (NIP-46)
      </p>
      <p
        className="nip46LoginHint"
        style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}
      >
        Remote signing (NIP-46) with Primal, Amber, nsec.app, or a{' '}
        <code>bunker://</code> URL. Default app relays are used for the QR
        handshake — see <code>NIP46-GUIDE.md</code> in the repo for flows and
        troubleshooting.
      </p>

      <div className="nip46ModeTabs" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`nip46Tab ${mode === 'qr' ? 'active' : ''}`}
          onClick={() => {
            setMode('qr');
            resetQr();
          }}
        >
          QR code
        </button>
        <button
          type="button"
          className={`nip46Tab ${mode === 'bunker' ? 'active' : ''}`}
          onClick={() => {
            setMode('bunker');
            resetQr();
          }}
        >
          Bunker / NIP-05
        </button>
      </div>

      {error ? (
        <p
          className="nip46Error"
          style={{ color: '#b91c1c', fontSize: 13, marginTop: 12 }}
        >
          {error}
        </p>
      ) : null}

      {mode === 'qr' ? (
        <div className="nip46QrSection" style={{ marginTop: 16 }}>
          {!qrDataUrl ? (
            <button
              type="button"
              className="cta"
              disabled={waiting}
              onClick={() => void startQrPairing()}
            >
              {waiting ? 'Starting…' : 'Show QR & wait for signer'}
            </button>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <img src={qrDataUrl} alt="Nostr Connect QR" />
              </div>
              <p
                className="label"
                style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.4 }}
              >
                Scan with your signer app, approve the connection, then keep
                this page open. Pairing can take up to several minutes.
              </p>
              {waiting ? (
                <p
                  className="label"
                  style={{ textAlign: 'center', marginTop: 8 }}
                >
                  Waiting for signer…
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="nip46BunkerSection" style={{ marginTop: 16 }}>
          <label className="label" htmlFor="nip46BunkerInput">
            Bunker URL or NIP-05 (e.g. user@domain.com)
          </label>
          <textarea
            id="nip46BunkerInput"
            rows={3}
            value={bunkerInput}
            onChange={e => setBunkerInput(e.target.value)}
            placeholder="bunker://… or name@domain.com"
            style={{
              width: '100%',
              marginTop: 8,
              boxSizing: 'border-box',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              border: '2px solid var(--border-color)',
              borderRadius: 6,
              padding: '12px 16px',
              fontFamily: 'inherit',
              fontSize: 14,
              resize: 'vertical'
            }}
          />
          <button
            type="button"
            className="cta"
            style={{ marginTop: 16 }}
            disabled={waiting || !bunkerInput.trim()}
            onClick={() => void submitBunker()}
          >
            {waiting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      )}

      <a
        href="#"
        className="label"
        id="backFromNip46"
        style={{ display: 'block', marginTop: 24, textAlign: 'center' }}
        onClick={e => {
          e.preventDefault();
          resetQr();
          setBunkerInput('');
          setError(null);
          onBack();
        }}
      >
        ← Back to sign-in options
      </a>
    </div>
  );
};
