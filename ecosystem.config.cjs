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
        PORT: "3000",
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
  ],
};
