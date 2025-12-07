import React from 'react';
import { DIMENSIONS, PROTOCOLS, SEPARATORS, API_PATHS } from '../../constants';
import { trimNpub, getNpubFromPublicKey } from '../../utils/profileUtils';

interface ProfileData {
  lightningAddress: string;
  nip05: string;
}

interface ProfileDetailsProps {
  profileData: ProfileData;
  targetPubkey: string;
  pubkey?: string;
  publicKey: string | null;
  isOwnProfile: boolean;
  nip05Valid: boolean | null;
  nip05Validating: boolean;
  isLoading: boolean;
  isInitialLoad: boolean;
  profileDataLoaded: boolean;
  loadStartTime: number | null;
  onCopyLightning: (e: React.MouseEvent) => void;
  onShowQRLightning: () => void;
  onCopyNip05: (e: React.MouseEvent) => void;
  onPurchaseNip05: () => void;
  onCopyNpub: (e: React.MouseEvent) => void;
  onShowQRNpub: () => void;
}

export const ProfileDetails: React.FC<ProfileDetailsProps> = ({
  profileData,
  targetPubkey,
  pubkey,
  publicKey,
  isOwnProfile,
  nip05Valid,
  nip05Validating,
  isLoading,
  isInitialLoad,
  profileDataLoaded,
  loadStartTime,
  onCopyLightning,
  onShowQRLightning,
  onCopyNip05,
  onPurchaseNip05,
  onCopyNpub,
  onShowQRNpub
}) => {
  const shouldShowSkeleton = 
    isLoading || 
    isInitialLoad || 
    !profileDataLoaded ||
    (loadStartTime !== null && Date.now() - loadStartTime < 300);

  const npub = getNpubFromPublicKey(pubkey, publicKey);

  return (
    <div className="profileDetails">
      {(isOwnProfile || profileData.lightningAddress) && (
        <div className="profileDetailItem">
          <label>Lightning Address</label>
          <div className="profileDetailValue">
            {shouldShowSkeleton ? (
              <div className="skeleton skeleton-text" style={{ width: '180px', height: '20px' }}></div>
            ) : profileData.lightningAddress ? (
              <>
                <a
                  href={`lightning:${profileData.lightningAddress}`}
                  className="profileLightningLink"
                >
                  {profileData.lightningAddress}
                </a>
                <div className="profileButtonGroup">
                  <button
                    className="profileCopyButton"
                    onClick={onCopyLightning}
                  >
                    Copy
                  </button>
                  <button
                    className="profileCopyButton"
                    onClick={onShowQRLightning}
                  >
                    Show QR
                  </button>
                </div>
              </>
            ) : (
              <span className="profileEmptyField">Not set</span>
            )}
          </div>
        </div>
      )}

      {(isOwnProfile || profileData.nip05) && (
        <div className="profileDetailItem">
          <label>Identifier (nip-05)</label>
          <div className="profileDetailValue">
            {shouldShowSkeleton ? (
              <div className="skeleton skeleton-text" style={{ width: '150px', height: '20px' }}></div>
            ) : profileData.nip05 ? (
              <>
                <a
                  href={`${PROTOCOLS.HTTPS}${profileData.nip05.split(SEPARATORS.LIGHTNING_ADDRESS)[1]}${API_PATHS.NIP05_WELL_KNOWN}?name=${profileData.nip05.split(SEPARATORS.LIGHTNING_ADDRESS)[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    nip05Valid === false
                      ? 'profileLightningLink unverified'
                      : nip05Validating
                        ? 'profileLightningLink'
                        : 'profileLightningLink'
                  }
                  title={
                    nip05Valid === false
                      ? 'NIP-05 identifier does not match this profile'
                      : nip05Validating
                        ? 'Validating NIP-05 identifier...'
                        : nip05Valid === true
                          ? 'Verified NIP-05 identifier'
                          : 'NIP-05 identifier'
                  }
                >
                  {nip05Validating ? (
                    <span className="material-symbols-outlined validating-icon">
                      hourglass_empty
                    </span>
                  ) : nip05Valid === false ? (
                    <span className="material-symbols-outlined">block</span>
                  ) : nip05Valid === true ? (
                    <span className="material-symbols-outlined">check_circle</span>
                  ) : null}
                  {profileData.nip05}
                </a>
                <button
                  className="profileCopyButton"
                  onClick={onCopyNip05}
                >
                  Copy
                </button>
              </>
            ) : (
              <>
                <span className="profileEmptyField">Not set</span>
                {isOwnProfile && (
                  <button
                    className="profileCopyButton"
                    onClick={onPurchaseNip05}
                  >
                    Buy NIP-05
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {targetPubkey && (
        <div className="profileDetailItem">
          <label>User ID (npub)</label>
          <div className="profileDetailValue">
            <div
              className="profilePublicKey"
              title={npub}
            >
              {trimNpub(npub)}
            </div>
            <div className="profileButtonGroup">
              <button
                className="profileCopyButton"
                onClick={onCopyNpub}
              >
                Copy
              </button>
              <button
                className="profileCopyButton"
                onClick={onShowQRNpub}
              >
                Show QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

