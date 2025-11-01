# Quick Start: Production Deployment

## What You Need

1. ✅ **VPS** (Ubuntu 20.04+ recommended)
2. ✅ **Domain name** pointing to your VPS
3. ✅ **LNBits** instance with API key

## Quick Setup (5 Steps)

### Step 1: Install Prerequisites on VPS

```bash
# Node.js and pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm pm2

# Nginx and SSL
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step 2: Deploy Code

```bash
cd /opt
sudo git clone <your-repo-url> nostrpay
sudo chown -R $USER:$USER /opt/nostrpay
cd /opt/nostrpay

# Configure environment
cp env.example .env
nano .env  # Edit with your values

# Build and start
pnpm install --frozen-lockfile
NODE_ENV=production pnpm run build:prod
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions
```

### Step 3: Configure Nginx

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/nostrpay
sudo nano /etc/nginx/sites-available/nostrpay
# Update: domain name, SSL paths, and /opt/nostrpay/dist

sudo ln -s /etc/nginx/sites-available/nostrpay /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Setup SSL

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Step 5: Verify

```bash
# Check backend
curl http://localhost:3002/health

# Check in browser
# https://yourdomain.com
# https://yourdomain.com/live
# https://yourdomain.com/jukebox
```

## File Structure Created

```
nostrpay/
├── DEPLOYMENT.md              # Detailed deployment guide
├── PRODUCTION_CHECKLIST.md    # Deployment checklist
├── QUICK_START_PRODUCTION.md  # This file
├── env.example                # Environment variables template
├── ecosystem.config.js        # PM2 process manager config
├── nginx.conf.example         # Nginx reverse proxy config
└── scripts/
    ├── build-prod.sh          # Production build script (Linux/Mac)
    ├── build-prod.ps1         # Production build script (Windows)
    ├── deploy.sh               # Deployment script
    └── setup-production.sh    # Quick setup script
```

## What Changed

### ✅ Production Build Configuration
- Updated all webpack configs to support production mode
- Added CSS extraction for production builds
- Added code splitting and minification

### ✅ Process Management
- Created PM2 ecosystem config for running backend

### ✅ Reverse Proxy
- Created Nginx config for routing and SSL
- Handles API routes and static file serving
- Configured for all three apps (pubpay, live, jukebox)

### ✅ Build Scripts
- Production build scripts for all platforms
- Deployment automation scripts

### ✅ Documentation
- Complete deployment guide
- Production checklist
- Quick start guide

## Environment Variables

Create `.env` file with:

```env
NODE_ENV=production
PORT=3002
FRONTEND_URL=https://yourdomain.com
LNBITS_URL=https://your-lnbits-instance.com
LNBITS_API_KEY=your-api-key
WEBHOOK_URL=https://yourdomain.com/webhook
```

## Routing

Your production setup will serve:

- **Main App**: `https://yourdomain.com` → `dist/pubpay/`
- **Live App**: `https://yourdomain.com/live` → `dist/live/`
- **Jukebox App**: `https://yourdomain.com/jukebox` → `dist/jukebox/`
- **API Routes**: `/lightning`, `/live`, `/jukebox`, `/multi`, `/health`, `/webhook` → Backend (port 3002)

## Common Commands

```bash
# Build for production
NODE_ENV=production pnpm run build:prod

# Start/Stop/Restart
pm2 start ecosystem.config.js
pm2 stop nostrpay-backend
pm2 restart nostrpay-backend

# View logs
pm2 logs nostrpay-backend

# Update and redeploy
git pull
pnpm install --frozen-lockfile
NODE_ENV=production pnpm run build:prod
pm2 reload ecosystem.config.js
```

## Need Help?

1. Check `DEPLOYMENT.md` for detailed instructions
2. Check `PRODUCTION_CHECKLIST.md` for verification steps
3. Check logs: `pm2 logs` and `sudo tail -f /var/log/nginx/error.log`

## Next Steps

1. Read `DEPLOYMENT.md` for complete instructions
2. Follow `PRODUCTION_CHECKLIST.md` step by step
3. Test thoroughly before going live
4. Set up monitoring and backups

---

**Ready to deploy?** Start with `DEPLOYMENT.md` for the full guide!

