#!/bin/bash

# Start all PubPay services in separate Terminal windows on macOS
# This script opens each service in its own Terminal window for better log separation

echo "🚀 Starting PubPay Development Environment..."
echo "Opening each service in separate Terminal windows..."

# Function to start a service in a new Terminal window
start_service_in_new_window() {
    local service_name="$1"
    local command="$2"
    local color="$3"
    
    osascript -e "
        tell application \"Terminal\"
            activate
            set newTab to do script \"cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command\"
            set custom title of newTab to \"PubPay - $service_name\"
        end tell
    "
}

# Start Backend
start_service_in_new_window "Backend (Port 3002)" "pnpm dev:backend" "Cyan"

# Wait a moment for backend to start
sleep 2

# Start PUBPAY
start_service_in_new_window "PUBPAY (Port 3000)" "pnpm dev:pubpay" "Green"

# Start Live App
start_service_in_new_window "Live App (Port 3001)" "pnpm dev:live" "Blue"

# Start Jukebox App
start_service_in_new_window "Jukebox App (Port 3003)" "pnpm dev:jukebox" "Magenta"

echo ""
echo "✅ All services started in separate Terminal windows!"
echo ""
echo "🌐 Service URLs:"
echo "  • Backend:    http://localhost:3002"
echo "  • Homepage:   http://localhost:3000"
echo "  • Live App:   http://localhost:3001"
echo "  • Jukebox:    http://localhost:3003"
echo ""
echo "💡 Each service runs in its own Terminal window - close individual windows to stop specific services"
echo "🛑 To stop all services, close all the opened Terminal windows"
