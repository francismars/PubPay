import React from 'react';
import { useUIStore } from '@pubpay/shared-services';

interface ProfilePageProps {
  authState?: any;
  onNavigateToRegister?: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ authState, onNavigateToRegister }) => {
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const displayName = authState?.displayName;
  const publicKey = authState?.publicKey;
  const openLogin = useUIStore(s => s.openLogin);

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        Profile
      </h1>

      {isLoggedIn ? (
        <div>
          {/* User Profile Section */}
          <div className="profileSection">
            <div className="profileUserInfo">
              <div className="profileAvatar">
                {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="profileUserDetails">
                <h2>
                  {displayName || 'Anonymous User'}
                </h2>
                <p>
                  PubPay User
                </p>
              </div>
            </div>

            {publicKey && (
              <div className="profilePublicKey">
                <label>
                  Public Key
                </label>
                <code>
                  {publicKey}
                </code>
              </div>
            )}
          </div>

          {/* Stats Section */}
          <div className="profileStatsSection">
            <h2 className="profileStatsTitle">
              Activity Stats
            </h2>
            <div className="profileStatsGrid">
              <div className="profileStatCard">
                <div className="profileStatValue">
                  0
                </div>
                <div className="profileStatLabel">
                  Paynotes Sent
                </div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  0
                </div>
                <div className="profileStatLabel">
                  Paynotes Received
                </div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  0
                </div>
                <div className="profileStatLabel">
                  Total Transactions
                </div>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="profileSettingsSection">
            <h2 className="profileSettingsTitle">
              Account Settings
            </h2>
            <div className="profileSettingsCard">
              <div className="profileFormField">
                <label>
                  Display Name
                </label>
                <input
                  type="text"
                  defaultValue={displayName || ''}
                  className="profileFormInput"
                  placeholder="Enter your display name"
                />
              </div>
              <div className="profileFormField">
                <label>
                  Bio
                </label>
                <textarea
                  className="profileFormTextarea"
                  placeholder="Tell us about yourself..."
                />
              </div>
              <button className="profileSaveButton">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="profileNotLoggedIn">
          <h2 className="profileNotLoggedInTitle">
            Not Logged In
          </h2>
          <p className="profileNotLoggedInText">
            Please log in to view your profile and manage your account settings.
          </p>
          <div className="profileButtonGroup">
            <button className="profileLoginButton" onClick={openLogin}>
              Log In
            </button>
            <button className="profileRegisterButton" onClick={onNavigateToRegister}>
              Register
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
