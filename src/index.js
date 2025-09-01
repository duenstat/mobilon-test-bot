import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Утилиты
import config, { validateConfig } from './utils/config.js';
import logger from './utils/logger.js';
import database from './utils/database.js';
import scheduler from './utils/scheduler.js';

// Функции
import bot from './functions/bot.js';
import { syncUsers } from './functions/users.js';
import { sendMorningGreetings, sendTestGreeting } from './functions/greetings.js';

// Получаем __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config();

// Создаём Express приложение
const app = express();

// Middleware
app.use(helmet()); // Безопасность
app.use(cors()); // CORS
app.use(bodyParser.json()); // Парсинг JSON
app.use(bodyParser.urlencoded({ extended: true })); // Парсинг URL-encoded
app.use(morgan('combined', { // Логирование запросов
    stream: { write: message => logger.info(message.trim()) }
}));

// Главная страница
app.get('/', (req, res) => {
    res.json({
        name: 'Битрикс24 Бот Утренних Приветствий',
        version: '1.0.0',
        status: 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Webhook для обработки событий от Битрикс24
app.post('/webhook', async (req, res) => {
    try {
        const { event, data } = req.body;
        
        logger.info('Получено событие webhook:', { event, data });
        
        // Обработка различных событий
        switch (event) {
            case 'ONIMCOMMANDADD':
                // Обработка команды от пользователя
                const { COMMAND, COMMAND_PARAMS, USER_ID } = data[0];
                await bot.handleCommand(COMMAND[0], COMMAND_PARAMS, USER_ID);
                break;
                
            case 'ONIMBOTMESSAGEADD':
                // Новое сообщение боту
                const { MESSAGE, FROM_USER_ID } = data[0];
                logger.info(`Получено сообщение от ${FROM_USER_ID}: ${MESSAGE}`);
                
                // Обработка текстовых команд
                if (MESSAGE.startsWith('/')) {
                    const parts = MESSAGE.split(' ');
                    const command = parts[0].substring(1);
                    const params = parts.slice(1).join(' ');
                    await bot.handleCommand(command, params, FROM_USER_ID);
                }
                break;
                
            case 'ONIMBOTJOINCHAT':
                // Бот добавлен в чат
                const { CHAT_ID } = data[0];
                logger.info(`Бот добавлен в чат ${CHAT_ID}`);
                await bot.sendMessage(
                    `chat${CHAT_ID}`,
                    'Привет! Я бот для утренних приветствий. Используйте /help для получения справки.'
                );
                break;
                
            case 'ONIMBOTDELETE':
                // Бот удалён
                logger.warn('Бот был удалён из Битрикс24');
                break;
                
            default:
                logger.info(`Неизвестное событие: ${event}`);
        }
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Ошибка обработки webhook:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API эндпоинты

// Статус бота
app.get('/api/status', async (req, res) => {
    try {
        const botInfo = await bot.getBotInfo();
        const activeJobs = scheduler.getActiveJobs();
        const userStats = await database.db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
            FROM users
        `);
        
        res.json({
            bot: {
                registered: !!bot.botId,
                id: bot.botId,
                info: botInfo
            },
            scheduler: {
                running: scheduler.isRunning,
                jobs: activeJobs
            },
            users: {
                total: userStats?.total || 0,
                active: userStats?.active || 0
            },
            database: {
                connected: !!database.db
            }
        });
    } catch (error) {
        logger.error('Ошибка получения статуса:', error);
        res.status(500).json({ error: error.message });
    }
});

// Регистрация бота
app.post('/api/bot/register', async (req, res) => {
    try {
        const result = await bot.registerBot(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Ошибка регистрации бота:', error);
        res.status(500).json({ error: error.message });
    }
});

// Удаление бота
app.delete('/api/bot/unregister', async (req, res) => {
    try {
        const result = await bot.unregisterBot();
        res.json({ success: result });
    } catch (error) {
        logger.error('Ошибка удаления бота:', error);
        res.status(500).json({ error: error.message });
    }
});

// Синхронизация пользователей
app.post('/api/users/sync', async (req, res) => {
    try {
        const result = await syncUsers();
        res.json(result);
    } catch (error) {
        logger.error('Ошибка синхронизации пользователей:', error);
        res.status(500).json({ error: error.message });
    }
});

// Список пользователей
app.get('/api/users', async (req, res) => {
    try {
        const users = await database.getActiveUsers();
        res.json(users);
    } catch (error) {
        logger.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: error.message });
    }
});

// Обновление пользователя
app.patch('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        await database.db.run(`
            UPDATE users 
            SET ${Object.keys(updates).map(k => `${k} = ?`).join(', ')}, 
                updated_at = CURRENT_TIMESTAMP
            WHERE bitrix_id = ?
        `, ...Object.values(updates), id);
        
        res.json({ success: true });
    } catch (error) {
        logger.error('Ошибка обновления пользователя:', error);
        res.status(500).json({ error: error.message });
    }
});

// Отправка утренних приветствий вручную
app.post('/api/greetings/send', async (req, res) => {
    try {
        const result = await sendMorningGreetings();
        res.json(result);
    } catch (error) {
        logger.error('Ошибка отправки приветствий:', error);
        res.status(500).json({ error: error.message });
    }
});

// Отправка тестового приветствия
app.post('/api/greetings/test', async (req, res) => {
    try {
        const { userId, message } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId обязателен' });
        }
        
        const result = await sendTestGreeting(userId, message);
        res.json(result);
    } catch (error) {
        logger.error('Ошибка отправки тестового приветствия:', error);
        res.status(500).json({ error: error.message });
    }
});

// Статистика сообщений
app.get('/api/stats/messages', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stats = await database.getMessageStats(days);
        res.json(stats);
    } catch (error) {
        logger.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: error.message });
    }
});

// Настройки расписания
app.get('/api/schedule', async (req, res) => {
    try {
        const settings = await database.getScheduleSettings();
        res.json(settings);
    } catch (error) {
        logger.error('Ошибка получения настроек расписания:', error);
        res.status(500).json({ error: error.message });
    }
});

// Обновление настроек расписания
app.put('/api/schedule', async (req, res) => {
    try {
        const { hour, minute, days_of_week, timezone } = req.body;
        
        await database.db.run(`
            UPDATE schedule_settings 
            SET hour = ?, minute = ?, days_of_week = ?, timezone = ?, 
                updated_at = CURRENT_TIMESTAMP
            WHERE schedule_type = 'morning_greeting'
        `, hour, minute, days_of_week, timezone);
        
        // Перезапускаем планировщик с новыми настройками
        scheduler.stopJob('morning_greeting');
        const settings = await database.getScheduleSettings();
        await scheduler.scheduleMorningGreeting(settings);
        
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Ошибка обновления расписания:', error);
        res.status(500).json({ error: error.message });
    }
});

// Запуск задачи вручную
app.post('/api/schedule/run/:jobName', async (req, res) => {
    try {
        const { jobName } = req.params;
        await scheduler.runJob(jobName);
        res.json({ success: true, message: `Задача ${jobName} запущена` });
    } catch (error) {
        logger.error('Ошибка запуска задачи:', error);
        res.status(500).json({ error: error.message });
    }
});

// Обработка ошибок
app.use((err, req, res, next) => {
    logger.error('Необработанная ошибка:', err);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        message: err.message
    });
});

// 404 обработчик
app.use((req, res) => {
    res.status(404).json({
        error: 'Не найдено',
        path: req.path
    });
});

/**
 * Инициализация и запуск сервера
 */
async function startServer() {
    try {
        logger.info('🚀 Запуск сервера бота утренних приветствий...');
        
        // Валидация конфигурации
        validateConfig();
        
        // Подключение к базе данных
        await database.connect();
        
        // Инициализация бота
        await bot.initialize();
        
        // Проверка регистрации бота
        if (!bot.botId) {
            logger.warn('⚠️ Бот не зарегистрирован. Используйте /api/bot/register для регистрации.');
        } else {
            logger.success(`✅ Бот загружен с ID: ${bot.botId}`);
            
            // Синхронизация пользователей при запуске
            logger.info('Синхронизация пользователей...');
            await syncUsers();
        }
        
        // Запуск планировщика
        await scheduler.start();
        
        // Добавляем дополнительные задачи
        await scheduler.scheduleDailyUserSync();
        await scheduler.scheduleLogCleanup();
        
        // Запуск HTTP сервера
        const port = config.server.port;
        const host = config.server.host;
        
        app.listen(port, host, () => {
            logger.success(`✅ Сервер запущен на http://${host}:${port}`);
            logger.info('📌 Webhook URL:', `http://${host}:${port}/webhook`);
            logger.info('📊 API документация:', `http://${host}:${port}/api`);
            
            // Показываем следующее время запуска утреннего приветствия
            const jobs = scheduler.getActiveJobs();
            if (jobs.length > 0) {
                logger.info('📅 Активные задачи:', jobs);
            }
        });
        
    } catch (error) {
        logger.error('❌ Критическая ошибка при запуске сервера:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal) {
    logger.info(`\n⚠️ Получен сигнал ${signal}. Начинаем плавное завершение...`);
    
    try {
        // Останавливаем планировщик
        scheduler.stopAll();
        
        // Закрываем соединение с БД
        await database.close();
        
        logger.success('✅ Сервер успешно остановлен');
        process.exit(0);
    } catch (error) {
        logger.error('Ошибка при остановке сервера:', error);
        process.exit(1);
    }
}

// Обработка сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Запускаем сервер
startServer();
