# Production deploy notes

This file is the checklist for the **production server** (nginx + PM2). Code changes land in the repo; items marked **PROD** must be applied on the host.

## Prerequisites

- Node.js **26+** available to the PM2 user (`node -v`, and `pm2 describe pubpay-backend` → interpreter path).
- `packages/backend/.env` present on the server (dotenv loads it from the backend package dir).
- Build before restart: `pnpm build:prod` (or your usual build), then `pm2 startOrReload ecosystem.config.js`.

## Required backend env (production)

Set in `packages/backend/.env` (and keep out of git):

| Variable | Notes |
| --- | --- |
| `NODE_ENV=production` | Also set in `ecosystem.config.js` |
| `FRONTEND_URL` | Comma-separated allowed CORS origins. **Missing → process exits on start.** |
| `WEBHOOK_SECRET` | Long random secret (`openssl rand -hex 32`). **Missing → process exits on start.** |
| `WEBHOOK_URL` | Public base URL LNbits can reach (no path) |
| `LNBITS_URL` / `LNBITS_API_KEY` | Payment provider |
| `NIP05_DOMAIN` | Real domain (do not leave `yourdomain.com`) |
| `TRUST_PROXY=true` | Set in `ecosystem.config.js` by default. Required behind nginx so rate limits use client IPs. |
| `PRETALX_*` | Optional; only if using schedule import |

Full reference: [packages/backend/ENV_SETUP.md](./packages/backend/ENV_SETUP.md).

## PROD: nginx — API / trust / rate limits

If nginx (or another reverse proxy) terminates TLS in front of the Node backend:

1. Forward the real client IP (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `X-Forwarded-Proto`).
2. Keep `TRUST_PROXY=true` in PM2 env (already in `ecosystem.config.js`). Without it, all clients share one rate-limit bucket.

## PROD: nginx — Live room SSE

Live rooms use `GET /multi/:roomId/events` (Server-Sent Events). The app sends `X-Accel-Buffering: no` and a comment heartbeat every 25s. On nginx you still need:

```nginx
location /multi/ {
  proxy_pass http://127.0.0.1:3002;
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 3600s;
  chunked_transfer_encoding off;
}
```

Adjust `proxy_pass` / path prefixes to match how you route the API today. Without `proxy_buffering off` and a long `proxy_read_timeout`, live rooms stall or disconnect.

## PROD: nginx — security headers (static apps)

Meta CSP in built HTML strips localhost in production builds, but `<meta>` CSP cannot set `frame-ancestors`. Prefer headers on the static site vhosts:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "SAMEORIGIN" always;
# Optionally override CSP here (more control than meta); keep connect-src aligned with your API + Nostr relays (wss/https).
```

Helmet is enabled on the Express API in production; static frontends are served by nginx, so headers above apply to the HTML/JS hosts.

## PROD: webhook secret & access logs

- **New LNURLp links** send `X-Webhook-Secret` via LNbits `webhook_headers` (URL has no `?secret=`).
- **NIP-05 invoices** still use `?secret=` on the webhook URL because LNbits core `/api/v1/payments` has no custom-header field. Prefer excluding or redacting query strings for `/nip05/webhook` and `/lightning/webhook` in nginx access logs, e.g.:

```nginx
# Example: do not log query string on webhook paths
location ~ ^/(lightning|nip05)/webhook {
  access_log /var/log/nginx/webhooks.log combined if=$loggable; # or a custom format without $query_string
  proxy_pass http://127.0.0.1:3002;
}
```

If `WEBHOOK_SECRET` may have appeared in historical access logs, rotate it and recreate LNURLp links so they pick up header-based auth.

Inbound verification accepts **either** the header or `?secret=` (legacy links keep working until replaced).

## PM2

```bash
pnpm build:prod
mkdir -p logs
pm2 startOrReload ecosystem.config.js
pm2 save
```

In production the backend binds to **`127.0.0.1` only** (override with `BIND_HOST` if needed). Confirm it is not on `0.0.0.0`:

```bash
ss -tlnp | grep 3002
# expect 127.0.0.1:3002
curl -sS http://127.0.0.1:3002/health
pm2 logs pubpay-backend --lines 50
```

Recommended on the host: `pm2 install pm2-logrotate` so `./logs/` does not grow unbounded.

## After deploy smoke check

1. `/health` returns healthy.
2. Create/enable a Lightning session once and confirm LNbits webhook hits succeed (401 → wrong/missing secret).
3. Open a live room display and leave it connected ~2 minutes (SSE should stay up).
4. Confirm CORS from the real frontend origin (missing `FRONTEND_URL` will refuse to start).
