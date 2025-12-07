import React, { useState, useEffect } from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams
} from 'react-router-dom';
import {
  useUIStore,
  ensureProfiles,
  getQueryClient,
  NostrRegistrationService,
  AuthService,
  FollowService
} from '@pubpay/shared-services';
import { TIME, COLORS } from '../constants';
import { nip19, finalizeEvent, verifyEvent } from 'nostr-tools';
import { PayNoteComponent } from '../components/PayNoteComponent/PayNoteComponent';
import { Nip05PurchaseOverlay } from '../components/Nip05PurchaseOverlay/Nip05PurchaseOverlay';
import { ProfileQRModal } from '../components/Profile/ProfileQRModal';
import { ProfileRecoveryModal } from '../components/Profile/ProfileRecoveryModal';
import { ProfileJSONViewer } from '../components/Profile/ProfileJSONViewer';
import { ProfileHeaderSkeleton } from '../components/Profile/ProfileHeaderSkeleton';
import { ProfileNotLoggedIn } from '../components/Profile/ProfileNotLoggedIn';
import { ProfileHeader } from '../components/Profile/ProfileHeader';
import { ProfileDetails } from '../components/Profile/ProfileDetails';
import { ProfileStats } from '../components/Profile/ProfileStats';
import { useProfileDataLoader } from '../hooks/useProfileDataLoader';
import { useProfileActivityLoader } from '../hooks/useProfileActivityLoader';
import { useProfilePaynotesLoader } from '../hooks/useProfilePaynotesLoader';
import { useProfileZapSubscription } from '../hooks/useProfileZapSubscription';
import { PubPayPost } from '../hooks/useHomeFunctionality';
import { useNostrReady, usePaymentErrors } from '../stores/usePostStore';
import {
  useProfileState,
  useProfileLoadingStates,
  useProfileDataWithValidation,
  useUserPaynotesWithPagination,
  useFollowState,
  useProfileManagementActions
} from '../stores/useProfileStore';
import {
  getHexPubkey,
  getNpubForPurchase,
  getNpubFromPublicKey
} from '../utils/profileUtils';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { pubkey } = useParams<{ pubkey?: string }>();
  
  // Use reusable selector hooks
  const nostrReady = useNostrReady();
  const paymentErrors = usePaymentErrors();
  const openLogin = useUIStore(s => s.openLogin);
  
  // Get authState and handlers from Layout context (authState includes privateKey from local state)
  const {
    authState,
    nostrClient,
    handlePayWithExtension,
    handlePayAnonymously,
    handleSharePost
  } = useOutletContext<{
    authState: {
      isLoggedIn: boolean;
      publicKey: string | null;
      privateKey: string | null;
      signInMethod: 'extension' | 'externalSigner' | 'nsec' | null;
      userProfile: any;
      displayName: string | null;
    };
    nostrClient: any;
    handlePayWithExtension: (
      post: PubPayPost,
      amount: number,
      comment?: string
    ) => void;
    handlePayAnonymously: (
      post: PubPayPost,
      amount: number,
      comment?: string
    ) => void;
    handleSharePost: (post: PubPayPost) => void;
  }>();

  const isLoggedIn = authState.isLoggedIn;
  const userProfile = authState.userProfile;
  const displayName = authState.displayName;
  const publicKey = authState.publicKey;

  // Recovery state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    show: boolean;
    message: string;
    x: number;
    y: number;
  }>({
    show: false,
    message: '',
    x: 0,
    y: 0
  });

  // QR Code modal state
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState('');
  const [qrCodeType, setQrCodeType] = useState<'npub' | 'lightning'>('npub');

  // JSON Viewer state
  const [showJSON, setShowJSON] = useState(false);
  const [jsonContent, setJsonContent] = useState('');

  // NIP-05 Purchase overlay state
  const [showNip05Purchase, setShowNip05Purchase] = useState(false);

  const handleViewRaw = (post: PubPayPost) => {
    setJsonContent(JSON.stringify(post.event, null, 2));
    setShowJSON(true);
  };

  // Recovery handler
  const handleRecoveryFromMnemonic = async () => {
    if (!recoveryMnemonic.trim()) {
      alert('Please enter your 12-word mnemonic phrase');
      return;
    }

    try {
      const result = NostrRegistrationService.recoverKeyPairFromMnemonic(
        recoveryMnemonic.trim()
      );

      if (result.success && result.keyPair && result.keyPair.privateKey) {
        // Sign in with the recovered private key
        const signInResult = await AuthService.signInWithNsec(
          result.keyPair.privateKey
        );

        if (signInResult.success && signInResult.publicKey) {
          await AuthService.storeAuthData(
            signInResult.publicKey,
            result.keyPair.privateKey,
            'nsec'
          );

          setRecoveryMnemonic('');
          setShowRecoveryModal(false);
          alert(
            'Account recovered successfully! Please refresh the page to continue.'
          );
          window.location.reload();
        } else {
          alert(
            `Failed to sign in with recovered keys: ${
              signInResult.error || 'Unknown error'}`
          );
        }
      } else {
        alert(
          `Failed to recover keys: ${  result.error || 'Invalid mnemonic'}`
        );
      }
    } catch (error) {
      console.error('Recovery failed:', error);
      alert('Failed to recover keys. Please check your mnemonic phrase.');
    }
  };

  // Determine if we're viewing own profile or another user's profile
  const isOwnProfile = !pubkey || pubkey === publicKey;

  const targetPubkey = getHexPubkey(pubkey || publicKey || '');

  // Use composite hooks for optimized state access
  const {
    isLoadingProfile,
    isLoadingPaynotes,
    activityLoading,
    profileError,
    isInitialLoad,
    profileDataLoaded
  } = useProfileLoadingStates();
  
  const {
    profileData,
    nip05Valid,
    nip05Validating
  } = useProfileDataWithValidation();
  
  const {
    userPaynotes,
    hasMorePaynotes
  } = useUserPaynotesWithPagination();
  
  const {
    isFollowing,
    followBusy,
    setIsFollowing,
    setFollowBusy
  } = useFollowState();
  
  // Get remaining state that's not in composite hooks
  const { activityStats, loadStartTime, currentProfilePubkey } = useProfileState();

  // Use composite hooks for actions
  const { setProfileData, setCurrentProfile } = useProfileManagementActions();

  // Set current profile in store when target pubkey changes
  useEffect(() => {
    if (targetPubkey && targetPubkey !== currentProfilePubkey) {
      setCurrentProfile(targetPubkey);
    }
  }, [targetPubkey, currentProfilePubkey, setCurrentProfile]);

  // Check follow status (auth user's contacts)
  useEffect(() => {
    (async () => {
      try {
        if (
          !nostrClient ||
          !publicKey ||
          !targetPubkey ||
          publicKey === targetPubkey
        )
          return;
        const following = await FollowService.isFollowing(
          nostrClient,
          publicKey,
          targetPubkey
        );
        setIsFollowing(following);
      } catch (e) {
        console.warn('Failed to check following status', e);
      }
    })();
  }, [nostrClient, publicKey, targetPubkey]);

  const handleFollow = async () => {
    try {
      if (!nostrClient || !publicKey || !targetPubkey) return;
      setFollowBusy(true);
      const ok = await FollowService.follow(
        nostrClient,
        publicKey,
        targetPubkey
      );
      if (ok) setIsFollowing(true);
    } catch (e) {
      console.error('Follow failed:', e);
    } finally {
      setFollowBusy(false);
    }
  };

  // Use data-fetching hooks
  useProfileDataLoader({
    targetPubkey,
    pubkey,
    publicKey,
    isOwnProfile,
    isLoggedIn,
    userProfile,
    nostrClient
  });

  // Use data-fetching hooks
  useProfileActivityLoader({
    targetPubkey,
    nostrClient
  });

  const { loadMorePaynotes } = useProfilePaynotesLoader({
    targetPubkey,
    nostrClient
  });

  useProfileZapSubscription({
              nostrClient,
    nostrReady
  });


  // Copy to clipboard function with tooltip
  const handleCopyToClipboard = (
    text: string,
    label: string,
    event: React.MouseEvent
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 10;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setTooltip({
          show: true,
          message: `${label} copied to clipboard!`,
          x,
          y
        });

        // Auto-hide tooltip after 2 seconds
        setTimeout(() => {
          setTooltip(prev => ({ ...prev, show: false }));
        }, 2000);
      })
      .catch(() => {
        setTooltip({
          show: true,
          message: `Failed to copy ${label}`,
          x,
          y
        });

        // Auto-hide tooltip after 2 seconds
        setTimeout(() => {
          setTooltip(prev => ({ ...prev, show: false }));
        }, 2000);
      });
  };

  // Show QR code modal
  const handleShowQRCode = (
    data: string,
    type: 'npub' | 'lightning' = 'npub'
  ) => {
    setQrCodeData(data);
    setQrCodeType(type);
    setShowQRModal(true);
  };


  return (
    <div className="profilePage">
      <h1 className="profilePageTitle">
        {isOwnProfile ? 'Profile' : 'User Profile'}
      </h1>

      {(() => {
        // Show skeletons if: loading, initial load, or data not confirmed loaded yet
        // Only hide skeleton when data is confirmed loaded (profileDataLoaded = true)
        const shouldShowSkeleton = 
          isLoadingProfile || 
          isInitialLoad || 
          !profileDataLoaded;
        return shouldShowSkeleton;
      })() ? (
        <ProfileHeaderSkeleton
          isOwnProfile={isOwnProfile}
          targetPubkey={targetPubkey}
        />
      ) : profileError ? (
        <div className="profileError">
          <h2>Error</h2>
          <p>{profileError}</p>
        </div>
      ) : isOwnProfile && !isLoggedIn ? (
        <ProfileNotLoggedIn
          onLogin={openLogin}
          onRegister={() => navigate('/register')}
          onRecover={() => setShowRecoveryModal(true)}
        />
      ) : !isLoadingProfile && !isInitialLoad ? (
        <div>
          {/* User Profile Section */}
          <ProfileHeader
            profileData={profileData}
            displayName={displayName}
            isOwnProfile={isOwnProfile}
            isLoggedIn={isLoggedIn}
            isLoading={isLoadingProfile}
            isInitialLoad={isInitialLoad}
            profileDataLoaded={profileDataLoaded}
            loadStartTime={loadStartTime}
            onEditClick={() => navigate('/edit-profile')}
            onFollowClick={handleFollow}
            isFollowing={isFollowing}
            followBusy={followBusy}
          >
            <ProfileDetails
              profileData={profileData}
              targetPubkey={targetPubkey}
              pubkey={pubkey}
              publicKey={publicKey}
              isOwnProfile={isOwnProfile}
              nip05Valid={nip05Valid}
              nip05Validating={nip05Validating}
              isLoading={isLoadingProfile}
              isInitialLoad={isInitialLoad}
              profileDataLoaded={profileDataLoaded}
              loadStartTime={loadStartTime}
              onCopyLightning={e => handleCopyToClipboard(profileData.lightningAddress, 'Lightning Address', e)}
              onShowQRLightning={() => handleShowQRCode(profileData.lightningAddress, 'lightning')}
              onCopyNip05={e => handleCopyToClipboard(profileData.nip05, 'Identifier (nip-05)', e)}
              onPurchaseNip05={() => setShowNip05Purchase(true)}
              onCopyNpub={e => handleCopyToClipboard(getNpubFromPublicKey(pubkey, publicKey), 'Public Key', e)}
              onShowQRNpub={() => handleShowQRCode(getNpubFromPublicKey(pubkey, publicKey))}
            />
          </ProfileHeader>

          {/* Stats Section */}
          <ProfileStats
            activityStats={activityStats}
            activityLoading={activityLoading}
          />

          {/* Paynotes Section */}
          <div className="profilePaynotesSection" style={{ marginTop: '30px' }}>
            <h2 className="profileStatsTitle">Paynotes</h2>
            {isLoadingPaynotes && userPaynotes.length === 0 ? (
              <div
                style={{ textAlign: 'center', padding: '40px', color: COLORS.TEXT_LIGHT }}
              >
                Loading paynotes...
              </div>
            ) : userPaynotes.length === 0 ? (
              <div
                style={{ textAlign: 'center', padding: '40px', color: COLORS.TEXT_LIGHT }}
              >
                No paynotes found
              </div>
            ) : (
              <div>
                {userPaynotes.map(post => (
                  <PayNoteComponent
                    key={post.id}
                    post={post}
                    onPay={handlePayWithExtension}
                    onPayAnonymously={handlePayAnonymously}
                    onShare={handleSharePost}
                    onViewRaw={handleViewRaw}
                    isLoggedIn={isLoggedIn}
                    currentUserPublicKey={publicKey}
                    nostrClient={nostrClient}
                    nostrReady={nostrReady}
                    paymentError={paymentErrors?.get(post.id)}
                  />
                ))}
                {hasMorePaynotes && (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                      onClick={loadMorePaynotes}
                      disabled={isLoadingPaynotes}
                      style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: isLoadingPaynotes ? COLORS.GRAY_LIGHT : COLORS.PRIMARY,
                        color: COLORS.TEXT_WHITE,
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isLoadingPaynotes ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingPaynotes ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Tooltip */}
      {tooltip.show && (
        <div
          className="profileTooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: COLORS.TEXT_PRIMARY,
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            whiteSpace: 'nowrap'
          }}
        >
          {tooltip.message}
        </div>
      )}

      {/* QR Code Modal */}
      <ProfileQRModal
        show={showQRModal}
                  data={qrCodeData}
        type={qrCodeType}
        onClose={() => setShowQRModal(false)}
        onCopy={handleCopyToClipboard}
      />

      {/* Recovery Modal */}
      <ProfileRecoveryModal
        show={showRecoveryModal}
        recoveryMnemonic={recoveryMnemonic}
        onMnemonicChange={setRecoveryMnemonic}
        onRecover={handleRecoveryFromMnemonic}
        onClose={() => {
                  setShowRecoveryModal(false);
                  setRecoveryMnemonic('');
                }}
      />

      {/* JSON Viewer Overlay */}
      <ProfileJSONViewer
        show={showJSON}
        content={jsonContent}
        onClose={() => setShowJSON(false)}
      />

      {/* NIP-05 Purchase Overlay */}
      {showNip05Purchase && publicKey && (
        <Nip05PurchaseOverlay
          pubkey={getNpubForPurchase(publicKey)}
          onSuccess={async (nip05: string) => {
            setShowNip05Purchase(false);
            // Update profile data to show the new NIP-05
            setProfileData(prev => ({ ...prev, nip05 }));
            
            // Update kind 0 profile event with new NIP-05
            if (nostrClient && publicKey && authState?.privateKey && authState?.signInMethod === 'nsec') {
              try {
                // Get existing profile content
                const queryClient = getQueryClient();
                const profileMap = await ensureProfiles(
                  queryClient,
                  nostrClient,
                  [publicKey]
                );
                const profileEvent = profileMap.get(publicKey);
                
                let existingProfile: Record<string, any> = {};
                if (profileEvent?.content) {
                  try {
                    const content =
                      typeof profileEvent.content === 'string'
                        ? JSON.parse(profileEvent.content)
                        : profileEvent.content;
                    existingProfile = content || {};
                  } catch (e) {
                    console.warn('Failed to parse existing profile:', e);
                  }
                }

                // Merge with new NIP-05
                const profileDataForNostr: Record<string, any> = {
                  ...existingProfile,
                  nip05: nip05
                };

                // Remove empty strings
                Object.keys(profileDataForNostr).forEach(key => {
                  if (profileDataForNostr[key] === '' || profileDataForNostr[key] === null) {
                    delete profileDataForNostr[key];
                  }
                });

                // Create and sign event
                const eventTemplate = {
                  kind: 0,
                  pubkey: publicKey,
                  created_at: Math.floor(Date.now() / TIME.MILLISECONDS_PER_SECOND),
                  tags: [],
                  content: JSON.stringify(profileDataForNostr)
                };

                const decoded = nip19.decode(authState.privateKey);
                const signedEvent = finalizeEvent(
                  eventTemplate,
                  decoded.data as unknown as Uint8Array
                );

                if (!verifyEvent(signedEvent)) {
                  throw new Error('Failed to create valid signed event');
                }

                // Publish the event
                await nostrClient.publishEvent(signedEvent);

                // Clear cache to force fresh fetch
                queryClient.removeQueries({ queryKey: ['profile', publicKey] });
                queryClient.invalidateQueries({ queryKey: ['profile', publicKey] });

                useUIStore.getState().openToast(
                  `NIP-05 registered and profile updated: ${nip05}`,
                  'success',
                  false
                );
              } catch (error) {
                console.error('Failed to update profile with NIP-05:', error);
                useUIStore.getState().openToast(
                  `NIP-05 registered: ${nip05}. Please update your profile manually to include it.`,
                  'info',
                  false
                );
              }
            } else {
              // Extension sign-in or no private key - just show success
              useUIStore.getState().openToast(
                `NIP-05 registered: ${nip05}. Please update your profile to include it.`,
                'success',
                false
              );
            }
            
            setTimeout(() => {
              useUIStore.getState().closeToast();
            }, 3000);
            
            // Refresh profile data
            if (nostrClient && publicKey) {
              try {
                const queryClient = getQueryClient();
                queryClient.removeQueries({ queryKey: ['profile', publicKey] });
                const profileMap = await ensureProfiles(
                  queryClient,
                  nostrClient,
                  [publicKey]
                );
                const profileEvent = profileMap.get(publicKey);
                if (profileEvent?.content) {
                  const content =
                    typeof profileEvent.content === 'string'
                      ? JSON.parse(profileEvent.content)
                      : profileEvent.content;
                  setProfileData(prev => ({
                    ...prev,
                    nip05: content.nip05 || nip05
                  }));
                }
              } catch (error) {
                console.error('Failed to refresh profile:', error);
              }
            }
          }}
          onClose={() => setShowNip05Purchase(false)}
        />
      )}
    </div>
  );
};

export default ProfilePage;
