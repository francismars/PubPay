import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PubPayPost } from '../types/postTypes';

interface ProfileData {
  displayName: string;
  bio: string;
  website: string;
  banner: string;
  picture: string;
  lightningAddress: string;
  nip05: string;
}

interface ActivityStats {
  paynotesCreated: number;
  pubpaysReceived: number;
  zapsReceived: number;
}

interface ProfileStore {
  // Current profile being viewed (keyed by pubkey)
  currentProfilePubkey: string | null;

  // Profile data
  profileData: ProfileData;
  setProfileData: (data: Partial<ProfileData> | ((prev: ProfileData) => Partial<ProfileData>)) => void;
  resetProfileData: () => void;

  // NIP-05 validation
  nip05Valid: boolean | null;
  nip05Validating: boolean;
  setNip05Valid: (valid: boolean | null) => void;
  setNip05Validating: (validating: boolean) => void;

  // Loading states
  isLoadingProfile: boolean;
  profileError: string | null;
  isInitialLoad: boolean;
  loadStartTime: number | null;
  profileDataLoaded: boolean;
  setIsLoadingProfile: (loading: boolean) => void;
  setProfileError: (error: string | null) => void;
  setIsInitialLoad: (isInitial: boolean) => void;
  setLoadStartTime: (time: number | null) => void;
  setProfileDataLoaded: (loaded: boolean) => void;

  // Activity stats
  activityLoading: boolean;
  activityStats: ActivityStats;
  setActivityLoading: (loading: boolean) => void;
  setActivityStats: (stats: Partial<ActivityStats>) => void;
  resetActivityStats: () => void;

  // User paynotes
  userPaynotes: PubPayPost[];
  isLoadingPaynotes: boolean;
  hasMorePaynotes: boolean;
  paynotesUntil: number | undefined;
  setUserPaynotes: (paynotes: PubPayPost[] | ((prev: PubPayPost[]) => PubPayPost[])) => void;
  addUserPaynotes: (paynotes: PubPayPost[]) => void;
  updateUserPaynote: (postId: string, updates: Partial<PubPayPost>) => void;
  setIsLoadingPaynotes: (loading: boolean) => void;
  setHasMorePaynotes: (hasMore: boolean) => void;
  setPaynotesUntil: (until: number | undefined) => void;
  clearUserPaynotes: () => void;

  // Follow state
  isFollowing: boolean;
  followBusy: boolean;
  setIsFollowing: (following: boolean) => void;
  setFollowBusy: (busy: boolean) => void;

  // Set current profile (resets all state for new profile)
  setCurrentProfile: (pubkey: string | null) => void;

  // Reset all state
  reset: () => void;
}

const initialProfileData: ProfileData = {
  displayName: '',
  bio: '',
  website: '',
  banner: '',
  picture: '',
  lightningAddress: '',
  nip05: ''
};

const initialActivityStats: ActivityStats = {
  paynotesCreated: 0,
  pubpaysReceived: 0,
  zapsReceived: 0
};

export const useProfileStore = create<ProfileStore>((set, get) => ({
  // Current profile
  currentProfilePubkey: null,

  // Profile data
  profileData: initialProfileData,
  setProfileData: (data: Partial<ProfileData> | ((prev: ProfileData) => Partial<ProfileData>)) =>
    set(state => ({
      profileData: {
        ...state.profileData,
        ...(typeof data === 'function' ? data(state.profileData) : data)
      }
    })),
  resetProfileData: () => set({ profileData: initialProfileData }),

  // NIP-05 validation
  nip05Valid: null,
  nip05Validating: false,
  setNip05Valid: (valid: boolean | null) => set({ nip05Valid: valid }),
  setNip05Validating: (validating: boolean) => set({ nip05Validating: validating }),

  // Loading states
  isLoadingProfile: false,
  profileError: null,
  isInitialLoad: true,
  loadStartTime: null,
  profileDataLoaded: false,
  setIsLoadingProfile: (loading: boolean) => set({ isLoadingProfile: loading }),
  setProfileError: (error: string | null) => set({ profileError: error }),
  setIsInitialLoad: (isInitial: boolean) => set({ isInitialLoad: isInitial }),
  setLoadStartTime: (time: number | null) => set({ loadStartTime: time }),
  setProfileDataLoaded: (loaded: boolean) => set({ profileDataLoaded: loaded }),

  // Activity stats
  activityLoading: false,
  activityStats: initialActivityStats,
  setActivityLoading: (loading: boolean) => set({ activityLoading: loading }),
  setActivityStats: (stats: Partial<ActivityStats>) =>
    set(state => ({
      activityStats: { ...state.activityStats, ...stats }
    })),
  resetActivityStats: () => set({ activityStats: initialActivityStats }),

  // User paynotes
  userPaynotes: [],
  isLoadingPaynotes: false,
  hasMorePaynotes: false,
  paynotesUntil: undefined,
  setUserPaynotes: (paynotes: PubPayPost[] | ((prev: PubPayPost[]) => PubPayPost[])) =>
    set(state => ({
      userPaynotes: typeof paynotes === 'function' ? paynotes(state.userPaynotes) : paynotes
    })),
  addUserPaynotes: (paynotes: PubPayPost[]) =>
    set(state => ({
      userPaynotes: [...state.userPaynotes, ...paynotes]
    })),
  updateUserPaynote: (postId: string, updates: Partial<PubPayPost>) =>
    set(state => ({
      userPaynotes: state.userPaynotes.map(post =>
        post.id === postId ? { ...post, ...updates } : post
      )
    })),
  setIsLoadingPaynotes: (loading: boolean) => set({ isLoadingPaynotes: loading }),
  setHasMorePaynotes: (hasMore: boolean) => set({ hasMorePaynotes: hasMore }),
  setPaynotesUntil: (until: number | undefined) => set({ paynotesUntil: until }),
  clearUserPaynotes: () =>
    set({
      userPaynotes: [],
      hasMorePaynotes: false,
      paynotesUntil: undefined
    }),

  // Follow state
  isFollowing: false,
  followBusy: false,
  setIsFollowing: (following: boolean) => set({ isFollowing: following }),
  setFollowBusy: (busy: boolean) => set({ followBusy: busy }),

  // Set current profile (resets state for new profile)
  setCurrentProfile: (pubkey: string | null) => {
    if (pubkey !== get().currentProfilePubkey) {
      set({
        currentProfilePubkey: pubkey,
        profileData: initialProfileData,
        nip05Valid: null,
        nip05Validating: false,
        isLoadingProfile: false,
        profileError: null,
        isInitialLoad: true,
        loadStartTime: null,
        profileDataLoaded: false,
        activityLoading: false,
        activityStats: initialActivityStats,
        userPaynotes: [],
        isLoadingPaynotes: false,
        hasMorePaynotes: false,
        paynotesUntil: undefined,
        isFollowing: false,
        followBusy: false
      });
    }
  },

  // Reset all state
  reset: () =>
    set({
      currentProfilePubkey: null,
      profileData: initialProfileData,
      nip05Valid: null,
      nip05Validating: false,
      isLoadingProfile: false,
      profileError: null,
      isInitialLoad: true,
      loadStartTime: null,
      profileDataLoaded: false,
      activityLoading: false,
      activityStats: initialActivityStats,
      userPaynotes: [],
      isLoadingPaynotes: false,
      hasMorePaynotes: false,
      paynotesUntil: undefined,
      isFollowing: false,
      followBusy: false
    })
}));

// Optimized selector hooks
export const useProfileState = () =>
  useProfileStore(
    useShallow(state => ({
      profileData: state.profileData,
      nip05Valid: state.nip05Valid,
      nip05Validating: state.nip05Validating,
      isLoadingProfile: state.isLoadingProfile,
      profileError: state.profileError,
      isInitialLoad: state.isInitialLoad,
      loadStartTime: state.loadStartTime,
      profileDataLoaded: state.profileDataLoaded,
      activityLoading: state.activityLoading,
      activityStats: state.activityStats,
      userPaynotes: state.userPaynotes,
      isLoadingPaynotes: state.isLoadingPaynotes,
      hasMorePaynotes: state.hasMorePaynotes,
      paynotesUntil: state.paynotesUntil,
      isFollowing: state.isFollowing,
      followBusy: state.followBusy,
      currentProfilePubkey: state.currentProfilePubkey
    }))
  );

export const useProfileActions = () =>
  useProfileStore(
    useShallow(state => ({
      setProfileData: state.setProfileData,
      resetProfileData: state.resetProfileData,
      setNip05Valid: state.setNip05Valid,
      setNip05Validating: state.setNip05Validating,
      setIsLoadingProfile: state.setIsLoadingProfile,
      setProfileError: state.setProfileError,
      setIsInitialLoad: state.setIsInitialLoad,
      setLoadStartTime: state.setLoadStartTime,
      setProfileDataLoaded: state.setProfileDataLoaded,
      setActivityLoading: state.setActivityLoading,
      setActivityStats: state.setActivityStats,
      resetActivityStats: state.resetActivityStats,
      setUserPaynotes: state.setUserPaynotes,
      addUserPaynotes: state.addUserPaynotes,
      updateUserPaynote: state.updateUserPaynote,
      setIsLoadingPaynotes: state.setIsLoadingPaynotes,
      setHasMorePaynotes: state.setHasMorePaynotes,
      setPaynotesUntil: state.setPaynotesUntil,
      clearUserPaynotes: state.clearUserPaynotes,
      setIsFollowing: state.setIsFollowing,
      setFollowBusy: state.setFollowBusy,
      setCurrentProfile: state.setCurrentProfile,
      reset: state.reset
    }))
  );

// Individual hooks for specific values
export const useProfileData = () => useProfileStore(state => state.profileData);
export const useUserPaynotes = () => useProfileStore(state => state.userPaynotes);
export const useActivityStats = () => useProfileStore(state => state.activityStats);
export const useIsFollowing = () => useProfileStore(state => state.isFollowing);

/**
 * Common composite hooks for frequently used patterns
 */

// Profile loading states
export const useProfileLoadingStates = () =>
  useProfileStore(
    useShallow(state => ({
      isLoadingProfile: state.isLoadingProfile,
      isLoadingPaynotes: state.isLoadingPaynotes,
      activityLoading: state.activityLoading,
      profileError: state.profileError,
      isInitialLoad: state.isInitialLoad,
      profileDataLoaded: state.profileDataLoaded
    }))
  );

// Profile data with validation state
export const useProfileDataWithValidation = () =>
  useProfileStore(
    useShallow(state => ({
      profileData: state.profileData,
      nip05Valid: state.nip05Valid,
      nip05Validating: state.nip05Validating
    }))
  );

// User paynotes with pagination state
export const useUserPaynotesWithPagination = () =>
  useProfileStore(
    useShallow(state => ({
      userPaynotes: state.userPaynotes,
      isLoadingPaynotes: state.isLoadingPaynotes,
      hasMorePaynotes: state.hasMorePaynotes,
      paynotesUntil: state.paynotesUntil
    }))
  );

// Follow state and actions
export const useFollowState = () =>
  useProfileStore(
    useShallow(state => ({
      isFollowing: state.isFollowing,
      followBusy: state.followBusy,
      setIsFollowing: state.setIsFollowing,
      setFollowBusy: state.setFollowBusy
    }))
  );

// Profile management actions (most commonly used)
export const useProfileManagementActions = () =>
  useProfileStore(
    useShallow(state => ({
      setProfileData: state.setProfileData,
      setUserPaynotes: state.setUserPaynotes,
      addUserPaynotes: state.addUserPaynotes,
      updateUserPaynote: state.updateUserPaynote,
      clearUserPaynotes: state.clearUserPaynotes,
      setCurrentProfile: state.setCurrentProfile
    }))
  );

