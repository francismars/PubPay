import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useUIStore, ensureProfiles, getQueryClient } from '@pubpay/shared-services';
import * as NostrTools from 'nostr-tools';

// Validation function for pubkeys and npubs/nprofiles
const isValidPublicKey = (pubkey: string): boolean => {
  // Check for hex pubkey format (64 characters)
  if (/^[0-9a-f]{64}$/i.test(pubkey)) {
    return true;
  }
  
  // Check for npub format
  if (pubkey.startsWith('npub1')) {
    try {
      const decoded = NostrTools.nip19.decode(pubkey);
      return decoded.type === 'npub';
    } catch {
      return false;
    }
  }
  
  // Check for nprofile format
  if (pubkey.startsWith('nprofile1')) {
    try {
      const decoded = NostrTools.nip19.decode(pubkey);
      return decoded.type === 'nprofile';
    } catch {
      return false;
    }
  }
  
  return false;
};

interface ProfilePageProps {
  authState?: any;
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { pubkey } = useParams<{ pubkey?: string }>();
  const { authState, nostrClient } = useOutletContext<{ authState: any; nostrClient: any }>();
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const displayName = authState?.displayName;
  const publicKey = authState?.publicKey;
  const openLogin = useUIStore(s => s.openLogin);

  // Determine if we're viewing own profile or another user's profile
  const isOwnProfile = !pubkey || pubkey === publicKey;
  
  // Extract hex pubkey from npub/nprofile for profile loading
  const getHexPubkey = (pubkeyOrNpub: string): string => {
    if (!pubkeyOrNpub) return '';
    
    // If it's already a hex pubkey, return it
    if (/^[0-9a-f]{64}$/i.test(pubkeyOrNpub)) {
      return pubkeyOrNpub;
    }
    
    // If it's an npub or nprofile, decode it
    if (pubkeyOrNpub.startsWith('npub1') || pubkeyOrNpub.startsWith('nprofile1')) {
      try {
        const decoded = NostrTools.nip19.decode(pubkeyOrNpub);
        if (decoded.type === 'npub') {
          return decoded.data;
        } else if (decoded.type === 'nprofile') {
          return decoded.data.pubkey;
        }
      } catch (error) {
        console.error('Failed to decode npub/nprofile:', error);
      }
    }
    
    return pubkeyOrNpub;
  };
  
  const targetPubkey = getHexPubkey(pubkey || publicKey);

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

  // Loading state for external profiles
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Load profile data - either from own profile or fetch external profile
  useEffect(() => {
    const loadProfileData = async () => {
      setIsLoadingProfile(false);
      setProfileError(null);
      
      if (isOwnProfile) {
        // Load own profile from userProfile
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
      } else if (targetPubkey && nostrClient) {
        // Validate pubkey format (use original pubkey parameter for validation)
        if (!isValidPublicKey(pubkey || publicKey)) {
          setProfileError('Invalid public key format');
          return;
        }
        
        // Load external profile using ensureProfiles
        setIsLoadingProfile(true);
        try {
          console.log('Loading profile for pubkey:', targetPubkey);
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [targetPubkey]
          );
          const profileEvent = profileMap.get(targetPubkey);
          console.log('Profile event received:', profileEvent);
          
          if (profileEvent?.content) {
            const content = typeof profileEvent.content === 'string' 
              ? JSON.parse(profileEvent.content) 
              : profileEvent.content;
            
            setProfileData({
              displayName: content.display_name || content.displayName || content.name || '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
          } else {
            // Profile not found, show minimal profile
            setProfileData({
              displayName: '',
              bio: '',
              website: '',
              banner: '',
              picture: '',
              lightningAddress: '',
              nip05: ''
            });
          }
        } catch (error) {
          console.error('Failed to load external profile:', error);
          setProfileError('Failed to load profile');
        } finally {
          setIsLoadingProfile(false);
        }
      }
    };

    loadProfileData();
  }, [isOwnProfile, targetPubkey, userProfile, nostrClient]);

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
  const getNpubFromPublicKey = (pubkey?: string): string => {
    const keyToConvert = pubkey || publicKey;
    if (!keyToConvert) return '';
    
    try {
      // If it's already an npub, return it
      if (keyToConvert.startsWith('npub1')) {
        return keyToConvert;
      }
      
      // If it's an nprofile, extract the pubkey and convert to npub
      if (keyToConvert.startsWith('nprofile1')) {
        const decoded = NostrTools.nip19.decode(keyToConvert);
        if ((decoded as any).type === 'nprofile') {
          return NostrTools.nip19.npubEncode((decoded.data as any).pubkey);
        }
      }
      
      // If it's a hex string, convert to npub
      if (keyToConvert.length === 64 && /^[0-9a-fA-F]+$/.test(keyToConvert)) {
        return NostrTools.nip19.npubEncode(keyToConvert);
      }
      
      // If it's already a string, try to encode it directly
      return NostrTools.nip19.npubEncode(keyToConvert);
    } catch (error) {
      console.error('Failed to convert public key to npub:', error);
      return keyToConvert; // Return original if conversion fails
    }
  };

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        {isOwnProfile ? 'Profile' : 'User Profile'}
      </h1>

      {isLoadingProfile ? (
        <div className="profileLoading">
          <p>Loading profile...</p>
        </div>
      ) : profileError ? (
        <div className="profileError">
          <h2>Error</h2>
          <p>{profileError}</p>
        </div>
      ) : isOwnProfile && !isLoggedIn ? (
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
            <button className="profileRegisterButton" onClick={() => navigate('/register')}>
              Register
            </button>
          </div>
        </div>
      ) : (
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
                {(isOwnProfile || profileData.lightningAddress) && (
                  <div className="profileDetailItem">
                    <label>Lightning Address</label>
                    <div className="profileDetailValue">
                      {profileData.lightningAddress ? (
                        <a href={`lightning:${profileData.lightningAddress}`} className="profileLightningLink">
                          {profileData.lightningAddress}
                        </a>
                      ) : (
                        <span className="profileEmptyField">Not set</span>
                      )}
                    </div>
                  </div>
                )}
              
              {(isOwnProfile || profileData.nip05) && (
                <div className="profileDetailItem">
                  <label>NIP-05 Identifier</label>
                  <div className="profileDetailValue">
                    {profileData.nip05 ? (
                      <>
                        <code className="profileNip05">{profileData.nip05}</code>
                        <button 
                          className="profileCopyButton"
                          onClick={() => handleCopyToClipboard(profileData.nip05, 'NIP-05 Identifier')}
                        >
                          Copy
                        </button>
                      </>
                    ) : (
                      <span className="profileEmptyField">Not set</span>
                    )}
                  </div>
                </div>
              )}

              {targetPubkey && (
                <div className="profileDetailItem">
                  <label>User ID (npub)</label>
                  <div className="profileDetailValue">
                    <code className="profilePublicKey">{getNpubFromPublicKey(pubkey)}</code>
                    <button 
                      className="profileCopyButton"
                      onClick={() => handleCopyToClipboard(getNpubFromPublicKey(pubkey), 'Public Key')}
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

          {/* Settings Section - Only show for own profile */}
          {isOwnProfile && (
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
          )}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
