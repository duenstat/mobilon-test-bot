module.exports = {
  apps: [{
    name: 'morning-greeting-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000,
    
    // Cron restart - перезапуск каждую неделю в воскресенье в 4:00
    cron_restart: '0 4 * * 0',
    
    // Мониторинг
    max_restarts: 10,
    min_uptime: '10s',
    
    // Переменные окружения для продакшена
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    
    // Переменные окружения для разработки
    env_development: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    }
  }]
};
