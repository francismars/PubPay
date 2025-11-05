# Backend Environment Variables Setup

## Required Environment Variables

Create a `.env` file in `packages/backend/` with these variables:

### Essential (Required for payments)

```env
# LNbits API Key - REQUIRED for all Lightning payments
# Get this from your LNbits dashboard
LNBITS_API_KEY=your_lnbits_api_key_here

# Webhook URL - REQUIRED for payment notifications
# LNbits will send payment notifications here
# For development:
WEBHOOK_URL=http://localhost:3002
# For production:
# WEBHOOK_URL=https://yourdomain.com
```

### Optional (Have defaults)

```env
# Server Port (default: 3002)
PORT=3002

# Node Environment (default: development)
NODE_ENV=development

# LNbits URL (default: https://legend.lnbits.com)
# Only change if you're using a custom LNbits instance
LNBITS_URL=https://legend.lnbits.com

# NIP-05 Domain (default: yourdomain.com)
# Your domain for NIP-05 verification
NIP05_DOMAIN=yourdomain.com

# Frontend URL (only needed for production CORS)
# FRONTEND_URL=https://yourdomain.com
```

## Complete Example

```env
# Server Configuration
PORT=3002
NODE_ENV=development

# LNbits Configuration (REQUIRED)
LNBITS_URL=https://legend.lnbits.com
LNBITS_API_KEY=your_lnbits_api_key_here

# Webhook Configuration (REQUIRED)
WEBHOOK_URL=http://localhost:3002
# Production: WEBHOOK_URL=https://yourdomain.com

# NIP-05 Configuration
NIP05_DOMAIN=yourdomain.com

# Frontend URL (Production only)
# FRONTEND_URL=https://yourdomain.com
```

## What Each Variable Does

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `LNBITS_API_KEY` | ✅ Yes | - | Authenticates with LNbits for payments |
| `WEBHOOK_URL` | ✅ Yes | - | Base URL for payment webhooks |
| `PORT` | ❌ No | `3002` | Backend server port |
| `NODE_ENV` | ❌ No | `development` | Environment mode |
| `LNBITS_URL` | ❌ No | `https://legend.lnbits.com` | LNbits instance URL |
| `NIP05_DOMAIN` | ❌ No | `yourdomain.com` | Domain for NIP-05 verification |
| `FRONTEND_URL` | ❌ No | - | CORS origin (production only) |

## Quick Setup

1. Copy the example above
2. Replace `your_lnbits_api_key_here` with your actual LNbits API key
3. Update `NIP05_DOMAIN` with your domain
4. For production, set `WEBHOOK_URL` to your production domain
5. Save as `packages/backend/.env`

## Testing

After setting up, start the server:
```bash
cd packages/backend
npm run dev
```

The server will log which variables are configured. Check the console output for any warnings about missing variables.

