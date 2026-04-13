import React from 'react';

interface LoginMethodSelectorProps {
  isVisible: boolean;
  extensionAvailable: boolean;
  externalSignerAvailable: boolean;
  externalSignerLoading: boolean;
  onSignInExtension: () => Promise<void>;
  onSignInExternalSigner: () => Promise<void>;
  onShowNsecGroup: () => void;
  onShowNip46Group: () => void;
}

export const LoginMethodSelector: React.FC<LoginMethodSelectorProps> = ({
  isVisible,
  extensionAvailable,
  externalSignerAvailable,
  externalSignerLoading,
  onSignInExtension,
  onSignInExternalSigner,
  onShowNsecGroup,
  onShowNip46Group
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="formFieldGroup"
      id="loginFormGroup"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center'
      }}
    >
      <a
        href="#"
        id="signInExtension"
        className={`cta ${!extensionAvailable ? 'disabled red' : ''}`}
        onClick={async e => {
          if (!extensionAvailable) {
            e.preventDefault();
            return;
          }
          await onSignInExtension();
        }}
      >
        {!extensionAvailable ? 'Not found' : 'Extension'}
      </a>
      <a
        href="#"
        id="signInexternalSigner"
        className={`cta ${!externalSignerAvailable ? 'disabled red' : ''}`}
        onClick={async e => {
          if (!externalSignerAvailable || externalSignerLoading) {
            e.preventDefault();
            return;
          }
          await onSignInExternalSigner();
        }}
      >
        {!externalSignerAvailable
          ? 'Not found'
          : externalSignerLoading
            ? 'Loading...'
            : 'Signer'}
      </a>
      <a
        href="#"
        id="signInNip46"
        className="cta"
        onClick={e => {
          e.preventDefault();
          onShowNip46Group();
        }}
      >
        Nostr Connect
      </a>
      <a
        href="#"
        id="signInNsec"
        className="cta"
        onClick={e => {
          e.preventDefault();
          onShowNsecGroup();
        }}
      >
        NSEC
      </a>
    </div>
  );
};
