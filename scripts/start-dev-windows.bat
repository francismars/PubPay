@echo off
echo 🚀 Starting PubPay Development Environment...
echo Opening each service in separate console windows...
echo.

start "PubPay - Backend (Port 3002)" cmd /k "pnpm dev:backend"
timeout /t 2 /nobreak >nul

start "PubPay - PUBPAY (Port 3000)" cmd /k "pnpm dev:pubpay"
timeout /t 1 /nobreak >nul

start "PubPay - Live App (Port 3001)" cmd /k "pnpm dev:live"
timeout /t 1 /nobreak >nul

start "PubPay - Jukebox App (Port 3003)" cmd /k "pnpm dev:jukebox"

echo.
echo ✅ All services started in separate windows!
echo.
echo 🌐 Service URLs:
echo   • Backend:    http://localhost:3002
echo   • Homepage:   http://localhost:3000
echo   • Live App:   http://localhost:3001
echo   • Jukebox:    http://localhost:3003
echo.
echo 💡 Each service runs in its own window - close individual windows to stop specific services
echo 🛑 To stop all services, close all the opened windows
echo.
pause
