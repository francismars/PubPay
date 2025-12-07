import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

interface ModalStore {
  // QR Scanner
  showQRScanner: boolean;
  openQRScanner: () => void;
  closeQRScanner: () => void;

  // Logged In Form
  showLoggedInForm: boolean;
  openLoggedInForm: () => void;
  closeLoggedInForm: () => void;

  // New Pay Note Form (also in shared UI store, but we'll use this for consistency)
  showNewPayNoteForm: boolean;
  isPublishing: boolean;
  openNewPayNoteForm: () => void;
  closeNewPayNoteForm: () => void;
  setIsPublishing: (publishing: boolean) => void;

  // Login Form - NSEC Group
  showNsecGroup: boolean;
  nsecInput: string;
  nsecPassword: string;
  openNsecGroup: () => void;
  closeNsecGroup: () => void;
  setNsecInput: (input: string) => void;
  setNsecPassword: (password: string) => void;
  resetNsecForm: () => void;

  // Login Form - Recovery Group
  showRecoveryGroup: boolean;
  recoveryMnemonic: string;
  recoveryPassword: string;
  openRecoveryGroup: () => void;
  closeRecoveryGroup: () => void;
  setRecoveryMnemonic: (mnemonic: string) => void;
  setRecoveryPassword: (password: string) => void;
  resetRecoveryForm: () => void;

  // Password Prompt
  showPasswordPrompt: boolean;
  openPasswordPrompt: () => void;
  closePasswordPrompt: () => void;

  // Extension/Signer Availability
  extensionAvailable: boolean;
  externalSignerAvailable: boolean;
  externalSignerLoading: boolean;
  setExtensionAvailable: (available: boolean) => void;
  setExternalSignerAvailable: (available: boolean) => void;
  setExternalSignerLoading: (loading: boolean) => void;

  // Reset all modals
  resetAllModals: () => void;
}

export const useModalStore = create<ModalStore>()(
  devtools(
    set => ({
  // QR Scanner
  showQRScanner: false,
  openQRScanner: () => set({ showQRScanner: true }),
  closeQRScanner: () => set({ showQRScanner: false }),

  // Logged In Form
  showLoggedInForm: false,
  openLoggedInForm: () => set({ showLoggedInForm: true }),
  closeLoggedInForm: () => set({ showLoggedInForm: false }),

  // New Pay Note Form
  showNewPayNoteForm: false,
  isPublishing: false,
  openNewPayNoteForm: () => set({ showNewPayNoteForm: true }),
  closeNewPayNoteForm: () => set({ showNewPayNoteForm: false, isPublishing: false }),
  setIsPublishing: (publishing: boolean) => set({ isPublishing: publishing }),

  // NSEC Group
  showNsecGroup: false,
  nsecInput: '',
  nsecPassword: '',
  openNsecGroup: () => set({ showNsecGroup: true }),
  closeNsecGroup: () => set({ showNsecGroup: false }),
  setNsecInput: (input: string) => set({ nsecInput: input }),
  setNsecPassword: (password: string) => set({ nsecPassword: password }),
  resetNsecForm: () => set({ nsecInput: '', nsecPassword: '', showNsecGroup: false }),

  // Recovery Group
  showRecoveryGroup: false,
  recoveryMnemonic: '',
  recoveryPassword: '',
  openRecoveryGroup: () => set({ showRecoveryGroup: true }),
  closeRecoveryGroup: () => set({ showRecoveryGroup: false }),
  setRecoveryMnemonic: (mnemonic: string) => set({ recoveryMnemonic: mnemonic }),
  setRecoveryPassword: (password: string) => set({ recoveryPassword: password }),
  resetRecoveryForm: () =>
    set({ recoveryMnemonic: '', recoveryPassword: '', showRecoveryGroup: false }),

  // Password Prompt
  showPasswordPrompt: false,
  openPasswordPrompt: () => set({ showPasswordPrompt: true }),
  closePasswordPrompt: () => set({ showPasswordPrompt: false }),

  // Extension/Signer Availability
  extensionAvailable: true,
  externalSignerAvailable: true,
  externalSignerLoading: false,
  setExtensionAvailable: (available: boolean) => set({ extensionAvailable: available }),
  setExternalSignerAvailable: (available: boolean) =>
    set({ externalSignerAvailable: available }),
  setExternalSignerLoading: (loading: boolean) => set({ externalSignerLoading: loading }),

  // Reset all modals
  resetAllModals: () =>
    set({
      showQRScanner: false,
      showLoggedInForm: false,
      showNewPayNoteForm: false,
      isPublishing: false,
      showNsecGroup: false,
      nsecInput: '',
      nsecPassword: '',
      showRecoveryGroup: false,
      recoveryMnemonic: '',
      recoveryPassword: '',
      showPasswordPrompt: false
    })
    }),
    { name: 'ModalStore' }
  )
);

// Optimized selector hooks
export const useModalState = () =>
  useModalStore(
    useShallow(state => ({
      showQRScanner: state.showQRScanner,
      showLoggedInForm: state.showLoggedInForm,
      showNewPayNoteForm: state.showNewPayNoteForm,
      isPublishing: state.isPublishing,
      showNsecGroup: state.showNsecGroup,
      nsecInput: state.nsecInput,
      nsecPassword: state.nsecPassword,
      showRecoveryGroup: state.showRecoveryGroup,
      recoveryMnemonic: state.recoveryMnemonic,
      recoveryPassword: state.recoveryPassword,
      showPasswordPrompt: state.showPasswordPrompt,
      extensionAvailable: state.extensionAvailable,
      externalSignerAvailable: state.externalSignerAvailable,
      externalSignerLoading: state.externalSignerLoading
    }))
  );

export const useModalActions = () =>
  useModalStore(
    useShallow(state => ({
      openQRScanner: state.openQRScanner,
      closeQRScanner: state.closeQRScanner,
      openLoggedInForm: state.openLoggedInForm,
      closeLoggedInForm: state.closeLoggedInForm,
      openNewPayNoteForm: state.openNewPayNoteForm,
      closeNewPayNoteForm: state.closeNewPayNoteForm,
      setIsPublishing: state.setIsPublishing,
      openNsecGroup: state.openNsecGroup,
      closeNsecGroup: state.closeNsecGroup,
      setNsecInput: state.setNsecInput,
      setNsecPassword: state.setNsecPassword,
      resetNsecForm: state.resetNsecForm,
      openRecoveryGroup: state.openRecoveryGroup,
      closeRecoveryGroup: state.closeRecoveryGroup,
      setRecoveryMnemonic: state.setRecoveryMnemonic,
      setRecoveryPassword: state.setRecoveryPassword,
      resetRecoveryForm: state.resetRecoveryForm,
      openPasswordPrompt: state.openPasswordPrompt,
      closePasswordPrompt: state.closePasswordPrompt,
      setExtensionAvailable: state.setExtensionAvailable,
      setExternalSignerAvailable: state.setExternalSignerAvailable,
      setExternalSignerLoading: state.setExternalSignerLoading,
      resetAllModals: state.resetAllModals
    }))
  );

// Individual hooks for single values
export const useShowQRScanner = () => useModalStore(state => state.showQRScanner);
export const useShowNewPayNoteForm = () => useModalStore(state => state.showNewPayNoteForm);
export const useIsPublishing = () => useModalStore(state => state.isPublishing);
export const useShowPasswordPrompt = () => useModalStore(state => state.showPasswordPrompt);

/**
 * Common composite hooks for frequently used patterns
 */

// Modal visibility states (all modals)
export const useModalVisibility = () =>
  useModalStore(
    useShallow(state => ({
      showQRScanner: state.showQRScanner,
      showLoggedInForm: state.showLoggedInForm,
      showNewPayNoteForm: state.showNewPayNoteForm,
      showNsecGroup: state.showNsecGroup,
      showRecoveryGroup: state.showRecoveryGroup,
      showPasswordPrompt: state.showPasswordPrompt
    }))
  );

// Login form state (NSEC and Recovery groups)
export const useLoginFormState = () =>
  useModalStore(
    useShallow(state => ({
      showNsecGroup: state.showNsecGroup,
      nsecInput: state.nsecInput,
      nsecPassword: state.nsecPassword,
      showRecoveryGroup: state.showRecoveryGroup,
      recoveryMnemonic: state.recoveryMnemonic,
      recoveryPassword: state.recoveryPassword
    }))
  );

// Login form actions
export const useLoginFormActions = () =>
  useModalStore(
    useShallow(state => ({
      openNsecGroup: state.openNsecGroup,
      closeNsecGroup: state.closeNsecGroup,
      setNsecInput: state.setNsecInput,
      setNsecPassword: state.setNsecPassword,
      resetNsecForm: state.resetNsecForm,
      openRecoveryGroup: state.openRecoveryGroup,
      closeRecoveryGroup: state.closeRecoveryGroup,
      setRecoveryMnemonic: state.setRecoveryMnemonic,
      setRecoveryPassword: state.setRecoveryPassword,
      resetRecoveryForm: state.resetRecoveryForm
    }))
  );

// Extension/Signer availability state
export const useExtensionAvailability = () =>
  useModalStore(
    useShallow(state => ({
      extensionAvailable: state.extensionAvailable,
      externalSignerAvailable: state.externalSignerAvailable,
      externalSignerLoading: state.externalSignerLoading
    }))
  );

// New Pay Note Form state and actions
export const useNewPayNoteForm = () =>
  useModalStore(
    useShallow(state => ({
      show: state.showNewPayNoteForm,
      isPublishing: state.isPublishing,
      open: state.openNewPayNoteForm,
      close: state.closeNewPayNoteForm,
      setIsPublishing: state.setIsPublishing
    }))
  );

