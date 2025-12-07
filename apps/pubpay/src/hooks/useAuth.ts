import { useRef, useEffect, useCallback, useState } from 'react';
import { AuthService } from '@pubpay/shared-services';
import { FollowService, useUIStore, useAuthStore, type AuthState } from '@pubpay/shared-services';
import { ensureProfiles } from '@pubpay/shared-services';
import { getQueryClient } from '@pubpay/shared-services';
import { Kind0Event } from '@pubpay/shared-types';
import { NostrClient } from '@pubpay/shared-services';
import { safeJson } from '@pubpay/shared-utils';
import { STORAGE_KEYS, TIMEOUT } from '../constants';

interface UseAuthOptions {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  onProfileLoaded?: (pubkey: string) => void;
}

export const useAuth = ({ nostrClientRef, onProfileLoaded }: UseAuthOptions) => {
  // Keep privateKey in local state for security (not in global store)
  const [privateKey, setPrivateKeyLocal] = useState<string | null>(null);

  // Use Zustand store for auth state (excluding privateKey)
  const storeAuthState = useAuthStore(state => ({
    isLoggedIn: state.isLoggedIn,
    publicKey: state.publicKey,
    signInMethod: state.signInMethod,
    userProfile: state.userProfile,
    displayName: state.displayName
  }));

  // Combine store state with local privateKey for backward compatibility
  const authState: AuthState = {
    ...storeAuthState,
    privateKey
  };

  // Store actions
  const setAuth = useAuthStore(state => state.setAuth);
  const clearAuth = useAuthStore(state => state.clearAuth);
  const setProfile = useAuthStore(state => state.setProfile);
  const setDisplayName = useAuthStore(state => state.setDisplayName);

  // Wrapper for setAuthState to maintain backward compatibility
  const setAuthState = useCallback((state: AuthState | ((prev: AuthState) => AuthState)) => {
    if (typeof state === 'function') {
      const currentStoreState = useAuthStore.getState();
      const newState = state({
        isLoggedIn: currentStoreState.isLoggedIn,
        publicKey: currentStoreState.publicKey,
        privateKey, // Use local state
        signInMethod: currentStoreState.signInMethod,
        userProfile: currentStoreState.userProfile,
        displayName: currentStoreState.displayName
      });
      // setAuth doesn't allow privateKey, so set it separately
      const { privateKey: newPrivateKey, ...rest } = newState;
      setAuth(rest);
      setPrivateKeyLocal(newPrivateKey);
    } else {
      // setAuth doesn't allow privateKey, so set it separately
      const { privateKey: newPrivateKey, ...rest } = state;
      setAuth(rest);
      setPrivateKeyLocal(newPrivateKey);
    }
  }, [setAuth, privateKey]);

  const checkAuthStatus = async (password?: string): Promise<{ requiresPassword: boolean }> => {
    if (AuthService.isAuthenticated()) {
      const { publicKey, encryptedPrivateKey, method } = AuthService.getStoredAuthData();

      let privateKey: string | null = null;
      let requiresPassword = false;

      // Decrypt private key if available (AuthService handles in-memory cache internally)
      if (encryptedPrivateKey) {
        try {
          privateKey = await AuthService.decryptStoredPrivateKey(password);

          // If decryption succeeded but we have a password-protected key and no private key, something is wrong
          if (AuthService.requiresPassword() && !privateKey) {
            requiresPassword = true;
          }
        } catch (error) {
          console.error('Failed to decrypt private key:', error);
          // If password is required
          if (AuthService.requiresPassword()) {
            if (!password) {
              // Password not provided
              requiresPassword = true;
            } else {
              // Password was provided but incorrect - throw error to indicate wrong password
              throw new Error('The password you entered is incorrect. Please check your password and try again.');
            }
            privateKey = null;
          } else {
            // Device key mode - re-throw the error
            throw error;
          }
        }
      } else {
        // Legacy format or no private key
        const legacyKey = localStorage.getItem(STORAGE_KEYS.PRIVATE_KEY) || sessionStorage.getItem(STORAGE_KEYS.PRIVATE_KEY);
        if (legacyKey && !legacyKey.startsWith('{')) {
          // Legacy plaintext - migrate automatically
          console.log('Migrating legacy plaintext private key to encrypted format...');
          try {
            // Encrypt the legacy key (device key mode, no password)
            await AuthService.storeAuthData(publicKey || '', legacyKey, method || 'nsec');
            console.log('Legacy key migrated successfully');
            // Now decrypt and use
            privateKey = await AuthService.decryptStoredPrivateKey();
          } catch (migrationError) {
            console.error('Failed to migrate legacy key:', migrationError);
            // Fallback: use plaintext temporarily
            privateKey = legacyKey;
          }
        }
      }

      // Set auth state - user should appear logged in even if private key isn't decrypted yet
      // This allows users with password-protected keys to browse while being prompted for password
      if (publicKey && method) {
        setAuth({
          isLoggedIn: true,
          publicKey,
          signInMethod: method as 'extension' | 'nsec' | 'externalSigner',
          userProfile: null,
          displayName: null
        });
        // Set privateKey in local state (not in store for security)
        setPrivateKeyLocal(privateKey); // May be null if password-protected and password not provided

        // Load user profile and follow suggestions (can be done without private key)
        if (nostrClientRef.current && publicKey) {
          loadUserProfile(publicKey);
          try {
            (async () => {
              const suggestions = await FollowService.getFollowSuggestions(
                nostrClientRef.current,
                publicKey
              );
              useUIStore.getState().setFollowSuggestions(suggestions);
            })();
          } catch {
            // Ignore errors loading follow suggestions
          }
        }
      }

      // Return whether password is still required (true if password-protected and no private key)
      return { requiresPassword: requiresPassword || (AuthService.requiresPassword() && !privateKey) };
    }
    return { requiresPassword: false };
  };

  const loadUserProfile = async (pubkey: string) => {
    if (!nostrClientRef.current || !pubkey) return;

    try {
      // Use ensureProfiles for centralized profile loading
      const profileMap = await ensureProfiles(
        getQueryClient(),
        nostrClientRef.current!,
        [pubkey]
      );
      const profile = profileMap.get(pubkey);

      if (profile) {
        const profileData = safeJson<Record<string, unknown>>(
          profile?.content || '{}',
          {}
        );
        const displayName =
          (profileData as any).display_name ||
          (profileData as any).displayName ||
          (profileData as any).name ||
          null;

        setProfile(profile || null);
        setDisplayName(displayName);

        // Call optional callback
        if (onProfileLoaded) {
          onProfileLoaded(pubkey);
        }
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const handleSignInExtension = async () => {
    try {
      const result = await AuthService.signInWithExtension();

      if (result.success && result.publicKey) {
        await AuthService.storeAuthData(
          result.publicKey,
          result.privateKey || null,
          'extension'
        );

        setAuth({
          isLoggedIn: true,
          publicKey: result.publicKey,
          signInMethod: 'extension',
          userProfile: null,
          displayName: null
        });
        setPrivateKeyLocal(result.privateKey || null);

        await loadUserProfile(result.publicKey);

        return { success: true };
      } else {
        console.error(
          'Extension sign in failed:',
          result.error || 'Extension sign in failed'
        );
        return {
          success: false,
          error: result.error || 'Extension sign in failed'
        };
      }
    } catch (error) {
      console.error('Extension sign in failed:', error);
      return { success: false, error: 'Extension sign in failed' };
    }
  };

  const handleSignInExternalSigner = async () => {
    try {
      const result = await AuthService.signInWithExternalSigner();

      if (!result.success) {
        console.error(
          'External signer failed:',
          result.error || 'External signer failed'
        );
        return {
          success: false,
          error: result.error || 'External signer failed'
        };
      }
      // Note: This will redirect the page, so the component will unmount
      return { success: true };
    } catch (error) {
      console.error('External signer failed:', error);
      return { success: false, error: 'External signer failed' };
    }
  };

  const handleContinueWithNsec = async (nsec: string, password?: string) => {
    try {
      const result = await AuthService.signInWithNsec(nsec);

      if (result.success && result.publicKey) {
        await AuthService.storeAuthData(
          result.publicKey,
          result.privateKey || null,
          'nsec',
          password
        );

        setAuth({
          isLoggedIn: true,
          publicKey: result.publicKey,
          signInMethod: 'nsec',
          userProfile: null,
          displayName: null
        });
        setPrivateKeyLocal(result.privateKey || null);

        await loadUserProfile(result.publicKey);

        // Close the login overlay after successful authentication
        // Note: This will be handled by the component
      } else {
        console.error('Nsec sign in failed:', result.error || 'Invalid nsec');
      }
    } catch (error) {
      console.error('Nsec sign in failed:', error);
      console.error('Invalid nsec');
    }
  };

  const handleLogout = () => {
    AuthService.clearAuthData();

    // Check if user wants to clear NWC on logout
    const clearNwcOnLogout = localStorage.getItem(STORAGE_KEYS.CLEAR_NWC_ON_LOGOUT);
    if (clearNwcOnLogout === 'true') {
      localStorage.removeItem(STORAGE_KEYS.NWC_CONNECTION_STRING);
      localStorage.removeItem(STORAGE_KEYS.NWC_CAPABILITIES);
    }

    clearAuth();
    setPrivateKeyLocal(null); // Clear privateKey from local state
  };

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus().catch(console.error);
  }, []);

  return {
    authState,
    setAuthState,
    checkAuthStatus,
    loadUserProfile,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleContinueWithNsec,
    handleLogout
  };
};

