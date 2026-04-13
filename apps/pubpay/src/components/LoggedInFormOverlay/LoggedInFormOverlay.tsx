import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Kind0Event } from '@pubpay/shared-types';
import { safeJson } from '@pubpay/shared-utils';
import {
  getNpubFromPublicKey,
  sanitizeImageUrl,
  trimNpub
} from '../../utils/profileUtils';

interface LoggedInFormOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  authState: {
    isLoggedIn: boolean;
    publicKey: string | null;
    signInMethod: 'extension' | 'externalSigner' | 'nsec' | 'nip46' | null;
    displayName: string | null;
    userProfile: Kind0Event | null;
  };
  onLogout: () => void;
}

function signInMethodLabel(
  method: 'extension' | 'externalSigner' | 'nsec' | 'nip46' | null
): string {
  switch (method) {
    case 'extension':
      return 'Browser extension';
    case 'externalSigner':
      return 'External signer';
    case 'nip46':
      return 'Nostr Connect (NIP-46)';
    case 'nsec':
      return 'nsec key';
    default:
      return 'Unknown';
  }
}

export const LoggedInFormOverlay: React.FC<LoggedInFormOverlayProps> = ({
  isVisible,
  onClose,
  authState,
  onLogout
}) => {
  const npub = useMemo(
    () => getNpubFromPublicKey(undefined, authState.publicKey),
    [authState.publicKey]
  );

  const pictureUrl = useMemo(() => {
    if (!authState.userProfile?.content) return null;
    const data = safeJson<Record<string, unknown>>(
      authState.userProfile.content,
      {}
    );
    const raw = typeof data.picture === 'string' ? data.picture : '';
    return raw ? sanitizeImageUrl(raw) : null;
  }, [authState.userProfile]);

  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    setAvatarFailed(false);
  }, [pictureUrl]);

  const displayName = authState.displayName?.trim() || null;
  const avatarInitial = displayName
    ? displayName.charAt(0).toUpperCase()
    : 'N';

  const showAvatarImage = Boolean(pictureUrl) && !avatarFailed;

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
        <p className="label">You are logged in as</p>
        {authState.publicKey ? (
          <Link
            to="/profile"
            className="loggedInIdentityCard"
            title={npub || undefined}
          >
            <div className="loggedInAvatar">
              {showAvatarImage ? (
                <img
                  src={pictureUrl!}
                  alt=""
                  className="loggedInAvatarImage"
                  onError={() => setAvatarFailed(true)}
                />
              ) : null}
              <span
                className="loggedInAvatarFallback"
                style={{ display: showAvatarImage ? 'none' : 'flex' }}
                aria-hidden
              >
                {avatarInitial}
              </span>
            </div>
            <div className="loggedInIdentityText">
              {displayName ? (
                <span className="loggedInDisplayName">{displayName}</span>
              ) : null}
              <span id="loggedInPublicKey" className="loggedInNpub">
                {trimNpub(npub)}
              </span>
            </div>
          </Link>
        ) : (
          <p id="loggedInPublicKey" className="loggedInNpub">
            Unknown
          </p>
        )}
        <p className="label">Sign-in method</p>
        <span id="loggedInMethod" className="loggedInMethodValue">
          {signInMethodLabel(authState.signInMethod)}
        </span>
        <a
          href="#"
          id="logoutButton"
          className="cta loggedInLogout"
          onClick={e => {
            e.preventDefault();
            onLogout();
          }}
        >
          Logout
        </a>
        <a
          id="cancelLoggedin"
          href="#"
          className="label"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          cancel
        </a>
      </div>
    </div>
  );
};
