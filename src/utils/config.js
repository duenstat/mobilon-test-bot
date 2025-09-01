import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: path.join(__dirname, '../../.env') });

/**
 * Конфигурация приложения
 */
const config = {
    // Битрикс24
    bitrix: {
        url: process.env.BITRIX_URL,
        userId: parseInt(process.env.BITRIX_USER_ID) || 1,
        secret: process.env.BITRIX_WEBHOOK_SECRET,
        botId: process.env.BOT_ID
    },

    // Расписание
    schedule: {
        morningGreeting: {
            hour: parseInt(process.env.GREETING_HOUR) || 9,
            minute: parseInt(process.env.GREETING_MINUTE) || 0,
            // Дни недели (0 - воскресенье, 1-5 - пн-пт, 6 - суббота)
            daysOfWeek: process.env.GREETING_DAYS 
                ? process.env.GREETING_DAYS.split(',').map(d => parseInt(d.trim()))
                : [1, 2, 3, 4, 5], // По умолчанию пн-пт
            timezone: process.env.TIMEZONE || 'Europe/Moscow'
        }
    },

    // Сообщения
    messages: {
        greetings: [
            '🌞 Доброе утро, {name}! Желаю вам продуктивного дня!',
            '☀️ Привет, {name}! Пусть этот день принесет только хорошее!',
            '🌅 С добрым утром, {name}! Отличного настроения и успехов в работе!',
            '💫 Добрый день, {name}! Начинаем день с позитива!',
            '🌈 Приветствую, {name}! Пусть день будет ярким и успешным!',
            '🌸 Доброе утро, {name}! Хорошего дня и отличных результатов!',
            '⭐ Привет, {name}! Новый день - новые возможности!',
            '🎯 С добрым утром, {name}! Пусть все задачи решаются легко!',
            '🚀 Доброе утро, {name}! Энергии и вдохновения на весь день!',
            '☕ Привет, {name}! Начнём день с улыбки и чашки кофе!'
        ],
        tips: [
            '[b]💡 Совет дня:[/b]\nНачните день с самой важной задачи - это повысит вашу продуктивность!',
            '[b]💡 Совет дня:[/b]\nНе забудьте сделать короткие перерывы между задачами для восстановления энергии.',
            '[b]💡 Совет дня:[/b]\nСоставьте список из 3 главных целей на день - это поможет сфокусироваться.',
            '[b]💡 Совет дня:[/b]\nВыпейте стакан воды прямо сейчас - гидратация важна для продуктивности!',
            '[b]💡 Совет дня:[/b]\nУделите 5 минут планированию дня - это сэкономит часы работы.',
            '[b]💡 Совет дня:[/b]\nПомните о правиле 2 минут: если задача занимает меньше 2 минут - сделайте её сразу!',
            '[b]💡 Совет дня:[/b]\nИспользуйте технику Pomodoro: 25 минут работы, 5 минут отдыха.',
            '[b]💡 Совет дня:[/b]\nНачните день с благодарности - это настроит на позитивный лад.',
            '[b]💡 Совет дня:[/b]\nОтключите уведомления на время важной работы - фокус превыше всего!',
            '[b]💡 Совет дня:[/b]\nСделайте несколько глубоких вдохов - это поможет сосредоточиться.'
        ],
        holidays: {
            '01-01': '🎄 С Новым годом, {name}! Пусть этот год будет полон успехов!',
            '23-02': '🎖️ С Днём защитника Отечества, {name}!',
            '08-03': '🌷 С Международным женским днём, {name}!',
            '01-05': '🌺 С праздником Весны и Труда, {name}!',
            '09-05': '🎗️ С Днём Победы, {name}!',
            '12-06': '🇷🇺 С Днём России, {name}!',
            '04-11': '🤝 С Днём народного единства, {name}!'
        }
    },

    // Настройки бота
    bot: {
        maxUsersPerBatch: parseInt(process.env.MAX_USERS_PER_BATCH) || 10,
        delayBetweenMessages: parseInt(process.env.MESSAGE_DELAY) || 1000, // мс
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.RETRY_DELAY) || 5000 // мс
    },

    // Настройки сервера
    server: {
        port: parseInt(process.env.PORT) || 3000,
        host: process.env.HOST || 'localhost'
    },

    // Режим разработки
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    logLevel: process.env.LOG_LEVEL || 'info'
};

// Валидация конфигурации
export function validateConfig() {
    const errors = [];

    if (!config.bitrix.url) {
        errors.push('BITRIX_URL не указан в .env');
    }

    if (!config.bitrix.secret) {
        errors.push('BITRIX_WEBHOOK_SECRET не указан в .env');
    }

    if (errors.length > 0) {
        throw new Error(`Ошибки конфигурации:\n${errors.join('\n')}`);
    }

    return true;
}

export default config;
