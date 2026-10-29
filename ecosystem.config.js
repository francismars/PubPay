module.exports = {
  apps: [
    {
      name: 'pubpay-backend',
      script: './packages/backend/dist/index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        // Required behind nginx so express-rate-limit sees real client IPs.
        // Other secrets (FRONTEND_URL, WEBHOOK_SECRET, LNBITS_*) come from
        // packages/backend/.env via dotenv in the process.
        TRUST_PROXY: 'true'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
