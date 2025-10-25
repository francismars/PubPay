// JukeboxStore - Jukebox specific state management
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { JukeboxTrack, User } from '../types/common';

export interface JukeboxState {
  // Track data
  tracks: Map<string, JukeboxTrack>;
  queue: JukeboxTrack[];
  currentTrack: JukeboxTrack | null;
  playedTracks: JukeboxTrack[];

  // Playback state
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  // Queue management
  maxQueueSize: number;
  isShuffled: boolean;
  repeatMode: 'none' | 'one' | 'all';

  // UI state
  showQueue: boolean;
  showRequestForm: boolean;
  isFullscreen: boolean;

  // Statistics
  totalTracksPlayed: number;
  totalPlayTime: number;
  mostRequestedArtist: string;
  mostRequestedTrack: string;

  // Actions
  addTrack: (track: JukeboxTrack) => void;
  removeTrack: (trackId: string) => void;
  addToQueue: (track: JukeboxTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  setCurrentTrack: (track: JukeboxTrack | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setMaxQueueSize: (size: number) => void;
  setShuffled: (shuffled: boolean) => void;
  setRepeatMode: (mode: JukeboxState['repeatMode']) => void;
  toggleQueue: () => void;
  toggleRequestForm: () => void;
  toggleFullscreen: () => void;
  updateStatistics: () => void;
  reset: () => void;
}

export const useJukeboxStore = create<JukeboxState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    tracks: new Map(),
    queue: [],
    currentTrack: null,
    playedTracks: [],
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    maxQueueSize: 50,
    isShuffled: false,
    repeatMode: 'none',
    showQueue: true,
    showRequestForm: false,
    isFullscreen: false,
    totalTracksPlayed: 0,
    totalPlayTime: 0,
    mostRequestedArtist: '',
    mostRequestedTrack: '',

    // Actions
    addTrack: (track) => set((state) => {
      const newTracks = new Map(state.tracks);
      newTracks.set(track.id, track);
      return { tracks: newTracks };
    }),

    removeTrack: (trackId) => set((state) => {
      const newTracks = new Map(state.tracks);
      newTracks.delete(trackId);
      const newQueue = state.queue.filter(track => track.id !== trackId);
      return {
        tracks: newTracks,
        queue: newQueue
      };
    }),

    addToQueue: (track) => set((state) => {
      if (state.queue.length >= state.maxQueueSize) {
        return state; // Queue is full
      }
      return { queue: [...state.queue, track] };
    }),

    removeFromQueue: (index) => set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(index, 1);
      return { queue: newQueue };
    }),

    clearQueue: () => set({ queue: [] }),

    shuffleQueue: () => set((state) => {
      const shuffled = [...state.queue].sort(() => Math.random() - 0.5);
      return {
        queue: shuffled,
        isShuffled: true
      };
    }),

    setCurrentTrack: (track) => set({ currentTrack: track }),

    play: () => set({
      isPlaying: true,
      isPaused: false
    }),

    pause: () => set({
      isPlaying: false,
      isPaused: true
    }),

    stop: () => set({
      isPlaying: false,
      isPaused: false,
      currentTime: 0
    }),

    next: () => set((state) => {
      if (state.queue.length === 0) {
        return {
          currentTrack: null,
          isPlaying: false,
          isPaused: false
        };
      }

      const nextTrack = state.queue[0];
      const newQueue = state.queue.slice(1);
      const newPlayedTracks = [...state.playedTracks, state.currentTrack].filter((track): track is JukeboxTrack => track !== null);

      return {
        currentTrack: nextTrack,
        queue: newQueue,
        playedTracks: newPlayedTracks,
        isPlaying: true,
        isPaused: false,
        currentTime: 0
      };
    }),

    previous: () => set((state) => {
      if (state.playedTracks.length === 0) {
        return state;
      }

      const previousTrack = state.playedTracks[state.playedTracks.length - 1];
      const newPlayedTracks = state.playedTracks.slice(0, -1);
      const newQueue = [state.currentTrack, ...state.queue].filter((track): track is JukeboxTrack => track !== null);

      return {
        currentTrack: previousTrack,
        queue: newQueue,
        playedTracks: newPlayedTracks,
        isPlaying: true,
        isPaused: false,
        currentTime: 0
      };
    }),

    setCurrentTime: (time) => set({ currentTime: time }),

    setDuration: (duration) => set({ duration }),

    setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

    setMaxQueueSize: (size) => set({ maxQueueSize: size }),

    setShuffled: (shuffled) => set({ isShuffled: shuffled }),

    setRepeatMode: (mode) => set({ repeatMode: mode }),

    toggleQueue: () => set((state) => ({
      showQueue: !state.showQueue
    })),

    toggleRequestForm: () => set((state) => ({
      showRequestForm: !state.showRequestForm
    })),

    toggleFullscreen: () => set((state) => ({
      isFullscreen: !state.isFullscreen
    })),

    updateStatistics: () => set((state) => {
      const artistCounts = new Map<string, number>();
      const trackCounts = new Map<string, number>();
      let totalPlayTime = 0;

      state.playedTracks.forEach(track => {
        // Count artists
        const artistCount = artistCounts.get(track.artist) || 0;
        artistCounts.set(track.artist, artistCount + 1);

        // Count tracks
        const trackCount = trackCounts.get(track.title) || 0;
        trackCounts.set(track.title, trackCount + 1);

        // Add play time
        totalPlayTime += track.duration;
      });

      // Find most requested artist
      let mostRequestedArtist = '';
      let maxArtistCount = 0;
      artistCounts.forEach((count, artist) => {
        if (count > maxArtistCount) {
          maxArtistCount = count;
          mostRequestedArtist = artist;
        }
      });

      // Find most requested track
      let mostRequestedTrack = '';
      let maxTrackCount = 0;
      trackCounts.forEach((count, track) => {
        if (count > maxTrackCount) {
          maxTrackCount = count;
          mostRequestedTrack = track;
        }
      });

      return {
        totalTracksPlayed: state.playedTracks.length,
        totalPlayTime,
        mostRequestedArtist,
        mostRequestedTrack
      };
    }),

    reset: () => set({
      tracks: new Map(),
      queue: [],
      currentTrack: null,
      playedTracks: [],
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      volume: 1.0,
      maxQueueSize: 50,
      isShuffled: false,
      repeatMode: 'none',
      showQueue: true,
      showRequestForm: false,
      isFullscreen: false,
      totalTracksPlayed: 0,
      totalPlayTime: 0,
      mostRequestedArtist: '',
      mostRequestedTrack: ''
    })
  }))
);

// Selectors
export const selectTracks = (state: JukeboxState) => state.tracks;
export const selectQueue = (state: JukeboxState) => state.queue;
export const selectCurrentTrack = (state: JukeboxState) => state.currentTrack;
export const selectIsPlaying = (state: JukeboxState) => state.isPlaying;
export const selectIsPaused = (state: JukeboxState) => state.isPaused;
export const selectCurrentTime = (state: JukeboxState) => state.currentTime;
export const selectDuration = (state: JukeboxState) => state.duration;
export const selectVolume = (state: JukeboxState) => state.volume;
export const selectStatistics = (state: JukeboxState) => ({
  totalTracksPlayed: state.totalTracksPlayed,
  totalPlayTime: state.totalPlayTime,
  mostRequestedArtist: state.mostRequestedArtist,
  mostRequestedTrack: state.mostRequestedTrack
});
