import React from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { genericUserIcon } from '../../assets/images';
import { COLORS } from '../../constants';

interface TopNavigationProps {
  authState: {
    isLoggedIn: boolean;
    publicKey: string | null;
    displayName: string | null;
    userProfile?: {
      content?: string | null;
    } | null;
  };
  onQRScannerOpen: () => void;
  onLoginOpen: () => void;
  onNavigateToHome: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  authState,
  onQRScannerOpen,
  onLoginOpen,
  onNavigateToHome
}) => {
  const handleMobileMenuToggle = () => {
    const sideNav = document.getElementById('sideNav');
    const hamburger = document.querySelector('.hamburger');
    if (sideNav && hamburger) {
      sideNav.classList.toggle('open');
      hamburger.classList.toggle('open');
    }
  };

  return (
    <div id="nav">
      <div id="navInner">
        <div className="navLeft">
          <button
            className="hamburger"
            onClick={handleMobileMenuToggle}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <Link id="logo" to="/" onClick={onNavigateToHome}>
            PUB<span className="logoPay">PAY</span>
            <span className="logoMe">.me</span>
            <span className="version">alpha 0.03</span>
          </Link>
        </div>
        <div id="navActions">
          <a
            id="scanQrCode"
            className="topAction"
            title="Scan QR Code"
            onClick={onQRScannerOpen}
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </a>
          <a
            id="settings"
            href="#"
            style={{ display: 'none' }}
            className="topAction disabled"
            title="coming soon"
          >
            <span className="material-symbols-outlined">settings</span>
          </a>
          <a
            id="login"
            href="#"
            className="topAction"
            onClick={onLoginOpen}
          >
            {authState.isLoggedIn && authState.userProfile ? (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <img
                  className="userImg currentUserImg"
                  src={
                    (() => {
                      try {
                        return JSON.parse(
                          authState.userProfile.content || '{}'
                        ).picture;
                      } catch {
                        return undefined;
                      }
                    })() || genericUserIcon
                  }
                  alt="Profile"
                />
                <span className="profileUserNameNav">
                  {authState.displayName ||
                    (authState.publicKey
                      ? `${nip19.npubEncode(authState.publicKey).substring(0, 12)}...`
                      : '...')}
                </span>
              </div>
            ) : (
              <span className="material-symbols-outlined">
                account_circle
              </span>
            )}
          </a>
        </div>
      </div>
    </div>
  );
};

