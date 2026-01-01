import React from 'react';
import { Link } from 'react-router-dom';

interface SideNavigationProps {
  authState: {
    isLoggedIn: boolean;
  };
  onClose: () => void;
  onNavigateToHome: () => void;
  onNewPayNote: () => void;
}

export const SideNavigation: React.FC<SideNavigationProps> = ({
  authState,
  onClose,
  onNavigateToHome,
  onNewPayNote
}) => {
  return (
    <div id="sideNav">
      <div id="navInner">
        <Link
          to="/"
          className="sideNavLink"
          title="Home Feed"
          onClick={() => {
            onNavigateToHome();
            onClose();
          }}
        >
          Home
        </Link>
        <Link
          to="/profile"
          className="sideNavLink"
          title="Your PubPay Profile"
          onClick={onClose}
        >
          Profile
        </Link>
        <Link
          to="/payments"
          className="sideNavLink"
          title="Payments"
          onClick={onClose}
        >
          Payments
        </Link>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Discovery
        </a>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Splits
        </a>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Bets & Wagers
        </a>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Events
        </a>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Notifications
        </a>
        <a
          href="javascript:void(0)"
          className="sideNavLink disabled"
          title="coming soon"
          onClick={e => {
            e.preventDefault();
            onClose();
          }}
        >
          Messages
        </a>
        <Link
          to="/settings"
          className="sideNavLink"
          title="Settings"
          onClick={onClose}
        >
          Settings
        </Link>
        <a
          href="/live"
          className="sideNavLink "
          title="PubPay Live"
          onClick={onClose}
        >
          Live
        </a>
        <Link
          to="/about"
          className="sideNavLink"
          title="About PubPay"
          onClick={onClose}
        >
          About
        </Link>
        <a
          id="newPayNote"
          className="sideNavLink cta"
          href="#"
          onClick={() => {
            onNewPayNote();
            onClose();
          }}
        >
          New Paynote
        </a>
      </div>
    </div>
  );
};

