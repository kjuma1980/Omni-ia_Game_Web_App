// PM2 ecosystem — para VPS (migración desde hPanel cuando haga falta).
// Uso: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'omni-auth',
      cwd: __dirname + '/../auth-server',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4010,
        HOST: '0.0.0.0',
        TRUST_PROXY: '1',
      },
      env_file: __dirname + '/../auth-server/.env',
    },
  ],
};
