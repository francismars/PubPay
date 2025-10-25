// LiveEventStore - Live event specific state management
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { LiveEvent, User, Zap } from '../types/common';

export interface LiveEventState {
  // Event data
  currentEvent: LiveEvent | null;
  eventHistory: LiveEvent[];

  // Participants
  participants: Map<string, User>;
  host: User | null;

  // Chat messages
  chatMessages: Map<string, any>;
  newMessageCount: number;

  // Zaps
  zaps: Map<string, Zap>;
  totalZaps: number;
  topZappers: User[];

  // Connection state
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastSeen: number;

  // UI state
  isFullscreen: boolean;
  showChat: boolean;
  showParticipants: boolean;
  showQR: boolean;
  showLightning: boolean;

  // Actions
  setCurrentEvent: (event: LiveEvent | null) => void;
  addEventToHistory: (event: LiveEvent) => void;
  addParticipant: (user: User) => void;
  removeParticipant: (pubkey: string) => void;
  setHost: (user: User | null) => void;
  addChatMessage: (message: any) => void;
  clearChatMessages: () => void;
  addZap: (zap: Zap) => void;
  updateTopZappers: () => void;
  setConnectionStatus: (status: LiveEventState['connectionStatus']) => void;
  setConnected: (connected: boolean) => void;
  updateLastSeen: () => void;
  toggleFullscreen: () => void;
  toggleChat: () => void;
  toggleParticipants: () => void;
  toggleQR: () => void;
  toggleLightning: () => void;
  reset: () => void;
}

export const useLiveEventStore = create<LiveEventState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentEvent: null,
    eventHistory: [],
    participants: new Map(),
    host: null,
    chatMessages: new Map(),
    newMessageCount: 0,
    zaps: new Map(),
    totalZaps: 0,
    topZappers: [],
    isConnected: false,
    connectionStatus: 'disconnected',
    lastSeen: 0,
    isFullscreen: false,
    showChat: true,
    showParticipants: true,
    showQR: true,
    showLightning: true,

    // Actions
    setCurrentEvent: event => set({ currentEvent: event }),

    addEventToHistory: event =>
      set(state => ({
        eventHistory: [...state.eventHistory, event]
      })),

    addParticipant: user =>
      set(state => {
        const newParticipants = new Map(state.participants);
        newParticipants.set(user.publicKey, user);
        return { participants: newParticipants };
      }),

    removeParticipant: pubkey =>
      set(state => {
        const newParticipants = new Map(state.participants);
        newParticipants.delete(pubkey);
        return { participants: newParticipants };
      }),

    setHost: user => set({ host: user }),

    addChatMessage: message =>
      set(state => {
        const newMessages = new Map(state.chatMessages);
        newMessages.set(message.id, message);
        return {
          chatMessages: newMessages,
          newMessageCount: state.newMessageCount + 1
        };
      }),

    clearChatMessages: () =>
      set({
        chatMessages: new Map(),
        newMessageCount: 0
      }),

    addZap: zap =>
      set(state => {
        const newZaps = new Map(state.zaps);
        newZaps.set(zap.id, zap);
        const totalZaps = state.totalZaps + zap.amount;
        return {
          zaps: newZaps,
          totalZaps
        };
      }),

    updateTopZappers: () =>
      set(state => {
        const zapperTotals = new Map<string, { user: User; total: number }>();

        // Calculate totals for each zapper
        state.zaps.forEach(zap => {
          const existing = zapperTotals.get(zap.payerPubkey);
          if (existing) {
            existing.total += zap.amount;
          } else {
            zapperTotals.set(zap.payerPubkey, {
              user: zap.profile || {
                id: zap.payerPubkey,
                publicKey: zap.payerPubkey,
                name: 'Unknown'
              },
              total: zap.amount
            });
          }
        });

        // Sort by total amount and take top 3
        const topZappers = Array.from(zapperTotals.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 3)
          .map(item => item.user);

        return { topZappers };
      }),

    setConnectionStatus: status =>
      set({
        connectionStatus: status,
        isConnected: status === 'connected'
      }),

    setConnected: connected =>
      set({
        isConnected: connected,
        connectionStatus: connected ? 'connected' : 'disconnected'
      }),

    updateLastSeen: () => set({ lastSeen: Date.now() }),

    toggleFullscreen: () =>
      set(state => ({
        isFullscreen: !state.isFullscreen
      })),

    toggleChat: () =>
      set(state => ({
        showChat: !state.showChat
      })),

    toggleParticipants: () =>
      set(state => ({
        showParticipants: !state.showParticipants
      })),

    toggleQR: () =>
      set(state => ({
        showQR: !state.showQR
      })),

    toggleLightning: () =>
      set(state => ({
        showLightning: !state.showLightning
      })),

    reset: () =>
      set({
        currentEvent: null,
        eventHistory: [],
        participants: new Map(),
        host: null,
        chatMessages: new Map(),
        newMessageCount: 0,
        zaps: new Map(),
        totalZaps: 0,
        topZappers: [],
        isConnected: false,
        connectionStatus: 'disconnected',
        lastSeen: 0,
        isFullscreen: false,
        showChat: true,
        showParticipants: true,
        showQR: true,
        showLightning: true
      })
  }))
);

// Selectors
export const selectCurrentEvent = (state: LiveEventState) => state.currentEvent;
export const selectParticipants = (state: LiveEventState) => state.participants;
export const selectHost = (state: LiveEventState) => state.host;
export const selectChatMessages = (state: LiveEventState) => state.chatMessages;
export const selectZaps = (state: LiveEventState) => state.zaps;
export const selectTopZappers = (state: LiveEventState) => state.topZappers;
export const selectIsConnected = (state: LiveEventState) => state.isConnected;
export const selectConnectionStatus = (state: LiveEventState) =>
  state.connectionStatus;
