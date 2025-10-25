// LiveDisplayFeature - Main feature module for live event display
import { ErrorService } from '../../services/ErrorService';
import {
  NostrClient,
  EventManager,
  ProfileService
} from '../../services/nostr';
import { LightningService } from '../../services/lightning';
import { LocalStorage, SessionStorage } from '../../services/storage';
import {
  LiveEventDisplayComponent,
  LiveEventDisplayOptions
} from '../../components/LiveEventDisplayComponent';
import {
  LightningPaymentComponent,
  LightningPaymentOptions
} from '../../components/LightningPaymentComponent';
import { LiveEvent, User, Zap } from '../../types/common';

export interface LiveDisplayConfig {
  eventId: string;
  autoConnect?: boolean;
  showLightning?: boolean;
  showChat?: boolean;
  showQR?: boolean;
  showParticipants?: boolean;
  showVideo?: boolean;
  styleOptions?: any;
}

export class LiveDisplayFeature {
  private errorService: ErrorService;
  private nostrClient: NostrClient;
  private eventManager: EventManager;
  private profileService: ProfileService;
  private lightningService: LightningService;
  private localStorage: LocalStorage;
  private sessionStorage: SessionStorage;

  private liveEventComponent: LiveEventDisplayComponent | null = null;
  private lightningComponent: LightningPaymentComponent | null = null;

  private config: LiveDisplayConfig;
  private currentEvent: LiveEvent | null = null;
  private isInitialized: boolean = false;

  constructor(
    config: LiveDisplayConfig,
    errorService: ErrorService,
    nostrClient: NostrClient,
    eventManager: EventManager,
    profileService: ProfileService,
    lightningService: LightningService,
    localStorage: LocalStorage,
    sessionStorage: SessionStorage
  ) {
    this.config = config;
    this.errorService = errorService;
    this.nostrClient = nostrClient;
    this.eventManager = eventManager;
    this.profileService = profileService;
    this.lightningService = lightningService;
    this.localStorage = localStorage;
    this.sessionStorage = sessionStorage;
  }

  /**
   * Initialize the live display feature
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.errorService.info('Initializing live display feature', {
        eventId: this.config.eventId
      });

      // Initialize components
      await this.initializeComponents();

      // Load event data
      await this.loadEventData();

      // Setup subscriptions
      this.setupSubscriptions();

      // Load style options
      this.loadStyleOptions();

      this.isInitialized = true;
      this.errorService.info('Live display feature initialized successfully');
    } catch (error) {
      this.errorService.error(
        'Failed to initialize live display feature',
        error as Error
      );
      throw error;
    }
  }

  /**
   * Initialize UI components
   */
  private async initializeComponents(): Promise<void> {
    // Initialize live event display component
    const liveEventElement = document.getElementById('liveEventDisplay');
    if (liveEventElement) {
      const liveEventOptions: LiveEventDisplayOptions = {
        showQR: this.config.showQR,
        showChat: this.config.showChat,
        showParticipants: this.config.showParticipants,
        showVideo: this.config.showVideo,
        className: 'live-event-display'
      };

      this.liveEventComponent = new LiveEventDisplayComponent(
        liveEventElement,
        liveEventOptions,
        this.errorService
      );
    }

    // Initialize Lightning payment component
    if (this.config.showLightning) {
      const lightningElement = document.getElementById('lightningPayment');
      if (lightningElement) {
        const lightningOptions: LightningPaymentOptions = {
          showToggle: true,
          showQR: true,
          showStatus: true,
          autoEnable: false,
          modalStyle: 'popup'
        };

        this.lightningComponent = new LightningPaymentComponent(
          lightningElement,
          this.lightningService,
          lightningOptions,
          this.errorService
        );
      }
    }
  }

  /**
   * Load event data
   */
  private async loadEventData(): Promise<void> {
    try {
      // Parse event ID from URL or config
      const eventId = this.config.eventId;
      if (!eventId) {
        throw new Error('No event ID provided');
      }

      // Load event from Nostr
      const events = await this.nostrClient.getEvents([
        {
          ids: [eventId],
          kinds: [30311] // Live event kind
        }
      ]);

      if (events.length === 0) {
        throw new Error('Event not found');
      }

      const event = await this.eventManager.handleLiveEvent(events[0]!);
      if (!event) {
        throw new Error('Failed to process event');
      }

      this.currentEvent = event;

      // Update live event component
      if (this.liveEventComponent) {
        this.liveEventComponent.update(event);
      }

      // Load participants
      await this.loadParticipants();

      this.errorService.info('Event data loaded successfully', {
        eventId: event.id
      });
    } catch (error) {
      this.errorService.error('Failed to load event data', error as Error);
      throw error;
    }
  }

  /**
   * Load participants
   */
  private async loadParticipants(): Promise<void> {
    if (!this.currentEvent) return;

    try {
      const participantTags = this.currentEvent.tags.filter(
        tag => tag[0] === 'p'
      );
      const pubkeys = participantTags
        .map(tag => tag[1])
        .filter((pubkey): pubkey is string => pubkey !== undefined);

      if (pubkeys.length > 0) {
        const profiles = await this.profileService.getProfiles(pubkeys);
        profiles.forEach(profile => {
          if (this.liveEventComponent) {
            this.liveEventComponent.addParticipant(profile);
          }
        });
      }
    } catch (error) {
      this.errorService.error('Failed to load participants', error as Error);
    }
  }

  /**
   * Setup Nostr subscriptions
   */
  private setupSubscriptions(): void {
    if (!this.currentEvent) return;

    try {
      // Subscribe to live event updates
      this.nostrClient.subscribeToLiveEvents(
        this.currentEvent.pubkey,
        this.currentEvent.identifier || '',
        async event => {
          const liveEvent = await this.eventManager.handleLiveEvent(event);
          if (liveEvent && this.liveEventComponent) {
            this.liveEventComponent.update(liveEvent);
          }
        }
      );

      // Subscribe to chat messages
      this.nostrClient.subscribeToLiveChat(
        this.currentEvent.pubkey,
        this.currentEvent.identifier || '',
        async event => {
          const noteData = await this.eventManager.handleNoteEvent(
            event as any
          );
          if (noteData && this.liveEventComponent) {
            const chatMessage = {
              id: event.id,
              pubkey: event.pubkey,
              content: noteData.content,
              created_at: event.created_at,
              author: noteData.author || undefined
            };
            this.liveEventComponent.addChatMessage(chatMessage);
          }
        }
      );

      // Subscribe to zaps
      this.nostrClient.subscribeToZaps(this.currentEvent.id, async event => {
        const zap = await this.eventManager.handleZapEvent(event);
        if (zap) {
          this.handleZap(zap);
        }
      });

      this.errorService.info('Subscriptions setup successfully');
    } catch (error) {
      this.errorService.error('Failed to setup subscriptions', error as Error);
    }
  }

  /**
   * Handle incoming zap
   */
  private handleZap(zap: Zap): void {
    this.errorService.info('Received zap', {
      amount: zap.amount,
      payer: zap.payerPubkey
    });

    // Update UI with zap information
    if (this.liveEventComponent) {
      // This would update the UI to show the zap
      // For now, just log it
      // Zap received
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
    try {
      const root = document.documentElement;

      if (options.textColor) {
        root.style.setProperty('--text-color', options.textColor);
      }

      if (options.bgColor) {
        root.style.setProperty('--bg-color', options.bgColor);
      }

      if (options.bgImage) {
        root.style.setProperty('--bg-image', `url(${options.bgImage})`);
      }

      if (options.opacity !== undefined) {
        root.style.setProperty('--opacity', options.opacity.toString());
      }

      if (options.textOpacity !== undefined) {
        root.style.setProperty(
          '--text-opacity',
          options.textOpacity.toString()
        );
      }

      this.errorService.debug('Style options applied', options);
    } catch (error) {
      this.errorService.error('Failed to apply style options', error as Error);
    }
  }

  /**
   * Enable Lightning payments
   */
  async enableLightning(): Promise<void> {
    if (!this.lightningComponent) {
      this.errorService.warn('Lightning component not initialized');
      return;
    }

    try {
      await this.lightningComponent.enableLightning();
      this.errorService.info('Lightning payments enabled');
    } catch (error) {
      this.errorService.error(
        'Failed to enable Lightning payments',
        error as Error
      );
    }
  }

  /**
   * Disable Lightning payments
   */
  async disableLightning(): Promise<void> {
    if (!this.lightningComponent) {
      this.errorService.warn('Lightning component not initialized');
      return;
    }

    try {
      await this.lightningComponent.disableLightning();
      this.errorService.info('Lightning payments disabled');
    } catch (error) {
      this.errorService.error(
        'Failed to disable Lightning payments',
        error as Error
      );
    }
  }

  /**
   * Get current event
   */
  getCurrentEvent(): LiveEvent | null {
    return this.currentEvent;
  }

  /**
   * Get Lightning status
   */
  getLightningStatus(): { enabled: boolean; lnurl: string | null } {
    if (!this.lightningComponent) {
      return { enabled: false, lnurl: null };
    }
    return this.lightningComponent.getStatus();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LiveDisplayConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get feature status
   */
  getStatus(): {
    initialized: boolean;
    eventLoaded: boolean;
    lightningEnabled: boolean;
    participantsCount: number;
  } {
    return {
      initialized: this.isInitialized,
      eventLoaded: this.currentEvent !== null,
      lightningEnabled: this.getLightningStatus().enabled,
      participantsCount: this.liveEventComponent?.getParticipants().size || 0
    };
  }

  /**
   * Destroy the feature
   */
  destroy(): void {
    if (this.liveEventComponent) {
      this.liveEventComponent.destroy();
    }

    if (this.lightningComponent) {
      this.lightningComponent.destroy();
    }

    this.nostrClient.unsubscribeAll();
    this.isInitialized = false;
  }
}
