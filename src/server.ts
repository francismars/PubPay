// Integration script to replace legacy Express server with new TypeScript backend
import { BackendServer } from '../packages/backend/dist/index.js';

// Start the new backend server
const server = new BackendServer();
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
