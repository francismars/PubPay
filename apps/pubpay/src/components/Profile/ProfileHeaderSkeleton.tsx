import React from 'react';
import { DIMENSIONS } from '../../constants';

interface ProfileHeaderSkeletonProps {
  isOwnProfile: boolean;
  targetPubkey: string | null;
}

export const ProfileHeaderSkeleton: React.FC<ProfileHeaderSkeletonProps> = ({
  isOwnProfile,
  targetPubkey
}) => {
  return (
    <div className="profileSection" id="profilePreview">
      {/* Banner Image */}
      <div className="profileBanner">
        <div className="skeleton" style={{ width: '100%', height: '120px', borderRadius: '0' }}></div>
      </div>

      <div className="profileUserInfo">
        <div className="profileAvatar">
          <div className="skeleton skeleton-avatar" style={{ width: '100%', height: '100%', borderRadius: '50%' }}></div>
        </div>
        <div className="profileUserDetails">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <h2 style={{ margin: 0 }}>
              <div className="skeleton skeleton-text" style={{ width: DIMENSIONS.BANNER_WIDTH, height: '24px' }}></div>
            </h2>
            {isOwnProfile ? (
              <div className="skeleton" style={{ width: '60px', height: '32px', borderRadius: '6px' }}></div>
            ) : null}
          </div>
          <div className="skeleton skeleton-text short" style={{ height: '16px', width: '150px', marginBottom: '8px' }}></div>
          <div style={{ margin: 0 }}>
            <div className="skeleton skeleton-text" style={{ height: '14px', width: '100%', marginBottom: '4px' }}></div>
            <div className="skeleton skeleton-text medium" style={{ height: '14px' }}></div>
          </div>

          {/* Profile Details */}
          <div className="profileDetails">
            {(isOwnProfile || true) && (
              <div className="profileDetailItem">
                <label>Lightning Address</label>
                <div className="profileDetailValue">
                  <div className="skeleton skeleton-text" style={{ width: '180px', height: '20px' }}></div>
                </div>
              </div>
            )}
            {(isOwnProfile || true) && (
              <div className="profileDetailItem">
                <label>Identifier (nip-05)</label>
                <div className="profileDetailValue">
                  <div className="skeleton skeleton-text" style={{ width: '150px', height: '20px' }}></div>
                </div>
              </div>
            )}
            {targetPubkey && (
              <div className="profileDetailItem">
                <label>User ID (npub)</label>
                <div className="profileDetailValue">
                  <div className="skeleton skeleton-text" style={{ width: DIMENSIONS.BANNER_WIDTH, height: '20px' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

