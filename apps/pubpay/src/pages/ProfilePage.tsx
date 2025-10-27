import React from 'react';

interface ProfilePageProps {
  authState?: any;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ authState }) => {
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const displayName = authState?.displayName;
  const publicKey = authState?.publicKey;

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
          <button className="profileLoginButton">
            Log In
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
