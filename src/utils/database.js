import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к базе данных
const DB_PATH = path.join(__dirname, '../../db/bot.db');

/**
 * Класс для работы с базой данных
 */
class Database {
    constructor() {
        this.db = null;
    }

    /**
     * Инициализация подключения к БД
     */
    async connect() {
        // Создаём папку db если её нет
        const dbDir = path.dirname(DB_PATH);
        try {
            await fs.mkdir(dbDir, { recursive: true });
        } catch (error) {
            // Папка уже существует
        }

        // Открываем соединение с БД
        this.db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Включаем foreign keys
        await this.db.exec('PRAGMA foreign_keys = ON');
        
        // Инициализируем таблицы
        await this.initTables();
        
        console.log('✅ База данных подключена и инициализирована');
        return this.db;
    }

    /**
     * Создание таблиц если их нет
     */
    async initTables() {
        // Таблица для данных бота
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS bot_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bot_id TEXT UNIQUE NOT NULL,
                bot_name TEXT,
                bot_code TEXT,
                webhook_url TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица для пользователей
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                bitrix_id TEXT UNIQUE NOT NULL,
                name TEXT,
                first_name TEXT,
                last_name TEXT,
                email TEXT,
                work_position TEXT,
                department TEXT,
                is_active BOOLEAN DEFAULT 1,
                last_greeting_sent DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица для истории отправленных сообщений
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS message_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                message_text TEXT,
                message_type TEXT DEFAULT 'greeting',
                status TEXT DEFAULT 'sent',
                error_message TEXT,
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(bitrix_id)
            )
        `);

        // Таблица для настроек расписания
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS schedule_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_type TEXT DEFAULT 'morning_greeting',
                hour INTEGER DEFAULT 9,
                minute INTEGER DEFAULT 0,
                days_of_week TEXT DEFAULT '1,2,3,4,5', -- Пн-Пт
                timezone TEXT DEFAULT 'Europe/Moscow',
                is_active BOOLEAN DEFAULT 1,
                last_run DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Вставляем дефолтные настройки расписания если их нет
        const scheduleExists = await this.db.get(
            'SELECT id FROM schedule_settings WHERE schedule_type = ?',
            'morning_greeting'
        );

        if (!scheduleExists) {
            await this.db.run(`
                INSERT INTO schedule_settings (schedule_type, hour, minute, days_of_week, timezone)
                VALUES ('morning_greeting', 9, 0, '1,2,3,4,5', 'Europe/Moscow')
            `);
        }
    }

    /**
     * Сохранение или обновление конфигурации бота
     */
    async saveBotConfig(botData) {
        const { botId, botName, botCode, webhookUrl } = botData;
        
        const existing = await this.db.get(
            'SELECT id FROM bot_config WHERE bot_id = ?',
            botId
        );

        if (existing) {
            await this.db.run(`
                UPDATE bot_config 
                SET bot_name = ?, bot_code = ?, webhook_url = ?, updated_at = CURRENT_TIMESTAMP
                WHERE bot_id = ?
            `, botName, botCode, webhookUrl, botId);
        } else {
            await this.db.run(`
                INSERT INTO bot_config (bot_id, bot_name, bot_code, webhook_url)
                VALUES (?, ?, ?, ?)
            `, botId, botName, botCode, webhookUrl);
        }

        return { botId, botName, botCode, webhookUrl };
    }

    /**
     * Получение конфигурации активного бота
     */
    async getActiveBotConfig() {
        return await this.db.get(`
            SELECT * FROM bot_config 
            WHERE is_active = 1 
            ORDER BY created_at DESC 
            LIMIT 1
        `);
    }

    /**
     * Сохранение или обновление пользователя
     */
    async saveUser(userData) {
        const { 
            bitrix_id, 
            name, 
            first_name, 
            last_name, 
            email, 
            work_position,
            department 
        } = userData;

        const existing = await this.db.get(
            'SELECT id FROM users WHERE bitrix_id = ?',
            bitrix_id
        );

        if (existing) {
            await this.db.run(`
                UPDATE users 
                SET name = ?, first_name = ?, last_name = ?, 
                    email = ?, work_position = ?, department = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE bitrix_id = ?
            `, name, first_name, last_name, email, work_position, department, bitrix_id);
        } else {
            await this.db.run(`
                INSERT INTO users (bitrix_id, name, first_name, last_name, email, work_position, department)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, bitrix_id, name, first_name, last_name, email, work_position, department);
        }
    }

    /**
     * Получение всех активных пользователей
     */
    async getActiveUsers() {
        return await this.db.all(`
            SELECT * FROM users 
            WHERE is_active = 1
            ORDER BY name
        `);
    }

    /**
     * Получение пользователей для утреннего приветствия
     */
    async getUsersForMorningGreeting() {
        const today = new Date().toISOString().split('T')[0];
        
        return await this.db.all(`
            SELECT * FROM users 
            WHERE is_active = 1 
                AND (last_greeting_sent IS NULL 
                     OR DATE(last_greeting_sent) < DATE(?))
            ORDER BY name
        `, today);
    }

    /**
     * Обновление времени последнего приветствия
     */
    async updateLastGreeting(userId) {
        await this.db.run(`
            UPDATE users 
            SET last_greeting_sent = CURRENT_TIMESTAMP 
            WHERE bitrix_id = ?
        `, userId);
    }

    /**
     * Сохранение истории сообщения
     */
    async saveMessageHistory(userId, messageText, status = 'sent', errorMessage = null) {
        await this.db.run(`
            INSERT INTO message_history (user_id, message_text, status, error_message)
            VALUES (?, ?, ?, ?)
        `, userId, messageText, status, errorMessage);
    }

    /**
     * Получение настроек расписания
     */
    async getScheduleSettings(scheduleType = 'morning_greeting') {
        return await this.db.get(`
            SELECT * FROM schedule_settings 
            WHERE schedule_type = ? AND is_active = 1
        `, scheduleType);
    }

    /**
     * Обновление времени последнего запуска
     */
    async updateLastRun(scheduleType = 'morning_greeting') {
        await this.db.run(`
            UPDATE schedule_settings 
            SET last_run = CURRENT_TIMESTAMP 
            WHERE schedule_type = ?
        `, scheduleType);
    }

    /**
     * Получение статистики отправленных сообщений
     */
    async getMessageStats(days = 7) {
        const stats = await this.db.all(`
            SELECT 
                DATE(sent_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
            FROM message_history
            WHERE sent_at >= DATE('now', '-${days} days')
            GROUP BY DATE(sent_at)
            ORDER BY date DESC
        `);

        return stats;
    }

    /**
     * Закрытие соединения с БД
     */
    async close() {
        if (this.db) {
            await this.db.close();
            console.log('База данных закрыта');
        }
    }
}

// Экспортируем singleton экземпляр
const database = new Database();
export default database;
