import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PubPayPost } from '../types/postTypes';

type FeedType = 'global' | 'following';

interface PostStore {
  // UI-reactive state
  posts: PubPayPost[];
  followingPosts: PubPayPost[];
  replies: PubPayPost[];
  activeFeed: FeedType;
  isLoading: boolean;
  isLoadingMore: boolean;
  nostrReady: boolean;
  paymentErrors: Map<string, string>;
  singleNoteMode: boolean;
  singleNoteId: string;

  // Actions - Posts
  setPosts: (posts: PubPayPost[]) => void;
  setFollowingPosts: (posts: PubPayPost[]) => void;
  setReplies: (replies: PubPayPost[]) => void;
  addPost: (post: PubPayPost) => void;
  addFollowingPost: (post: PubPayPost) => void;
  addReply: (reply: PubPayPost) => void;
  updatePost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateFollowingPost: (postId: string, updates: Partial<PubPayPost>) => void;
  updateReply: (replyId: string, updates: Partial<PubPayPost>) => void;
  removePost: (postId: string) => void;
  removeFollowingPost: (postId: string) => void;
  removeReply: (replyId: string) => void;
  clearPosts: () => void;
  clearFollowingPosts: () => void;
  clearReplies: () => void;
  clearAllPosts: () => void;

  // Actions - Feed
  setActiveFeed: (feed: FeedType) => void;

  // Actions - Loading
  setIsLoading: (loading: boolean) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setNostrReady: (ready: boolean) => void;

  // Actions - Payment Errors
  setPaymentError: (postId: string, error: string | null) => void;
  clearPaymentError: (postId: string) => void;
  clearPaymentErrors: () => void;

  // Actions - Single Note Mode
  setSingleNoteMode: (mode: boolean, noteId?: string) => void;
  clearSingleNoteMode: () => void;

  // Computed/derived state helpers (getters)
  getAllPosts: () => PubPayPost[];
  getCurrentFeedPosts: () => PubPayPost[];
  getPostById: (postId: string) => PubPayPost | undefined;
  getReplyById: (replyId: string) => PubPayPost | undefined;
}

export const usePostStore = create<PostStore>((set, get) => ({
  // Initial state
  posts: [],
  followingPosts: [],
  replies: [],
  activeFeed: 'global',
  isLoading: false,
  isLoadingMore: false,
  nostrReady: false,
  paymentErrors: new Map(),
  singleNoteMode: false,
  singleNoteId: '',

  // Actions - Posts
  setPosts: posts => set({ posts }),
  setFollowingPosts: posts => set({ followingPosts: posts }),
  setReplies: replies => set({ replies }),

  addPost: post =>
    set(state => ({
      posts: [post, ...state.posts]
    })),

  addFollowingPost: post =>
    set(state => ({
      followingPosts: [post, ...state.followingPosts]
    })),

  addReply: reply =>
    set(state => ({
      replies: [...state.replies, reply]
    })),

  updatePost: (postId, updates) =>
    set(state => ({
      posts: state.posts.map(post =>
        post.id === postId ? { ...post, ...updates } : post
      )
    })),

  updateFollowingPost: (postId, updates) =>
    set(state => ({
      followingPosts: state.followingPosts.map(post =>
        post.id === postId ? { ...post, ...updates } : post
      )
    })),

  updateReply: (replyId, updates) =>
    set(state => ({
      replies: state.replies.map(reply =>
        reply.id === replyId ? { ...reply, ...updates } : reply
      )
    })),

  removePost: postId =>
    set(state => ({
      posts: state.posts.filter(post => post.id !== postId)
    })),

  removeFollowingPost: postId =>
    set(state => ({
      followingPosts: state.followingPosts.filter(post => post.id !== postId)
    })),

  removeReply: replyId =>
    set(state => ({
      replies: state.replies.filter(reply => reply.id !== replyId)
    })),

  clearPosts: () => set({ posts: [] }),
  clearFollowingPosts: () => set({ followingPosts: [] }),
  clearReplies: () => set({ replies: [] }),
  clearAllPosts: () =>
    set({
      posts: [],
      followingPosts: [],
      replies: []
    }),

  // Actions - Feed
  setActiveFeed: feed => set({ activeFeed: feed }),

  // Actions - Loading
  setIsLoading: loading => set({ isLoading: loading }),
  setIsLoadingMore: loading => set({ isLoadingMore: loading }),
  setNostrReady: ready => set({ nostrReady: ready }),

  // Actions - Payment Errors
  setPaymentError: (postId, error) =>
    set(state => {
      const newErrors = new Map(state.paymentErrors);
      if (error) {
        newErrors.set(postId, error);
      } else {
        newErrors.delete(postId);
      }
      return { paymentErrors: newErrors };
    }),

  clearPaymentError: postId =>
    set(state => {
      const newErrors = new Map(state.paymentErrors);
      newErrors.delete(postId);
      return { paymentErrors: newErrors };
    }),

  clearPaymentErrors: () => set({ paymentErrors: new Map() }),

  // Actions - Single Note Mode
  setSingleNoteMode: (mode: boolean, noteId = '') =>
    set({ singleNoteMode: mode, singleNoteId: noteId }),
  clearSingleNoteMode: () => set({ singleNoteMode: false, singleNoteId: '' }),

  // Computed/derived state helpers
  getAllPosts: () => {
    const state = get();
    return [...state.posts, ...state.followingPosts, ...state.replies];
  },

  getCurrentFeedPosts: () => {
    const state = get();
    return state.activeFeed === 'following' ? state.followingPosts : state.posts;
  },

  getPostById: postId => {
    const state = get();
    return (
      state.posts.find(p => p.id === postId) ||
      state.followingPosts.find(p => p.id === postId)
    );
  },

  getReplyById: replyId => {
    const state = get();
    return state.replies.find(r => r.id === replyId);
  }
}));

// Optimized selector hooks with shallow equality to prevent unnecessary re-renders

type PostStoreData = {
  posts: PubPayPost[];
  followingPosts: PubPayPost[];
  replies: PubPayPost[];
  activeFeed: FeedType;
  isLoading: boolean;
  isLoadingMore: boolean;
  nostrReady: boolean;
  paymentErrors: Map<string, string>;
  singleNoteMode: boolean;
  singleNoteId: string;
};

/**
 * Hook to get all post-related state in a single subscription
 * Uses shallow equality to prevent re-renders when object reference changes but values are the same
 */
export const usePostStoreData = (): PostStoreData =>
  usePostStore(
    useShallow(state => ({
      posts: state.posts,
      followingPosts: state.followingPosts,
      replies: state.replies,
      activeFeed: state.activeFeed,
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      nostrReady: state.nostrReady,
      paymentErrors: state.paymentErrors,
      singleNoteMode: state.singleNoteMode,
      singleNoteId: state.singleNoteId
    }))
  );

/**
 * Hook to get only post arrays (posts, followingPosts, replies)
 */
export const usePosts = () =>
  usePostStore(
    useShallow(state => ({
      posts: state.posts,
      followingPosts: state.followingPosts,
      replies: state.replies
    }))
  );

/**
 * Hook to get feed-related state (activeFeed, loading states)
 */
export const useFeedState = () =>
  usePostStore(
    useShallow(state => ({
      activeFeed: state.activeFeed,
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      nostrReady: state.nostrReady
    }))
  );

type PostStoreActions = Pick<
  PostStore,
  | 'setPosts'
  | 'setFollowingPosts'
  | 'setReplies'
  | 'addPost'
  | 'addFollowingPost'
  | 'addReply'
  | 'updatePost'
  | 'updateFollowingPost'
  | 'updateReply'
  | 'removePost'
  | 'removeFollowingPost'
  | 'removeReply'
  | 'clearPosts'
  | 'clearFollowingPosts'
  | 'clearReplies'
  | 'clearAllPosts'
  | 'setActiveFeed'
  | 'setIsLoading'
  | 'setIsLoadingMore'
  | 'setNostrReady'
  | 'setPaymentError'
  | 'clearPaymentError'
  | 'clearPaymentErrors'
  | 'setSingleNoteMode'
  | 'clearSingleNoteMode'
>;

/**
 * Hook to get all post store actions
 * Actions are stable references, so shallow comparison is still beneficial
 */
export const usePostActions = (): PostStoreActions =>
  usePostStore(
    useShallow(state => ({
      setPosts: state.setPosts,
      setFollowingPosts: state.setFollowingPosts,
      setReplies: state.setReplies,
      addPost: state.addPost,
      addFollowingPost: state.addFollowingPost,
      addReply: state.addReply,
      updatePost: state.updatePost,
      updateFollowingPost: state.updateFollowingPost,
      updateReply: state.updateReply,
      removePost: state.removePost,
      removeFollowingPost: state.removeFollowingPost,
      removeReply: state.removeReply,
      clearPosts: state.clearPosts,
      clearFollowingPosts: state.clearFollowingPosts,
      clearReplies: state.clearReplies,
      clearAllPosts: state.clearAllPosts,
      setActiveFeed: state.setActiveFeed,
      setIsLoading: state.setIsLoading,
      setIsLoadingMore: state.setIsLoadingMore,
      setNostrReady: state.setNostrReady,
      setPaymentError: state.setPaymentError,
      clearPaymentError: state.clearPaymentError,
      clearPaymentErrors: state.clearPaymentErrors,
      setSingleNoteMode: state.setSingleNoteMode,
      clearSingleNoteMode: state.clearSingleNoteMode
    }))
  );

/**
 * Individual selector hooks for single values (when you only need one field)
 * These are still optimized as they only subscribe to one field
 */
export const usePostsList = () => usePostStore(state => state.posts);
export const useFollowingPostsList = () => usePostStore(state => state.followingPosts);
export const useRepliesList = () => usePostStore(state => state.replies);
export const useActiveFeed = () => usePostStore(state => state.activeFeed);
export const useIsLoading = () => usePostStore(state => state.isLoading);
export const useIsLoadingMore = () => usePostStore(state => state.isLoadingMore);
export const useNostrReady = () => usePostStore(state => state.nostrReady);
export const usePaymentErrors = () => usePostStore(state => state.paymentErrors);
export const useSingleNoteMode = () => usePostStore(state => state.singleNoteMode);
export const useSingleNoteId = () => usePostStore(state => state.singleNoteId);

/**
 * Common composite hooks for frequently used patterns
 */

// Loading states together
export const useLoadingStates = () =>
  usePostStore(
    useShallow(state => ({
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      nostrReady: state.nostrReady
    }))
  );

// Post management actions (most commonly used)
export const usePostManagementActions = () =>
  usePostStore(
    useShallow(state => ({
      addPost: state.addPost,
      updatePost: state.updatePost,
      removePost: state.removePost,
      clearPosts: state.clearPosts
    }))
  );

// Feed management actions
export const useFeedManagementActions = () =>
  usePostStore(
    useShallow(state => ({
      setActiveFeed: state.setActiveFeed,
      setPosts: state.setPosts,
      setFollowingPosts: state.setFollowingPosts,
      clearAllPosts: state.clearAllPosts
    }))
  );

// Payment error management
export const usePaymentErrorActions = () =>
  usePostStore(
    useShallow(state => ({
      setPaymentError: state.setPaymentError,
      clearPaymentError: state.clearPaymentError,
      clearPaymentErrors: state.clearPaymentErrors
    }))
  );

// Get a single post by ID (useful utility)
export const usePostById = (postId: string) =>
  usePostStore(state => {
    const post = state.posts.find(p => p.id === postId);
    if (post) return post;
    return state.followingPosts.find(p => p.id === postId);
  });

// Get payment error for a specific post
export const usePaymentErrorForPost = (postId: string) =>
  usePostStore(state => state.paymentErrors.get(postId));

// Single note mode state and actions
export const useSingleNoteState = () =>
  usePostStore(
    useShallow(state => ({
      singleNoteMode: state.singleNoteMode,
      singleNoteId: state.singleNoteId
    }))
  );

