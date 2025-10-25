#!/usr/bin/env node

const { spawn } = require('child_process');
const os = require('os');

console.log('🚀 Starting PubPay Development Environment...');
console.log('Opening each service in separate console windows...\n');

// Service configurations
const services = [
  {
    name: 'Backend (Port 3002)',
    command: 'pnpm',
    args: ['dev:backend'],
    color: '\x1b[36m', // Cyan
    url: 'http://localhost:3002'
  },
  {
    name: 'PUBPAY (Port 3000)',
    command: 'pnpm',
    args: ['dev:pubpay'],
    color: '\x1b[32m', // Green
    url: 'http://localhost:3000'
  },
  {
    name: 'Live App (Port 3001)',
    command: 'pnpm',
    args: ['dev:live'],
    color: '\x1b[34m', // Blue
    url: 'http://localhost:3001'
  },
  {
    name: 'Jukebox App (Port 3003)',
    command: 'pnpm',
    args: ['dev:jukebox'],
    color: '\x1b[35m', // Magenta
    url: 'http://localhost:3003'
  }
];

// Function to start service in new terminal
function startServiceInNewTerminal(service) {
  const platform = os.platform();
  let command, args;

  switch (platform) {
    case 'win32':
      // Windows
      command = 'cmd';
      args = [
        '/c',
        'start',
        `"PubPay - ${service.name}"`,
        'cmd',
        '/k',
        `${service.command} ${service.args.join(' ')}`
      ];
      break;
    case 'darwin':
      // macOS
      command = 'osascript';
      args = [
        '-e',
        `tell application "Terminal" to do script "cd ${process.cwd()} && ${service.command} ${service.args.join(' ')}"`
      ];
      break;
    default:
      // Linux
      command = 'gnome-terminal';
      args = [
        '--',
        'bash',
        '-c',
        `cd ${process.cwd()} && ${service.command} ${service.args.join(' ')}; exec bash`
      ];
      break;
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  console.log(`${service.color}✅ Started ${service.name}${'\x1b[0m'}`);
}

// Start all services with delays
services.forEach((service, index) => {
  setTimeout(() => {
    startServiceInNewTerminal(service);
  }, index * 1000); // 1 second delay between each service
});

// Show final information
setTimeout(
  () => {
    console.log('\n✅ All services started in separate windows!');
    console.log('\n🌐 Service URLs:');
    services.forEach(service => {
      console.log(`  • ${service.name.split(' ')[0]}: ${service.url}`);
    });
    console.log(
      '\n💡 Each service runs in its own window - close individual windows to stop specific services'
    );
    console.log('🛑 To stop all services, close all the opened windows\n');
  },
  services.length * 1000 + 1000
);
