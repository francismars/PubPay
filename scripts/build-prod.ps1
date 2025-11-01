# Production build script for NostrPay (Windows/PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting production build..." -ForegroundColor Green

# Set production environment
$env:NODE_ENV = "production"

# Clean previous builds
Write-Host "🧹 Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Path "packages" -Directory | ForEach-Object {
    $distPath = Join-Path $_.FullName "dist"
    if (Test-Path $distPath) { Remove-Item -Recurse -Force $distPath }
}
Get-ChildItem -Path "apps" -Directory | ForEach-Object {
    $distPath = Join-Path $_.FullName "dist"
    if (Test-Path $distPath) { Remove-Item -Recurse -Force $distPath }
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install --frozen-lockfile

# Build shared packages first
Write-Host "📦 Building shared packages..." -ForegroundColor Yellow
pnpm --filter @pubpay/shared-types build
pnpm --filter @pubpay/shared-utils build
pnpm --filter @pubpay/shared-ui build
pnpm --filter @pubpay/shared-services build

# Build backend
Write-Host "🔧 Building backend..." -ForegroundColor Yellow
pnpm --filter @pubpay/backend build

# Build frontend apps
Write-Host "🎨 Building frontend applications..." -ForegroundColor Yellow
pnpm --filter @pubpay/pubpay build
pnpm --filter @pubpay/live build
pnpm --filter @pubpay/jukebox build

Write-Host "✅ Production build completed successfully!" -ForegroundColor Green
Write-Host "📁 Build output is in the 'dist' directory" -ForegroundColor Cyan

