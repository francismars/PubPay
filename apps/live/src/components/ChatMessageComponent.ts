// ChatMessageComponent - Handles chat message display
import { BaseComponent } from '@pubpay/shared-ui';
import { ErrorService } from '@pubpay/shared-services';
import { User } from '@pubpay/shared-types';
import { sanitizeImageUrl, escapeHtml } from '../utils/sanitization';

export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  author?: User;
}

export interface ChatMessageOptions {
  showAvatar?: boolean;
  showTimestamp?: boolean;
  showAuthor?: boolean;
  maxLength?: number;
  className?: string;
  avatarSize?: number;
  timeFormat?: 'relative' | 'absolute';
}

export class ChatMessageComponent extends BaseComponent {
  private message: ChatMessage;
  private options: ChatMessageOptions;

  constructor(
    element: HTMLElement | string,
    message: ChatMessage,
    options: ChatMessageOptions = {},
    errorService: ErrorService
  ) {
    super(element, errorService);
    this.message = message;
    this.options = {
      showAvatar: true,
      showTimestamp: true,
      showAuthor: true,
      maxLength: 500,
      className: 'chat-message',
      avatarSize: 40,
      timeFormat: 'relative',
      ...options
    };
  }

  initialize(): void {
    this.render();
  }

  render(): void {
    this.safeExecute(() => {
      this.clear();
      this.createMessageElement();
    }, 'Error rendering chat message');
  }

  update(message: Partial<ChatMessage>): void {
    this.message = { ...this.message, ...message };
    this.render();
  }

  /**
   * Create chat message element
   */
  private createMessageElement(): void {
    const messageDiv = document.createElement('div');
    messageDiv.className = `live-chat-message ${this.options.className || ''}`;
    messageDiv.dataset.pubkey = this.message.pubkey;
    messageDiv.dataset.timestamp = this.message.created_at.toString();
    messageDiv.dataset.messageId = this.message.id;

    // Create message header
    const header = this.createMessageHeader();
    messageDiv.appendChild(header);

    // Create message content
    const content = this.createMessageContent();
    messageDiv.appendChild(content);

    this.element.appendChild(messageDiv);
  }

  /**
   * Create message header with avatar and info
   */
  private createMessageHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'chat-message-header';

    // Create avatar if enabled
    if (this.options.showAvatar) {
      const avatar = this.createAvatar();
      header.appendChild(avatar);
    }

    // Create message info
    const info = this.createMessageInfo();
    header.appendChild(info);

    return header;
  }

  /**
   * Create avatar element
   */
  private createAvatar(): HTMLElement {
    const avatarImg = document.createElement('img');
    avatarImg.className = 'chat-author-img';
    avatarImg.dataset.pubkey = this.message.pubkey;
    avatarImg.style.width = `${this.options.avatarSize}px`;
    avatarImg.style.height = `${this.options.avatarSize}px`;
    avatarImg.style.borderRadius = '50%';
    avatarImg.style.objectFit = 'cover';

    // Set avatar source
    if (this.message.author?.picture) {
      avatarImg.src = sanitizeImageUrl(this.message.author.picture) || '/live/images/gradient_color.gif';
    } else {
      avatarImg.src = '/live/images/gradient_color.gif'; // Default avatar
    }

    // Add error handling for broken images
    avatarImg.onerror = () => {
      avatarImg.src = '/live/images/gradient_color.gif';
    };

    return avatarImg;
  }

  /**
   * Create message info (author name and timestamp)
   */
  private createMessageInfo(): HTMLElement {
    const info = document.createElement('div');
    info.className = 'chat-message-info';

    // Create author name
    if (this.options.showAuthor) {
      const authorName = document.createElement('div');
      authorName.className = 'chat-author-name';
      authorName.dataset.pubkey = this.message.pubkey;
      authorName.textContent = this.getAuthorDisplayName();
      info.appendChild(authorName);
    }

    // Create timestamp
    if (this.options.showTimestamp) {
      const timestamp = document.createElement('div');
      timestamp.className = 'chat-message-time';
      timestamp.textContent = this.formatTimestamp();
      info.appendChild(timestamp);
    }

    return info;
  }

  /**
   * Create message content
   */
  private createMessageContent(): HTMLElement {
    const content = document.createElement('div');
    content.className = 'chat-message-content';

    // Truncate content if too long
    let displayContent = this.message.content;
    if (
      this.options.maxLength &&
      displayContent.length > this.options.maxLength
    ) {
      displayContent = `${displayContent.substring(0, this.options.maxLength)}...`;
    }

    // Escape HTML and preserve line breaks
    displayContent = escapeHtml(displayContent).replace(/\n/g, '<br>');

    content.innerHTML = displayContent;
    return content;
  }

  /**
   * Get author display name
   */
  private getAuthorDisplayName(): string {
    if (this.message.author?.displayName) {
      return this.message.author.displayName;
    }
    if (this.message.author?.name) {
      return this.message.author.name;
    }
    return `${this.message.pubkey.slice(0, 8)}...`;
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(): string {
    const date = new Date(this.message.created_at * 1000);

    if (this.options.timeFormat === 'relative') {
      return this.getRelativeTime(date);
    } else {
      return date.toLocaleString();
    }
  }

  /**
   * Get relative time (e.g., "2 minutes ago")
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  }


  /**
   * Update author information
   */
  updateAuthor(author: User): void {
    this.message.author = author;
    this.render();
  }

  /**
   * Get message data
   */
  getMessage(): ChatMessage {
    return { ...this.message };
  }

  /**
   * Get message age in seconds
   */
  getAge(): number {
    return Math.floor(Date.now() / 1000) - this.message.created_at;
  }

  /**
   * Check if message is recent (within last 5 minutes)
   */
  isRecent(): boolean {
    return this.getAge() < 300; // 5 minutes
  }

  /**
   * Highlight the message
   */
  highlight(): void {
    this.addClass('highlighted');
    setTimeout(() => {
      this.removeClass('highlighted');
    }, 3000);
  }

  /**
   * Mark message as read
   */
  markAsRead(): void {
    this.addClass('read');
  }

  /**
   * Check if message is read
   */
  isRead(): boolean {
    return this.element.classList.contains('read');
  }
}
