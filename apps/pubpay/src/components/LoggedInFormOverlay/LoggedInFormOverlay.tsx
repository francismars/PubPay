import React from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

interface LoggedInFormOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  authState: {
    isLoggedIn: boolean;
    publicKey: string | null;
    signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
    displayName: string | null;
  };
  onLogout: () => void;
}

export const LoggedInFormOverlay: React.FC<LoggedInFormOverlayProps> = ({
  isVisible,
  onClose,
  authState,
  onLogout
}) => {
  return (
    <div
      className="overlayContainer"
      id="loggedInForm"
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
        <p className="label">You are logged in as:</p>
        <p id="loggedInPublicKey">
          {authState.publicKey ? (
            <Link to="/profile" className="userMention">
              {authState.displayName ||
                (authState.publicKey
                  ? nip19.npubEncode(authState.publicKey)
                  : '')}
            </Link>
          ) : (
            'Unknown'
          )}
        </p>
        <p className="label">Sign-in Method:</p>
        <span id="loggedInMethod">{authState.signInMethod || 'Unknown'}</span>
        <a href="" id="logoutButton" className="cta" onClick={onLogout}>
          Logout
        </a>
        <a
          id="cancelLoggedin"
          href="#"
          className="label"
          onClick={onClose}
        >
          cancel
        </a>
      </div>
    </div>
  );
};

