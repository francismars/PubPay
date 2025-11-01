#!/bin/bash
# Production build script for NostrPay

set -e

echo "🚀 Starting production build..."

# Set production environment
export NODE_ENV=production

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist
rm -rf packages/*/dist
rm -rf apps/*/dist

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build shared packages first (dependency order matters)
echo "📦 Building shared packages..."
pnpm --filter @pubpay/shared-types build
pnpm --filter @pubpay/shared-utils build
pnpm --filter @pubpay/shared-ui build
pnpm --filter @pubpay/shared-services build

# Build backend
echo "🔧 Building backend..."
pnpm --filter @pubpay/backend build

# Build frontend apps
echo "🎨 Building frontend applications..."
pnpm --filter @pubpay/pubpay build
pnpm --filter @pubpay/live build
pnpm --filter @pubpay/jukebox build

echo "✅ Production build completed successfully!"
echo "📁 Build output is in the 'dist' directory"

