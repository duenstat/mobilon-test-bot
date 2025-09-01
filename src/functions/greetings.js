import bot from './bot.js';
import { getActiveUsersForGreeting } from './users.js';
import database from '../utils/database.js';
import logger from '../utils/logger.js';
import config from '../utils/config.js';

/**
 * Генерация приветственного сообщения
 */
function generateGreeting(userName) {
    // Проверяем, есть ли сегодня праздник
    const today = new Date();
    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    if (config.messages.holidays[monthDay]) {
        // Используем праздничное приветствие
        return config.messages.holidays[monthDay].replace('{name}', userName);
    }
    
    // Выбираем случайное приветствие
    const greetings = config.messages.greetings;
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    // Выбираем случайный совет
    const tips = config.messages.tips;
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    // Формируем полное сообщение
    const greeting = randomGreeting.replace('{name}', userName);
    return `${greeting}\n\n${randomTip}`;
}

/**
 * Генерация клавиатуры для приветственного сообщения
 */
function generateKeyboard() {
    return [
        [
            {
                TEXT: '👍 Спасибо!',
                COMMAND: 'thanks',
                COMMAND_PARAMS: 'morning',
                BG_COLOR: '#29619b',
                TEXT_COLOR: '#ffffff'
            },
            {
                TEXT: '📅 Мои задачи',
                COMMAND: 'tasks',
                COMMAND_PARAMS: 'today',
                BG_COLOR: '#2a9b05',
                TEXT_COLOR: '#ffffff'
            }
        ],
        [
            {
                TEXT: '❓ Помощь',
                COMMAND: 'help',
                COMMAND_PARAMS: '',
                BG_COLOR: '#555555',
                TEXT_COLOR: '#ffffff'
            }
        ]
    ];
}

/**
 * Отправка приветствия одному пользователю
 */
async function sendGreetingToUser(user) {
    try {
        const userName = user.name || user.first_name || 'Коллега';
        const message = generateGreeting(userName);
        const keyboard = generateKeyboard();
        
        // Отправляем сообщение
        await bot.sendMessage(user.bitrix_id, message, { keyboard });
        
        // Обновляем время последнего приветствия
        await database.updateLastGreeting(user.bitrix_id);
        
        logger.bot(`Приветствие отправлено: ${userName} (ID: ${user.bitrix_id})`);
        
        return { success: true, userId: user.bitrix_id };
    } catch (error) {
        logger.error(`Ошибка отправки приветствия пользователю ${user.name} (${user.bitrix_id}):`, error);
        return { success: false, userId: user.bitrix_id, error: error.message };
    }
}

/**
 * Отправка утренних приветствий всем активным пользователям
 */
export async function sendMorningGreetings() {
    try {
        logger.info('🌅 Начало отправки утренних приветствий...');
        
        // Инициализируем бота
        await bot.initialize();
        
        if (!bot.botId) {
            throw new Error('Бот не зарегистрирован. Необходима регистрация бота.');
        }
        
        // Получаем список пользователей для приветствия
        const users = await getActiveUsersForGreeting();
        
        if (users.length === 0) {
            logger.info('Нет пользователей для отправки утренних приветствий');
            return {
                total: 0,
                sent: 0,
                errors: 0
            };
        }
        
        logger.info(`Найдено ${users.length} пользователей для отправки приветствий`);
        
        const results = {
            total: users.length,
            sent: 0,
            errors: 0,
            details: []
        };
        
        // Разбиваем пользователей на батчи для контроля нагрузки
        const batchSize = config.bot.maxUsersPerBatch;
        const delay = config.bot.delayBetweenMessages;
        
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            logger.info(`Обработка батча ${Math.floor(i / batchSize) + 1} из ${Math.ceil(users.length / batchSize)}`);
            
            // Отправляем сообщения в батче последовательно с задержкой
            for (const user of batch) {
                const result = await sendGreetingToUser(user);
                results.details.push(result);
                
                if (result.success) {
                    results.sent++;
                } else {
                    results.errors++;
                }
                
                // Задержка между сообщениями
                if (delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            // Дополнительная задержка между батчами
            if (i + batchSize < users.length) {
                await new Promise(resolve => setTimeout(resolve, delay * 2));
            }
        }
        
        // Логируем результаты
        const successRate = results.total > 0 
            ? ((results.sent / results.total) * 100).toFixed(2) 
            : 0;
            
        logger.success(`✅ Утренние приветствия отправлены!`, {
            total: results.total,
            sent: results.sent,
            errors: results.errors,
            successRate: `${successRate}%`
        });
        
        // Сохраняем статистику в БД
        await saveGreetingStats(results);
        
        return results;
    } catch (error) {
        logger.error('Критическая ошибка при отправке утренних приветствий:', error);
        throw error;
    }
}

/**
 * Сохранение статистики отправки приветствий
 */
async function saveGreetingStats(results) {
    try {
        for (const detail of results.details) {
            if (!detail.success && detail.error) {
                // Сохраняем информацию об ошибках для анализа
                await database.saveMessageHistory(
                    detail.userId,
                    'Morning greeting',
                    'error',
                    detail.error
                );
            }
        }
    } catch (error) {
        logger.error('Ошибка сохранения статистики приветствий:', error);
    }
}

/**
 * Отправка тестового приветствия конкретному пользователю
 */
export async function sendTestGreeting(userId, customMessage = null) {
    try {
        await bot.initialize();
        
        if (!bot.botId) {
            throw new Error('Бот не зарегистрирован');
        }
        
        // Находим пользователя в БД
        const user = await database.db.get(`
            SELECT * FROM users WHERE bitrix_id = ?
        `, userId);
        
        if (!user) {
            throw new Error(`Пользователь ${userId} не найден в базе данных`);
        }
        
        const userName = user.name || user.first_name || 'Коллега';
        const message = customMessage || generateGreeting(userName);
        const keyboard = generateKeyboard();
        
        await bot.sendMessage(userId, message, { keyboard });
        
        logger.success(`Тестовое приветствие отправлено пользователю ${userName} (${userId})`);
        
        return {
            success: true,
            userId,
            userName,
            message
        };
    } catch (error) {
        logger.error(`Ошибка отправки тестового приветствия:`, error);
        throw error;
    }
}

/**
 * Отправка персонализированного сообщения
 */
export async function sendPersonalizedMessage(userId, messageTemplate, params = {}) {
    try {
        await bot.initialize();
        
        if (!bot.botId) {
            throw new Error('Бот не зарегистрирован');
        }
        
        // Заменяем плейсхолдеры в шаблоне
        let message = messageTemplate;
        for (const [key, value] of Object.entries(params)) {
            message = message.replace(new RegExp(`{${key}}`, 'g'), value);
        }
        
        await bot.sendMessage(userId, message);
        
        logger.bot(`Персонализированное сообщение отправлено пользователю ${userId}`);
        
        return {
            success: true,
            userId,
            message
        };
    } catch (error) {
        logger.error('Ошибка отправки персонализированного сообщения:', error);
        throw error;
    }
}

/**
 * Массовая рассылка сообщений
 */
export async function sendBroadcastMessage(message, userFilter = null) {
    try {
        await bot.initialize();
        
        if (!bot.botId) {
            throw new Error('Бот не зарегистрирован');
        }
        
        // Получаем пользователей по фильтру
        let query = 'SELECT * FROM users WHERE is_active = 1';
        const params = [];
        
        if (userFilter) {
            if (userFilter.department) {
                query += ' AND department LIKE ?';
                params.push(`%${userFilter.department}%`);
            }
            if (userFilter.position) {
                query += ' AND work_position LIKE ?';
                params.push(`%${userFilter.position}%`);
            }
        }
        
        const users = await database.db.all(query, ...params);
        
        logger.info(`Начало массовой рассылки для ${users.length} пользователей`);
        
        let sent = 0;
        let errors = 0;
        
        for (const user of users) {
            try {
                await bot.sendMessage(user.bitrix_id, message);
                sent++;
                
                // Задержка между сообщениями
                await new Promise(resolve => 
                    setTimeout(resolve, config.bot.delayBetweenMessages)
                );
            } catch (error) {
                logger.error(`Ошибка отправки пользователю ${user.bitrix_id}:`, error);
                errors++;
            }
        }
        
        logger.success(`Массовая рассылка завершена: ${sent} отправлено, ${errors} ошибок`);
        
        return {
            total: users.length,
            sent,
            errors
        };
    } catch (error) {
        logger.error('Ошибка массовой рассылки:', error);
        throw error;
    }
}
