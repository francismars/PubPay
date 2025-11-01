# Production Deployment Guide

This guide will walk you through deploying NostrPay to a production VPS with a single domain.

## Prerequisites

- A VPS with Ubuntu 20.04+ (or similar Linux distribution)
- Node.js 18+ and pnpm installed
- Domain name pointing to your VPS IP
- SSL certificate (Let's Encrypt recommended)
- Nginx installed
- PM2 installed globally (`npm install -g pm2`)
- LNBits instance and API key

## Architecture Overview

Your production setup will consist of:
- **Backend**: Express.js server running on port 3002 (PM2 managed)
- **Frontend Apps**: Static files built and served via Nginx
- **Reverse Proxy**: Nginx handles routing, SSL, and static file serving

## Step 1: Server Preparation

### 1.1 Install Node.js and pnpm

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm
```

### 1.2 Install Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### 1.3 Install PM2

```bash
npm install -g pm2
```

### 1.4 Install SSL Certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Step 2: Deploy Code

### 2.1 Clone Repository on VPS

```bash
cd /opt
sudo git clone https://github.com/yourusername/nostrpay.git
sudo chown -R $USER:$USER /opt/nostrpay
cd /opt/nostrpay
```

### 2.2 Create Environment File

```bash
cp env.example .env
nano .env
```

Update the `.env` file with your production values:

```env
NODE_ENV=production
PORT=3002
FRONTEND_URL=https://yourdomain.com
LNBITS_URL=https://your-lnbits-instance.com
LNBITS_API_KEY=your-actual-lnbits-api-key
WEBHOOK_URL=https://yourdomain.com/webhook
LOG_LEVEL=info
```

### 2.3 Install Dependencies and Build

```bash
pnpm install --frozen-lockfile
NODE_ENV=production pnpm run build:prod
```

Or use the build script:

```bash
chmod +x scripts/build-prod.sh
./scripts/build-prod.sh
```

## Step 3: Configure Nginx

### 3.1 Copy Nginx Configuration

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/nostrpay
```

### 3.2 Edit Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/nostrpay
```

Update the following:
- Replace `yourdomain.com` with your actual domain
- Update SSL certificate paths if different
- Update `/path/to/nostrpay/dist` to `/opt/nostrpay/dist`

### 3.3 Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/nostrpay /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Step 4: Start Application with PM2

### 4.1 Start Backend

```bash
cd /opt/nostrpay
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

### 4.2 Verify Running

```bash
pm2 status
pm2 logs nostrpay-backend
```

## Step 5: Verify Deployment

### 5.1 Check Health Endpoint

```bash
curl http://localhost:3002/health
```

### 5.2 Test via Browser

- Main app: `https://yourdomain.com`
- Live app: `https://yourdomain.com/live`
- Jukebox app: `https://yourdomain.com/jukebox`

### 5.3 Check Logs

```bash
pm2 logs nostrpay-backend
tail -f logs/backend-combined.log
```

## Step 6: Maintenance

### 6.1 Updating the Application

```bash
cd /opt/nostrpay
git pull origin main
pnpm install --frozen-lockfile
NODE_ENV=production pnpm run build:prod
pm2 reload ecosystem.config.js
```

### 6.2 Viewing Logs

```bash
# PM2 logs
pm2 logs nostrpay-backend

# Application logs
tail -f /opt/nostrpay/logs/backend-combined.log

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### 6.3 Restarting Services

```bash
# Restart backend
pm2 restart nostrpay-backend

# Restart Nginx
sudo systemctl restart nginx

# Check status
pm2 status
sudo systemctl status nginx
```

## Directory Structure

After deployment, your production structure should look like:

```
/opt/nostrpay/
├── apps/              # Frontend app source
├── packages/          # Backend and shared packages
├── dist/              # Built frontend apps
│   ├── pubpay/
│   ├── live/
│   └── jukebox/
├── packages/backend/dist/  # Built backend
├── logs/              # Application logs
├── .env               # Environment variables
├── ecosystem.config.js # PM2 configuration
└── package.json
```

## Troubleshooting

### Backend not starting

1. Check environment variables: `cat .env`
2. Check logs: `pm2 logs nostrpay-backend`
3. Verify port 3002 is not in use: `sudo lsof -i :3002`

### 502 Bad Gateway

- Backend might not be running: `pm2 status`
- Check Nginx error logs: `sudo tail -f /var/log/nginx/error.log`
- Verify backend is listening: `curl http://localhost:3002/health`

### SSL Certificate Issues

```bash
# Renew certificate
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

### Build Failures

```bash
# Clean and rebuild
rm -rf dist packages/*/dist
pnpm install --frozen-lockfile
NODE_ENV=production pnpm run build:prod
```

### Port Conflicts

If port 3002 is in use, either:
1. Change PORT in `.env` file
2. Stop the conflicting service
3. Update `ecosystem.config.js` and Nginx config

## Security Checklist

- [ ] Firewall configured (only 80, 443, and SSH open)
- [ ] SSL certificate installed and auto-renewal enabled
- [ ] Environment variables secured (`.env` file permissions: `chmod 600 .env`)
- [ ] Regular updates: `sudo apt update && sudo apt upgrade`
- [ ] Backups configured for database/state if applicable
- [ ] Rate limiting configured in Nginx (optional)
- [ ] Security headers enabled in Nginx config

## Performance Optimization

### Enable Nginx Caching

Add to your Nginx config:

```nginx
# Cache zone
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m;

# Use in location blocks
proxy_cache api_cache;
proxy_cache_valid 200 10m;
```

### Enable Gzip

Already configured in the nginx config example, but verify:

```bash
curl -H "Accept-Encoding: gzip" -I https://yourdomain.com
```

### PM2 Clustering (Optional)

For high traffic, you can use PM2 cluster mode in `ecosystem.config.js`:

```js
instances: 'max',
exec_mode: 'cluster'
```

## Backup and Recovery

### Backup Script

Create `/opt/nostrpay/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/nostrpay"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup code and config
tar -czf $BACKUP_DIR/nostrpay_$DATE.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  /opt/nostrpay

# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

Add to cron: `0 2 * * * /opt/nostrpay/scripts/backup.sh`

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

---

## Quick Reference Commands

```bash
# Build
NODE_ENV=production pnpm run build:prod

# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop nostrpay-backend

# Restart
pm2 restart nostrpay-backend

# Logs
pm2 logs nostrpay-backend

# Status
pm2 status

# Nginx reload
sudo systemctl reload nginx
```

