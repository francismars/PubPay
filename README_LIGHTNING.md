# Lightning Payment Integration

This implementation adds Lightning payment support to NostrPay, allowing users without Nostr to make anonymous payments that appear as zaps in the live display.

## Features

- **Toggle-based Lightning payments**: Users can enable/disable Lightning payments with a simple toggle
- **Anonymous zaps**: Lightning payments are converted to anonymous Nostr zaps
- **QR code integration**: Lightning QR codes appear in the existing QR swiper
- **Session management**: Proper tracking of frontend sessions and LNURLP associations
- **LNBits integration**: Uses LNBits API for Lightning invoice generation and webhook handling

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file with:
   ```
   LNBITS_URL=https://legend.lnbits.com
   LNBITS_API_KEY=your_lnbits_api_key_here
   WEBHOOK_URL=https://yourdomain.com/lightning/webhook
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

## How It Works

1. **User toggles Lightning ON**: Frontend calls `/lightning/enable` with `frontendSessionId` and `eventId`
2. **Backend creates LNURLP**: Uses LNBits API to generate Lightning payment link
3. **QR code appears**: Lightning QR is added to the existing QR swiper
4. **User pays**: Scans QR with Lightning wallet, adds comment
5. **Payment processed**: LNBits webhook triggers anonymous zap to Nostr
6. **Zap appears**: Frontend sees the zap via existing Nostr relay monitoring

## API Endpoints

- `POST /lightning/enable` - Enable Lightning payments for a frontend session
- `POST /lightning/disable` - Disable Lightning payments for a frontend session  
- `POST /lightning/webhook` - LNBits webhook for payment notifications
- `GET /lightning/debug/sessions` - Debug endpoint to view current sessions

## Session Management

- Frontend sessions are tracked by `frontendSessionId`
- Each session is associated with a specific `eventId`
- Sessions automatically expire after 1 hour of inactivity
- LNURLP sessions can be reused if toggled back on quickly

## Frontend Integration

The Lightning toggle appears in the live page with:
- Toggle button to enable/disable Lightning payments
- Status messages showing current state
- QR code integration with existing swiper
- Automatic session management

## Benefits

- **No Nostr required**: Users can pay without Nostr knowledge
- **Anonymous payments**: Lightning payments appear as anonymous zaps
- **Seamless integration**: Works with existing zap display system
- **Real-time updates**: Payments appear immediately via Nostr relays
- **Session persistence**: Toggle state maintained across page interactions
