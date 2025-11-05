import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  useUIStore,
  getQueryClient,
  BlossomService
} from '@pubpay/shared-services';
import { nip19, finalizeEvent, getEventHash, verifyEvent } from 'nostr-tools';

const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { authState, nostrClient, loadUserProfile } = useOutletContext<{
    authState: any;
    nostrClient: any;
    loadUserProfile: (pubkey: string) => Promise<void>;
  }>();
  const isLoggedIn = authState?.isLoggedIn;
  const userProfile = authState?.userProfile;
  const openLogin = useUIStore(s => s.openLogin);
  const updateToast = useUIStore(s => s.updateToast);
  const closeToast = useUIStore(s => s.closeToast);

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
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<'picture' | 'banner' | null>(null);

  // Load current profile data
  useEffect(() => {
    if (userProfile?.content) {
      try {
        const content =
          typeof userProfile.content === 'string'
            ? JSON.parse(userProfile.content)
            : userProfile.content;

        setProfileData({
          displayName:
            content.display_name || content.displayName || content.name || '',
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

  // Listen for Blossom upload completion (for external signer)
  useEffect(() => {
    const handleUploadComplete = (event: CustomEvent) => {
      const { imageUrl } = event.detail;
      const uploadType = sessionStorage.getItem('BlossomUploadType');
      sessionStorage.removeItem('BlossomUploadType');

      if (uploadType === 'picture') {
        setProfileData(prev => ({ ...prev, picture: imageUrl }));
        setUploadingPicture(false);
        updateToast('Picture uploaded successfully!', 'success', false);
        setTimeout(() => closeToast(), 2000);
        if (pictureInputRef.current) {
          pictureInputRef.current.value = '';
        }
      } else if (uploadType === 'banner') {
        setProfileData(prev => ({ ...prev, banner: imageUrl }));
        setUploadingBanner(false);
        updateToast('Banner uploaded successfully!', 'success', false);
        setTimeout(() => closeToast(), 2000);
        if (bannerInputRef.current) {
          bannerInputRef.current.value = '';
        }
      }
      uploadTypeRef.current = null;
    };

    const handleUploadError = (event: CustomEvent) => {
      const { error } = event.detail;
      const uploadType = sessionStorage.getItem('BlossomUploadType');
      sessionStorage.removeItem('BlossomUploadType');

      if (uploadType === 'picture') {
        setUploadingPicture(false);
      } else if (uploadType === 'banner') {
        setUploadingBanner(false);
      }
      uploadTypeRef.current = null;
      updateToast(`Upload failed: ${error}`, 'error', true);
    };

    window.addEventListener(
      'blossomUploadComplete',
      handleUploadComplete as EventListener
    );
    window.addEventListener(
      'blossomUploadError',
      handleUploadError as EventListener
    );

    return () => {
      window.removeEventListener(
        'blossomUploadComplete',
        handleUploadComplete as EventListener
      );
      window.removeEventListener(
        'blossomUploadError',
        handleUploadError as EventListener
      );
    };
  }, [updateToast, closeToast]);

  // Handle form input changes
  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  // Handle profile picture upload
  const handlePictureUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      updateToast('Please upload an image file', 'error', true);
      return;
    }

    setUploadingPicture(true);
    uploadTypeRef.current = 'picture';
    // Store upload type for external signer return
    if (authState?.signInMethod === 'externalSigner') {
      sessionStorage.setItem('BlossomUploadType', 'picture');
    }
    updateToast('Uploading picture...', 'loading', false);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFile(file);
      // Extract extension from filename or MIME type
      const extension = file.name
        ? file.name.split('.').pop()?.toLowerCase()
        : file.type === 'image/jpeg'
          ? 'jpg'
          : file.type === 'image/png'
            ? 'png'
            : file.type === 'image/gif'
              ? 'gif'
              : file.type === 'image/webp'
                ? 'webp'
                : null;
      const imageUrl = blossomService.getFileUrl(hash, extension || undefined);
      setProfileData(prev => ({ ...prev, picture: imageUrl }));
      updateToast('Picture uploaded successfully!', 'success', false);
      setTimeout(() => closeToast(), 2000);
      uploadTypeRef.current = null;
    } catch (error) {
      console.error('Failed to upload picture:', error);
      // Don't show error if it's external signer redirect (will be handled on return)
      if (!(error instanceof Error && error.message.includes('redirect'))) {
        updateToast(
          `Failed to upload picture: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          true
        );
      }
      // If external signer, keep uploading state true - will be cleared on return
      if (authState?.signInMethod !== 'externalSigner') {
        setUploadingPicture(false);
        uploadTypeRef.current = null;
      }
    } finally {
      if (authState?.signInMethod !== 'externalSigner') {
        if (pictureInputRef.current) {
          pictureInputRef.current.value = '';
        }
      }
    }
  };

  // Handle banner upload
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      updateToast('Please upload an image file', 'error', true);
      return;
    }

    setUploadingBanner(true);
    uploadTypeRef.current = 'banner';
    // Store upload type for external signer return
    if (authState?.signInMethod === 'externalSigner') {
      sessionStorage.setItem('BlossomUploadType', 'banner');
    }
    updateToast('Uploading banner...', 'loading', false);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFile(file);
      // Extract extension from filename or MIME type
      const extension = file.name
        ? file.name.split('.').pop()?.toLowerCase()
        : file.type === 'image/jpeg'
          ? 'jpg'
          : file.type === 'image/png'
            ? 'png'
            : file.type === 'image/gif'
              ? 'gif'
              : file.type === 'image/webp'
                ? 'webp'
                : null;
      const imageUrl = blossomService.getFileUrl(hash, extension || undefined);
      setProfileData(prev => ({ ...prev, banner: imageUrl }));
      updateToast('Banner uploaded successfully!', 'success', false);
      setTimeout(() => closeToast(), 2000);
      uploadTypeRef.current = null;
    } catch (error) {
      console.error('Failed to upload banner:', error);
      // Don't show error if it's external signer redirect (will be handled on return)
      if (!(error instanceof Error && error.message.includes('redirect'))) {
        updateToast(
          `Failed to upload banner: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          true
        );
      }
      // If external signer, keep uploading state true - will be cleared on return
      if (authState?.signInMethod !== 'externalSigner') {
        setUploadingBanner(false);
        uploadTypeRef.current = null;
      }
    } finally {
      if (authState?.signInMethod !== 'externalSigner') {
        if (bannerInputRef.current) {
          bannerInputRef.current.value = '';
        }
      }
    }
  };

  // Handle form submission
  const handleSaveProfile = async () => {
    if (!isLoggedIn || !authState?.publicKey || !nostrClient) {
      openLogin();
      return;
    }

    setIsSaving(true);
    updateToast('Saving profile...', 'loading', false);

    try {
      // Load existing profile content to preserve fields we're not editing
      let existingProfile: Record<string, any> = {};
      if (userProfile?.content) {
        try {
          const content =
            typeof userProfile.content === 'string'
              ? JSON.parse(userProfile.content)
              : userProfile.content;
          existingProfile = content || {};
        } catch (e) {
          console.warn('Failed to parse existing profile, starting fresh:', e);
        }
      }

      // Merge: start with existing profile, then update only the fields we're editing
      const profileDataForNostr: Record<string, any> = {
        ...existingProfile, // Preserve all existing fields
        ...(profileData.displayName
          ? {
              name: profileData.displayName,
              display_name: profileData.displayName
            }
          : {}),
        ...(profileData.bio !== undefined ? { about: profileData.bio } : {}),
        ...(profileData.picture !== undefined
          ? { picture: profileData.picture }
          : {}),
        ...(profileData.banner !== undefined
          ? { banner: profileData.banner }
          : {}),
        ...(profileData.website !== undefined
          ? { website: profileData.website }
          : {}),
        ...(profileData.lightningAddress !== undefined
          ? { lud16: profileData.lightningAddress }
          : {}),
        ...(profileData.nip05 !== undefined ? { nip05: profileData.nip05 } : {})
      };

      // Remove empty strings to keep JSON clean (but preserve other falsy values like false, 0, etc.)
      Object.keys(profileDataForNostr).forEach(key => {
        if (
          profileDataForNostr[key] === '' ||
          profileDataForNostr[key] === null
        ) {
          delete profileDataForNostr[key];
        }
      });

      // Create event template
      const eventTemplate: any = {
        kind: 0,
        pubkey: authState.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profileDataForNostr)
      };

      // Sign the event based on sign-in method
      let signedEvent;
      if (authState.signInMethod === 'extension') {
        if (!(window as any).nostr) {
          throw new Error('Nostr extension not available');
        }
        signedEvent = await (window as any).nostr.signEvent(eventTemplate);
      } else if (authState.signInMethod === 'nsec') {
        if (!authState.privateKey) {
          throw new Error('Private key not available');
        }
        const decoded = nip19.decode(authState.privateKey);
        signedEvent = finalizeEvent(
          eventTemplate,
          decoded.data as unknown as Uint8Array
        );
      } else if (authState.signInMethod === 'externalSigner') {
        // For external signer, compute event ID first, then store event and redirect
        eventTemplate.id = getEventHash(eventTemplate);
        const eventString = JSON.stringify(eventTemplate);
        sessionStorage.setItem('SignProfileUpdate', eventString);
        window.location.href = `nostrsigner:${eventString}?compressionType=none&returnType=signature&type=sign_event`;
        updateToast(
          'Please sign the profile update in your external signer app',
          'info',
          false
        );
        setIsSaving(false);
        return;
      } else {
        throw new Error('No valid signing method available');
      }

      // Verify the event
      if (!verifyEvent(signedEvent)) {
        throw new Error('Failed to create valid signed event');
      }

      // Publish the event
      await nostrClient.publishEvent(signedEvent);

      // Remove cached profile and invalidate queries to force fresh fetch
      if (authState.publicKey) {
        const queryClient = getQueryClient();
        // Remove the cached value entirely
        queryClient.removeQueries({
          queryKey: ['profile', authState.publicKey]
        });
        // Also invalidate for good measure
        queryClient.invalidateQueries({
          queryKey: ['profile', authState.publicKey]
        });
      }

      updateToast('Profile updated successfully!', 'success', false);

      // Reload profile to reflect changes before navigating
      if (authState.publicKey && loadUserProfile) {
        // Wait for event to propagate to relays, then reload profile
        await new Promise(resolve => setTimeout(resolve, 2000));
        await loadUserProfile(authState.publicKey);
        // Auto-close toast after a short delay
        setTimeout(() => {
          closeToast();
        }, 2000);
        // Navigate with state to indicate profile was just updated
        navigate('/profile', { state: { profileUpdated: true } });
      } else {
        setTimeout(() => {
          closeToast();
        }, 2000);
        navigate('/profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to save profile. Please try again.';
      updateToast(errorMessage, 'error', true);
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
          <h2 className="profileNotLoggedInTitle">Not Logged In</h2>
          <p className="profileNotLoggedInText">
            Please log in to edit your profile.
          </p>
          <div className="profileButtonGroup">
            <button className="profileLoginButton" onClick={openLogin}>
              Log In
            </button>
            <button
              className="profileRegisterButton"
              onClick={() => navigate('/register')}
            >
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '30px'
          }}
        >
          <button
            className="profileCopyButton"
            onClick={() => navigate('/profile')}
            style={{ marginRight: '15px' }}
          >
            ← Back
          </button>
          <h1 className="profilePageTitle">Edit Profile</h1>
        </div>

        {/* Preview Section */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '20px' }}>Preview</h3>
          <div className="profileSettingsCard">
            <div
              style={{
                display: 'flex',
                marginBottom: '15px',
                alignItems: 'flex-start'
              }}
            >
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
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: '#ddd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '15px',
                    fontSize: '24px'
                  }}
                >
                  {profileData.displayName
                    ? profileData.displayName.charAt(0).toUpperCase()
                    : 'U'}
                </div>
              )}
              <div>
                <h4 style={{ margin: '0 0 5px 0' }}>
                  {profileData.displayName || 'Anonymous User'}
                </h4>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                  {profileData.bio || 'No bio provided'}
                </p>
                {profileData.website && (
                  <p style={{ margin: '5px 0', fontSize: '14px' }}>
                    <a
                      href={profileData.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#4a75ff' }}
                    >
                      {profileData.website}
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <div className="profileSettingsCard">
          <div className="profileFormField">
            <label htmlFor="editDisplayName">Display Name *</label>
            <input
              type="text"
              id="editDisplayName"
              value={profileData.displayName}
              onChange={e => handleInputChange('displayName', e.target.value)}
              className="profileFormInput"
              placeholder="Enter your display name"
              required
            />
          </div>

          <div className="profileFormField">
            <label htmlFor="editBio">Bio</label>
            <textarea
              id="editBio"
              value={profileData.bio}
              onChange={e => handleInputChange('bio', e.target.value)}
              className="profileFormTextarea"
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>

          <div className="profileFormField">
            <label htmlFor="editWebsite">Website</label>
            <input
              type="url"
              id="editWebsite"
              value={profileData.website}
              onChange={e => handleInputChange('website', e.target.value)}
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
                    objectFit: 'cover'
                  }}
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const errorDiv = document.createElement('div');
                      errorDiv.textContent = 'Failed to load image';
                      errorDiv.style.cssText =
                        'color: #dc3545; font-size: 12px; margin-top: 5px;';
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              </div>
            )}
            <label htmlFor="editPicture">Profile Picture</label>
            <div style={{ position: 'relative' }}>
              <input
                type="url"
                id="editPicture"
                value={profileData.picture}
                onChange={e => handleInputChange('picture', e.target.value)}
                className="profileFormInput"
                placeholder="https://example.com/profile.jpg or upload"
              />
              <input
                type="file"
                ref={pictureInputRef}
                accept="image/*"
                onChange={handlePictureUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => pictureInputRef.current?.click()}
                disabled={uploadingPicture}
                className="profileUploadButton"
              >
                {uploadingPicture ? 'Uploading...' : 'Upload'}
              </button>
            </div>
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
                    objectFit: 'cover'
                  }}
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const errorDiv = document.createElement('div');
                      errorDiv.textContent = 'Failed to load image';
                      errorDiv.style.cssText =
                        'color: #dc3545; font-size: 12px; margin-top: 5px;';
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              </div>
            )}
            <label htmlFor="editBanner">Banner Image</label>
            <div style={{ position: 'relative' }}>
              <input
                type="url"
                id="editBanner"
                value={profileData.banner}
                onChange={e => handleInputChange('banner', e.target.value)}
                className="profileFormInput"
                placeholder="https://example.com/banner.jpg or upload"
              />
              <input
                type="file"
                ref={bannerInputRef}
                accept="image/*"
                onChange={handleBannerUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className="profileUploadButton"
              >
                {uploadingBanner ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>

          <div className="profileFormField">
            <label htmlFor="editLightningAddress">Lightning Address</label>
            <input
              type="text"
              id="editLightningAddress"
              value={profileData.lightningAddress}
              onChange={e =>
                handleInputChange('lightningAddress', e.target.value)
              }
              className="profileFormInput"
              placeholder="yourname@domain.com"
            />
          </div>

          <div className="profileFormField">
            <label htmlFor="editNip05">Identifier (nip-05)</label>
            <input
              type="text"
              id="editNip05"
              value={profileData.nip05}
              onChange={e => handleInputChange('nip05', e.target.value)}
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
            <button className="profileCopyButton" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfilePage;
