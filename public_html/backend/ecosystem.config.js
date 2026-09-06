module.exports = {
  apps: [
    {
      name: "crypto-backend",
      script: "./src/server.js",
      cwd: "/home/webuser/web/crypto.schnueddels.de/public_html/backend",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3033"
      }
    },
    {
      name: "crypto-refresh",
      script: "/home/webuser/web/crypto.schnueddels.de/private/.scripts/refresh_market.sh",
      cwd: "/home/webuser/web/crypto.schnueddels.de/public_html/backend",
      interpreter: "/bin/bash",
      autorestart: false,
      cron_restart: "*/5 * * * *",
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3033"
      }
    }
  ]
};
