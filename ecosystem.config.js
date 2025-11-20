module.exports = {
  apps: [
    {
      name: 'ai-maestro',
      script: './scripts/start-with-ssh.sh',
      interpreter: '/bin/bash',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 23000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 23000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 5000,
      kill_timeout: 5000,
    },
  ],
};
