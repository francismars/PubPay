# Production Deployment Checklist

Quick reference checklist for deploying NostrPay to production.

## Pre-Deployment

- [ ] VPS with Ubuntu 20.04+ ready
- [ ] Domain name DNS pointing to VPS IP
- [ ] SSH access configured
- [ ] LNBits instance ready with API key

## Server Setup

- [ ] Node.js 18+ installed (`node --version`)
- [ ] pnpm installed (`pnpm --version`)
- [ ] Nginx installed (`nginx -v`)
- [ ] PM2 installed (`pm2 --version`)
- [ ] Firewall configured (UFW or similar)

## Code Deployment

- [ ] Repository cloned to `/opt/nostrpay`
- [ ] `.env` file created and configured from `env.example`
- [ ] All environment variables set correctly:
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3002`
  - [ ] `FRONTEND_URL=https://yourdomain.com`
  - [ ] `LNBITS_URL` and `LNBITS_API_KEY` configured
  - [ ] `WEBHOOK_URL` configured
- [ ] Dependencies installed (`pnpm install --frozen-lockfile`)
- [ ] Production build completed (`pnpm run build:prod`)
- [ ] Build outputs verified in `dist/` directory

## Nginx Configuration

- [ ] Nginx config copied from `nginx.conf.example`
- [ ] Domain name updated in config
- [ ] SSL certificate paths updated
- [ ] `/path/to/nostrpay/dist` updated to `/opt/nostrpay/dist`
- [ ] Config tested (`sudo nginx -t`)
- [ ] Nginx reloaded (`sudo systemctl reload nginx`)

## SSL Certificate

- [ ] Certbot installed
- [ ] SSL certificate obtained (`sudo certbot --nginx -d yourdomain.com`)
- [ ] Auto-renewal configured (`sudo certbot renew --dry-run`)

## Application Startup

- [ ] PM2 started (`pm2 start ecosystem.config.js`)
- [ ] PM2 configured for auto-start (`pm2 startup`, `pm2 save`)
- [ ] Application logs checked (`pm2 logs nostrpay-backend`)

## Verification

- [ ] Health endpoint accessible (`curl http://localhost:3002/health`)
- [ ] Main app loads (`https://yourdomain.com`)
- [ ] Live app loads (`https://yourdomain.com/live`)
- [ ] Jukebox app loads (`https://yourdomain.com/jukebox`)
- [ ] API endpoints working (`curl https://yourdomain.com/health`)
- [ ] CORS headers correct (check browser console)
- [ ] SSL certificate valid (green lock in browser)

## Security

- [ ] `.env` file permissions set (`chmod 600 .env`)
- [ ] Firewall rules configured (only 80, 443, SSH open)
- [ ] SSH key authentication (disable password auth)
- [ ] Regular updates scheduled (`sudo apt update && sudo apt upgrade`)
- [ ] Backups configured (if needed)

## Monitoring

- [ ] Logs accessible (`pm2 logs`, `/opt/nostrpay/logs/`)
- [ ] Monitoring tool configured (optional: PM2 Plus, Sentry, etc.)
- [ ] Alerting configured (optional)

## Post-Deployment

- [ ] Document deployment process
- [ ] Team notified of production URL
- [ ] Smoke tests performed
- [ ] Performance baseline established

## Quick Commands Reference

```bash
# Build
NODE_ENV=production pnpm run build:prod

# PM2
pm2 start ecosystem.config.js
pm2 status
pm2 logs nostrpay-backend
pm2 restart nostrpay-backend
pm2 save

# Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx

# SSL
sudo certbot renew
sudo certbot certificates

# Logs
pm2 logs
tail -f /opt/nostrpay/logs/backend-combined.log
sudo tail -f /var/log/nginx/error.log
```

## Troubleshooting

**502 Bad Gateway**
- Check backend is running: `pm2 status`
- Check backend logs: `pm2 logs nostrpay-backend`
- Test backend directly: `curl http://localhost:3002/health`

**SSL Certificate Issues**
- Renew: `sudo certbot renew`
- Check: `sudo certbot certificates`

**Build Failures**
- Clean: `rm -rf dist packages/*/dist`
- Rebuild: `NODE_ENV=production pnpm run build:prod`

**Port Already in Use**
- Find process: `sudo lsof -i :3002`
- Kill process or change PORT in `.env`

