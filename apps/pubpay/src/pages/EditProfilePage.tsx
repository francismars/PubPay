import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useUIStore } from '@pubpay/shared-services';

interface EditProfilePageProps {
  authState?: any;
}

const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { authState } = useOutletContext<{ authState: any }>();
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const openLogin = useUIStore(s => s.openLogin);

  // Profile form state
  const [profileData, setProfileData] = useState({
    displayName: '',
    bio: '',
    website: '',
    banner: '',
    picture: '',
    lightningAddress: '',
    nip05: ''
  });

  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load current profile data
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

  // Handle form input changes
  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
    // Clear save message when user starts typing
    if (saveMessage) {
      setSaveMessage(null);
    }
  };

  // Handle form submission
  const handleSaveProfile = async () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // TODO: Implement actual profile update to Nostr relays
      // For now, just simulate a save
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaveMessage({
        type: 'success',
        text: 'Profile updated successfully! (Note: This is a placeholder - actual Nostr profile update will be implemented)'
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage({
        type: 'error',
        text: 'Failed to save profile. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/profile');
  };

  if (!isLoggedIn) {
    return (
      <div className="profilePage">
        <div className="profileNotLoggedIn">
          <h2 className="profileNotLoggedInTitle">
            Not Logged In
          </h2>
          <p className="profileNotLoggedInText">
            Please log in to edit your profile.
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
      </div>
    );
  }

  return (
    <div className="profilePage">
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
          <button 
            className="profileCopyButton"
            onClick={() => navigate('/profile')}
            style={{ marginRight: '15px'}}
          >
            ← Back
          </button>
          <h1 className="profilePageTitle">
            Edit Profile
          </h1>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div 
            className="profileSaveMessage"
            style={{
              padding: '12px 16px',
              borderRadius: '6px',
              marginBottom: '20px',
              backgroundColor: saveMessage.type === 'success' ? '#d4edda' : '#f8d7da',
              color: saveMessage.type === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${saveMessage.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
            }}
          >
            {saveMessage.text}
          </div>
        )}

        {/* Preview Section */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '20px', color: '#333' }}>Preview</h3>
          <div className="profileSettingsCard" style={{ backgroundColor: '#f8f9fa' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
              {profileData.picture ? (
                <img 
                  src={profileData.picture} 
                  alt="Profile" 
                  style={{ 
                    width: '60px', 
                    height: '60px', 
                    borderRadius: '50%', 
                    marginRight: '15px',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div style={{ 
                  width: '60px', 
                  height: '60px', 
                  borderRadius: '50%', 
                  backgroundColor: '#ddd',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '15px',
                  fontSize: '24px',
                  color: '#666'
                }}>
                  {profileData.displayName ? profileData.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div>
                <h4 style={{ margin: '0 0 5px 0', color: '#333' }}>
                  {profileData.displayName || 'Anonymous User'}
                </h4>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                  {profileData.bio || 'No bio provided'}
                </p>
              </div>
            </div>
            {profileData.website && (
              <p style={{ margin: '5px 0', fontSize: '14px' }}>
                <a href={profileData.website} target="_blank" rel="noopener noreferrer" style={{ color: '#4a75ff' }}>
                  {profileData.website}
                </a>
              </p>
            )}
          </div>
        </div>

        {/* Profile Form */}
        <div className="profileSettingsCard">
          <div className="profileFormField">
            <label htmlFor="editDisplayName">
              Display Name *
            </label>
            <input
              type="text"
              id="editDisplayName"
              value={profileData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              className="profileFormInput"
              placeholder="Enter your display name"
              required
            />
          </div>
          
          <div className="profileFormField">
            <label htmlFor="editBio">
              Bio
            </label>
            <textarea
              id="editBio"
              value={profileData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              className="profileFormTextarea"
              placeholder="Tell us about yourself..."
              rows={4}
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
              onChange={(e) => handleInputChange('website', e.target.value)}
              className="profileFormInput"
              placeholder="https://your-website.com"
            />
          </div>
          
          <div className="profileFormField">
            {profileData.picture && (
              <div style={{ marginBottom: '10px' }}>
                <img 
                  src={profileData.picture} 
                  alt="Profile preview" 
                  style={{ 
                    width: '80px', 
                    height: '80px', 
                    borderRadius: '50%', 
                    objectFit: 'cover',
                    border: '2px solid #ddd'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const errorDiv = document.createElement('div');
                      errorDiv.textContent = 'Failed to load image';
                      errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              </div>
            )}
            <label htmlFor="editPicture">
              Profile Picture URL
            </label>
            <input
              type="url"
              id="editPicture"
              value={profileData.picture}
              onChange={(e) => handleInputChange('picture', e.target.value)}
              className="profileFormInput"
              placeholder="https://example.com/profile.jpg"
            />
          </div>
          
          <div className="profileFormField">
            {profileData.banner && (
              <div style={{ marginBottom: '10px' }}>
                <img 
                  src={profileData.banner} 
                  alt="Banner preview" 
                  style={{ 
                    width: '200px', 
                    height: '80px', 
                    borderRadius: '4px', 
                    objectFit: 'cover',
                    border: '2px solid #ddd'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const errorDiv = document.createElement('div');
                      errorDiv.textContent = 'Failed to load image';
                      errorDiv.style.cssText = 'color: #dc3545; font-size: 12px; margin-top: 5px;';
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              </div>
            )}
            <label htmlFor="editBanner">
              Banner Image URL
            </label>
            <input
              type="url"
              id="editBanner"
              value={profileData.banner}
              onChange={(e) => handleInputChange('banner', e.target.value)}
              className="profileFormInput"
              placeholder="https://example.com/banner.jpg"
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
              onChange={(e) => handleInputChange('lightningAddress', e.target.value)}
              className="profileFormInput"
              placeholder="yourname@domain.com"
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
              onChange={(e) => handleInputChange('nip05', e.target.value)}
              className="profileFormInput"
              placeholder="yourname@domain.com"
            />
          </div>
          
          <div className="profileButtonGroup" style={{ marginTop: '30px' }}>
            <button 
              className="profileEditButton" 
              onClick={handleSaveProfile}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button 
              className="profileCopyButton"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EditProfilePage;
