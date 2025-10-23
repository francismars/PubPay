# PubPay Development Scripts

This directory contains scripts to start all PubPay services in separate terminal windows for better development experience and log separation.

## Available Scripts

### Cross-Platform (Recommended)
- **`pnpm dev:all`** - Start all services in one console (using concurrently)
- **`pnpm dev:apps`** - Start only frontend apps (no backend)

### Windows
- **`pnpm dev:windows`** - Node.js script (works on Windows, macOS, Linux)
- **`pnpm dev:windows:ps`** - PowerShell script (Windows only)
- **`pnpm dev:windows:bat`** - Batch file (Windows only)

### macOS
- **`pnpm dev:macos`** - Opens each service in separate Terminal windows
- **`pnpm dev:macos:tabs`** - Opens each service in separate Terminal tabs

### Linux
- **`pnpm dev:linux`** - Opens each service in separate terminal windows (supports gnome-terminal, xterm, konsole, xfce4-terminal)

## Service URLs

When all services are running, you can access:

- **Backend**: http://localhost:3002
- **Homepage**: http://localhost:3000  
- **Live App**: http://localhost:3001
- **Jukebox App**: http://localhost:3003

## Usage Examples

### Start All Services (Cross-Platform)
```bash
pnpm dev:all
```

### Start All Services in Separate Windows (Platform-Specific)
```bash
# Windows
pnpm dev:windows

# macOS
pnpm dev:macos

# Linux
pnpm dev:linux
```

### Start Only Frontend Apps
```bash
pnpm dev:apps
```

## Benefits of Separate Windows

✅ **Better Log Separation**: Each service has its own dedicated console window  
✅ **Individual Control**: Stop specific services by closing their windows  
✅ **Visual Organization**: Clear service identification with colored titles  
✅ **Better Development Workflow**: Easy to debug individual services  

## Stopping Services

- **Individual Services**: Close the specific console window for that service
- **All Services**: Close all opened console windows or press `Ctrl+C` in each window

## Requirements

- **Node.js**: v18+ recommended
- **pnpm**: Package manager
- **Terminal Emulator**: 
  - Windows: PowerShell, Command Prompt, or Windows Terminal
  - macOS: Terminal.app
  - Linux: gnome-terminal, xterm, konsole, or xfce4-terminal

## Troubleshooting

### Windows
- If PowerShell execution is blocked, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Make sure you have Node.js and pnpm installed

### macOS
- Make sure Terminal.app has permission to run AppleScript
- Scripts are automatically executable

### Linux
- Install a supported terminal emulator if none are found
- Make sure scripts are executable: `chmod +x scripts/*.sh`
