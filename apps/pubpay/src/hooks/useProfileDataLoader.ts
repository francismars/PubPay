import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ensureProfiles,
  getQueryClient,
  Nip05ValidationService
} from '@pubpay/shared-services';
import { TIMEOUT } from '../constants';
import { isValidPublicKey } from '../utils/profileUtils';
import {
  useProfileActions,
  useProfileDataWithValidation
} from '../stores/useProfileStore';
import { useAbortController } from './useAbortController';
import { safeAsync, safeTimeout, isAbortError } from '../utils/asyncHelpers';

interface UseProfileDataLoaderOptions {
  targetPubkey: string;
  pubkey?: string;
  publicKey: string | null;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  userProfile: any;
  nostrClient: any;
}

/**
 * Hook for loading profile data from own profile or external profile
 */
export const useProfileDataLoader = (options: UseProfileDataLoaderOptions) => {
  const {
    targetPubkey,
    pubkey,
    publicKey,
    isOwnProfile,
    isLoggedIn,
    userProfile,
    nostrClient
  } = options;

  const location = useLocation();
  const navigate = useNavigate();

  const {
    setProfileData,
    setIsLoadingProfile,
    setProfileError,
    setIsInitialLoad,
    setLoadStartTime,
    setProfileDataLoaded,
    setNip05Valid,
    setNip05Validating
  } = useProfileActions();

  const { profileData } = useProfileDataWithValidation();
  const { signal, isAborted } = useAbortController();

  // Handle profile updates from edit page - force refetch and update
  useEffect(() => {
    if (
      (location.state as any)?.profileUpdated &&
      publicKey &&
      nostrClient &&
      isOwnProfile
    ) {
      // Clear cache and force fresh fetch
      const queryClient = getQueryClient();
      queryClient.removeQueries({ queryKey: ['profile', publicKey] });
      // Force refetch own profile from relays and update local state
      safeAsync(async () => {
        if (isAborted) return;
        
        try {
          // Small delay to ensure relays have the event
          await new Promise<void>(resolve => {
            const timeoutId = safeTimeout(() => resolve(), TIMEOUT.MEDIUM_DELAY, signal);
            if (!timeoutId) resolve();
          });
          
          if (isAborted) return;
          
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [publicKey]
          );
          
          if (isAborted) return;
          
          const profileEvent = profileMap.get(publicKey);
          if (profileEvent?.content) {
            const content =
              typeof profileEvent.content === 'string'
                ? JSON.parse(profileEvent.content)
                : profileEvent.content;
            
            if (isAborted) return;
            
            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
          }
        } catch (error) {
          if (isAbortError(error)) {
            console.log('Profile refresh aborted (component unmounted)');
            return;
          }
          console.error('Failed to refresh profile after update:', error);
        }
      }, signal);
      // Clear location state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [
    location.state,
    publicKey,
    navigate,
    location.pathname,
    nostrClient,
    isOwnProfile,
    setProfileData,
    signal,
    isAborted
  ]);

  // Load profile data - either from own profile or fetch external profile
  useEffect(() => {
    let waitForProfileTimeout: NodeJS.Timeout | null = null;

    const loadProfileData = async () => {
      if (isAborted) return;
      
      const startTime = Date.now();
      setLoadStartTime(startTime);
      setProfileDataLoaded(false);
      setIsLoadingProfile(false);
      setProfileError(null);
      setIsInitialLoad(true);

      const markAsLoaded = () => {
        // Ensure minimum display time for skeletons (300ms)
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, 300 - elapsed);
        safeTimeout(() => {
          if (isAborted) return;
          setIsInitialLoad(false);
          setIsLoadingProfile(false);
          setProfileDataLoaded(true);
        }, remainingTime, signal);
      };

      if (isOwnProfile) {
        // For own profile, wait for userProfile to be loaded from authState
        // If user is logged in but userProfile is null, it might still be loading
        if (isLoggedIn && userProfile === null) {
          // User is logged in but userProfile is null - might still be loading
          // Wait a bit to see if it loads, then mark as loaded
          waitForProfileTimeout = safeTimeout(() => {
            if (isAborted) return;
            // After 500ms, if userProfile is still null, it's confirmed not available
            markAsLoaded();
          }, 500, signal);
          return; // Exit early, will re-run when userProfile changes
        }

        // Load own profile from userProfile
        if (userProfile?.content) {
          try {
            if (isAborted) return;
            
            const content =
              typeof userProfile.content === 'string'
                ? JSON.parse(userProfile.content)
                : userProfile.content;

            if (isAborted) return;
            
            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });

            markAsLoaded();
          } catch (error) {
            if (isAbortError(error)) {
              return;
            }
            console.error('Failed to parse profile content:', error);
            markAsLoaded();
          }
        } else {
          // userProfile is null and user is not logged in, or confirmed not available
          // Mark as loaded after minimum time
          markAsLoaded();
        }
      } else if (targetPubkey && nostrClient) {
        // Validate pubkey format (use original pubkey parameter for validation)
        if (!isValidPublicKey(pubkey || publicKey || '')) {
          if (isAborted) return;
          setProfileError('Invalid public key format');
          return;
        }

        // Load external profile using ensureProfiles
        setIsLoadingProfile(true);
        try {
          if (isAborted) return;
          
          console.log('Loading profile for pubkey:', targetPubkey);
          const profileMap = await ensureProfiles(
            getQueryClient(),
            nostrClient,
            [targetPubkey]
          );
          
          if (isAborted) return;
          
          const profileEvent = profileMap.get(targetPubkey);
          console.log('Profile event received:', profileEvent);

          if (profileEvent?.content) {
            const content =
              typeof profileEvent.content === 'string'
                ? JSON.parse(profileEvent.content)
                : profileEvent.content;

            if (isAborted) return;
            
            setProfileData({
              displayName:
                content.display_name ||
                content.displayName ||
                content.name ||
                '',
              bio: content.about || '',
              website: content.website || '',
              banner: content.banner || '',
              picture: content.picture || '',
              lightningAddress: content.lud16 || '',
              nip05: content.nip05 || ''
            });
          } else {
            // Profile not found, show minimal profile
            if (isAborted) return;
            
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

          markAsLoaded();
        } catch (error) {
          if (isAbortError(error)) {
            console.log('Profile load aborted (component unmounted)');
            return;
          }
          console.error('Failed to load external profile:', error);
          if (isAborted) return;
          setProfileError('Failed to load profile');
          markAsLoaded();
        }
      }
    };

    safeAsync(loadProfileData, signal);

    // Cleanup: clear timeout if component unmounts or dependencies change
    return () => {
      if (waitForProfileTimeout) {
        clearTimeout(waitForProfileTimeout);
      }
    };
  }, [
    isOwnProfile,
    targetPubkey,
    userProfile,
    nostrClient,
    isLoggedIn,
    pubkey,
    publicKey,
    setProfileData,
    setIsLoadingProfile,
    setProfileError,
    setIsInitialLoad,
    setLoadStartTime,
    setProfileDataLoaded,
    signal,
    isAborted
  ]);

  // Validate NIP-05 when it changes
  useEffect(() => {
    if (!profileData.nip05 || !targetPubkey) {
      if (isAborted) return;
      setNip05Valid(null);
      setNip05Validating(false);
      return;
    }

    if (isAborted) return;
    
    setNip05Validating(true);
    
    safeAsync(async () => {
      if (isAborted) return;
      
      try {
        const isValid = await Nip05ValidationService.validateNip05(
          profileData.nip05,
          targetPubkey
        );
        
        if (isAborted) return;
        
        setNip05Valid(isValid);
        setNip05Validating(false);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        console.warn('Failed to validate NIP-05:', error);
        if (isAborted) return;
        setNip05Valid(false);
        setNip05Validating(false);
      }
    }, signal);
  }, [profileData.nip05, targetPubkey, setNip05Valid, setNip05Validating, signal, isAborted]);
};

