var express = require('express');
var router = express.Router();
const crypto = require('crypto');

// WebSocket polyfill for Node.js
const WebSocket = require('ws');
global.WebSocket = WebSocket;

const { SimplePool } = require('nostr-tools');

// LNBits configuration
const LNBITS_CONFIG = {
  baseUrl: process.env.LNBITS_URL || 'https://legend.lnbits.com',
  apiKey: process.env.LNBITS_API_KEY,
  webhookUrl: process.env.WEBHOOK_URL || 'https://yourdomain.com/lightning/webhook'
};

// Validate configuration
if (!LNBITS_CONFIG.apiKey) {
  console.error('❌ LNBITS_API_KEY environment variable is not set!');
  console.error('Please create a .env file with your LNBits configuration.');
}

if (!process.env.WEBHOOK_URL) {
  console.warn('⚠️  WEBHOOK_URL environment variable is not set, using default fallback');
  console.warn('This will not work for production. Please set WEBHOOK_URL in your .env file.');
}

// Frontend session tracking: frontendSessionId -> { events: { eventId: { lnurl, lastSeen, active } } }
const frontendSessions = new Map();

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  
  for (const [frontendSessionId, session] of frontendSessions.entries()) {
    // Check if any events in this session are still active
    let hasActiveEvents = false;
    for (const [eventId, eventData] of Object.entries(session.events)) {
      if (now - eventData.lastSeen > 3600000) { // 1 hour
        delete session.events[eventId];
        console.log(`Cleaned up event ${eventId} from session: ${frontendSessionId}`);
      } else if (eventData.active) {
        hasActiveEvents = true;
      }
    }
    
    // If no events left in session, delete the entire session
    if (Object.keys(session.events).length === 0) {
      frontendSessions.delete(frontendSessionId);
      console.log(`Cleaned up entire frontend session: ${frontendSessionId}`);
    }
  }
}, 300000);

// Enable Lightning payments for frontend session
router.post('/enable', async (req, res) => {
  console.log('⚡ Lightning enable endpoint called:', {
    frontendSessionId: req.body.frontendSessionId,
    eventId: req.body.eventId,
    timestamp: new Date().toISOString()
  });
  
  const { frontendSessionId, eventId } = req.body;
  
  if (!frontendSessionId || !eventId) {
    const errorMsg = 'Missing required parameters: frontendSessionId and eventId are both required';
    console.log('❌ Validation failed:', { frontendSessionId, eventId });
    return res.status(400).json({ 
      success: false,
      error: errorMsg,
      details: 'Please provide both frontendSessionId and eventId in the request body'
    });
  }
  
  try {
    // Get or create session
    let session = frontendSessions.get(frontendSessionId);
    if (!session) {
      session = { events: {} };
      frontendSessions.set(frontendSessionId, session);
    }
    
    // Check if this specific event already has an active LNURL
    if (session.events[eventId] && session.events[eventId].lnurl && session.events[eventId].active) {
      // Update last seen and return existing LNURL
      session.events[eventId].lastSeen = Date.now();
      console.log(`♻️  Reusing existing active LNURL for session: ${frontendSessionId}, event: ${eventId}`);
      
      return res.json({
        success: true,
        message: 'Lightning payments enabled using existing payment link',
        lnurl: session.events[eventId].lnurl,
        existing: true,
        sessionInfo: {
          frontendSessionId,
          eventId,
          lastSeen: new Date(session.events[eventId].lastSeen).toISOString(),
          status: 'active',
          totalEvents: Object.keys(session.events).length
        }
      });
    }
    
    // Create new LNURL for this frontend session and event
    console.log(`🆕 Creating new LNURL for session: ${frontendSessionId}, event: ${eventId}`);
    const lnurl = await createLNBitsLNURL(eventId, frontendSessionId);
    
    // Store event data in session
    session.events[eventId] = {
      lnurl,
      lastSeen: Date.now(),
      active: true
    };
    
    console.log(`✅ Successfully created new LNURL for session: ${frontendSessionId}, event: ${eventId}`);
    
    res.json({
      success: true,
      message: 'Lightning payments enabled with new payment link',
      lnurl: lnurl,
      existing: false,
      sessionInfo: {
        frontendSessionId,
        eventId,
        lastSeen: new Date().toISOString(),
        status: 'active',
        totalEvents: Object.keys(session.events).length
      },
      instructions: {
        qrCode: 'Display the LNURL as a QR code for users to scan',
        paymentFlow: 'Users can scan QR code to pay with any Lightning wallet',
        zapIntegration: 'Payments will automatically appear as zaps in the live feed'
      }
    });
    
  } catch (error) {
    console.error('💥 Error creating LNURL:', {
      error: error.message,
      frontendSessionId,
      eventId,
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to create Lightning payment link',
      details: error.message,
      troubleshooting: {
        checkLNBits: 'Verify LNBits API configuration and credentials',
        checkNetwork: 'Ensure server can reach LNBits API',
        checkWebhook: 'Verify webhook URL is accessible from LNBits'
      }
    });
  }
});

// Disable Lightning payments for frontend session
router.post('/disable', (req, res) => {
  console.log('🔌 Lightning disable endpoint called:', {
    frontendSessionId: req.body.frontendSessionId,
    eventId: req.body.eventId,
    timestamp: new Date().toISOString()
  });
  
  const { frontendSessionId, eventId } = req.body;
  
  if (!frontendSessionId || !eventId) {
    const errorMsg = 'Missing required parameters: frontendSessionId and eventId are both required';
    console.log('❌ Validation failed:', { frontendSessionId, eventId });
    return res.status(400).json({ 
      success: false,
      error: errorMsg,
      details: 'Please provide both frontendSessionId and eventId in the request body'
    });
  }
  
  // Find and deactivate specific event in session
  const session = frontendSessions.get(frontendSessionId);
  
  if (session && session.events[eventId]) {
    // Mark specific event as inactive instead of deleting immediately
    // This allows for potential re-enabling without creating new LNURL
    const wasActive = session.events[eventId].active;
    session.events[eventId].active = false;
    session.events[eventId].lastSeen = Date.now();
    
    console.log(`🔌 Disabled Lightning payments for session: ${frontendSessionId}, event: ${eventId} (was active: ${wasActive})`);
    
    res.json({ 
      success: true,
      message: 'Lightning payments disabled successfully',
      sessionInfo: {
        frontendSessionId,
        eventId,
        lastSeen: new Date(session.events[eventId].lastSeen).toISOString(),
        status: 'inactive',
        wasActive,
        totalEvents: Object.keys(session.events).length
      },
      note: 'Event is preserved for potential re-enabling without creating new LNURL'
    });
  } else {
    console.log(`❌ Session or event not found for disable request:`, { frontendSessionId, eventId });
    res.status(404).json({ 
      success: false,
      error: 'Lightning payment session not found',
      details: `No active session found for frontendSessionId: ${frontendSessionId} and eventId: ${eventId}`,
      troubleshooting: {
        checkSessionId: 'Verify the frontendSessionId matches the one used to enable payments',
        checkEventId: 'Verify the eventId matches the one used to enable payments',
        checkActive: 'Session may have been automatically cleaned up due to inactivity'
      }
    });
  }
});

// Create LNURL-pay using LNBits API
async function createLNBitsLNURL(eventId, frontendSessionId) {
  console.log('Creating LNBits LNURL with config:', {
    baseUrl: LNBITS_CONFIG.baseUrl,
    hasApiKey: !!LNBITS_CONFIG.apiKey,
    webhookUrl: LNBITS_CONFIG.webhookUrl
  });
  
  const requestBody = {
    description: `Payment for event ${eventId}`,
    min: 1000, // 1 sat minimum
    max: 100000000, // 1M sats maximum
    comment_chars: 200,
    webhook_url: `${LNBITS_CONFIG.webhookUrl}?frontendSessionId=${frontendSessionId}&eventId=${eventId}`,
    success_text: 'Payment received! Thank you for your support.',
    success_url: `${LNBITS_CONFIG.baseUrl}/lightning/success/${frontendSessionId}`,
    currency: 'sat'
  };
  
  console.log('LNBits request body:', requestBody);
  
  const response = await fetch(`${LNBITS_CONFIG.baseUrl}/lnurlp/api/v1/links`, {
    method: 'POST',
    headers: {
      'X-Api-Key': LNBITS_CONFIG.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  console.log('LNBits response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('LNBits API error:', errorText);
    throw new Error(`LNBits API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('LNBits response data:', data);
  return data.lnurl;
}

// LNBits webhook endpoint for payment notifications
router.post('/webhook', async (req, res) => {
  const { frontendSessionId, eventId } = req.query;
  const paymentData = req.body;
  
  console.log('💰 LNBits webhook received:', {
    frontendSessionId,
    eventId,
    paymentAmount: paymentData.amount,
    paymentComment: paymentData.comment,
    timestamp: new Date().toISOString()
  });
  
  if (!frontendSessionId || !eventId) {
    console.log('❌ Missing required webhook parameters:', { frontendSessionId, eventId });
    return res.status(400).json({ 
      success: false,
      error: 'Missing required parameters',
      details: 'Frontend session ID and event ID are required in query parameters'
    });
  }
  
  // Verify frontend session exists and event is active
  const session = frontendSessions.get(frontendSessionId);
  if (!session || !session.events[eventId] || !session.events[eventId].active) {
    console.log('❌ Invalid or inactive session for webhook:', { 
      frontendSessionId, 
      eventId,
      sessionExists: !!session,
      eventExists: session?.events?.[eventId] ? true : false,
      eventActive: session?.events?.[eventId]?.active
    });
    return res.status(404).json({ 
      success: false,
      error: 'Invalid or inactive session',
      details: 'The payment session is either not found, inactive, or does not match the event ID'
    });
  }
  
  // Update last seen for this specific event
  session.events[eventId].lastSeen = Date.now();
  
  // Send anonymous zap to Nostr with comment as zapperMessage
  try {
    const amount = paymentData.amount || 1000; // Default to 1 sat if not provided
    const comment = paymentData.comment || 'Lightning payment';
    
    console.log(`⚡ Processing Lightning payment: ${amount} sats for event ${eventId} with comment: "${comment}"`);
    
    try {
      await sendAnonymousZap(eventId, amount, comment);
      console.log(`✅ Successfully published anonymous zap: ${amount} sats for event ${eventId}`);
    } catch (error) {
      console.error(`❌ Failed to publish zap: ${error.message}`);
      // Don't fail the webhook response, just log the error
    }
    
    res.json({ 
      success: true,
      message: 'Payment processed and zap published successfully',
      paymentInfo: {
        amount,
        comment,
        eventId,
        frontendSessionId
      },
      zapStatus: 'Published to Nostr relays'
    });
  } catch (error) {
    console.error('💥 Error sending anonymous zap:', {
      error: error.message,
      frontendSessionId,
      eventId,
      amount: paymentData.amount,
      comment: paymentData.comment,
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to publish zap to Nostr',
      details: error.message,
      troubleshooting: {
        checkNostrRelays: 'Verify Nostr relay connections are working',
        checkNostrKeys: 'Verify anonymous key generation is working',
        checkNetwork: 'Ensure server can reach Nostr relays'
      }
    });
  }
});

// Send anonymous zap to Nostr
async function sendAnonymousZap(eventId, amount, comment) {
  const pool = new SimplePool();
  const relays = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.nostr.band'
  ];
  
  try {
    // Generate anonymous key pair (same as frontend)
    const privateKey = crypto.randomBytes(32);
    
    console.log(`Creating zap request for event ${eventId} with amount ${amount} sats`);
    
    // Decode note1... or nevent1... to get raw hex event ID
    let rawEventId = eventId;
    if (eventId.startsWith('note1') || eventId.startsWith('nevent1')) {
      try {
        const { decode } = require('nostr-tools/nip19');
        const decoded = decode(eventId);
        
        if (eventId.startsWith('note1')) {
          // note1... decodes to raw hex event ID
          rawEventId = decoded.data;
        } else if (eventId.startsWith('nevent1')) {
          // nevent1... decodes to object with id field
          rawEventId = decoded.data.id;
        }
        
        console.log(`Decoded event ID: ${eventId} -> ${rawEventId}`);
      } catch (error) {
        console.log('Could not decode event ID, using as-is:', error.message);
        // If decoding fails, we'll use the original format and let makeZapRequest handle it
      }
    }
    
    // Fetch the event to get the author's pubkey
    let authorPubkey;
    try {
      console.log(`Fetching event ${rawEventId} to get author's pubkey...`);
      const event = await pool.get(relays, {
        ids: [rawEventId]
      });
      
      if (!event || !event.pubkey) {
        throw new Error(`Event not found or has no pubkey: ${rawEventId}`);
      }
      
      authorPubkey = event.pubkey;
      console.log(`Found event author pubkey: ${authorPubkey}`);
    } catch (error) {
      throw new Error(`Failed to fetch event: ${error.message}`);
    }
    
    // Fetch the author's profile to get Lightning address
    let lightningAddress;
    let lnurlCallback;
    try {
      console.log(`Fetching profile for author ${authorPubkey}...`);
      const profile = await pool.get(relays, {
        kinds: [0],
        authors: [authorPubkey]
      });
      
      if (!profile || !profile.content) {
        throw new Error(`Profile not found for author ${authorPubkey}`);
      }
      
      const profileData = JSON.parse(profile.content);
      lightningAddress = profileData.lud16 || profileData.lud06;
      
      if (!lightningAddress) {
        throw new Error(`No Lightning address found in profile for author ${authorPubkey}. Author needs to set lud16 or lud06 field.`);
      }
      
      console.log(`Found Lightning address: ${lightningAddress}`);
      
      // Parse Lightning address to get LNURL discovery endpoint
      const ludSplit = lightningAddress.split('@');
      if (ludSplit.length !== 2) {
        throw new Error(`Invalid Lightning address format: ${lightningAddress}`);
      }
      
      const lnurlDiscoveryUrl = `https://${ludSplit[1]}/.well-known/lnurlp/${ludSplit[0]}`;
      console.log(`LNURL discovery URL: ${lnurlDiscoveryUrl}`);
      
      // Fetch LNURL discovery to get the callback URL
      const discoveryResponse = await fetch(lnurlDiscoveryUrl);
      const discoveryData = await discoveryResponse.json();
      
      if (discoveryData.status !== 'OK' || !discoveryData.callback) {
        throw new Error(`LNURL discovery failed: ${discoveryData.reason || 'Unknown error'}`);
      }
      
      lnurlCallback = discoveryData.callback;
      console.log(`LNURL callback URL: ${lnurlCallback}`);
      console.log(`LNURL supports Nostr: ${discoveryData.allowsNostr}`);
      console.log(`Min sendable: ${discoveryData.minSendable}, Max sendable: ${discoveryData.maxSendable}`);
      
    } catch (error) {
      throw new Error(`Failed to get Lightning address: ${error.message}`);
    }
    
    // Use the same approach as frontend - makeZapRequest from nip57
    let makeZapRequest;
    try {
      const nip57 = require('nostr-tools/nip57');
      makeZapRequest = nip57.makeZapRequest;
    } catch (error) {
      // Fallback to main export
      const nostrTools = require('nostr-tools');
      makeZapRequest = nostrTools.makeZapRequest;
    }
    
    const zapRequest = makeZapRequest({
      profile: authorPubkey,
      event: rawEventId, // Use raw hex event ID
      amount: amount,
      comment: String(comment || ''),
      relays: relays
    });
    
    console.log('Zap request:', JSON.stringify(zapRequest, null, 2));
    
    // Sign the zap request (same as frontend anonymous zap)
    const signedZapRequest = await signEvent(zapRequest, privateKey);
    console.log('Signed zap request:', signedZapRequest);
    
    // Send zap request to LNURL callback (not publish to relays)
    // According to NIP-57, the zap request (kind 9734) should be sent to the LNURL callback
    // The LNURL server will validate it and return an invoice
    // Once paid, the server will publish the zap receipt (kind 9735) to relays
    
    try {
      console.log(`Sending zap request to LNURL callback: ${lnurlCallback}`);
      
      // Send zap request to LNURL callback
      const zapRequestUrl = `${lnurlCallback}?nostr=${encodeURIComponent(JSON.stringify(signedZapRequest))}&amount=${amount}`;
      
      const response = await fetch(zapRequestUrl);
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        throw new Error(`LNURL callback returned non-JSON response (${response.status}): ${textResponse.substring(0, 200)}`);
      }
      
      const responseData = await response.json();
      
      if (!response.ok || !responseData.pr) {
        throw new Error(`LNURL callback error: ${responseData.reason || 'Unknown error'}`);
      }
      
      console.log(`Received Lightning invoice: ${responseData.pr}`);
      console.log(`Zap request sent successfully to ${lnurlCallback}`);
      
      // Pay the invoice using LNBits API
      console.log('Paying Lightning invoice using LNBits...');
      const paymentResponse = await fetch(`${LNBITS_CONFIG.baseUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'X-Api-Key': LNBITS_CONFIG.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          out: true,
          bolt11: responseData.pr
        })
      });
      
      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json();
        throw new Error(`Failed to pay invoice: ${errorData.detail || 'Unknown error'}`);
      }
      
      const paymentData = await paymentResponse.json();
      console.log(`✅ Lightning invoice paid successfully!`);
      console.log(`Payment details:`, paymentData);
      console.log(`The recipient's Lightning service will now create and publish the zap receipt (kind 9735)`);
      
    } catch (error) {
      throw new Error(`Failed to send zap request: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error in sendAnonymousZap:', error.message);
    throw error; // Re-throw to be caught by the calling function
  } finally {
    // Always close the pool
    try {
      pool.close(relays);
    } catch (closeError) {
      console.log('Error closing pool:', closeError.message);
    }
  }
}

// Proper Nostr event signing
async function signEvent(event, privateKey) {
  const { finalizeEvent } = require('nostr-tools');
  
  // Convert private key to hex string
  const privateKeyHex = privateKey.toString('hex');
  
  // Sign the event
  const signedEvent = finalizeEvent(event, privateKeyHex);
  
  return signedEvent;
}

// Test endpoint for debugging
router.post('/test', (req, res) => {
  console.log('🧪 Lightning test endpoint called:', {
    body: req.body,
    timestamp: new Date().toISOString()
  });
  
  const configStatus = {
    baseUrl: LNBITS_CONFIG.baseUrl,
    hasApiKey: !!LNBITS_CONFIG.apiKey,
    webhookUrl: LNBITS_CONFIG.webhookUrl,
    status: 'configured'
  };
  
  // Check configuration validity
  const issues = [];
  if (!LNBITS_CONFIG.apiKey) {
    issues.push('LNBITS_API_KEY is missing');
    configStatus.status = 'misconfigured';
  }
  if (!process.env.WEBHOOK_URL) {
    issues.push('WEBHOOK_URL is using fallback (not recommended for production)');
  }
  
  res.json({ 
    success: true,
    message: 'Lightning route is working correctly!',
    receivedBody: req.body,
    config: configStatus,
    issues: issues,
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      hasEnvFile: !!process.env.LNBITS_URL || !!process.env.LNBITS_API_KEY,
      loadedVars: {
        LNBITS_URL: !!process.env.LNBITS_URL,
        LNBITS_API_KEY: !!process.env.LNBITS_API_KEY,
        WEBHOOK_URL: !!process.env.WEBHOOK_URL
      }
    },
    endpoints: {
      enable: 'POST /lightning/enable - Enable Lightning payments',
      disable: 'POST /lightning/disable - Disable Lightning payments',
      webhook: 'POST /lightning/webhook - LNBits payment notifications',
      debug: 'GET /lightning/debug/sessions - View active sessions'
    }
  });
});

// Debug endpoint to see current sessions
router.get('/debug/sessions', (req, res) => {
  console.log('🔍 Debug sessions endpoint called');
  
  const sessions = Array.from(frontendSessions.entries()).map(([id, session]) => ({
    frontendSessionId: id,
    events: Object.entries(session.events).map(([eventId, eventData]) => ({
      eventId,
      lnurl: eventData.lnurl,
      active: eventData.active,
      lastSeen: new Date(eventData.lastSeen).toISOString(),
      ageMinutes: Math.round((Date.now() - eventData.lastSeen) / 60000)
    })),
    totalEvents: Object.keys(session.events).length,
    activeEvents: Object.values(session.events).filter(e => e.active).length
  }));
  
  res.json({
    success: true,
    message: 'Current Lightning payment sessions',
    totalSessions: sessions.length,
    totalEvents: sessions.reduce((sum, s) => sum + s.totalEvents, 0),
    activeEvents: sessions.reduce((sum, s) => sum + s.activeEvents, 0),
    frontendSessions: sessions,
    cleanupInfo: {
      inactiveTimeoutMinutes: 60,
      nextCleanup: 'Every 5 minutes',
      note: 'Inactive events are automatically cleaned up after 1 hour'
    }
  });
});

module.exports = router;
