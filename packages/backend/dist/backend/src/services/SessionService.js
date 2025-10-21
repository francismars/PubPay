"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
// SessionService - Manages Lightning payment sessions and LNURL mappings
const logger_1 = require("../utils/logger");
class SessionService {
    sessions = new Map();
    lnurlpMappings = new Map();
    logger;
    cleanupInterval;
    constructor() {
        this.logger = new logger_1.Logger('SessionService');
        // Start cleanup interval (every 5 minutes)
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveSessions();
        }, 5 * 60 * 1000);
        this.logger.info('SessionService initialized with cleanup interval');
    }
    /**
     * Create or update a Lightning session
     */
    createOrUpdateSession(frontendSessionId, eventId, lnurl) {
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
        // Extract LNURL-pay ID from LNURL and create mapping
        const lnurlpId = this.extractLNURLPayId(lnurl);
        if (lnurlpId) {
            this.lnurlpMappings.set(lnurlpId, {
                frontendSessionId,
                eventId
            });
            this.logger.info(`Created LNURL mapping: ${lnurlpId} -> ${frontendSessionId}/${eventId}`);
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
    getSession(frontendSessionId) {
        return this.sessions.get(frontendSessionId);
    }
    /**
     * Get LNURL mapping by LNURL-pay ID
     */
    getLNURLMapping(lnurlpId) {
        return this.lnurlpMappings.get(lnurlpId);
    }
    /**
     * Update last seen timestamp for a session event
     */
    updateLastSeen(frontendSessionId, eventId) {
        const session = this.sessions.get(frontendSessionId);
        if (session && session.events[eventId]) {
            session.events[eventId].lastSeen = Date.now();
            this.logger.debug(`Updated last seen for ${frontendSessionId}/${eventId}`);
        }
    }
    /**
     * Deactivate a session event
     */
    deactivateSession(frontendSessionId, eventId) {
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
    getAllSessions() {
        return Array.from(this.sessions.entries());
    }
    /**
     * Get all LNURL mappings (for debugging)
     */
    getAllLNURLMappings() {
        return Array.from(this.lnurlpMappings.entries());
    }
    /**
     * Extract LNURL-pay ID from LNURL
     */
    extractLNURLPayId(lnurl) {
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
        }
        catch (error) {
            this.logger.warn('Failed to extract LNURL-pay ID from:', lnurl);
            return null;
        }
    }
    /**
     * Cleanup inactive sessions
     */
    cleanupInactiveSessions() {
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
                }
                else if (eventData.active) {
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
    getStats() {
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
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.sessions.clear();
        this.lnurlpMappings.clear();
        this.logger.info('SessionService destroyed and cleaned up');
    }
}
exports.SessionService = SessionService;
//# sourceMappingURL=SessionService.js.map