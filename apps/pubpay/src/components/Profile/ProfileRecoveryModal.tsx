import React from 'react';
import { COLORS, FONT_SIZES } from '../../constants';

interface ProfileRecoveryModalProps {
  show: boolean;
  recoveryMnemonic: string;
  onMnemonicChange: (value: string) => void;
  onRecover: () => void;
  onClose: () => void;
}

export const ProfileRecoveryModal: React.FC<ProfileRecoveryModalProps> = ({
  show,
  recoveryMnemonic,
  onMnemonicChange,
  onRecover,
  onClose
}) => {
  if (!show) return null;

  return (
    <div
      className="overlayContainer"
      onClick={onClose}
    >
      <div
        className="overlayInner"
        style={{ textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', color: COLORS.TEXT_PRIMARY }}>
          Recover Existing Account
        </h3>
        <p
          style={{ margin: '0 0 20px 0', color: COLORS.TEXT_LIGHT, fontSize: FONT_SIZES.SM }}
        >
          If you have a 12-word recovery phrase from a previous account, you
          can recover your keys here.
        </p>

        <div className="profileFormField" style={{ textAlign: 'left' }}>
          <label htmlFor="recoveryMnemonic">12-Word Recovery Phrase</label>
          <textarea
            id="recoveryMnemonic"
            value={recoveryMnemonic}
            onChange={e => onMnemonicChange(e.target.value)}
            className="profileFormTextarea"
            placeholder="Enter your 12-word recovery phrase separated by spaces..."
            rows={3}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '20px'
          }}
        >
          <button
            className="profileCopyButton"
            onClick={onRecover}
            disabled={!recoveryMnemonic.trim()}
            style={{ margin: 0 }}
          >
            Recover Keys
          </button>
          <button
            className="profileCopyButton"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

