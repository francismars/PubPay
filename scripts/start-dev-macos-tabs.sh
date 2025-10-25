#!/bin/bash

# Start all PubPay services in separate Terminal tabs on macOS
# This script opens each service in its own Terminal tab for better log separation

echo "🚀 Starting PubPay Development Environment..."
echo "Opening each service in separate Terminal tabs..."

# Function to start a service in a new Terminal tab
start_service_in_new_tab() {
    local service_name="$1"
    local command="$2"
    local color="$3"
    
    osascript -e "
        tell application \"Terminal\"
            activate
            if (count of windows) = 0 then
                set newTab to do script \"cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command\"
            else
                set newTab to do script \"cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command\" in window 1
            end if
            set custom title of newTab to \"PubPay - $service_name\"
        end tell
    "
}

# Start Backend
start_service_in_new_tab "Backend (Port 3002)" "pnpm dev:backend" "Cyan"

# Wait a moment for backend to start
sleep 2

# Start PUBPAY
start_service_in_new_tab "PUBPAY (Port 3000)" "pnpm dev:pubpay" "Green"

# Start Live App
start_service_in_new_tab "Live App (Port 3001)" "pnpm dev:live" "Blue"

# Start Jukebox App
start_service_in_new_tab "Jukebox App (Port 3003)" "pnpm dev:jukebox" "Magenta"

echo ""
echo "✅ All services started in separate Terminal tabs!"
echo ""
echo "🌐 Service URLs:"
echo "  • Backend:    http://localhost:3002"
echo "  • Homepage:   http://localhost:3000"
echo "  • Live App:   http://localhost:3001"
echo "  • Jukebox:    http://localhost:3003"
echo ""
echo "💡 Each service runs in its own Terminal tab - close individual tabs to stop specific services"
echo "🛑 To stop all services, close the Terminal window or all tabs"
