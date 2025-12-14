import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DIMENSIONS } from '../../constants';
import { trimWebsiteUrl, sanitizeUrl, sanitizeImageUrl } from '../../utils/profileUtils';

interface ProfileData {
  displayName: string;
  bio: string;
  website: string;
  banner: string;
  picture: string;
}

interface ProfileHeaderProps {
  profileData: ProfileData;
  displayName?: string | null;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  isInitialLoad: boolean;
  profileDataLoaded: boolean;
  loadStartTime: number | null;
  onEditClick: () => void;
  onFollowClick: () => void;
  isFollowing: boolean;
  followBusy: boolean;
  children?: React.ReactNode;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  profileData,
  displayName,
  isOwnProfile,
  isLoggedIn,
  isLoading,
  isInitialLoad,
  profileDataLoaded,
  loadStartTime,
  onEditClick,
  onFollowClick,
  isFollowing,
  followBusy,
  children
}) => {
  const shouldShowSkeleton = 
    isLoading || 
    isInitialLoad || 
    !profileDataLoaded ||
    (loadStartTime !== null && Date.now() - loadStartTime < 300);

  return (
    <div className="profileSection" id="profilePreview">
      {/* Banner Image */}
      <div className="profileBanner">
        {profileData.banner && sanitizeImageUrl(profileData.banner) && (
          <img
            src={sanitizeImageUrl(profileData.banner)!}
            alt="Profile banner"
            className="profileBannerImage"
            onError={e => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
      </div>

      <div className="profileUserInfo">
        <div className="profileAvatar">
          {shouldShowSkeleton ? (
            <div className="skeleton skeleton-avatar" style={{ width: '120px', height: '120px' }}></div>
          ) : profileData.picture && sanitizeImageUrl(profileData.picture) ? (
            <img
              src={sanitizeImageUrl(profileData.picture)!}
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
          {!shouldShowSkeleton && (
            <div
              className="profileAvatarFallback"
              style={{ display: profileData.picture ? 'none' : 'flex' }}
            >
              {profileData.displayName
                ? profileData.displayName.charAt(0).toUpperCase()
                : 'U'}
            </div>
          )}
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
              {shouldShowSkeleton ? (
                <div className="skeleton skeleton-text" style={{ width: DIMENSIONS.BANNER_WIDTH, height: '28px' }}></div>
              ) : (
                profileData.displayName || displayName || 'Anonymous User'
              )}
            </h2>
            {isOwnProfile ? (
              <button
                className="profileEditButton"
                onClick={onEditClick}
              >
                Edit
              </button>
            ) : (
              isLoggedIn && (
                <button
                  className="profileEditButton"
                  onClick={onFollowClick}
                  disabled={isFollowing || followBusy}
                >
                  {isFollowing
                    ? 'Following'
                    : followBusy
                      ? 'Following…'
                      : 'Follow'}
                </button>
              )
            )}
          </div>
          {shouldShowSkeleton ? (
            <>
              <div className="skeleton skeleton-text short" style={{ height: '16px', marginBottom: '8px' }}></div>
              <div className="skeleton skeleton-text" style={{ height: '14px', width: '100%', marginBottom: '4px' }}></div>
              <div className="skeleton skeleton-text medium" style={{ height: '14px' }}></div>
            </>
          ) : (
            <>
              {profileData.website && sanitizeUrl(profileData.website) && (
                <a
                  href={sanitizeUrl(profileData.website)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profileWebsite"
                >
                  {trimWebsiteUrl(profileData.website)}
                </a>
              )}
              <p>{profileData.bio || 'PubPay User'}</p>
            </>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};


