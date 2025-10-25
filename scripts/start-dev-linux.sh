#!/bin/bash

# Start all PubPay services in separate terminal windows on Linux
# This script opens each service in its own terminal window for better log separation

echo "🚀 Starting PubPay Development Environment..."
echo "Opening each service in separate terminal windows..."

# Function to start a service in a new terminal window
start_service_in_new_window() {
    local service_name="$1"
    local command="$2"
    local color="$3"
    
    # Try different terminal emulators
    if command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal --title="PubPay - $service_name" -- bash -c "cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command; exec bash"
    elif command -v xterm >/dev/null 2>&1; then
        xterm -title "PubPay - $service_name" -e bash -c "cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command; exec bash" &
    elif command -v konsole >/dev/null 2>&1; then
        konsole --title "PubPay - $service_name" -e bash -c "cd $(pwd) && echo 'Starting $service_name...' && echo 'Command: $command' && echo 'Press Ctrl+C to stop this service' && echo '----------------------------------------' && $command; exec bash" &
    elif command -v xfce4-terminal >/dev/null 2>&1; then
        xfce4-terminal --title="PubPay - $service_name" -e "bash -c 'cd $(pwd) && echo \"Starting $service_name...\" && echo \"Command: $command\" && echo \"Press Ctrl+C to stop this service\" && echo \"----------------------------------------\" && $command; exec bash'" &
    else
        echo "No supported terminal emulator found. Please install gnome-terminal, xterm, konsole, or xfce4-terminal."
        exit 1
    fi
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
echo "✅ All services started in separate terminal windows!"
echo ""
echo "🌐 Service URLs:"
echo "  • Backend:    http://localhost:3002"
echo "  • Homepage:   http://localhost:3000"
echo "  • Live App:   http://localhost:3001"
echo "  • Jukebox:    http://localhost:3003"
echo ""
echo "💡 Each service runs in its own terminal window - close individual windows to stop specific services"
echo "🛑 To stop all services, close all the opened terminal windows"
