import React from 'react';
import { COLORS, FONT_SIZES } from '../../constants';

interface ProfileNotLoggedInProps {
  onLogin: () => void;
  onRegister: () => void;
  onRecover: () => void;
}

export const ProfileNotLoggedIn: React.FC<ProfileNotLoggedInProps> = ({
  onLogin,
  onRegister,
  onRecover
}) => {
  return (
    <div>
      <div className="profileNotLoggedIn">
        <h2 className="profileNotLoggedInTitle">Not Logged In</h2>
        <p className="profileNotLoggedInText">
          Please log in to view your profile and manage your account
          settings.
        </p>
        <div className="profileButtonGroup">
          <button className="profileLoginButton" onClick={onLogin}>
            Log In
          </button>
          <button
            className="profileRegisterButton"
            onClick={onRegister}
          >
            Register
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '15px' }}>
          <button
            className="profileRecoveryLink"
            onClick={onRecover}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.PRIMARY,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: FONT_SIZES.SM
            }}
          >
            Recover Existing Account
          </button>
        </div>
      </div>
    </div>
  );
};

