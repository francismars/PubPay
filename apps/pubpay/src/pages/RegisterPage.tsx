import React, { useState, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useUIStore, NostrRegistrationService, NostrKeyPair, ProfileData, BlossomService } from '@pubpay/shared-services';

interface RegisterPageProps {
  authState?: any;
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { authState } = useOutletContext<{ authState: any }>();
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
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [isRegistrationComplete, setIsRegistrationComplete] = useState(false);
  const [showManualPublish, setShowManualPublish] = useState(false);
  const [showNsecQR, setShowNsecQR] = useState(false);
  const [showHexValues, setShowHexValues] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const openLogin = useUIStore(s => s.openLogin);

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

  const handleDownloadKeys = () => {
    if (!generatedKeys) return;
    
    const keyData = {
      nsec: generatedKeys.privateKey,
      npub: generatedKeys.publicKey,
      displayName: formData.displayName,
      generatedAt: new Date().toISOString(),
      warning: 'IMPORTANT: Keep your nsec (private key) secure and never share it with anyone!'
    };
    
    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nostr-keys-${formData.displayName || 'user'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} copied to clipboard!`);
    }).catch(() => {
      alert(`Failed to copy ${label}`);
    });
  };

  // Helper function to convert npub/nsec to hex format
  const convertToHex = (encodedKey: string): string => {
    try {
      if (typeof window !== 'undefined' && (window as any).NostrTools) {
        const decoded = (window as any).NostrTools.nip19.decode(encodedKey);
        console.log('Decoded key:', decoded); // Debug log
        
        if (decoded && decoded.data) {
          const hexString = Array.from(decoded.data as Uint8Array)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
          console.log('Converted to hex:', hexString); // Debug log
          return hexString;
        }
      }
      console.warn('NostrTools not available or failed to decode');
      return encodedKey; // Fallback if NostrTools not available
    } catch (error) {
      console.error('Failed to convert to hex:', error);
      return encodedKey; // Fallback on error
    }
  };

  // Helper function to get hex from raw key data
  const getHexFromRawKey = (rawKey: Uint8Array | string): string => {
    try {
      if (rawKey instanceof Uint8Array) {
        return Array.from(rawKey)
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
      } else if (typeof rawKey === 'string') {
        return rawKey;
      }
      return '';
    } catch (error) {
      console.error('Failed to convert raw key to hex:', error);
      return '';
    }
  };

  const handleRecoveryFromMnemonic = async () => {
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }

    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(recoveryMnemonic.trim());
      
      if (result.success && result.keyPair) {
        setGeneratedKeys(result.keyPair);
        setShowKeys(true);
        setShowRecoveryForm(false);
        setRecoveryMnemonic('');
        setIsRegistrationComplete(true);
        alert('Keys recovered successfully from mnemonic!');
      } else {
        alert('Failed to recover keys: ' + (result.error || 'Invalid mnemonic'));
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
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
      const event = NostrRegistrationService.createProfileEvent(generatedKeys.rawPrivateKey, profileData);
      const eventJson = JSON.stringify(event, null, 2);
      
      // Copy to clipboard
      navigator.clipboard.writeText(eventJson);
      alert('Event data copied to clipboard! You can now paste this into any Nostr client to publish your profile manually.');
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
        // Remove alert - success is shown in the UI
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle profile picture upload
  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Can only upload after keys are generated
    if (!generatedKeys || !generatedKeys.rawPrivateKey || !generatedKeys.rawPublicKey) {
      alert('Please wait for keys to be generated');
      return;
    }

    setUploadingPicture(true);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFileWithKey(file, generatedKeys.rawPrivateKey, generatedKeys.rawPublicKey);
      const imageUrl = blossomService.getFileUrl(hash);
      setFormData(prev => ({ ...prev, picture: imageUrl }));
    } catch (error) {
      console.error('Failed to upload picture:', error);
      alert(`Failed to upload picture: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    if (!generatedKeys || !generatedKeys.rawPrivateKey || !generatedKeys.rawPublicKey) {
      alert('Please wait for keys to be generated');
      return;
    }

    setUploadingBanner(true);
    try {
      const blossomService = new BlossomService();
      const hash = await blossomService.uploadFileWithKey(file, generatedKeys.rawPrivateKey, generatedKeys.rawPublicKey);
      const imageUrl = blossomService.getFileUrl(hash);
      setFormData(prev => ({ ...prev, banner: imageUrl }));
    } catch (error) {
      console.error('Failed to upload banner:', error);
      alert(`Failed to upload banner: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = '';
      }
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
      <h1 className="profilePageTitle">
        Create Account
      </h1>

      <div className="profileSection" id="profilePreview">
        {/* Banner Image */}
        {formData.banner && (
          <div className="profileBanner">
            <img 
              src={formData.banner} 
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
            {formData.picture ? (
              <img 
                src={formData.picture} 
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
            <div className="profileAvatarFallback" style={{ display: formData.picture ? 'none' : 'flex' }}>
              {formData.displayName ? formData.displayName.charAt(0).toUpperCase() : '?'}
            </div>
          </div>
          <div className="profileUserDetails">
            <h2>
              {formData.displayName || 'New User'}
            </h2>
            <p>
              {formData.bio || 'Join PubPay Community'}
            </p>
            {formData.website && (
              <a href={formData.website} target="_blank" rel="noopener noreferrer" className="profileWebsite">
                {formData.website}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="profileSettingsSection">
        <h2 className="profileSettingsTitle">
          Account Information
        </h2>
        <div className="profileSettingsCard">
          <form onSubmit={handleSubmit}>
            <div className="profileFormField">
              <label htmlFor="displayName">
                Display Name *
              </label>
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
              <label htmlFor="lightningAddress">
                Lightning Address
              </label>
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
                Profile Picture {generatedKeys ? '(Blossom upload available)' : ''}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  id="picture"
                  name="picture"
                  value={formData.picture}
                  onChange={handleInputChange}
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
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      cursor: uploadingPicture ? 'wait' : 'pointer',
                      backgroundColor: '#4a75ff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    {uploadingPicture ? 'Uploading...' : '📷 Upload'}
                  </button>
                )}
              </div>
            </div>
            
            <div className="profileFormField">
              <label htmlFor="bio">
                Bio
              </label>
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
                Banner Image {generatedKeys ? '(Blossom upload available)' : ''}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="url"
                  id="banner"
                  name="banner"
                  value={formData.banner}
                  onChange={handleInputChange}
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
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      cursor: uploadingBanner ? 'wait' : 'pointer',
                      backgroundColor: '#4a75ff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    {uploadingBanner ? 'Uploading...' : '📷 Upload'}
                  </button>
                )}
              </div>
            </div>
            
            <div className="profileFormField">
              <label htmlFor="website">
                Website
              </label>
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
              <label htmlFor="nip05">
                NIP-05 Identifier
              </label>
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
                {isPublishing ? 'Publishing to Nostr...' : isSubmitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Nostr Key Generation Section - Only show after registration is complete */}
      {isRegistrationComplete && (
        <div className="profileSection">
          <h2 className="profileSettingsTitle">
            Nostr Keys
          </h2>
          <div className="profileSettingsCard">
            <p className="profileNotLoggedInText" style={{ marginBottom: '20px' }}>
              Your Nostr private key (nsec) and public key (npub) for decentralized identity.
            </p>
            
            {/* Advanced Options */}
            <div className="advancedOptions" style={{ marginBottom: '20px' }}>
              <label className="advancedOptionLabel">
                <input
                  type="checkbox"
                  checked={showHexValues}
                  onChange={(e) => setShowHexValues(e.target.checked)}
                />
                Show hex values (advanced)
              </label>
            </div>
            
            <div className="nostrKeysDisplay">
              <div className="nostrKeyItem">
                <label className="nostrKeyLabel">
                  Private Key (nsec) - Keep Secret!
                </label>
                <div className="nostrKeyValue">
                  {!showNsecQR ? (
                    <div className="nostrKeyDisplay">
                      <code className="nostrKeyCode">
                        {showHexValues ? getHexFromRawKey(generatedKeys?.rawPrivateKey || new Uint8Array()) : generatedKeys?.privateKey}
                      </code>
                      {showHexValues && (
                        <div className="nostrKeyFormat">
                          <small>Hex format</small>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="nostrQRCode">
                      <div className="nostrQRPlaceholder">
                        QR Code for nsec
                      </div>
                    </div>
                  )}
                  <div className="nostrKeyActions">
                    <button 
                      className="nostrKeyCopyButton"
                      onClick={() => handleCopyToClipboard(
                        showHexValues ? getHexFromRawKey(generatedKeys?.rawPrivateKey || new Uint8Array()) : generatedKeys?.privateKey || '', 
                        'Private Key'
                      )}
                    >
                      Copy
                    </button>
                    <button 
                      className="nostrKeyCopyButton"
                      onClick={() => setShowNsecQR(!showNsecQR)}
                    >
                      {showNsecQR ? 'Show Text' : 'Show QR'}
                    </button>
                  </div>
                </div>
              </div>

              {generatedKeys?.mnemonic && (
                <div className="nostrKeyItem">
                  <label className="nostrKeyLabel">
                    12-Word Recovery Phrase (NIP-06) - Keep Secret!
                  </label>
                  <div className="nostrKeyValue">
                    <code className="nostrKeyCode nostrMnemonicCode">
                      {generatedKeys.mnemonic}
                    </code>
                    <button 
                      className="nostrKeyCopyButton"
                      onClick={() => handleCopyToClipboard(generatedKeys.mnemonic || '', 'Recovery Phrase')}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="nostrKeyWarning">
                    ⚠️ This 12-word phrase can be used to recover your account. Store it safely and never share it!
                  </div>
                </div>
              )}
              
              <div className="nostrKeyItem">
                <label className="nostrKeyLabel">
                  Public Key (npub)34
                </label>
                <div className="nostrKeyValue">
                  <div className="nostrKeyDisplay">
                    <code className="nostrKeyCode">
                      {showHexValues ? getHexFromRawKey(generatedKeys?.rawPublicKey || '') : generatedKeys?.publicKey}
                    </code>
                    {showHexValues && (
                      <div className="nostrKeyFormat">
                        <small>Hex format</small>
                      </div>
                    )}
                  </div>
                  <button 
                    className="nostrKeyCopyButton"
                    onClick={() => handleCopyToClipboard(
                      showHexValues ? getHexFromRawKey(generatedKeys?.rawPublicKey || '') : generatedKeys?.publicKey || '', 
                      'Public Key'
                    )}
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div className="nostrKeyActions">
                <button 
                  className="profileSaveButton"
                  onClick={handleDownloadKeys}
                  style={{ marginRight: '10px' }}
                >
                  Download Keys
                </button>
                <button 
                  className="profileRegisterButton"
                  onClick={() => setShowKeys(false)}
                >
                  Hide Keys
                </button>
              </div>
              
              {publishError && !publishedEventId && (
                <div className="nostrPublishError">
                  <strong>⚠️ Publishing Failed</strong>
                  <p>{publishError}</p>
                  <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                    <strong>What this means:</strong> Your Nostr keys were generated successfully, but some relays are blocking new accounts. This is normal for new Nostr users.
                  </p>
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    <strong>What you can do:</strong> Try again later, or use a different Nostr client to publish your profile manually.
                  </p>
                  <button 
                    className="profileSaveButton"
                    onClick={handleRetryPublish}
                    disabled={isPublishing}
                    style={{ marginTop: '10px' }}
                  >
                    {isPublishing ? 'Retrying...' : 'Retry Publishing'}
                  </button>
                  <button 
                    className="profileSaveButton"
                    onClick={handleManualPublish}
                    style={{ marginTop: '10px', marginLeft: '10px', backgroundColor: '#6c757d' }}
                  >
                    📋 Copy Event Data for Manual Publish
                  </button>
                </div>
              )}
              
              <div className="nostrKeyWarning">
                <strong>⚠️ Important Security Notice:</strong>
                <ul>
                  <li>Your private key (nsec) gives full access to your account</li>
                  <li>Never share your private key with anyone</li>
                  <li>Store it securely and make backups</li>
                  <li>If you lose your private key, you cannot recover your account</li>
                </ul>
              </div>
              
              {publishedEventId && (
                <div className="nostrEventInfo">
                  <strong>✅ Profile Published Successfully!</strong>
                  <p>Your profile has been published to Nostr relays.</p>
                  <div className="nostrEventId">
                    <label className="nostrKeyLabel">Event ID:</label>
                    <div className="nostrKeyValue">
                      <code className="nostrKeyCode">
                        {publishedEventId}
                      </code>
                      <button 
                        className="nostrKeyCopyButton"
                        onClick={() => handleCopyToClipboard(publishedEventId, 'Event ID')}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>
      )}

      {/* Recovery Section */}
      <div className="profileSection">
        <h2 className="profileSectionTitle">
          Recover Existing Account
        </h2>
        <p className="profileSectionDescription">
          If you have a 12-word recovery phrase from a previous account, you can recover your keys here.
        </p>
        
        {!showRecoveryForm ? (
          <button 
            className="profileSaveButton"
            onClick={() => setShowRecoveryForm(true)}
          >
            Recover from Mnemonic
          </button>
        ) : (
          <div className="profileFormField">
            <label htmlFor="recoveryMnemonic">
              12-Word Recovery Phrase
            </label>
            <textarea
              id="recoveryMnemonic"
              value={recoveryMnemonic}
              onChange={(e) => setRecoveryMnemonic(e.target.value)}
              className="profileFormTextarea"
              placeholder="Enter your 12-word recovery phrase separated by spaces..."
              rows={3}
            />
            <div className="nostrKeyActions">
              <button 
                className="nostrKeyCopyButton"
                onClick={handleRecoveryFromMnemonic}
                disabled={!recoveryMnemonic.trim()}
              >
                Recover Keys
              </button>
              <button 
                className="nostrKeyCopyButton"
                onClick={() => {
                  setShowRecoveryForm(false);
                  setRecoveryMnemonic('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="profileNotLoggedIn">
        <h2 className="profileNotLoggedInTitle">
          Already have an account?
        </h2>
        <p className="profileNotLoggedInText">
          Sign in to access your existing profile and settings.
        </p>
        <button className="profileLoginButton" onClick={() => navigate('/profile')}>
          Sign In
        </button>
      </div>
    </div>
  );
};

export default RegisterPage;
