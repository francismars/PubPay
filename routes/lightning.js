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

// Frontend session tracking: frontendSessionId -> { eventId, lnurl, lastSeen, active }
const frontendSessions = new Map();

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  
  for (const [frontendSessionId, session] of frontendSessions.entries()) {
    if (now - session.lastSeen > 3600000) { // 1 hour
      frontendSessions.delete(frontendSessionId);
      console.log(`Cleaned up frontend session: ${frontendSessionId}`);
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
    // Check if frontend session already has an LNURL for this event
    let session = frontendSessions.get(frontendSessionId);
    
    if (session && session.eventId === eventId && session.lnurl && session.active) {
      // Update last seen and return existing LNURL
      session.lastSeen = Date.now();
      console.log(`♻️  Reusing existing active LNURL for session: ${frontendSessionId}, event: ${eventId}`);
      
      return res.json({
        success: true,
        message: 'Lightning payments enabled using existing payment link',
        lnurl: session.lnurl,
        existing: true,
        sessionInfo: {
          frontendSessionId,
          eventId,
          lastSeen: new Date(session.lastSeen).toISOString(),
          status: 'active'
        }
      });
    }
    
    // Create new LNURL for this frontend session and event
    console.log(`🆕 Creating new LNURL for session: ${frontendSessionId}, event: ${eventId}`);
    const lnurl = await createLNBitsLNURL(eventId, frontendSessionId);
    
    // Store or update frontend session
    frontendSessions.set(frontendSessionId, {
      eventId,
      lnurl,
      lastSeen: Date.now(),
      active: true
    });
    
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
        status: 'active'
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
  
  // Find and deactivate frontend session
  const session = frontendSessions.get(frontendSessionId);
  
  if (session && session.eventId === eventId) {
    // Mark as inactive instead of deleting immediately
    // This allows for potential re-enabling without creating new LNURL
    const wasActive = session.active;
    session.active = false;
    session.lastSeen = Date.now();
    
    console.log(`🔌 Disabled Lightning payments for session: ${frontendSessionId}, event: ${eventId} (was active: ${wasActive})`);
    
    res.json({ 
      success: true,
      message: 'Lightning payments disabled successfully',
      sessionInfo: {
        frontendSessionId,
        eventId,
        lastSeen: new Date(session.lastSeen).toISOString(),
        status: 'inactive',
        wasActive
      },
      note: 'Session is preserved for potential re-enabling without creating new LNURL'
    });
  } else {
    console.log(`❌ Session not found for disable request:`, { frontendSessionId, eventId });
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
  
  // Verify frontend session exists and is active
  const session = frontendSessions.get(frontendSessionId);
  if (!session || session.eventId !== eventId || !session.active) {
    console.log('❌ Invalid or inactive session for webhook:', { 
      frontendSessionId, 
      eventId,
      sessionExists: !!session,
      sessionEventId: session?.eventId,
      sessionActive: session?.active
    });
    return res.status(404).json({ 
      success: false,
      error: 'Invalid or inactive session',
      details: 'The payment session is either not found, inactive, or does not match the event ID'
    });
  }
  
  // Update last seen
  session.lastSeen = Date.now();
  
  // Send anonymous zap to Nostr with comment as zapperMessage
  try {
    const amount = paymentData.amount || 1000; // Default to 1 sat if not provided
    const comment = paymentData.comment || 'Lightning payment';
    
    console.log(`⚡ Processing Lightning payment: ${amount} sats for event ${eventId} with comment: "${comment}"`);
    
    await sendAnonymousZap(eventId, amount, comment);
    
    console.log(`✅ Successfully published anonymous zap: ${amount} sats for event ${eventId}`);
    
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
  
  // Generate anonymous key pair
  const privateKey = crypto.randomBytes(32);
  const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
  
  // Create zap request (kind 9734)
  const zapRequest = {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    content: String(comment || ''), // Ensure content is always a string
    tags: [
      ['p', eventId],
      ['amount', amount.toString()],
      ['relays', ...relays]
    ]
  };
  
  // Sign and publish
  const signedZapRequest = await signEvent(zapRequest, privateKey);
  await pool.publish(relays, signedZapRequest);
  
  console.log(`Published anonymous zap: ${amount} sats for event ${eventId} with comment: "${comment}"`);
}

// Mock event signing (replace with proper Nostr signing)
async function signEvent(event, privateKey) {
  // This is a mock - replace with proper Nostr signing
  return {
    ...event,
    id: crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex'),
    pubkey: crypto.createHash('sha256').update(privateKey).digest('hex'),
    sig: crypto.randomBytes(64).toString('hex')
  };
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
    eventId: session.eventId,
    lnurl: session.lnurl,
    active: session.active,
    lastSeen: new Date(session.lastSeen).toISOString(),
    ageMinutes: Math.round((Date.now() - session.lastSeen) / 60000)
  }));
  
  res.json({
    success: true,
    message: 'Current Lightning payment sessions',
    totalSessions: sessions.length,
    activeSessions: sessions.filter(s => s.active).length,
    inactiveSessions: sessions.filter(s => !s.active).length,
    frontendSessions: sessions,
    cleanupInfo: {
      inactiveTimeoutMinutes: 60,
      nextCleanup: 'Every 5 minutes',
      note: 'Inactive sessions are automatically cleaned up after 1 hour'
    }
  });
});

module.exports = router;
