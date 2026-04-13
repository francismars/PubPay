import React from 'react';
import { Link } from 'react-router-dom';
import { COLORS } from '../../constants';
import { LoginMethodSelector } from './LoginMethodSelector';
import { NSECInputForm } from './NSECInputForm';
import { RecoveryForm } from './RecoveryForm';
import { Nip46LoginForm } from './Nip46LoginForm';

interface LoginFormOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  showNip46Group: boolean;
  showNsecGroup: boolean;
  showRecoveryGroup: boolean;
  extensionAvailable: boolean;
  externalSignerAvailable: boolean;
  externalSignerLoading: boolean;
  onSignInExtension: () => Promise<void>;
  onSignInExternalSigner: () => Promise<void>;
  onShowNsecGroup: () => void;
  onShowNip46Group: () => void;
  onShowRecoveryGroup: () => void;
  onHideNsecGroup: () => void;
  onHideNip46Group: () => void;
  onHideRecoveryGroup: () => void;
  onContinueWithNsec: (nsec: string, password?: string) => Promise<void>;
  onCompleteNip46Login: (publicKey: string) => Promise<void>;
  onRecoverFromMnemonic: (mnemonic: string, password?: string) => Promise<void>;
  nsecInput: string;
  nsecPassword: string;
  recoveryMnemonic: string;
  recoveryPassword: string;
  onNsecInputChange: (value: string) => void;
  onNsecPasswordChange: (value: string) => void;
  onRecoveryMnemonicChange: (value: string) => void;
  onRecoveryPasswordChange: (value: string) => void;
}

export const LoginFormOverlay: React.FC<LoginFormOverlayProps> = ({
  isVisible,
  onClose,
  showNip46Group,
  showNsecGroup,
  showRecoveryGroup,
  extensionAvailable,
  externalSignerAvailable,
  externalSignerLoading,
  onSignInExtension,
  onSignInExternalSigner,
  onShowNsecGroup,
  onShowNip46Group,
  onShowRecoveryGroup,
  onHideNsecGroup,
  onHideNip46Group,
  onHideRecoveryGroup,
  onContinueWithNsec,
  onCompleteNip46Login,
  onRecoverFromMnemonic,
  nsecInput,
  nsecPassword,
  recoveryMnemonic,
  recoveryPassword,
  onNsecInputChange,
  onNsecPasswordChange,
  onRecoveryMnemonicChange,
  onRecoveryPasswordChange
}) => {
  return (
    <div
      className="overlayContainer"
      id="loginForm"
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
        <p className="label" id="titleSignin">
          Choose Sign-in Method
        </p>

        <LoginMethodSelector
          isVisible={
            !showNsecGroup && !showRecoveryGroup && !showNip46Group
          }
          extensionAvailable={extensionAvailable}
          externalSignerAvailable={externalSignerAvailable}
          externalSignerLoading={externalSignerLoading}
          onSignInExtension={onSignInExtension}
          onSignInExternalSigner={onSignInExternalSigner}
          onShowNsecGroup={onShowNsecGroup}
          onShowNip46Group={onShowNip46Group}
        />

        <Nip46LoginForm
          isVisible={showNip46Group}
          onBack={onHideNip46Group}
          onComplete={async pubkey => {
            await onCompleteNip46Login(pubkey);
          }}
        />

        <NSECInputForm
          isVisible={showNsecGroup}
          nsecInput={nsecInput}
          nsecPassword={nsecPassword}
          onNsecInputChange={onNsecInputChange}
          onNsecPasswordChange={onNsecPasswordChange}
          onContinue={onContinueWithNsec}
          onShowRecovery={onShowRecoveryGroup}
          onHide={onHideNsecGroup}
        />

        <RecoveryForm
          isVisible={showRecoveryGroup}
          recoveryMnemonic={recoveryMnemonic}
          recoveryPassword={recoveryPassword}
          onRecoveryMnemonicChange={onRecoveryMnemonicChange}
          onRecoveryPasswordChange={onRecoveryPasswordChange}
          onRecover={onRecoverFromMnemonic}
          onShowNsec={onHideRecoveryGroup}
        />

        {/* Remember option removed: sessions persist until logout */}
        <div
          style={{ textAlign: 'center', marginTop: '32px', fontSize: '13px' }}
        >
          <span className="label" style={{ color: COLORS.TEXT_SECONDARY }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{ color: COLORS.PRIMARY, textDecoration: 'underline' }}
              onClick={onClose}
            >
              Sign up
            </Link>
          </span>
        </div>
        <a id="cancelLogin" href="#" className="label" onClick={onClose}>
          cancel
        </a>
      </div>
    </div>
  );
};
