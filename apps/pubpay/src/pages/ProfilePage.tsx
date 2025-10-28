import React, { useState, useEffect } from 'react';
import { useUIStore } from '@pubpay/shared-services';
import * as NostrTools from 'nostr-tools';

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

  // Profile data state
  const [profileData, setProfileData] = useState({
    displayName: '',
    bio: '',
    website: '',
    banner: '',
    picture: '',
    lightningAddress: '',
    nip05: ''
  });

  // Load profile data from userProfile
  useEffect(() => {
    if (userProfile?.content) {
      try {
        const content = typeof userProfile.content === 'string' 
          ? JSON.parse(userProfile.content) 
          : userProfile.content;
        
        setProfileData({
          displayName: content.display_name || content.displayName || content.name || '',
          bio: content.about || '',
          website: content.website || '',
          banner: content.banner || '',
          picture: content.picture || '',
          lightningAddress: content.lud16 || '',
          nip05: content.nip05 || ''
        });
      } catch (error) {
        console.error('Failed to parse profile content:', error);
      }
    }
  }, [userProfile]);

  // Copy to clipboard function
  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} copied to clipboard!`);
    }).catch(() => {
      alert(`Failed to copy ${label}`);
    });
  };

  // Save profile changes (placeholder - would need to implement Nostr profile update)
  const handleSaveProfile = () => {
    // TODO: Implement profile update to Nostr relays
    alert('Profile update functionality will be implemented soon!');
  };

  // Convert public key to npub format
  const getNpubFromPublicKey = (pubkey: string): string => {
    try {
      // If it's already an npub, return it
      if (pubkey.startsWith('npub1')) {
        return pubkey;
      }
      
      // If it's a hex string, convert to npub
      if (pubkey.length === 64 && /^[0-9a-fA-F]+$/.test(pubkey)) {
        return NostrTools.nip19.npubEncode(pubkey);
      }
      
      // If it's already a string, try to encode it directly
      return NostrTools.nip19.npubEncode(pubkey);
    } catch (error) {
      console.error('Failed to convert public key to npub:', error);
      return pubkey; // Return original if conversion fails
    }
  };

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        Profile
      </h1>

      {isLoggedIn ? (
        <div>
          {/* User Profile Section */}
          <div className="profileSection" id="profilePreview">
            {/* Banner Image */}
            {profileData.banner && (
              <div className="profileBanner">
                <img 
                  src={profileData.banner} 
                  alt="Profile banner" 
                  className="profileBannerImage"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            
            <div className="profileUserInfo">
              <div className="profileAvatar">
                {profileData.picture ? (
                  <img 
                    src={profileData.picture} 
                    alt="Profile" 
                    className="profileAvatarImage"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className="profileAvatarFallback" style={{ display: profileData.picture ? 'none' : 'flex' }}>
                  {profileData.displayName ? profileData.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              </div>
              <div className="profileUserDetails">
                <h2>
                  {profileData.displayName || displayName || 'Anonymous User'}
                </h2>
                <p>
                  {profileData.bio || 'PubPay User'}
                </p>
                {profileData.website && (
                  <a href={profileData.website} target="_blank" rel="noopener noreferrer" className="profileWebsite">
                    {profileData.website}
                  </a>
                )}

                {/* Profile Details */}
            <div className="profileDetails">
              {profileData.lightningAddress && (
                <div className="profileDetailItem">
                  <label>Lightning Address</label>
                  <div className="profileDetailValue">
                    <a href={`lightning:${profileData.lightningAddress}`} className="profileLightningLink">
                      {profileData.lightningAddress}
                    </a>
                  </div>
                </div>
              )}
              
              {profileData.nip05 && (
                <div className="profileDetailItem">
                  <label>NIP-05 Identifier</label>
                  <div className="profileDetailValue">
                    <code className="profileNip05">{profileData.nip05}</code>
                    <button 
                      className="profileCopyButton"
                      onClick={() => handleCopyToClipboard(profileData.nip05, 'NIP-05 Identifier')}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {publicKey && (
                <div className="profileDetailItem">
                  <label>Public Key (npub)</label>
                  <div className="profileDetailValue">
                    <code className="profilePublicKey">{getNpubFromPublicKey(publicKey)}</code>
                    <button 
                      className="profileCopyButton"
                      onClick={() => handleCopyToClipboard(getNpubFromPublicKey(publicKey), 'Public Key')}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              
              </div>
            </div>

            
            </div>
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
              Edit Profile
            </h2>
            <div className="profileSettingsCard">
              <div className="profileFormField">
                <label htmlFor="editDisplayName">
                  Display Name
                </label>
                <input
                  type="text"
                  id="editDisplayName"
                  value={profileData.displayName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                  className="profileFormInput"
                  placeholder="Enter your display name"
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editWebsite">
                  Website
                </label>
                <input
                  type="url"
                  id="editWebsite"
                  value={profileData.website}
                  onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                  className="profileFormInput"
                  placeholder="https://your-website.com (optional)"
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editPicture">
                  Profile Picture URL
                </label>
                <input
                  type="url"
                  id="editPicture"
                  value={profileData.picture}
                  onChange={(e) => setProfileData(prev => ({ ...prev, picture: e.target.value }))}
                  className="profileFormInput"
                  placeholder="https://example.com/profile.jpg (optional)"
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editBio">
                  Bio
                </label>
                <textarea
                  id="editBio"
                  value={profileData.bio}
                  onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                  className="profileFormTextarea"
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editBanner">
                  Banner Image URL
                </label>
                <input
                  type="url"
                  id="editBanner"
                  value={profileData.banner}
                  onChange={(e) => setProfileData(prev => ({ ...prev, banner: e.target.value }))}
                  className="profileFormInput"
                  placeholder="https://example.com/banner.jpg (optional)"
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editLightningAddress">
                  Lightning Address
                </label>
                <input
                  type="text"
                  id="editLightningAddress"
                  value={profileData.lightningAddress}
                  onChange={(e) => setProfileData(prev => ({ ...prev, lightningAddress: e.target.value }))}
                  className="profileFormInput"
                  placeholder="yourname@domain.com (optional)"
                />
              </div>
              
              <div className="profileFormField">
                <label htmlFor="editNip05">
                  NIP-05 Identifier
                </label>
                <input
                  type="text"
                  id="editNip05"
                  value={profileData.nip05}
                  onChange={(e) => setProfileData(prev => ({ ...prev, nip05: e.target.value }))}
                  className="profileFormInput"
                  placeholder="yourname@domain.com (optional)"
                />
              </div>
              
              <button className="profileSaveButton" onClick={handleSaveProfile}>
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
