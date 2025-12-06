import React from 'react';
import { COLORS } from '../../constants';

interface NSECInputFormProps {
  isVisible: boolean;
  nsecInput: string;
  nsecPassword: string;
  onNsecInputChange: (value: string) => void;
  onNsecPasswordChange: (value: string) => void;
  onContinue: (nsec: string, password?: string) => Promise<void>;
  onShowRecovery: () => void;
  onHide: () => void;
}

export const NSECInputForm: React.FC<NSECInputFormProps> = ({
  isVisible,
  nsecInput,
  nsecPassword,
  onNsecInputChange,
  onNsecPasswordChange,
  onContinue,
  onShowRecovery,
  onHide
}) => {
  if (!isVisible) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onContinue(nsecInput, nsecPassword || undefined);
  };

  return (
    <div
      id="nsecInputGroup"
      style={{ display: 'block' }}
    >
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          autoComplete="username"
          style={{ display: 'none' }}
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          type="text"
          id="nsecInput"
          placeholder="Enter your nsec"
          className="inputField"
          value={nsecInput}
          onChange={e => onNsecInputChange(e.target.value)}
          autoComplete="off"
          required
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px 16px',
            width: '100%',
            fontSize: '14px',
            boxSizing: 'border-box',
            marginBottom: '12px',
            fontFamily: 'monospace'
          }}
        />
        <input
          type="password"
          id="nsecPasswordInput"
          placeholder="Password (optional, for extra security)"
          className="inputField"
          value={nsecPassword}
          onChange={e => onNsecPasswordChange(e.target.value)}
          autoComplete="new-password"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px 16px',
            width: '100%',
            fontSize: '14px',
            boxSizing: 'border-box',
            marginBottom: '12px'
          }}
        />
        <p
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            margin: '0 0 12px 0',
            textAlign: 'left'
          }}
        >
          Optional: Set a password to encrypt your private key. You'll need to enter it each session.
        </p>
        <button
          id="continueWithNsec"
          className="cta"
          type="submit"
        >
          Continue
        </button>
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a
            href="#"
            className="label"
            style={{
              color: COLORS.TEXT_SECONDARY,
              fontSize: '13px',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
            onClick={e => {
              e.preventDefault();
              onHide();
              onShowRecovery();
            }}
          >
            Recover from seed
          </a>
        </div>
      </form>
    </div>
  );
};

