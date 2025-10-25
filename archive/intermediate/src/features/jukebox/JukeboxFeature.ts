// JukeboxFeature - Main feature module for jukebox functionality
import { ErrorService } from '../../services/ErrorService';
import {
  NostrClient,
  EventManager,
  ProfileService
} from '../../services/nostr';
import { LightningService } from '../../services/lightning';
import { LocalStorage, SessionStorage } from '../../services/storage';
import { BaseComponent } from '../../components/BaseComponent';
import { User, Zap } from '../../types/common';

export interface JukeboxConfig {
  autoPlay?: boolean;
  showLightning?: boolean;
  showChat?: boolean;
  showQueue?: boolean;
  maxQueueSize?: number;
  styleOptions?: any;
}

export interface JukeboxTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
  requester: User;
  requestedAt: number;
  played: boolean;
  zapAmount?: number;
}

export class JukeboxFeature {
  private errorService: ErrorService;
  private nostrClient: NostrClient;
  private eventManager: EventManager;
  private profileService: ProfileService;
  private lightningService: LightningService;
  private localStorage: LocalStorage;
  private sessionStorage: SessionStorage;

  private config: JukeboxConfig;
  private tracks: Map<string, JukeboxTrack> = new Map();
  private queue: JukeboxTrack[] = [];
  private currentTrack: JukeboxTrack | null = null;
  private isPlaying: boolean = false;
  private isInitialized: boolean = false;

  constructor(
    config: JukeboxConfig,
    errorService: ErrorService,
    nostrClient: NostrClient,
    eventManager: EventManager,
    profileService: ProfileService,
    lightningService: LightningService,
    localStorage: LocalStorage,
    sessionStorage: SessionStorage
  ) {
    this.config = {
      autoPlay: false,
      showLightning: true,
      showChat: true,
      showQueue: true,
      maxQueueSize: 50,
      ...config
    };

    this.errorService = errorService;
    this.nostrClient = nostrClient;
    this.eventManager = eventManager;
    this.profileService = profileService;
    this.lightningService = lightningService;
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
  }

  /**
   * Initialize the jukebox feature
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.errorService.info('Initializing jukebox feature');

      // Initialize UI
      this.initializeUI();

      // Load saved tracks
      await this.loadSavedTracks();

      // Setup subscriptions
      this.setupSubscriptions();

      // Load style options
      this.loadStyleOptions();

      this.isInitialized = true;
      this.errorService.info('Jukebox feature initialized successfully');
    } catch (error) {
      this.errorService.error(
        'Failed to initialize jukebox feature',
        error as Error
      );
      throw error;
    }
  }

  /**
   * Initialize UI components
   */
  private initializeUI(): void {
    // Create jukebox container
    const container = document.getElementById('jukeboxContainer');
    if (!container) {
      this.errorService.warn('Jukebox container not found');
      return;
    }

    container.innerHTML = `
      <div class="jukebox-feature">
        <div class="jukebox-header">
          <h2>🎵 Jukebox</h2>
          <div class="jukebox-controls">
            <button id="playPauseBtn" class="control-btn">▶️</button>
            <button id="nextBtn" class="control-btn">⏭️</button>
            <button id="clearQueueBtn" class="control-btn">🗑️</button>
          </div>
        </div>
        
        <div class="current-track">
          <div id="currentTrackInfo" class="track-info">
            <div class="track-title">No track playing</div>
            <div class="track-artist"></div>
          </div>
          <div class="track-controls">
            <div class="progress-bar">
              <div id="progressBar" class="progress"></div>
            </div>
            <div class="time-info">
              <span id="currentTime">0:00</span>
              <span id="totalTime">0:00</span>
            </div>
          </div>
        </div>

        <div class="queue-section">
          <h3>Queue (<span id="queueCount">0</span>)</h3>
          <div id="queueList" class="queue-list"></div>
        </div>

        <div class="request-section">
          <h3>Request a Track</h3>
          <form id="trackRequestForm" class="track-request-form">
            <input type="text" id="trackTitle" placeholder="Track title" required>
            <input type="text" id="trackArtist" placeholder="Artist" required>
            <input type="url" id="trackUrl" placeholder="YouTube/Spotify URL" required>
            <button type="submit">Request Track</button>
          </form>
        </div>
      </div>
    `;

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Play/Pause button
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    }

    // Next button
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.playNext());
    }

    // Clear queue button
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    if (clearQueueBtn) {
      clearQueueBtn.addEventListener('click', () => this.clearQueue());
    }

    // Track request form
    const trackRequestForm = document.getElementById('trackRequestForm');
    if (trackRequestForm) {
      trackRequestForm.addEventListener('submit', e =>
        this.handleTrackRequestForm(e)
      );
    }
  }

  /**
   * Load saved tracks from storage
   */
  private async loadSavedTracks(): Promise<void> {
    try {
      const savedTracks = this.localStorage.getItem<JukeboxTrack[]>(
        'jukeboxTracks',
        []
      );
      if (Array.isArray(savedTracks)) {
        savedTracks.forEach((trackData: JukeboxTrack) => {
          const track: JukeboxTrack = {
            id: trackData.id,
            title: trackData.title,
            artist: trackData.artist,
            url: trackData.url,
            duration: trackData.duration,
            requester: trackData.requester,
            requestedAt: trackData.requestedAt,
            played: trackData.played || false,
            zapAmount: trackData.zapAmount
          };
          this.tracks.set(track.id, track);
        });
      }
    } catch (error) {
      this.errorService.error('Failed to load saved tracks', error as Error);
    }
  }

  /**
   * Save tracks to storage
   */
  private saveTracks(): void {
    try {
      const tracksArray = Array.from(this.tracks.values());
      this.localStorage.setItem('jukeboxTracks', tracksArray);
    } catch (error) {
      this.errorService.error('Failed to save tracks', error as Error);
    }
  }

  /**
   * Setup Nostr subscriptions
   */
  private setupSubscriptions(): void {
    try {
      // Subscribe to jukebox events (kind 1 with #j tag)
      this.nostrClient.subscribeToEvents(
        [
          {
            kinds: [1],
            '#j': ['jukebox']
          }
        ],
        async event => {
          const noteData = await this.eventManager.handleNoteEvent(
            event as any
          );
          if (noteData) {
            this.handleJukeboxEvent(event, noteData.content);
          }
        }
      );

      // Subscribe to zaps for jukebox
      this.nostrClient.subscribeToEvents(
        [
          {
            kinds: [9735],
            '#j': ['jukebox']
          }
        ],
        async event => {
          const zap = await this.eventManager.handleZapEvent(event);
          if (zap) {
            this.handleJukeboxZap(zap);
          }
        }
      );

      this.errorService.info('Jukebox subscriptions setup successfully');
    } catch (error) {
      this.errorService.error(
        'Failed to setup jukebox subscriptions',
        error as Error
      );
    }
  }

  /**
   * Handle jukebox event
   */
  private handleJukeboxEvent(event: any, content: string): void {
    try {
      // Parse jukebox command from content
      const command = this.parseJukeboxCommand(content);
      if (!command) return;

      switch (command.type) {
        case 'request':
          this.handleTrackRequest(command.data);
          break;
        case 'play':
          this.handlePlayCommand(command.data);
          break;
        case 'pause':
          this.handlePauseCommand();
          break;
        case 'next':
          this.handleNextCommand();
          break;
        case 'clear':
          this.handleClearCommand();
          break;
      }
    } catch (error) {
      this.errorService.error('Failed to handle jukebox event', error as Error);
    }
  }

  /**
   * Parse jukebox command from content
   */
  private parseJukeboxCommand(
    content: string
  ): { type: string; data: any } | null {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('jukebox:')) {
        const command = line.substring(8).trim();
        const parts = command.split(' ');
        const type = parts[0];

        switch (type) {
          case 'request':
            const title = parts.slice(1, -2).join(' ');
            const artist = parts[parts.length - 2];
            const url = parts[parts.length - 1];
            return { type, data: { title, artist, url } };
          case 'play':
          case 'pause':
          case 'next':
          case 'clear':
            return { type, data: {} };
        }
      }
    }
    return null;
  }

  /**
   * Handle track request
   */
  private async handleTrackRequest(data: {
    title: string;
    artist: string;
    url: string;
  }): Promise<void> {
    try {
      const track: JukeboxTrack = {
        id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: data.title,
        artist: data.artist,
        url: data.url,
        duration: 0, // Would be determined from URL
        requester: { id: 'unknown', publicKey: 'unknown', name: 'Unknown' },
        requestedAt: Date.now(),
        played: false
      };

      this.tracks.set(track.id, track);
      this.queue.push(track);
      this.updateQueueDisplay();
      this.saveTracks();

      this.errorService.info('Track added to queue', {
        title: track.title,
        artist: track.artist
      });
    } catch (error) {
      this.errorService.error('Failed to handle track request', error as Error);
    }
  }

  /**
   * Handle play command
   */
  private handlePlayCommand(data: any): void {
    this.play();
  }

  /**
   * Handle pause command
   */
  private handlePauseCommand(): void {
    this.pause();
  }

  /**
   * Handle next command
   */
  private handleNextCommand(): void {
    this.playNext();
  }

  /**
   * Handle clear command
   */
  private handleClearCommand(): void {
    this.clearQueue();
  }

  /**
   * Handle jukebox zap
   */
  private handleJukeboxZap(zap: Zap): void {
    this.errorService.info('Received jukebox zap', { amount: zap.amount });
    // Handle zap logic here
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Play current track
   */
  play(): void {
    if (!this.currentTrack && this.queue.length > 0) {
      this.currentTrack = this.queue.shift()!;
    }

    if (this.currentTrack) {
      this.isPlaying = true;
      this.updatePlayPauseButton();
      this.updateCurrentTrackDisplay();
      this.errorService.info('Playing track', {
        title: this.currentTrack.title
      });
    }
  }

  /**
   * Pause current track
   */
  pause(): void {
    this.isPlaying = false;
    this.updatePlayPauseButton();
    this.errorService.info('Paused track');
  }

  /**
   * Play next track
   */
  playNext(): void {
    if (this.queue.length > 0) {
      this.currentTrack = this.queue.shift()!;
      this.play();
    } else {
      this.currentTrack = null;
      this.isPlaying = false;
      this.updatePlayPauseButton();
      this.updateCurrentTrackDisplay();
    }
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
    this.updateQueueDisplay();
    this.errorService.info('Queue cleared');
  }

  /**
   * Update queue display
   */
  private updateQueueDisplay(): void {
    const queueList = document.getElementById('queueList');
    const queueCount = document.getElementById('queueCount');

    if (!queueList || !queueCount) return;

    queueCount.textContent = this.queue.length.toString();

    queueList.innerHTML = '';
    this.queue.forEach((track, index) => {
      const trackElement = document.createElement('div');
      trackElement.className = 'queue-item';
      trackElement.innerHTML = `
        <div class="track-info">
          <div class="track-title">${track.title}</div>
          <div class="track-artist">${track.artist}</div>
        </div>
        <div class="track-actions">
          <button onclick="jukeboxFeature.playTrack(${index})">Play</button>
          <button onclick="jukeboxFeature.removeFromQueue(${index})">Remove</button>
        </div>
      `;
      queueList.appendChild(trackElement);
    });
  }

  /**
   * Update current track display
   */
  private updateCurrentTrackDisplay(): void {
    const currentTrackInfo = document.getElementById('currentTrackInfo');
    if (!currentTrackInfo) return;

    if (this.currentTrack) {
      const titleElement = currentTrackInfo.querySelector('.track-title');
      const artistElement = currentTrackInfo.querySelector('.track-artist');

      if (titleElement) titleElement.textContent = this.currentTrack.title;
      if (artistElement) artistElement.textContent = this.currentTrack.artist;
    } else {
      const titleElement = currentTrackInfo.querySelector('.track-title');
      if (titleElement) titleElement.textContent = 'No track playing';
    }
  }

  /**
   * Update play/pause button
   */
  private updatePlayPauseButton(): void {
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      playPauseBtn.textContent = this.isPlaying ? '⏸️' : '▶️';
    }
  }

  /**
   * Handle track request form submission
   */
  private handleTrackRequestForm(e: Event): void {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const title = (form.querySelector('#trackTitle') as HTMLInputElement).value;
    const artist = (form.querySelector('#trackArtist') as HTMLInputElement)
      .value;
    const url = (form.querySelector('#trackUrl') as HTMLInputElement).value;

    if (title && artist && url) {
      this.handleTrackRequest({ title, artist, url });
      form.reset();
    }
  }

  /**
   * Load style options
   */
  private loadStyleOptions(): void {
    try {
      const styleOptions = this.localStorage.getStyleOptions();
      if (styleOptions && Object.keys(styleOptions).length > 0) {
        this.applyStyleOptions(styleOptions);
      }
    } catch (error) {
      this.errorService.error('Failed to load style options', error as Error);
    }
  }

  /**
   * Apply style options
   */
  private applyStyleOptions(options: any): void {
    // Apply jukebox-specific styles
    const root = document.documentElement;

    if (options.textColor) {
      root.style.setProperty('--jukebox-text-color', options.textColor);
    }

    if (options.bgColor) {
      root.style.setProperty('--jukebox-bg-color', options.bgColor);
    }
  }

  /**
   * Get jukebox status
   */
  getStatus(): {
    initialized: boolean;
    isPlaying: boolean;
    currentTrack: JukeboxTrack | null;
    queueLength: number;
    totalTracks: number;
  } {
    return {
      initialized: this.isInitialized,
      isPlaying: this.isPlaying,
      currentTrack: this.currentTrack,
      queueLength: this.queue.length,
      totalTracks: this.tracks.size
    };
  }

  /**
   * Get queue
   */
  getQueue(): JukeboxTrack[] {
    return [...this.queue];
  }

  /**
   * Get all tracks
   */
  getAllTracks(): JukeboxTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Destroy the feature
   */
  destroy(): void {
    this.nostrClient.unsubscribeAll();
    this.isInitialized = false;
  }
}
