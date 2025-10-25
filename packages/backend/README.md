# PubPay Backend Server

Modern TypeScript Express server providing API endpoints for PubPay's Lightning payments, Nostr integration, and live event management.

## Features

- **Lightning Payments**: LNBits integration for anonymous Lightning payments
- **Nostr Integration**: Relay management and zap processing
- **Live Events**: Real-time event management and session tracking
- **Jukebox**: Music queue management with YouTube integration
- **Session Management**: Frontend session tracking and persistence
- **Webhook Processing**: Payment notifications and event handling

## Quick Start

1. **Install dependencies** (from project root):
   ```bash
   pnpm install
   ```

2. **Configure environment variables**:
   Create a `.env` file in the backend folder (`packages/backend/.env`):
   ```env
   # Server Configuration
   PORT=3002
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   
   # Lightning Configuration
   LNBITS_URL=https://legend.lnbits.com
   LNBITS_API_KEY=your_lnbits_api_key_here
   WEBHOOK_URL=https://yourdomain.com/lightning/webhook
   
   # Frontend Configuration (for React apps)
   REACT_APP_API_BASE_URL=http://localhost:3002
   REACT_APP_LNBITS_URL=https://legend.lnbits.com
   REACT_APP_LNBITS_API_KEY=your_lnbits_api_key_here
   REACT_APP_WEBHOOK_URL=https://yourdomain.com/lightning/webhook
   ```

3. **Start the backend server**:
   ```bash
   pnpm dev:backend
   ```

The server will start on `http://localhost:3002`

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Lightning Payments
- `POST /lightning/enable` - Enable Lightning payments for a session
- `POST /lightning/disable` - Disable Lightning payments for a session
- `POST /lightning/webhook` - LNBits webhook for payment notifications
- `GET /lightning/debug/sessions` - Debug endpoint to view current sessions
- `GET /lightning/health` - Lightning service health check

### Live Events
- `GET /live/events/:eventId` - Get live event details
- `POST /live/events` - Create new live event
- `GET /live/events/:eventId/zaps` - Get zaps for an event

### Jukebox
- `GET /jukebox/queue/:eventId` - Get current music queue
- `POST /jukebox/queue/:eventId` - Add song to queue
- `DELETE /jukebox/queue/:eventId/:songId` - Remove song from queue

## Lightning Payment Integration

### How It Works

1. **User toggles Lightning ON**: Frontend calls `/lightning/enable` with `frontendSessionId` and `eventId`
2. **Backend creates LNURLP**: Uses LNBits API to generate Lightning payment link
3. **QR code appears**: Lightning QR is added to the existing QR swiper
4. **User pays**: Scans QR with Lightning wallet, adds comment
5. **Payment processed**: LNBits webhook triggers anonymous zap to Nostr
6. **Zap appears**: Frontend sees the zap via existing Nostr relay monitoring

### Session Management

- Frontend sessions are tracked by `frontendSessionId`
- Each session is associated with a specific `eventId`
- Sessions automatically expire after 1 hour of inactivity
- LNURLP sessions can be reused if toggled back on quickly

### Benefits

- **No Nostr required**: Users can pay without Nostr knowledge
- **Anonymous payments**: Lightning payments appear as anonymous zaps
- **Seamless integration**: Works with existing zap display system
- **Real-time updates**: Payments appear immediately via Nostr relays
- **Session persistence**: Toggle state maintained across page interactions

## Architecture

### Services
- **LightningService**: LNBits API integration and LNURL generation
- **NostrService**: Relay management and zap processing
- **SessionService**: Frontend session tracking and persistence
- **WebhookService**: Payment webhook processing and zap creation

### Middleware
- **ErrorHandler**: Centralized error handling and logging
- **CORS**: Cross-origin resource sharing configuration
- **Security**: Helmet for security headers
- **Logging**: Morgan for HTTP request logging

## Development

### Project Structure
```
packages/backend/
├── .env                    # Environment variables
├── src/
│   ├── index.ts              # Main server entry point
│   ├── middleware/           # Express middleware
│   ├── routes/              # API route handlers
│   ├── services/            # Business logic services
│   └── utils/               # Utility functions
├── dist/                    # Compiled JavaScript output
├── package.json             # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

### Scripts
- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Compile TypeScript to JavaScript
- `pnpm start` - Start production server
- `pnpm type-check` - Run TypeScript type checking

### Environment Variables

| Variable | Description | Default | Used By |
|----------|-------------|---------|---------|
| `PORT` | Server port | `3002` | Backend |
| `NODE_ENV` | Environment mode | `development` | Backend |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` | Backend |
| `LNBITS_URL` | LNBits API base URL | `https://legend.lnbits.com` | Backend |
| `LNBITS_API_KEY` | LNBits API key | Required | Backend |
| `WEBHOOK_URL` | Webhook callback URL | Required | Backend |
| `REACT_APP_API_BASE_URL` | Backend API URL | `http://localhost:3002` | Frontend |
| `REACT_APP_LNBITS_URL` | LNBits URL for frontend | `https://legend.lnbits.com` | Frontend |
| `REACT_APP_LNBITS_API_KEY` | LNBits API key for frontend | Required | Frontend |
| `REACT_APP_WEBHOOK_URL` | Webhook URL for frontend | Required | Frontend |

**Note**: Some frontend services (`JukeboxApiService`, `LightningApiService`) currently use hardcoded `http://localhost:3002` as the default API base URL. The `REACT_APP_API_BASE_URL` environment variable is available for configuration but not yet implemented in all services.

## Integration

This backend is part of the PubPay monorepo and integrates with:

- **Frontend Apps**: `apps/live`
- **Shared Services**: `packages/shared-services`
- **Shared Types**: `packages/shared-types`
- **Shared UI**: `packages/shared-ui`
- **Shared Utils**: `packages/shared-utils`

## Security

- **CORS**: Configured for development and production origins
- **Helmet**: Security headers and CSP policies
- **Input Validation**: Request body validation and sanitization
- **Rate Limiting**: Session-based rate limiting (planned)
- **Authentication**: Nostr-based authentication (planned)

## Monitoring

- **Health Checks**: `/health` endpoint for uptime monitoring
- **Logging**: Structured logging with Winston (planned)
- **Metrics**: Performance metrics collection (planned)
- **Error Tracking**: Centralized error reporting (planned)
