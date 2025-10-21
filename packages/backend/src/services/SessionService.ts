// SessionService - Manages Lightning payment sessions and LNURL mappings
import { Logger } from '../utils/logger';

export interface LightningEvent {
  lnurl: string;
  lastSeen: number;
  active: boolean;
}

export interface LightningSession {
  events: Record<string, LightningEvent>;
}

export interface LNURLMapping {
  frontendSessionId: string;
  eventId: string;
}

export class SessionService {
  private sessions: Map<string, LightningSession> = new Map();
  private lnurlpMappings: Map<string, LNURLMapping> = new Map();
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger('SessionService');
    
    // Start cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
    
    this.logger.info('SessionService initialized with cleanup interval');
  }

  /**
   * Create or update a Lightning session
   */
  createOrUpdateSession(frontendSessionId: string, eventId: string, lnurl: string, lnurlpId?: string): void {
    let session = this.sessions.get(frontendSessionId);
    
    if (!session) {
      session = { events: {} };
      this.sessions.set(frontendSessionId, session);
    }
    
    session.events[eventId] = {
      lnurl,
      lastSeen: Date.now(),
      active: true
    };
    
    // Use provided LNURL-pay ID or try to extract from LNURL
    const id = lnurlpId || this.extractLNURLPayId(lnurl);
    if (id) {
      this.lnurlpMappings.set(id, {
        frontendSessionId,
        eventId
      });
      
      this.logger.info(`Created LNURL mapping: ${id} -> ${frontendSessionId}/${eventId}`);
    } else {
      this.logger.warn('No LNURL-pay ID available for mapping');
    }
    
    this.logger.info(`Session updated: ${frontendSessionId}/${eventId}`, {
      lnurl,
      active: true,
      totalSessions: this.sessions.size,
      totalMappings: this.lnurlpMappings.size
    });
  }

  /**
   * Get session by frontend session ID
   */
  getSession(frontendSessionId: string): LightningSession | undefined {
    return this.sessions.get(frontendSessionId);
  }

  /**
   * Get LNURL mapping by LNURL-pay ID
   */
  getLNURLMapping(lnurlpId: string): LNURLMapping | undefined {
    return this.lnurlpMappings.get(lnurlpId);
  }

  /**
   * Update last seen timestamp for a session event
   */
  updateLastSeen(frontendSessionId: string, eventId: string): void {
    const session = this.sessions.get(frontendSessionId);
    if (session && session.events[eventId]) {
      session.events[eventId].lastSeen = Date.now();
      this.logger.debug(`Updated last seen for ${frontendSessionId}/${eventId}`);
    }
  }

  /**
   * Deactivate a session event
   */
  deactivateSession(frontendSessionId: string, eventId: string): boolean {
    const session = this.sessions.get(frontendSessionId);
    if (session && session.events[eventId]) {
      const wasActive = session.events[eventId].active;
      session.events[eventId].active = false;
      session.events[eventId].lastSeen = Date.now();
      
      this.logger.info(`Deactivated session: ${frontendSessionId}/${eventId} (was active: ${wasActive})`);
      return wasActive;
    }
    
    return false;
  }

  /**
   * Get all sessions (for debugging)
   */
  getAllSessions(): Array<[string, LightningSession]> {
    return Array.from(this.sessions.entries());
  }

  /**
   * Get all LNURL mappings (for debugging)
   */
  getAllLNURLMappings(): Array<[string, LNURLMapping]> {
    return Array.from(this.lnurlpMappings.entries());
  }

  /**
   * Extract LNURL-pay ID from LNURL
   */
  private extractLNURLPayId(lnurl: string): string | null {
    try {
      // LNURL format: https://domain.com/lnurlp/abc123
      const url = new URL(lnurl);
      const pathParts = url.pathname.split('/');
      
      // Find the lnurlp part and get the ID after it
      const lnurlpIndex = pathParts.indexOf('lnurlp');
      if (lnurlpIndex !== -1 && lnurlpIndex + 1 < pathParts.length) {
        const id = pathParts[lnurlpIndex + 1];
        return id || null;
      }
      
      return null;
    } catch (error) {
      this.logger.warn('Failed to extract LNURL-pay ID from:', lnurl);
      return null;
    }
  }

  /**
   * Cleanup inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const cleanupThreshold = 60 * 60 * 1000; // 1 hour
    
    let cleanedSessions = 0;
    let cleanedMappings = 0;
    
    for (const [frontendSessionId, session] of this.sessions.entries()) {
      let hasActiveEvents = false;
      
      for (const [eventId, eventData] of Object.entries(session.events)) {
        if (now - eventData.lastSeen > cleanupThreshold) {
          // Remove inactive event
          delete session.events[eventId];
          cleanedSessions++;
          
          // Remove corresponding LNURL mapping
          for (const [lnurlpId, mapping] of this.lnurlpMappings.entries()) {
            if (mapping.frontendSessionId === frontendSessionId && mapping.eventId === eventId) {
              this.lnurlpMappings.delete(lnurlpId);
              cleanedMappings++;
              break;
            }
          }
          
          this.logger.debug(`Cleaned up event ${eventId} from session: ${frontendSessionId}`);
        } else if (eventData.active) {
          hasActiveEvents = true;
        }
      }
      
      // Remove session if no active events
      if (!hasActiveEvents && Object.keys(session.events).length === 0) {
        this.sessions.delete(frontendSessionId);
        this.logger.debug(`Cleaned up empty session: ${frontendSessionId}`);
      }
    }
    
    if (cleanedSessions > 0 || cleanedMappings > 0) {
      this.logger.info(`Cleanup completed: ${cleanedSessions} events, ${cleanedMappings} mappings`, {
        remainingSessions: this.sessions.size,
        remainingMappings: this.lnurlpMappings.size
      });
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    totalEvents: number;
    activeEvents: number;
    totalMappings: number;
    oldestEvent: number;
    newestEvent: number;
  } {
    let totalEvents = 0;
    let activeEvents = 0;
    let oldestEvent = Date.now();
    let newestEvent = 0;
    
    for (const session of this.sessions.values()) {
      for (const eventData of Object.values(session.events)) {
        totalEvents++;
        if (eventData.active) {
          activeEvents++;
        }
        
        if (eventData.lastSeen < oldestEvent) {
          oldestEvent = eventData.lastSeen;
        }
        if (eventData.lastSeen > newestEvent) {
          newestEvent = eventData.lastSeen;
        }
      }
    }
    
    return {
      totalSessions: this.sessions.size,
      totalEvents,
      activeEvents,
      totalMappings: this.lnurlpMappings.size,
      oldestEvent,
      newestEvent
    };
  }

  /**
   * Destroy service and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.sessions.clear();
    this.lnurlpMappings.clear();
    
    this.logger.info('SessionService destroyed and cleaned up');
  }
}
