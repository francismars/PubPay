import React from 'react';
import { COLORS } from '../../constants';

interface RecoveryFormProps {
  isVisible: boolean;
  recoveryMnemonic: string;
  recoveryPassword: string;
  onRecoveryMnemonicChange: (value: string) => void;
  onRecoveryPasswordChange: (value: string) => void;
  onRecover: (mnemonic: string, password?: string) => Promise<void>;
  onShowNsec: () => void;
}

export const RecoveryForm: React.FC<RecoveryFormProps> = ({
  isVisible,
  recoveryMnemonic,
  recoveryPassword,
  onRecoveryMnemonicChange,
  onRecoveryPasswordChange,
  onRecover,
  onShowNsec
}) => {
  if (!isVisible) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }
    await onRecover(recoveryMnemonic.trim(), recoveryPassword || undefined);
  };

  return (
    <div
      id="recoveryInputGroup"
      style={{ display: 'block' }}
    >
      <form onSubmit={handleSubmit}>
        <div
          className="formField"
          style={{ textAlign: 'left', marginBottom: '20px' }}
        >
          <textarea
            id="recoveryMnemonic"
            placeholder="Enter your 12-word recovery phrase separated by spaces..."
            value={recoveryMnemonic}
            onChange={e => onRecoveryMnemonicChange(e.target.value)}
            rows={3}
            required
            style={{
              width: '100%',
              minHeight: '80px',
              resize: 'vertical',
              fontFamily: 'monospace',
              padding: '12px 16px',
              border: '2px solid var(--border-color)',
              borderRadius: '6px',
              fontSize: '16px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              marginBottom: '12px'
            }}
          />
        </div>
        <input
          type="password"
          id="recoveryPasswordInput"
          placeholder="Password (optional, for extra security)"
          className="inputField"
          value={recoveryPassword}
          onChange={e => onRecoveryPasswordChange(e.target.value)}
          autoComplete="new-password"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            border: '2px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px 16px',
            width: '100%',
            fontSize: '16px',
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
        <button id="continueWithRecovery" className="cta" type="submit">
          Recover Account
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
              onShowNsec();
            }}
          >
            Back to nsec login
          </a>
        </div>
      </form>
    </div>
  );
};

