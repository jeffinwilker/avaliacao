// Configuração do PM2 para rodar o admin em produção.
// Uso: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "avaliacoes-admin",
      cwd: "./apps/admin",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        // Porta 3000 já é usada por outros apps PM2 do VPS.
        // Nginx faz proxy do subdomínio para essa porta.
        PORT: "3002",
      },
      autorestart: true,
      max_memory_restart: "500M",
      instances: 1,
      exec_mode: "fork",
      error_file: "./logs/admin-error.log",
      out_file: "./logs/admin-out.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "avaliacoes-automation-worker",
      cwd: ".",
      script: "scripts/automation-worker.mjs",
      env: {
        NODE_ENV: "production",
        AUTOMATION_CRON_URL:
          "http://127.0.0.1:3002/api/cron/send-requests",
        AUTOMATION_CRON_INTERVAL_MS: "300000",
      },
      autorestart: true,
      max_memory_restart: "150M",
      instances: 1,
      exec_mode: "fork",
      error_file: "./apps/admin/logs/automation-error.log",
      out_file: "./apps/admin/logs/automation-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
