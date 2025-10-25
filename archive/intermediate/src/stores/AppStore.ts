// AppStore - Main application state management with Zustand
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AppConfig, User, LiveEvent, Zap } from '../types/common';
import { LightningConfig } from '../types/lightning';

export interface AppState {
  // Configuration
  config: AppConfig;
  lightningConfig: LightningConfig;

  // User state
  currentUser: User | null;
  isAuthenticated: boolean;

  // Live event state
  currentEvent: LiveEvent | null;
  events: Map<string, LiveEvent>;

  // Lightning state
  lightningEnabled: boolean;
  lightningSessionId: string | null;
  lightningLNURL: string | null;

  // UI state
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark';

  // Actions
  setConfig: (config: Partial<AppConfig>) => void;
  setLightningConfig: (config: Partial<LightningConfig>) => void;
  setCurrentUser: (user: User | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setCurrentEvent: (event: LiveEvent | null) => void;
  addEvent: (event: LiveEvent) => void;
  updateEvent: (eventId: string, updates: Partial<LiveEvent>) => void;
  removeEvent: (eventId: string) => void;
  setLightningEnabled: (enabled: boolean) => void;
  setLightningSession: (sessionId: string | null, lnurl: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  clearError: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    config: {
      relays: [],
      lightning: {
        enabled: false,
        lnbitsUrl: '',
        apiKey: '',
        webhookUrl: ''
      },
      features: {
        liveDisplay: true,
        jukebox: true,
        payments: true,
        auth: true
      }
    },
    lightningConfig: {
      enabled: false,
      lnbitsUrl: '',
      apiKey: '',
      webhookUrl: ''
    },
    currentUser: null,
    isAuthenticated: false,
    currentEvent: null,
    events: new Map(),
    lightningEnabled: false,
    lightningSessionId: null,
    lightningLNURL: null,
    isLoading: false,
    error: null,
    theme: 'light',

    // Actions
    setConfig: config =>
      set(state => ({
        config: { ...state.config, ...config }
      })),

    setLightningConfig: config =>
      set(state => ({
        lightningConfig: { ...state.lightningConfig, ...config }
      })),

    setCurrentUser: user =>
      set({
        currentUser: user,
        isAuthenticated: user !== null
      }),

    setAuthenticated: authenticated =>
      set({
        isAuthenticated: authenticated,
        currentUser: authenticated ? get().currentUser : null
      }),

    setCurrentEvent: event => set({ currentEvent: event }),

    addEvent: event =>
      set(state => {
        const newEvents = new Map(state.events);
        newEvents.set(event.id, event);
        return { events: newEvents };
      }),

    updateEvent: (eventId, updates) =>
      set(state => {
        const newEvents = new Map(state.events);
        const existingEvent = newEvents.get(eventId);
        if (existingEvent) {
          newEvents.set(eventId, { ...existingEvent, ...updates });
        }
        return { events: newEvents };
      }),

    removeEvent: eventId =>
      set(state => {
        const newEvents = new Map(state.events);
        newEvents.delete(eventId);
        return { events: newEvents };
      }),

    setLightningEnabled: enabled => set({ lightningEnabled: enabled }),

    setLightningSession: (sessionId, lnurl) =>
      set({
        lightningSessionId: sessionId,
        lightningLNURL: lnurl
      }),

    setLoading: loading => set({ isLoading: loading }),

    setError: error => set({ error }),

    setTheme: theme => set({ theme }),

    clearError: () => set({ error: null }),

    reset: () =>
      set({
        currentUser: null,
        isAuthenticated: false,
        currentEvent: null,
        events: new Map(),
        lightningEnabled: false,
        lightningSessionId: null,
        lightningLNURL: null,
        isLoading: false,
        error: null,
        theme: 'light'
      })
  }))
);

// Selectors for common state access
export const selectCurrentUser = (state: AppState) => state.currentUser;
export const selectIsAuthenticated = (state: AppState) => state.isAuthenticated;
export const selectCurrentEvent = (state: AppState) => state.currentEvent;
export const selectLightningEnabled = (state: AppState) =>
  state.lightningEnabled;
export const selectIsLoading = (state: AppState) => state.isLoading;
export const selectError = (state: AppState) => state.error;
export const selectTheme = (state: AppState) => state.theme;
