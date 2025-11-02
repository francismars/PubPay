// LiveEventDisplayComponent - Handles live event display
import { BaseComponent } from '@pubpay/shared-ui';
import { ErrorService } from '@pubpay/shared-services';
import { LiveEvent, User } from '@pubpay/shared-types';
import { QRCodeComponent, QRCodeOptions } from '@pubpay/shared-ui';
import { ChatMessageComponent, ChatMessage } from './ChatMessageComponent';

export interface LiveEventDisplayOptions {
  showQR?: boolean;
  showChat?: boolean;
  showParticipants?: boolean;
  showVideo?: boolean;
  showLightning?: boolean;
  qrOptions?: QRCodeOptions;
  chatOptions?: any;
  className?: string;
}

export class LiveEventDisplayComponent extends BaseComponent {
  private event: LiveEvent | null = null;
  private options: LiveEventDisplayOptions;
  private qrComponents: Map<string, QRCodeComponent> = new Map();
  private chatComponents: Map<string, ChatMessageComponent> = new Map();
  private participants: Map<string, User> = new Map();

  constructor(
    element: HTMLElement | string,
    options: LiveEventDisplayOptions = {},
    errorService: ErrorService
  ) {
    super(element, errorService);
    this.options = {
      showQR: true,
      showChat: true,
      showParticipants: true,
      showVideo: true,
      showLightning: true,
      className: 'live-event-display',
      ...options
    };
  }

  initialize(): void {
    this.render();
  }

  render(): void {
    this.safeExecute(() => {
      this.clear();
      this.createEventDisplay();
    }, 'Error rendering live event display');
  }

  update(event: LiveEvent): void {
    this.event = event;
    this.render();
  }

  /**
   * Create live event display
   */
  private createEventDisplay(): void {
    if (!this.event) {
      this.showLoading();
      return;
    }

    const container = document.createElement('div');
    container.className = `live-event-container ${this.options.className || ''}`;

    // Create event header
    const header = this.createEventHeader();
    container.appendChild(header);

    // Create event content
    const content = this.createEventContent();
    container.appendChild(content);

    // Create QR codes if enabled
    if (this.options.showQR) {
      const qrSection = this.createQRSection();
      container.appendChild(qrSection);
    }

    // Create chat section if enabled
    if (this.options.showChat) {
      const chatSection = this.createChatSection();
      container.appendChild(chatSection);
    }

    // Create participants section if enabled
    if (this.options.showParticipants) {
      const participantsSection = this.createParticipantsSection();
      container.appendChild(participantsSection);
    }

    this.element.appendChild(container);
  }

  /**
   * Create event header
   */
  private createEventHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'live-event-header';

    // Create title
    const title = document.createElement('h1');
    title.className = 'event-title';
    title.textContent = this.getEventTitle();
    header.appendChild(title);

    // Create author info
    const authorInfo = this.createAuthorInfo();
    header.appendChild(authorInfo);

    // Create event metadata
    const metadata = this.createEventMetadata();
    header.appendChild(metadata);

    return header;
  }

  /**
   * Create author info
   */
  private createAuthorInfo(): HTMLElement {
    const authorInfo = document.createElement('div');
    authorInfo.className = 'event-author';

    // Create author name
    const authorName = document.createElement('div');
    authorName.className = 'author-name';
    authorName.id = 'authorName';
    authorName.textContent = this.getAuthorDisplayName();
    authorInfo.appendChild(authorName);

    // Create author avatar
    const authorImg = document.createElement('img');
    authorImg.className = 'author-avatar';
    authorImg.id = 'authorImg';
    authorImg.src = this.getAuthorAvatar();
    authorImg.style.width = '50px';
    authorImg.style.height = '50px';
    authorImg.style.borderRadius = '50%';
    authorImg.style.objectFit = 'cover';
    authorInfo.appendChild(authorImg);

    return authorInfo;
  }

  /**
   * Create event metadata
   */
  private createEventMetadata(): HTMLElement {
    const metadata = document.createElement('div');
    metadata.className = 'event-metadata';

    // Create timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'event-timestamp';
    timestamp.textContent = new Date(
      this.event!.created_at * 1000
    ).toLocaleString();
    metadata.appendChild(timestamp);

    // Create event ID
    const eventId = document.createElement('div');
    eventId.className = 'event-id';
    eventId.textContent = `ID: ${this.event!.id.slice(0, 8)}...`;
    metadata.appendChild(eventId);

    return metadata;
  }

  /**
   * Create event content
   */
  private createEventContent(): HTMLElement {
    const content = document.createElement('div');
    content.className = 'event-content';

    // Create content text
    const contentText = document.createElement('div');
    contentText.className = 'event-text';
    contentText.innerHTML = this.formatEventContent();
    content.appendChild(contentText);

    // Create video player if enabled and streaming URL available
    if (this.options.showVideo) {
      const videoPlayer = this.createVideoPlayer();
      if (videoPlayer) {
        content.appendChild(videoPlayer);
      }
    }

    return content;
  }

  /**
   * Create QR section
   */
  private createQRSection(): HTMLElement {
    const qrSection = document.createElement('div');
    qrSection.className = 'qr-section';

    // Create QR codes container
    const qrContainer = document.createElement('div');
    qrContainer.className = 'qr-codes-container';
    qrContainer.innerHTML = `
      <div class="qr-swiper swiper">
        <div class="swiper-wrapper">
          <div class="swiper-slide">
            <div class="qr-slide-title">Web Link <span class="qr-data-preview" id="qrDataPreview1"></span></div>
            <a href="" target="_blank" id="qrLink">
              <div id="qrCode" class="qr-code"></div>
            </a>
            <div class="qr-slide-label">Scan with any QR reader</div>
          </div>
          <div class="swiper-slide">
            <div class="qr-slide-title">Nostr Event <span class="qr-data-preview" id="qrDataPreview2"></span></div>
            <a href="" target="_blank" id="qrNeventLink">
              <div id="qrCodeNevent" class="qr-code"></div>
            </a>
            <div class="qr-slide-label">Scan with Nostr client</div>
          </div>
          <div class="swiper-slide">
            <div class="qr-slide-title">Event ID <span class="qr-data-preview" id="qrDataPreview3"></span></div>
            <a href="" target="_blank" id="qrNoteLink">
              <div id="qrCodeNote" class="qr-code"></div>
            </a>
            <div class="qr-slide-label">Raw event identifier</div>
          </div>
        </div>
      </div>
    `;

    qrSection.appendChild(qrContainer);

    // Generate QR codes
    this.generateQRCodes();

    return qrSection;
  }

  /**
   * Create chat section
   */
  private createChatSection(): HTMLElement {
    const chatSection = document.createElement('div');
    chatSection.className = 'chat-section';

    // Create chat header
    const chatHeader = document.createElement('div');
    chatHeader.className = 'chat-header';
    chatHeader.innerHTML = '<h3>Live Chat</h3>';
    chatSection.appendChild(chatHeader);

    // Create chat messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.id = 'zaps';
    messagesContainer.className = 'chat-messages loading';
    messagesContainer.innerHTML =
      '<div class="loading-text">Loading messages...</div>';
    chatSection.appendChild(messagesContainer);

    // Create activity list for live events
    const activityList = document.createElement('div');
    activityList.id = 'activity-list';
    activityList.className = 'activity-list';
    chatSection.appendChild(activityList);

    return chatSection;
  }

  /**
   * Create participants section
   */
  private createParticipantsSection(): HTMLElement {
    const participantsSection = document.createElement('div');
    participantsSection.className = 'participants-section';

    // Create participants header
    const participantsHeader = document.createElement('div');
    participantsHeader.className = 'participants-header';
    participantsHeader.innerHTML = '<h3>Participants</h3>';
    participantsSection.appendChild(participantsHeader);

    // Create participants list
    const participantsList = document.createElement('div');
    participantsList.className = 'participants-list';
    participantsSection.appendChild(participantsList);

    // Add participants
    this.addParticipants(participantsList);

    return participantsSection;
  }

  /**
   * Create video player
   */
  private createVideoPlayer(): HTMLElement | null {
    // Check if streaming URL is available in event content or tags
    const streamingUrl = this.getStreamingUrl();
    if (!streamingUrl) return null;

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-player-container';

    const video = document.createElement('video');
    video.className = 'live-video';
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.src = streamingUrl;

    videoContainer.appendChild(video);
    return videoContainer;
  }

  /**
   * Generate QR codes
   */
  private generateQRCodes(): void {
    if (!this.event) return;

    const identifier = this.event.identifier;
    const pubkey = this.event.pubkey;
    const kind = 30311;

    if (!identifier || !pubkey) return;

    try {
      // Generate naddr
      const naddrId = (window as any).NostrTools.nip19.naddrEncode({
        identifier,
        pubkey,
        kind,
        relays: []
      });

      const njumpUrl = `https://njump.me/${naddrId}`;
      const nostrNaddr = `nostr:${naddrId}`;

      // Calculate QR size
      const qrSize = Math.min(
        window.innerWidth * 0.6,
        window.innerHeight * 0.7
      );

      // Generate QR codes
      this.generateQRCode('qrCode', njumpUrl, qrSize);
      this.generateQRCode('qrCodeNevent', nostrNaddr, qrSize);
      this.generateQRCode('qrCodeNote', naddrId, qrSize);

      // Update links
      this.updateQRLinks(njumpUrl, nostrNaddr, naddrId);

      // Update previews
      this.updateQRPreviews(njumpUrl, nostrNaddr, naddrId);
    } catch (error) {
      this.errorService.error('Error generating QR codes', error as Error);
    }
  }

  /**
   * Generate individual QR code
   */
  private generateQRCode(elementId: string, value: string, size: number): void {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      new (window as any).QRious({
        element,
        value,
        size
      });
    } catch (error) {
      this.errorService.error(
        `Error generating QR code for ${elementId}`,
        error as Error
      );
    }
  }

  /**
   * Update QR links
   */
  private updateQRLinks(
    njumpUrl: string,
    nostrNaddr: string,
    naddrId: string
  ): void {
    const qrLink = document.getElementById('qrLink') as HTMLAnchorElement;
    const qrNeventLink = document.getElementById(
      'qrNeventLink'
    ) as HTMLAnchorElement;
    const qrNoteLink = document.getElementById(
      'qrNoteLink'
    ) as HTMLAnchorElement;

    if (qrLink) qrLink.href = njumpUrl;
    if (qrNeventLink) qrNeventLink.href = nostrNaddr;
    if (qrNoteLink) qrNoteLink.href = naddrId;
  }

  /**
   * Update QR previews
   */
  private updateQRPreviews(
    njumpUrl: string,
    nostrNaddr: string,
    naddrId: string
  ): void {
    const preview1 = document.getElementById('qrDataPreview1');
    const preview2 = document.getElementById('qrDataPreview2');
    const preview3 = document.getElementById('qrDataPreview3');

    if (preview1) preview1.textContent = `(${njumpUrl.substring(0, 20)}...)`;
    if (preview2) preview2.textContent = `(${nostrNaddr.substring(0, 20)}...)`;
    if (preview3) preview3.textContent = `(${naddrId.substring(0, 20)}...)`;
  }

  /**
   * Add chat message
   */
  addChatMessage(message: ChatMessage): void {
    const messagesContainer = this.find('#zaps');
    if (!messagesContainer) return;

    // Hide loading animation
    messagesContainer.classList.remove('loading');
    const loadingText = messagesContainer.querySelector('.loading-text');
    if (loadingText) loadingText.remove();

    // Create chat message component
    const messageElement = document.createElement('div');
    const chatComponent = new ChatMessageComponent(
      messageElement,
      message,
      this.options.chatOptions,
      this.errorService
    );

    // Insert message in chronological order
    this.insertMessageInOrder(messagesContainer, messageElement);

    // Store component
    this.chatComponents.set(message.id, chatComponent);
  }

  /**
   * Insert message in chronological order
   */
  private insertMessageInOrder(
    container: HTMLElement,
    messageElement: HTMLElement
  ): void {
    const existingMessages = Array.from(
      container.querySelectorAll('.live-chat-message, .live-event-zap')
    );
    const messageTimestamp = parseInt(messageElement.dataset.timestamp || '0');

    const insertPosition = existingMessages.findIndex(
      msg =>
        parseInt((msg as HTMLElement).dataset.timestamp || '0') <
        messageTimestamp
    );

    if (insertPosition === -1) {
      container.appendChild(messageElement);
    } else {
      const targetElement = existingMessages[insertPosition];
      if (targetElement) {
        container.insertBefore(messageElement, targetElement);
      } else {
        container.appendChild(messageElement);
      }
    }
  }

  /**
   * Add participant
   */
  addParticipant(participant: User): void {
    this.participants.set(participant.publicKey, participant);
    this.updateParticipantsDisplay();
  }

  /**
   * Update participants display
   */
  private updateParticipantsDisplay(): void {
    const participantsList = this.find('.participants-list');
    if (!participantsList) return;

    participantsList.innerHTML = '';

    this.participants.forEach(participant => {
      const participantElement = document.createElement('div');
      participantElement.className = 'participant';
      participantElement.innerHTML = `
        <img src="${participant.picture || '/live/images/gradient_color.gif'}" alt="${participant.displayName || participant.name}" class="participant-avatar">
        <span class="participant-name">${participant.displayName || participant.name || participant.publicKey.slice(0, 8)}...</span>
      `;
      participantsList.appendChild(participantElement);
    });
  }

  /**
   * Add participants from event tags
   */
  private addParticipants(container: HTMLElement): void {
    if (!this.event) return;

    const participantTags = this.event.tags.filter(tag => tag[0] === 'p');
    participantTags.forEach(tag => {
      const pubkey = tag[1];
      if (pubkey) {
        const participantElement = document.createElement('div');
        participantElement.className = 'participant';
        participantElement.innerHTML = `
          <img src="/images/gradient_color.gif" alt="Participant" class="participant-avatar" data-pubkey="${pubkey}">
          <span class="participant-name">${pubkey.slice(0, 8)}...</span>
        `;
        container.appendChild(participantElement);
      }
    });
  }

  /**
   * Get event title
   */
  private getEventTitle(): string {
    if (!this.event) return 'Live Event';

    // Try to extract title from content or tags
    const titleTag = this.event.tags.find(tag => tag[0] === 'title');
    if (titleTag && titleTag[1]) {
      return titleTag[1];
    }

    return this.event.content || 'Live Event';
  }

  /**
   * Get author display name
   */
  private getAuthorDisplayName(): string {
    if (!this.event) return 'Unknown';

    // This would get from profile service
    return `${this.event.pubkey.slice(0, 8)}...`;
  }

  /**
   * Get author avatar
   */
  private getAuthorAvatar(): string {
    // This would get from profile service
    return '/live/images/gradient_color.gif';
  }

  /**
   * Format event content
   */
  private formatEventContent(): string {
    if (!this.event) return '';

    return this.event.content
      .replace(/\n/g, '<br>')
      .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  }

  /**
   * Get streaming URL
   */
  private getStreamingUrl(): string | null {
    if (!this.event) return null;

    // Check for streaming URL in tags
    const streamingTag = this.event.tags.find(tag => tag[0] === 'streaming');
    if (streamingTag && streamingTag[1]) {
      return streamingTag[1];
    }

    // Check for streaming URL in content
    const urlMatch = this.event.content.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return urlMatch[0];
    }

    return null;
  }

  /**
   * Show loading state
   */
  private showLoading(): void {
    this.element.innerHTML = '<div class="loading">Loading live event...</div>';
  }

  /**
   * Get current event
   */
  getEvent(): LiveEvent | null {
    return this.event;
  }

  /**
   * Get participants
   */
  getParticipants(): Map<string, User> {
    return new Map(this.participants);
  }

  /**
   * Get chat messages
   */
  getChatMessages(): Map<string, ChatMessageComponent> {
    return new Map(this.chatComponents);
  }
}
