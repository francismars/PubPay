import { useEffect, useRef } from 'react';
import { AuthService, BlossomService, FollowService, useUIStore, getQueryClient } from '@pubpay/shared-services';
import { verifyEvent } from 'nostr-tools';
import { STORAGE_KEYS, TIMEOUT } from '../constants';
import type { NostrClient, ZapService } from '@pubpay/shared-services';
import type { AuthState } from '../types/postTypes';

interface UseExternalSignerParams {
  nostrClientRef: React.MutableRefObject<NostrClient | null>;
  zapServiceRef: React.MutableRefObject<ZapService | null>;
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  loadUserProfile: (publicKey: string) => Promise<void>;
}

export const useExternalSigner = ({
  nostrClientRef,
  zapServiceRef,
  authState,
  setAuthState,
  loadUserProfile
}: UseExternalSignerParams) => {
  useEffect(() => {
    // Handle external signer return
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // First, process sign-in return (npub from clipboard)
        const result = await AuthService.handleExternalSignerReturn();
        if (result.success && result.publicKey) {
          await AuthService.storeAuthData(result.publicKey, null, 'externalSigner');

          setAuthState({
            isLoggedIn: true,
            publicKey: result.publicKey,
            privateKey: null,
            signInMethod: 'externalSigner',
            userProfile: null,
            displayName: null
          });

          await loadUserProfile(result.publicKey);
          // Load follow suggestions after login via external signer
          try {
            const suggestions = await FollowService.getFollowSuggestions(
              nostrClientRef.current!,
              result.publicKey
            );
            useUIStore.getState().setFollowSuggestions(suggestions);
          } catch {
            // Ignore errors loading follow suggestions
          }
        }

        // Then, handle pending external-signer operations that require signature
        try {
          // Ensure page has focus to allow clipboard reads
          while (!document.hasFocus()) {
            await new Promise(resolve => setTimeout(resolve, TIMEOUT.SHORT_DELAY));
          }

          // Helper to read signature from clipboard with retries and prompt fallback
          const readClipboard = async (): Promise<string | null> => {
            // Try up to 10 times with small delay to allow clipboard to populate
            for (let i = 0; i < 10; i++) {
              try {
                const text = await navigator.clipboard.readText();
                const val = (text || '').trim();
                if (val) return val;
              } catch {
                // Ignore clipboard read errors
              }
              await new Promise(resolve => setTimeout(resolve, TIMEOUT.SHORT_DELAY));
            }
            // Last resort: prompt user to paste manually (non-blocking UX is preferred, but this ensures progress)
            try {
              const manual = window.prompt('Paste signature from signer');
              if (manual && manual.trim()) return manual.trim();
            } catch {
              // Ignore prompt errors
            }
            return null;
          };

          // Handle SignKind1: finalize and publish a note
          try {
            const kind1Raw = sessionStorage.getItem(STORAGE_KEYS.SIGN_KIND1);
            if (kind1Raw) {
              const payload = JSON.parse(kind1Raw) as { event?: any };
              sessionStorage.removeItem(STORAGE_KEYS.SIGN_KIND1);

              if (payload && payload.event) {
                const sig = await readClipboard();
                if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                  console.error(
                    'No valid signature found in clipboard for note'
                  );
                  return;
                }

                const eventSigned = { ...payload.event, sig };
                const verified = verifyEvent(eventSigned);
                if (!verified) {
                  console.error('Invalid signed event (note)');
                  return;
                }

                if (nostrClientRef.current) {
                  await nostrClientRef.current.publishEvent(eventSigned);
                  console.log('Note published via external signer');
                }
              }
            }
          } catch (e) {
            console.warn('Error handling SignKind1 return:', e);
          }

          // Handle SignZapEvent: finalize and proceed to get invoice/pay
          try {
            const zapRaw = sessionStorage.getItem(STORAGE_KEYS.SIGN_ZAP_EVENT);
            if (zapRaw) {
              const payload = JSON.parse(zapRaw) as {
                callback: string;
                amount: number;
                lud16: string;
                event: any;
                id: string;
              };
              sessionStorage.removeItem(STORAGE_KEYS.SIGN_ZAP_EVENT);

              const sig = await readClipboard();
              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error('No valid signature found in clipboard for zap');
                return;
              }

              const eventSigned = { ...payload.event, sig };
              const verified = verifyEvent(eventSigned);
              if (!verified) {
                console.error('Invalid signed event (zap)');
                return;
              }

              if (zapServiceRef.current) {
                await zapServiceRef.current.getInvoiceandPay(
                  payload.callback,
                  payload.amount,
                  eventSigned,
                  payload.lud16,
                  payload.id
                );
              }
            }
          } catch (e) {
            console.warn('Error handling SignZapEvent return:', e);
          }

          // Handle SignProfileUpdate: finalize and publish profile update
          try {
            const profileRaw = sessionStorage.getItem(STORAGE_KEYS.SIGN_PROFILE_UPDATE);
            if (profileRaw) {
              console.log(
                'Found SignProfileUpdate data, processing profile update...'
              );
              const eventTemplate = JSON.parse(profileRaw);
              sessionStorage.removeItem(STORAGE_KEYS.SIGN_PROFILE_UPDATE);

              console.log(
                'Reading signature from clipboard for profile update...'
              );
              let sig = await readClipboard();
              if (sig) {
                sig = sig.trim();
              }
              console.log(
                'Signature read, length:',
                sig?.length,
                'first 20 chars:',
                sig?.substring(0, 20)
              );

              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error(
                  'No valid signature found in clipboard for profile update. Signature:',
                  sig?.substring(0, 40)
                );
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'No valid signature found. Please try saving again.',
                      'error',
                      true
                    );
                } catch {
                  // Ignore toast errors
                }
                return;
              }

              const eventSigned = { ...eventTemplate, sig };
              const verified = verifyEvent(eventSigned);
              if (!verified) {
                console.error('Invalid signed event (profile update)');
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'Invalid signature. Please try saving again.',
                      'error',
                      true
                    );
                } catch {
                  // Ignore toast errors
                }
                return;
              }

              console.log('Event verified, publishing profile update...');
              if (nostrClientRef.current) {
                await nostrClientRef.current.publishEvent(eventSigned);
                console.log('Profile updated via external signer');

                // Show success toast
                try {
                  const { useUIStore } = await import(
                    '@pubpay/shared-services'
                  );
                  useUIStore
                    .getState()
                    .updateToast(
                      'Profile updated successfully!',
                      'success',
                      false
                    );
                  setTimeout(() => {
                    try {
                      useUIStore.getState().closeToast();
                    } catch {
                      // Ignore toast close errors
                    }
                  }, 2000);
                } catch {
                  // Ignore toast errors
                }

                // Invalidate cache and reload profile to reflect changes
                if (authState.publicKey) {
                  const pubkey = authState.publicKey;
                  const queryClient = getQueryClient();
                  queryClient.removeQueries({ queryKey: ['profile', pubkey] });
                  queryClient.invalidateQueries({
                    queryKey: ['profile', pubkey]
                  });
                  setTimeout(async () => {
                    await loadUserProfile(pubkey);
                  }, 500);
                }

                // Wait a bit for profile to reload, then navigate
                await new Promise(resolve => setTimeout(resolve, TIMEOUT.PROFILE_LOAD_DELAY));
                // Navigate using pushState to avoid page reload
                window.history.pushState({}, '', '/profile');
                // Trigger popstate to reload the page component
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }
          } catch (e) {
            console.error('Error handling SignProfileUpdate return:', e);
            try {
              const { useUIStore } = await import('@pubpay/shared-services');
              useUIStore
                .getState()
                .updateToast(
                  `Failed to save profile: ${e instanceof Error ? e.message : 'Unknown error'}`,
                  'error',
                  true
                );
            } catch {
              // Ignore toast errors
            }
          }

          // Handle BlossomAuth: complete file upload
          try {
            const blossomData = sessionStorage.getItem(STORAGE_KEYS.BLOSSOM_AUTH);
            if (blossomData) {
              console.log('Found BlossomAuth data, processing upload...');

              console.log('Reading signature from clipboard...');
              let sig = await readClipboard();
              if (sig) {
                sig = sig.trim();
              }
              console.log(
                'Signature read, length:',
                sig?.length,
                'first 20 chars:',
                sig?.substring(0, 20)
              );

              if (!sig || !/^([0-9a-f]{128})$/i.test(sig)) {
                console.error(
                  'No valid signature found in clipboard for Blossom upload. Signature:',
                  sig?.substring(0, 40)
                );
                window.dispatchEvent(
                  new CustomEvent('blossomUploadError', {
                    detail: {
                      error:
                        'No valid signature found in clipboard. Expected 128 hex characters.'
                    }
                  })
                );
                return;
              }

              console.log('Completing external signer upload...');
              const imageUrl =
                await BlossomService.completeExternalSignerUpload(sig);

              if (imageUrl) {
                console.log(
                  'Blossom upload completed via external signer:',
                  imageUrl
                );
                // Dispatch custom event with the uploaded image URL
                window.dispatchEvent(
                  new CustomEvent('blossomUploadComplete', {
                    detail: { imageUrl }
                  })
                );
              } else {
                console.warn('Blossom upload returned null');
                window.dispatchEvent(
                  new CustomEvent('blossomUploadError', {
                    detail: { error: 'Upload returned no result' }
                  })
                );
              }
            }
          } catch (e) {
            console.error('Error handling BlossomAuth return:', e);
            // Dispatch error event
            window.dispatchEvent(
              new CustomEvent('blossomUploadError', {
                detail: {
                  error: e instanceof Error ? e.message : 'Unknown error'
                }
              })
            );
          }
        } catch (e) {
          console.warn('External signer return processing error:', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Respond to NewPayNoteOverlay follow suggestions request
    const handleRequestFollowSuggestions = async () => {
      try {
        const auth = AuthService.getStoredAuthData
          ? AuthService.getStoredAuthData()
          : null;
        const pubkey = auth?.publicKey;
        const client = nostrClientRef.current;
        if (!client || !pubkey) return;
        const suggestions = await FollowService.getFollowSuggestions(
          client,
          pubkey
        );
        useUIStore.getState().setFollowSuggestions(suggestions);
        try {
          window.dispatchEvent(
            new CustomEvent('followingUpdated', {
              detail: { suggestions }
            })
          );
        } catch {
          // Ignore event dispatch errors
        }
      } catch {
        // Ignore follow suggestions errors
      }
    };
    window.addEventListener(
      'requestFollowSuggestions',
      handleRequestFollowSuggestions
    );

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(
        'requestFollowSuggestions',
        handleRequestFollowSuggestions
      );
    };
  }, [nostrClientRef, zapServiceRef, authState, setAuthState, loadUserProfile]);
};

