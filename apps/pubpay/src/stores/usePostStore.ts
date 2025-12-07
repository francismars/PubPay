import { create } from 'zustand';
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

