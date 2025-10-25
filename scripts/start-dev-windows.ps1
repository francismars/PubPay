# Start all PubPay services in separate console windows
# This script opens each service in its own terminal window for better log separation

Write-Host "🚀 Starting PubPay Development Environment..." -ForegroundColor Green
Write-Host "Opening each service in separate console windows..." -ForegroundColor Yellow

# Function to start a service in a new PowerShell window
function Start-ServiceInNewWindow {
    param(
        [string]$ServiceName,
        [string]$Command,
        [string]$Color
    )
    
    $title = "PubPay - $ServiceName"
    $scriptBlock = {
        param($cmd, $title, $color)
        $Host.UI.RawUI.WindowTitle = $title
        Write-Host "Starting $title..." -ForegroundColor $color
        Write-Host "Command: $cmd" -ForegroundColor Gray
        Write-Host "Press Ctrl+C to stop this service" -ForegroundColor Yellow
        Write-Host "----------------------------------------" -ForegroundColor Gray
        Invoke-Expression $cmd
    }
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& {$scriptBlock} '$Command' '$title' '$Color'"
}

# Start Backend
Start-ServiceInNewWindow -ServiceName "Backend (Port 3002)" -Command "pnpm dev:backend" -Color "Cyan"

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start PUBPAY
Start-ServiceInNewWindow -ServiceName "PUBPAY (Port 3000)" -Command "pnpm dev:pubpay" -Color "Green"

# Start Live App
Start-ServiceInNewWindow -ServiceName "Live App (Port 3001)" -Command "pnpm dev:live" -Color "Blue"

# Start Jukebox App
Start-ServiceInNewWindow -ServiceName "Jukebox App (Port 3003)" -Command "pnpm dev:jukebox" -Color "Magenta"

Write-Host ""
Write-Host "✅ All services started in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Service URLs:" -ForegroundColor Yellow
Write-Host "  • Backend:    http://localhost:3002" -ForegroundColor Cyan
Write-Host "  • Homepage:   http://localhost:3000" -ForegroundColor Green
Write-Host "  • Live App:   http://localhost:3001" -ForegroundColor Blue
Write-Host "  • Jukebox:    http://localhost:3003" -ForegroundColor Magenta
Write-Host ""
Write-Host "💡 Each service runs in its own window - close individual windows to stop specific services" -ForegroundColor Gray
Write-Host "🛑 To stop all services, close all the opened windows" -ForegroundColor Red
