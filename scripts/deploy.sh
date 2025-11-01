#!/bin/bash
# Deployment script for NostrPay VPS

set -e

# Configuration
DEPLOY_USER="${DEPLOY_USER:-$USER}"
DEPLOY_HOST="${DEPLOY_HOST:-your-vps-ip}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/nostrpay}"
REMOTE_REPO="${REMOTE_REPO:-origin}"
REMOTE_BRANCH="${REMOTE_BRANCH:-main}"

echo "🚀 Starting deployment to production..."

# Build locally
echo "📦 Building production bundle..."
./scripts/build-prod.sh

# Copy files to server (using rsync for efficiency)
echo "📤 Uploading files to server..."
rsync -avz --exclude 'node_modules' \
           --exclude '.git' \
           --exclude '*.log' \
           --exclude '.env' \
           --exclude 'dist' \
           ./ ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/

# SSH into server and run build/restart
echo "🔧 Building and restarting on server..."
ssh ${DEPLOY_USER}@${DEPLOY_HOST} << EOF
  cd ${DEPLOY_PATH}
  export NODE_ENV=production
  pnpm install --frozen-lockfile --prod=false
  ./scripts/build-prod.sh
  pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
  pm2 save
EOF

echo "✅ Deployment completed successfully!"

