import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к папке с логами
const LOG_DIR = path.join(__dirname, '../../logs');

// Создаём папку для логов если её нет
async function ensureLogDir() {
    try {
        await fs.mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
        // Папка уже существует
    }
}

// Вызываем создание папки
ensureLogDir();

// Формат для консоли с цветами
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `[${timestamp}] ${level}: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta, null, 2)}`;
        }
        return msg;
    })
);

// Формат для файлов (JSON)
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Создаём логгер
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        // Консоль
        new winston.transports.Console({
            format: consoleFormat
        }),
        // Файл для всех логов
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'app.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Файл для ошибок
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Файл для сообщений бота
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'bot-messages.log'),
            format: fileFormat,
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    ]
});

// Добавляем методы для удобства
logger.success = function(message, meta) {
    this.info(`✅ ${message}`, meta);
};

logger.bot = function(message, meta) {
    // Логируем в специальный файл для сообщений бота
    const botTransport = this.transports.find(t => 
        t.filename && t.filename.includes('bot-messages.log')
    );
    if (botTransport) {
        botTransport.log({
            level: 'info',
            message: `🤖 ${message}`,
            timestamp: new Date().toISOString(),
            ...meta
        });
    }
    this.info(`🤖 ${message}`, meta);
};

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
});

export default logger;
