import React, { useState, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  useUIStore,
  useAuthStore,
  NostrRegistrationService,
  NostrKeyPair,
  ProfileData,
  BlossomService,
  AuthService
} from '@pubpay/shared-services';
import { GenericQR } from '@pubpay/shared-ui';
import { nip19 } from 'nostr-tools';
import { COLORS, FONT_SIZES } from '../constants';

interface RegisterPageProps {
  authState?: any;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { authState, checkAuthStatus } = useOutletContext<{ 
    authState: any; 
    checkAuthStatus?: (password?: string) => Promise<{ requiresPassword: boolean }>;
  }>();
  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    website: '',
    banner: '',
    picture: '',
    lightningAddress: '',
    nip05: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<NostrKeyPair | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [publishedEventId, setPublishedEventId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isRegistrationComplete, setIsRegistrationComplete] = useState(false);
  const [showManualPublish, setShowManualPublish] = useState(false);
  const [showNsecQRModal, setShowNsecQRModal] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [keysBackedUp, setKeysBackedUp] = useState(false);
  const [activeTab, setActiveTab] = useState<'privateKey' | 'mnemonic'>(
    'mnemonic'
  );
  const [registrationPassword, setRegistrationPassword] = useState('');
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const openLogin = useUIStore(s => s.openLogin);
  const openToast = useUIStore(s => s.openToast);
  const setAuth = useAuthStore(s => s.setAuth);

  // Handle backup acknowledgement and login
  const handleBackupAcknowledgement = async () => {
    if (!generatedKeys) return;

    try {
      // Get hex public key from raw public key
      let hexPublicKey: string;
      if (typeof generatedKeys.rawPublicKey === 'string') {
        hexPublicKey = generatedKeys.rawPublicKey;
      } else {
        hexPublicKey = Array.from(generatedKeys.rawPublicKey as Uint8Array)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      }

      // Store authentication data with encryption (device key or password)
      await AuthService.storeAuthData(
        hexPublicKey,
        generatedKeys.privateKey, // nsec format
        'nsec',
        registrationPassword.trim() || undefined // Optional password
      );

      // Update auth state via checkAuthStatus to sync with useHomeFunctionality hook
      // This ensures the hook's authState is properly updated
      if (checkAuthStatus) {
        const password = registrationPassword.trim() || undefined;
        await checkAuthStatus(password);
      } else {
        // Fallback: Update Zustand store directly if checkAuthStatus not available
      setAuth({
        isLoggedIn: true,
        publicKey: hexPublicKey,
        displayName: formData.displayName || 'Anonymous',
        signInMethod: 'nsec'
      });
      }

      openToast('Successfully logged in with your new account!', 'success');

      console.log('User logged in after backup acknowledgement');

      // Navigate without page reload to preserve in-memory cache
      setTimeout(() => {
        navigate('/profile');
      }, 1000);
    } catch (error) {
      console.error('Failed to login user:', error);
      openToast('Failed to login. Please try signing in manually.', 'error');
    }
  };

  // Generate keys on component mount so user can upload images immediately
  React.useEffect(() => {
    if (!generatedKeys) {
      const result = NostrRegistrationService.generateKeyPairWithMnemonic();
      if (result.success && result.keyPair) {
        setGeneratedKeys(result.keyPair);
      }
    }
  }, []);

  const handleGenerateKeys = async () => {
    setIsGeneratingKeys(true);
    try {
      const result = NostrRegistrationService.generateKeyPair();
      if (result.success && result.keyPair) {
        setGeneratedKeys(result.keyPair);
        setShowKeys(true);
      } else {
        alert('Failed to generate keys: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Key generation failed:', error);
      alert('Failed to generate keys. Please try again.');
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        openToast(`${label} copied to clipboard!`, 'success');
        setTimeout(() => {
          useUIStore.getState().closeToast();
        }, 2000);
      })
      .catch(() => {
        openToast(`Failed to copy ${label}`, 'error');
        setTimeout(() => {
          useUIStore.getState().closeToast();
        }, 2000);
      });
  };

  // Helper function to convert npub/nsec to hex format
  const convertToHex = (encodedKey: string): string => {
    try {
      const decoded = nip19.decode(encodedKey);
      console.log('Decoded key:', decoded); // Debug log

      if (decoded && decoded.data) {
        const hexString = Array.from(decoded.data as Uint8Array)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
        console.log('Converted to hex:', hexString); // Debug log
        return hexString;
      }
      console.warn('Failed to decode');
      return encodedKey; // Fallback if decode fails
    } catch (error) {
      console.error('Failed to convert to hex:', error);
      return encodedKey; // Fallback on error
    }
  };

  const handleManualPublish = () => {
    if (!generatedKeys) return;

    const profileData = {
      name: formData.displayName || 'Anonymous',
      display_name: formData.displayName || 'Anonymous',
      about: formData.bio || '',
      picture: formData.picture || '',
      banner: formData.banner || '',
      website: formData.website || '',
      lud16: formData.lightningAddress || '',
      nip05: formData.nip05 || ''
    };

    try {
      const event = NostrRegistrationService.createProfileEvent(
        generatedKeys.rawPrivateKey,
        profileData
      );
      const eventJson = JSON.stringify(event, null, 2);

      // Copy to clipboard
      navigator.clipboard.writeText(eventJson);
      alert(
        'Event data copied to clipboard! You can now paste this into any Nostr client to publish your profile manually.'
      );
    } catch (error) {
      console.error('Failed to create event for manual publishing:', error);
      alert('Failed to create event data. Please try again.');
    }
  };

  const handleRetryPublish = async () => {
    if (!generatedKeys) return;

    setIsPublishing(true);
    setPublishError(null);

    try {
      const profileData: ProfileData = {
        name: formData.displayName || '',
        display_name: formData.displayName || '',
        about: formData.bio || '',
        website: formData.website || '',
        banner: formData.banner || '',
        picture: formData.picture || '',
        lud16: formData.lightningAddress || '',
        nip05: formData.nip05 || ''
      };

      const result = await NostrRegistrationService.publishProfileEvent(
        generatedKeys.rawPrivateKey,
        profileData
      );

      if (result.success) {
        setPublishedEventId(result.eventId || null);
        setPublishError(null);

        // Show success toast
        openToast('Profile published successfully to Nostr relays!', 'success');
        setTimeout(() => {
          useUIStore.getState().closeToast();
        }, 3000);
      } else {
        setPublishError(result.error || 'Failed to publish');
      }
    } catch (error) {
      console.error('Retry publish failed:', error);
      setPublishError('Failed to publish profile');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle profile picture upload
  const handlePictureUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Can only upload after keys are generated
    if (
      !generatedKeys ||
      !generatedKeys.rawPrivateKey ||
      !generatedKeys.rawPublicKey
    ) {
      alert('Please wait for keys to be generated');
      return;
    }

    setUploadingPicture(true);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFileWithKey(
        file,
        generatedKeys.rawPrivateKey,
        generatedKeys.rawPublicKey
      );
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
      setFormData(prev => ({ ...prev, picture: imageUrl }));
    } catch (error) {
      console.error('Failed to upload picture:', error);
      alert(
        `Failed to upload picture: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setUploadingPicture(false);
      if (pictureInputRef.current) {
        pictureInputRef.current.value = '';
      }
    }
  };

  // Handle banner upload
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Can only upload after keys are generated
    if (
      !generatedKeys ||
      !generatedKeys.rawPrivateKey ||
      !generatedKeys.rawPublicKey
    ) {
      alert('Please wait for keys to be generated');
      return;
    }

    setUploadingBanner(true);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFileWithKey(
        file,
        generatedKeys.rawPrivateKey,
        generatedKeys.rawPublicKey
      );
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
      setFormData(prev => ({ ...prev, banner: imageUrl }));
    } catch (error) {
      console.error('Failed to upload banner:', error);
      alert(
        `Failed to upload banner: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = '';
      }
    }
  };

  // Handle paste-to-upload for picture/banner using clipboard image
  const handleClipboardImage = async (
    e: React.ClipboardEvent<HTMLInputElement>,
    target: 'picture' | 'banner'
  ) => {
    try {
      const items = e.clipboardData?.items || [];
      let imageFile: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            imageFile = new File(
              [blob],
              `pasted.${blob.type.split('/')[1] || 'png'}`,
              {
                type: blob.type
              }
            );
            break;
          }
        }
      }
      if (!imageFile) return; // no image in clipboard; allow default paste

      // Prevent pasting the image as text
      e.preventDefault();

      if (
        !generatedKeys ||
        !generatedKeys.rawPrivateKey ||
        !generatedKeys.rawPublicKey
      ) {
        alert('Please wait for keys to be generated');
        return;
      }

      if (target === 'picture') setUploadingPicture(true);
      if (target === 'banner') setUploadingBanner(true);

      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFileWithKey(
        imageFile,
        generatedKeys.rawPrivateKey,
        generatedKeys.rawPublicKey
      );

      const extFromType =
        imageFile.type === 'image/jpeg'
          ? 'jpg'
          : imageFile.type === 'image/png'
            ? 'png'
            : imageFile.type === 'image/gif'
              ? 'gif'
              : imageFile.type === 'image/webp'
                ? 'webp'
                : undefined;
      const imageUrl = blossomService.getFileUrl(hash, extFromType);

      setFormData(prev => ({ ...prev, [target]: imageUrl }));
    } catch (error) {
      console.error('Failed to upload pasted image:', error);
      alert(
        `Failed to upload pasted image: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      if (target === 'picture') setUploadingPicture(false);
      if (target === 'banner') setUploadingBanner(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure keys are generated
    if (!generatedKeys || !generatedKeys.rawPrivateKey) {
      alert('Please wait for keys to be generated');
      return;
    }

    setIsSubmitting(true);
    setIsPublishing(true);

    try {
      // Prepare profile data for NIP-01 compliant profile event
      const profileData: ProfileData = {
        name: formData.displayName || '',
        display_name: formData.displayName || '',
        about: formData.bio || '',
        website: formData.website || '',
        banner: formData.banner || '',
        picture: formData.picture || '',
        lud16: formData.lightningAddress || '',
        nip05: formData.nip05 || ''
      };

      // Publish profile with the already-generated keys
      const publishResult = await NostrRegistrationService.publishProfileEvent(
        generatedKeys.rawPrivateKey,
        profileData
      );

      if (publishResult.success) {
        setPublishedEventId(publishResult.eventId || null);
        setPublishError(null);
        setIsRegistrationComplete(true);
        setShowKeys(true);

        // Show success toast
        openToast('Profile published successfully to Nostr relays!', 'success');
        setTimeout(() => {
          useUIStore.getState().closeToast();
        }, 3000);
      } else {
        setPublishError(publishResult.error || 'Failed to publish profile');
        setIsRegistrationComplete(true);
        setShowKeys(true);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      setPublishError('Registration failed. Please try again.');
      setIsRegistrationComplete(true);
      setShowKeys(true);
    } finally {
      setIsSubmitting(false);
      setIsPublishing(false);
    }
  };

  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">Create Account</h1>

      <div className="profileSection" id="profilePreview">
        {/* Banner Image */}
        <div className="profileBanner">
          {formData.banner ? (
            <img
              src={formData.banner}
              alt="Profile banner"
              className="profileBannerImage"
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="profileBannerPlaceholder">Banner image</div>
          )}
        </div>

        <div className="profileUserInfo">
          <div className="profileAvatar">
            {formData.picture ? (
              <img
                src={formData.picture}
                alt="Profile"
                className="profileAvatarImage"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) {
                    fallback.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div
              className="profileAvatarFallback"
              style={{ display: formData.picture ? 'none' : 'flex' }}
            >
              {formData.displayName
                ? formData.displayName.charAt(0).toUpperCase()
                : '?'}
            </div>
          </div>
          <div className="profileUserDetails">
            <h2>{formData.displayName || 'New User'}</h2>
            <p>{formData.bio || 'Join PubPay Community'}</p>
            {formData.website && (
              <a
                href={formData.website}
                target="_blank"
                rel="noopener noreferrer"
                className="profileWebsite"
              >
                {formData.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {!isRegistrationComplete && (
        <div
          className="profileSettingsSection registrationTransition"
          id="accountInformation"
        >
          <h2 className="profileSettingsTitle">Account Information</h2>
          <div className="profileSettingsCard">
            <form onSubmit={handleSubmit}>
              <div className="profileFormField">
                <label htmlFor="displayName">Display Name *</label>
                <input
                  type="text"
                  id="displayName"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  className="profileFormInput"
                  placeholder="Enter your display name"
                  required
                />
              </div>

              <div className="profileFormField">
                <label htmlFor="lightningAddress">Lightning Address</label>
                <input
                  type="text"
                  id="lightningAddress"
                  name="lightningAddress"
                  value={formData.lightningAddress}
                  onChange={handleInputChange}
                  className="profileFormInput"
                  placeholder="yourname@domain.com (optional)"
                />
              </div>

              <div className="profileFormField">
                <label htmlFor="picture">
                  Profile Picture{' '}
                  {generatedKeys ? '(Blossom upload available)' : ''}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    id="picture"
                    name="picture"
                    value={formData.picture}
                    onChange={handleInputChange}
                    onPaste={e => handleClipboardImage(e, 'picture')}
                    className="profileFormInput"
                    placeholder="https://example.com/profile.jpg or upload from Blossom"
                  />
                  <input
                    type="file"
                    ref={pictureInputRef}
                    accept="image/*"
                    onChange={handlePictureUpload}
                    style={{ display: 'none' }}
                  />
                  {generatedKeys && (
                    <button
                      type="button"
                      onClick={() => pictureInputRef.current?.click()}
                      disabled={uploadingPicture}
                      className="profileUploadButton"
                    >
                      {uploadingPicture ? 'Uploading...' : 'Upload'}
                    </button>
                  )}
                </div>
              </div>

              <div className="profileFormField">
                <label htmlFor="bio">Bio</label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  className="profileFormTextarea"
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
              </div>

              <div className="profileFormField">
                <label htmlFor="banner">
                  Banner Image{' '}
                  {generatedKeys ? '(Blossom upload available)' : ''}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="url"
                    id="banner"
                    name="banner"
                    value={formData.banner}
                    onChange={handleInputChange}
                    onPaste={e => handleClipboardImage(e, 'banner')}
                    className="profileFormInput"
                    placeholder="https://example.com/banner.jpg or upload from Blossom"
                  />
                  <input
                    type="file"
                    ref={bannerInputRef}
                    accept="image/*"
                    onChange={handleBannerUpload}
                    style={{ display: 'none' }}
                  />
                  {generatedKeys && (
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={uploadingBanner}
                      className="profileUploadButton"
                    >
                      {uploadingBanner ? 'Uploading...' : 'Upload'}
                    </button>
                  )}
                </div>
              </div>

              <div className="profileFormField">
                <label htmlFor="website">Website</label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  className="profileFormInput"
                  placeholder="https://your-website.com (optional)"
                />
              </div>

              <div className="profileFormField">
                <label htmlFor="nip05">Identifier (nip-05)</label>
                <input
                  type="text"
                  id="nip05"
                  name="nip05"
                  value={formData.nip05}
                  onChange={handleInputChange}
                  className="profileFormInput"
                  placeholder="yourname@domain.com (optional)"
                />
              </div>

              <div className="profileFormField">
                <button
                  type="submit"
                  className="profileSaveButton"
                  disabled={isSubmitting || isPublishing}
                >
                  {isPublishing
                    ? 'Publishing to Nostr...'
                    : isSubmitting
                      ? 'Creating Account...'
                      : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nostr Key Generation Section - Only show after registration is complete */}
      {isRegistrationComplete && (
        <>
          <div
            className="profileSettingsSection registrationTransition"
            id="nostrKeys"
          >
            <h2 className="profileSettingsTitle">Secret Keys</h2>

            <div className="profileSection" id="nostrKeys">
              <p
                className="profileNotLoggedInText"
                style={{ marginBottom: '20px' }}
              >
                Your Nostr private key (nsec) and 12-word recovery phrase for
                decentralized identity.
              </p>

              {/* Tab Navigation */}
              <div className="keyTabs">
                {generatedKeys?.mnemonic && (
                  <button
                    className={`keyTab ${activeTab === 'mnemonic' ? 'active' : ''}`}
                    onClick={() => setActiveTab('mnemonic')}
                  >
                    Recovery (mnemonic)
                  </button>
                )}
                <button
                  className={`keyTab ${activeTab === 'privateKey' ? 'active' : ''}`}
                  onClick={() => setActiveTab('privateKey')}
                >
                  Private Key (nsec)
                </button>
              </div>

              {/* Tab Content */}
              <div className="keyTabContent">
                {activeTab === 'mnemonic' && generatedKeys?.mnemonic && (
                  <div className="keyTabPanel">
                    <div className="nostrKeyWarning">
                      ⚠️ This 12-word phrase can be used to recover your
                      account. Store it safely and never share it!
                    </div>
                    <div className="nostrKeyValue">
                      <code className="nostrKeyCode nostrMnemonicCode">
                        {generatedKeys.mnemonic}
                      </code>
                      <div className="nostrKeyActions">
                        <button
                          className="nostrKeyCopyButton"
                          onClick={() =>
                            handleCopyToClipboard(
                              generatedKeys.mnemonic || '',
                              'Recovery Phrase'
                            )
                          }
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'privateKey' && (
                  <div className="keyTabPanel">
                    <div className="nostrKeyWarning">
                      ⚠️ Your private key (nsec) gives full access to your
                      account. Never share it with anyone!
                    </div>
                    <div className="nostrKeyValue">
                      <div className="nostrKeyDisplay">
                        <code className="nostrKeyCode">
                          {generatedKeys?.privateKey}
                        </code>
                      </div>
                      <div className="nostrKeyActions">
                        <button
                          className="nostrKeyCopyButton"
                          onClick={() =>
                            handleCopyToClipboard(
                              generatedKeys?.privateKey || '',
                              'Private Key'
                            )
                          }
                        >
                          Copy
                        </button>
                        <button
                          className="nostrKeyCopyButton"
                          onClick={() => setShowNsecQRModal(true)}
                        >
                          Show QR
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {publishError && !publishedEventId && (
              <div className="nostrPublishError">
                <strong>⚠️ Publishing Failed</strong>
                <p>{publishError}</p>
                <p
                  style={{ fontSize: FONT_SIZES.SM, color: COLORS.TEXT_LIGHT, marginTop: '10px' }}
                >
                  <strong>What this means:</strong> Your Nostr keys were
                  generated successfully, but some relays are blocking new
                  accounts. This is normal for new Nostr users.
                </p>
                <p style={{ fontSize: FONT_SIZES.SM, color: COLORS.TEXT_LIGHT }}>
                  <strong>What you can do:</strong> Try again later, or use a
                  different Nostr client to publish your profile manually.
                </p>
                <button
                  className="profileSaveButton spaceTop"
                  onClick={handleRetryPublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? 'Retrying...' : 'Retry Publishing'}
                </button>
                <button
                  className="profileSaveButton secondary"
                  onClick={handleManualPublish}
                >
                  📋 Copy Event Data for Manual Publish
                </button>
              </div>
            )}

            {/* Backup Acknowledgement Section */}
            <div className="backupAcknowledgement">
              <div className="backupAcknowledgementContent">
                <h3>Backup Your Keys</h3>
                <p>Copy your keys above before continuing.</p>
                <label className="backupCheckbox">
                  <input
                    type="checkbox"
                    checked={keysBackedUp}
                    onChange={e => setKeysBackedUp(e.target.checked)}
                  />
                  <span>I've backed up my keys</span>
                </label>
                
                <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary)'
                  }}>
                    Password (optional, for extra security)
                  </label>
                  <input
                    type="password"
                    placeholder="Password (optional)"
                    value={registrationPassword}
                    onChange={e => setRegistrationPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      border: '2px solid var(--border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    marginBottom: '0'
                  }}>
                    Optional: Set a password to encrypt your private key with extra security. You'll need to enter it each session.
                  </p>
                </div>

                <button
                  className="profileSaveButton fullWidth"
                  onClick={handleBackupAcknowledgement}
                  disabled={!keysBackedUp}
                >
                  Continue to My Account
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {!isRegistrationComplete && (
        <div className="profileNotLoggedIn" style={{ marginTop: '40px' }}>
          <h2 className="profileNotLoggedInTitle">Already have an account?</h2>
          <p className="profileNotLoggedInText">
            Sign in to access your existing profile and settings.
          </p>
          <button className="profileLoginButton" onClick={openLogin}>
            Sign In
          </button>
        </div>
      )}

      {/* QR Code Modal for nsec */}
      {showNsecQRModal && generatedKeys?.privateKey && (
        <div
          className="overlayContainer"
          onClick={() => setShowNsecQRModal(false)}
        >
          <div
            className="overlayInner"
            style={{ textAlign: 'center', maxWidth: '400px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: COLORS.TEXT_PRIMARY }}>
              Private Key QR Code
            </h3>

            <div className="profileQRContainer">
              <GenericQR
                data={generatedKeys.privateKey}
                width={250}
                height={250}
                id="nsecQR"
              />
            </div>

            <p
              style={{
                margin: '16px 0',
                color: COLORS.ERROR_DARK,
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              ⚠️ Never share this QR code with anyone!
            </p>

            <p
              style={{ margin: '0 0 16px 0', color: COLORS.TEXT_LIGHT, fontSize: FONT_SIZES.SM }}
            >
              <code
                style={{
                  fontSize: '11px',
                  wordBreak: 'break-all',
                  backgroundColor: '#f0f0f0',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  display: 'inline-block'
                }}
              >
                {generatedKeys.privateKey}
              </code>
            </p>

            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}
            >
              <button
                className="profileCopyButton primary"
                onClick={() =>
                  handleCopyToClipboard(
                    generatedKeys.privateKey || '',
                    'Private Key'
                  )
                }
              >
                Copy nsec
              </button>
              <button
                className="profileCopyButton"
                onClick={() => setShowNsecQRModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterPage;
