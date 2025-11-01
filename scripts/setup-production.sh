#!/bin/bash
# Quick production setup script for VPS

set -e

echo "🚀 NostrPay Production Setup"
echo "============================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "❌ Please do not run this script as root"
   exit 1
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from env.example..."
    cp env.example .env
    echo "✅ Created .env file. Please edit it with your production values:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter after you've configured .env..."
else
    echo "✅ .env file found"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build for production
echo "🔨 Building for production..."
export NODE_ENV=production
pnpm run build:prod

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 is not installed. Installing..."
    npm install -g pm2
fi

# Start with PM2
echo "🚀 Starting application with PM2..."
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure Nginx (see nginx.conf.example)"
echo "2. Set up SSL certificate (certbot)"
echo "3. Configure firewall"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check application status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart application"

