# Backend Environment Variables Setup

Create a `.env` file in `packages/backend/` with these variables.

Production deploy checklist (nginx, PM2, SSE, headers): see root [DEPLOY.md](../../DEPLOY.md).

## Required for payments

```env
# LNbits API Key - REQUIRED for Lightning payments
LNBITS_API_KEY=your_lnbits_api_key_here

# Public base URL LNbits can reach (no path). Backend appends /lightning/webhook or /nip05/webhook.
# Dev: use ngrok or similar — localhost is unreachable from hosted LNbits.
# WEBHOOK_URL=https://your-ngrok-url.ngrok.io
# Prod:
WEBHOOK_URL=https://yourdomain.com

# Shared webhook secret — REQUIRED in production (server refuses to start without it)
# Generate: openssl rand -hex 32
#
# LNURLp links send this as header X-Webhook-Secret (via LNbits webhook_headers).
# NIP-05 core invoices still append ?secret= (LNbits payments API has no custom headers).
WEBHOOK_SECRET=replace_with_long_random_secret
```

## Required in production

```env
NODE_ENV=production

# Comma-separated CORS origins. Missing → process exits on start.
FRONTEND_URL=https://yourdomain.com,https://live.yourdomain.com

# Behind nginx/reverse proxy (also set in ecosystem.config.js). Without it, rate limits collapse to the proxy IP.
TRUST_PROXY=true

# Real domain for NIP-05 (do not leave the placeholder)
NIP05_DOMAIN=yourdomain.com
```

## Optional

```env
PORT=3002

# Bind address (default: 127.0.0.1 in production, 0.0.0.0 in development)
# Production should stay on localhost; nginx proxies to it.
# BIND_HOST=127.0.0.1

# LNbits instance (default: https://legend.lnbits.com)
LNBITS_URL=https://legend.lnbits.com

# Cap outbound zap amount in sats (default 1000000)
# MAX_ZAP_SATS=1000000

# Pretalx schedule import (all three required to enable)
# PRETALX_BASE_URL=https://pretalx.example.com
# PRETALX_EVENT=your-event-slug
# PRETALX_TOKEN=your_pretalx_token
```

## Complete example (development)

```env
PORT=3002
NODE_ENV=development

LNBITS_URL=https://legend.lnbits.com
LNBITS_API_KEY=your_lnbits_api_key_here

WEBHOOK_URL=https://your-ngrok-url.ngrok.io
WEBHOOK_SECRET=replace_with_long_random_secret

NIP05_DOMAIN=localhost
```

## Variable reference

| Variable           | Required          | Default                     | Purpose                             |
| ------------------ | ----------------- | --------------------------- | ----------------------------------- |
| `LNBITS_API_KEY`   | Yes (payments)    | —                           | Authenticate with LNbits            |
| `WEBHOOK_URL`      | Yes (payments)    | —                           | Public base URL for webhooks        |
| `WEBHOOK_SECRET`   | **Prod**          | —                           | Auth for inbound webhooks           |
| `FRONTEND_URL`     | **Prod**          | —                           | CORS allowlist                      |
| `TRUST_PROXY`      | Prod behind proxy | unset                       | Trust `X-Forwarded-*` (rate limits) |
| `NIP05_DOMAIN`     | Prod for NIP-05   | `yourdomain.com`            | NIP-05 domain                       |
| `LNBITS_URL`       | No                | `https://legend.lnbits.com` | LNbits host                         |
| `PORT`             | No                | `3002`                      | Listen port                         |
| `NODE_ENV`         | No                | `development`               | Mode                                |
| `MAX_ZAP_SATS`     | No                | `1000000`                   | Outbound zap cap                    |
| `PRETALX_BASE_URL` | No                | —                           | Pretalx API base                    |
| `PRETALX_EVENT`    | No                | —                           | Pretalx event slug                  |
| `PRETALX_TOKEN`    | No                | —                           | Pretalx API token                   |

## Quick setup

1. Copy an example above into `packages/backend/.env`
2. Set `LNBITS_API_KEY` and `WEBHOOK_SECRET`
3. For production: set `FRONTEND_URL`, `WEBHOOK_URL`, `NIP05_DOMAIN`, `TRUST_PROXY=true`
4. Start: `pnpm --filter @pubpay/backend dev` (or PM2 — see DEPLOY.md)

The server logs which payment-related variables are present. In production it **exits** if `FRONTEND_URL` or `WEBHOOK_SECRET` is missing.
