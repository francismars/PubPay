import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useUIStore, ensureProfiles, getQueryClient, NostrRegistrationService, AuthService } from '@pubpay/shared-services';
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
  
  // Recovery state
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');

  // Recovery handler
  const handleRecoveryFromMnemonic = async () => {
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }

    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(recoveryMnemonic.trim());
      
      if (result.success && result.keyPair && result.keyPair.privateKey) {
        // Sign in with the recovered private key
        const signInResult = await AuthService.signInWithNsec(result.keyPair.privateKey);
        
        if (signInResult.success && signInResult.publicKey) {
          AuthService.storeAuthData(
            signInResult.publicKey,
            result.keyPair.privateKey,
            'nsec',
            true
          );
          
          alert('Account recovered successfully! Please refresh the page to continue.');
          window.location.reload();
        } else {
          alert('Failed to sign in with recovered keys: ' + (signInResult.error || 'Unknown error'));
        }
      } else {
        alert('Failed to recover keys: ' + (result.error || 'Invalid mnemonic'));
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
    }
  };

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

  // Activity stats (counts only for now)
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityStats, setActivityStats] = useState({
    paynotesCreated: 0,
    pubpaysReceived: 0,
    zapsReceived: 0
  });

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

  // Load activity stats (frontend-only, counts)
  useEffect(() => {
    const loadActivityStats = async () => {
      if (!targetPubkey || !nostrClient) return;

      setActivityLoading(true);
      try {
        // Helper function to paginate and get all events
        const getAllEvents = async (
          filter: any,
          description: string
        ): Promise<any[]> => {
          const allEvents: any[] = [];
          let until: number | undefined = undefined;
          const limit = 500;
          let hasMore = true;
          let batchCount = 0;

          console.log(`[${description}] Starting to fetch all events with filter:`, filter);

          while (hasMore) {
            batchCount++;
            try {
              const batchFilter = {
                ...filter,
                limit,
                ...(until ? { until } : {})
              };
              
              console.log(`[${description}] Batch ${batchCount} - Filter:`, batchFilter);
              const batch = (await nostrClient.getEvents([batchFilter])) as any[];

              console.log(`[${description}] Batch ${batchCount} - Received ${batch.length} events`);

              if (batch.length === 0) {
                console.log(`[${description}] No more events found`);
                hasMore = false;
                break;
              }

              // Sort batch by created_at descending (newest first) to ensure consistent ordering
              batch.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

              allEvents.push(...batch);

              console.log(`[${description}] Total events so far: ${allEvents.length}`);

              // If we got fewer events than the limit, we've reached the end
              if (batch.length < limit) {
                console.log(`[${description}] Got fewer events than limit (${batch.length} < ${limit}), reached end`);
                hasMore = false;
              } else {
                // Set until to the oldest event's timestamp for next batch
                const oldestEvent = batch[batch.length - 1]; // Last event is oldest (after sorting)
                const oldestTimestamp = oldestEvent.created_at || 0;
                until = oldestTimestamp - 1; // Subtract 1 to avoid overlap
                console.log(`[${description}] Setting until to ${until} (oldest: ${oldestTimestamp})`);
              }

              // Safety limit to prevent infinite loops
              if (batchCount > 50) {
                console.warn(`[${description}] Reached safety limit of 50 batches, stopping`);
                hasMore = false;
              }
            } catch (error) {
              console.error(`[${description}] Error fetching batch ${batchCount}:`, error);
              hasMore = false;
            }
          }

          // Deduplicate by event ID
          const uniqueEvents = new Map<string, any>();
          for (const event of allEvents) {
            if (event && event.id) {
              uniqueEvents.set(event.id, event);
            }
          }

          const finalCount = uniqueEvents.size;
          console.log(`[${description}] Final count after deduplication: ${finalCount} unique events`);

          return Array.from(uniqueEvents.values());
        };

        // Fetch all kind:1 events by this user first (more reliable than filtering by tag on relay side)
        let allNotes: any[] = [];
        try {
          allNotes = await getAllEvents(
            {
              kinds: [1],
              authors: [targetPubkey]
            },
            'all notes'
          );
          console.log(`[stats] Fetched ${allNotes.length} total kind:1 events`);
        } catch (error) {
          console.error('Error fetching all notes:', error);
          allNotes = [];
        }

        // Filter for paynotes client-side (more reliable than relay tag filtering)
        const paynotes = allNotes.filter((event: any) => {
          if (!event || !event.tags) return false;
          const hasPubpayTag = event.tags.some((tag: any[]) => 
            Array.isArray(tag) && tag[0] === 't' && tag[1] === 'pubpay'
          );
          return hasPubpayTag;
        });

        console.log(`[stats] Found ${paynotes.length} paynotes out of ${allNotes.length} total notes`);

        // Create Set for fast lookup
        const paynoteIdsSet = new Set<string>(paynotes.map((e: any) => e.id).filter(Boolean));

        // Create Set of all note IDs (includes paynotes)
        const allNoteIdsSet = new Set<string>(allNotes.map(e => e.id).filter(Boolean));

        // 3) Count zaps where:
        //    - #e tag references one of the event IDs
        //    - #p tag matches targetPubkey (user is the recipient)
        const countZapsForEventIds = async (
          eventIdsSet: Set<string>,
          description: string
        ): Promise<number> => {
          if (eventIdsSet.size === 0) return 0;
          
          // Query zaps where recipient is targetPubkey
          // Then filter by event IDs
          const seen = new Set<string>();
          
          // Query zaps received by this user (p tag = targetPubkey)
          try {
            // Get zaps where p tag matches targetPubkey
            const receipts = (await nostrClient.getEvents([
              { kinds: [9735], '#p': [targetPubkey], limit: 5000 }
            ])) as any[];
            
            // Filter to only zaps that reference events in our set
            for (const receipt of receipts) {
              if (!receipt || !receipt.id || !receipt.tags) continue;
              
              // Check if this zap references one of our events
              const eventTag = receipt.tags.find((tag: any[]) => tag[0] === 'e');
              if (!eventTag || !eventTag[1]) continue;
              
              const referencedEventId = eventTag[1];
              if (eventIdsSet.has(referencedEventId)) {
                seen.add(receipt.id);
              }
            }
          } catch (error) {
            console.error(`Error counting ${description}:`, error);
          }
          
          return seen.size;
        };

        const [pubpaysReceived, zapsReceived] = await Promise.all([
          countZapsForEventIds(paynoteIdsSet, 'pubpays received'),
          countZapsForEventIds(allNoteIdsSet, 'zaps received')
        ]);

        setActivityStats({
          paynotesCreated: paynoteIdsSet.size,
          pubpaysReceived,
          zapsReceived
        });
      } catch (error) {
        console.error('Error loading activity stats:', error);
        // Set to zero on error
        setActivityStats({
          paynotesCreated: 0,
          pubpaysReceived: 0,
          zapsReceived: 0
        });
      } finally {
        setActivityLoading(false);
      }
    };

    loadActivityStats();
  }, [targetPubkey, nostrClient]);

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
        <div>
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

          {/* Recovery Section */}
          <div className="profileSection" style={{ marginTop: '40px' }}>
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
                  {activityLoading ? '—' : activityStats.paynotesCreated}
                </div>
                <div className="profileStatLabel">
                  Paynotes Created
                </div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  {activityLoading ? '—' : activityStats.pubpaysReceived}
                </div>
                <div className="profileStatLabel">
                  PubPays Received
                </div>
              </div>
              <div className="profileStatCard">
                <div className="profileStatValue">
                  {activityLoading ? '—' : activityStats.zapsReceived}
                </div>
                <div className="profileStatLabel">
                  Zaps Received
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
