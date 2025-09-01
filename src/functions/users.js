import bot from './bot.js';
import database from '../utils/database.js';
import logger from '../utils/logger.js';
import config from '../utils/config.js';

/**
 * Получение списка пользователей из Битрикс24
 */
export async function fetchUsersFromBitrix() {
    try {
        await bot.initialize();
        
        logger.info('Получение списка пользователей из Битрикс24...');
        
        const result = await bot.$b24.callMethod('user.get', {
            ACTIVE: true,
            FILTER: {
                USER_TYPE: 'employee' // Только сотрудники
            }
        });
        
        const users = result._data?.result || result.getData() || [];
        
        // Фильтруем системных пользователей и ботов
        const filteredUsers = users.filter(user => {
            return !user.EMAIL?.includes('no-reply@') && 
                   !user.EMAIL?.includes('bot@') &&
                   !user.EMAIL?.includes('system@') &&
                   user.ACTIVE === true &&
                   user.ID !== '0' &&
                   user.ID !== 0;
        });
        
        logger.info(`Получено ${filteredUsers.length} активных пользователей из Битрикс24`);
        
        return filteredUsers;
    } catch (error) {
        logger.error('Ошибка получения пользователей из Битрикс24:', error);
        throw error;
    }
}

/**
 * Синхронизация пользователей с базой данных
 */
export async function syncUsers() {
    try {
        logger.info('🔄 Начало синхронизации пользователей...');
        
        // Получаем пользователей из Битрикс24
        const bitrixUsers = await fetchUsersFromBitrix();
        
        let synced = 0;
        let errors = 0;
        
        for (const user of bitrixUsers) {
            try {
                await database.saveUser({
                    bitrix_id: user.ID,
                    name: `${user.NAME || ''} ${user.LAST_NAME || ''}`.trim() || 'Пользователь',
                    first_name: user.NAME || '',
                    last_name: user.LAST_NAME || '',
                    email: user.EMAIL || '',
                    work_position: user.WORK_POSITION || '',
                    department: Array.isArray(user.UF_DEPARTMENT) 
                        ? user.UF_DEPARTMENT.join(',') 
                        : (user.UF_DEPARTMENT || '')
                });
                synced++;
            } catch (error) {
                logger.error(`Ошибка синхронизации пользователя ${user.ID}:`, error);
                errors++;
            }
        }
        
        logger.success(`✅ Синхронизация завершена: ${synced} пользователей синхронизировано, ${errors} ошибок`);
        
        return {
            total: bitrixUsers.length,
            synced,
            errors
        };
    } catch (error) {
        logger.error('Критическая ошибка синхронизации пользователей:', error);
        throw error;
    }
}

/**
 * Получение активных пользователей для рассылки
 */
export async function getActiveUsersForGreeting() {
    try {
        // Получаем пользователей, которым сегодня ещё не отправляли приветствие
        const users = await database.getUsersForMorningGreeting();
        
        logger.info(`Найдено ${users.length} пользователей для утреннего приветствия`);
        
        return users;
    } catch (error) {
        logger.error('Ошибка получения пользователей для приветствия:', error);
        throw error;
    }
}

/**
 * Обновление информации о пользователе
 */
export async function updateUser(userId, updates) {
    try {
        const updateFields = [];
        const values = [];
        
        if (updates.name !== undefined) {
            updateFields.push('name = ?');
            values.push(updates.name);
        }
        
        if (updates.is_active !== undefined) {
            updateFields.push('is_active = ?');
            values.push(updates.is_active ? 1 : 0);
        }
        
        if (updates.email !== undefined) {
            updateFields.push('email = ?');
            values.push(updates.email);
        }
        
        if (updates.work_position !== undefined) {
            updateFields.push('work_position = ?');
            values.push(updates.work_position);
        }
        
        if (updateFields.length === 0) {
            return false;
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(userId);
        
        await database.db.run(`
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE bitrix_id = ?
        `, ...values);
        
        logger.info(`Информация о пользователе ${userId} обновлена`);
        return true;
    } catch (error) {
        logger.error(`Ошибка обновления пользователя ${userId}:`, error);
        throw error;
    }
}

/**
 * Получение статистики по пользователям
 */
export async function getUserStats() {
    try {
        const stats = await database.db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
                SUM(CASE WHEN DATE(last_greeting_sent) = DATE('now') THEN 1 ELSE 0 END) as greeted_today
            FROM users
        `);
        
        return {
            total: stats.total || 0,
            active: stats.active || 0,
            inactive: stats.inactive || 0,
            greetedToday: stats.greeted_today || 0
        };
    } catch (error) {
        logger.error('Ошибка получения статистики пользователей:', error);
        throw error;
    }
}

/**
 * Поиск пользователя по ID
 */
export async function findUserById(userId) {
    try {
        return await database.db.get(`
            SELECT * FROM users 
            WHERE bitrix_id = ?
        `, userId);
    } catch (error) {
        logger.error(`Ошибка поиска пользователя ${userId}:`, error);
        throw error;
    }
}

/**
 * Массовая активация/деактивация пользователей
 */
export async function bulkUpdateUsersStatus(userIds, isActive) {
    try {
        const placeholders = userIds.map(() => '?').join(',');
        
        await database.db.run(`
            UPDATE users 
            SET is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE bitrix_id IN (${placeholders})
        `, isActive ? 1 : 0, ...userIds);
        
        logger.info(`Статус ${userIds.length} пользователей обновлён на ${isActive ? 'активный' : 'неактивный'}`);
        
        return true;
    } catch (error) {
        logger.error('Ошибка массового обновления статуса пользователей:', error);
        throw error;
    }
}

/**
 * Экспорт списка пользователей
 */
export async function exportUsers(format = 'json') {
    try {
        const users = await database.db.all(`
            SELECT 
                bitrix_id,
                name,
                email,
                work_position,
                department,
                is_active,
                last_greeting_sent,
                created_at
            FROM users
            ORDER BY name
        `);
        
        if (format === 'csv') {
            // Формируем CSV
            const headers = ['ID', 'Имя', 'Email', 'Должность', 'Отдел', 'Активен', 'Последнее приветствие', 'Дата добавления'];
            const rows = users.map(user => [
                user.bitrix_id,
                user.name,
                user.email,
                user.work_position,
                user.department,
                user.is_active ? 'Да' : 'Нет',
                user.last_greeting_sent || 'Никогда',
                user.created_at
            ]);
            
            const csv = [headers, ...rows]
                .map(row => row.map(cell => `"${cell || ''}"`).join(','))
                .join('\n');
                
            return csv;
        }
        
        return users;
    } catch (error) {
        logger.error('Ошибка экспорта пользователей:', error);
        throw error;
    }
}

/**
 * Импорт пользователей из файла
 */
export async function importUsers(users) {
    try {
        let imported = 0;
        let errors = 0;
        
        for (const user of users) {
            try {
                await database.saveUser({
                    bitrix_id: user.bitrix_id || user.id,
                    name: user.name,
                    first_name: user.first_name || '',
                    last_name: user.last_name || '',
                    email: user.email || '',
                    work_position: user.work_position || '',
                    department: user.department || ''
                });
                imported++;
            } catch (error) {
                logger.error(`Ошибка импорта пользователя:`, error);
                errors++;
            }
        }
        
        logger.success(`Импорт завершён: ${imported} пользователей импортировано, ${errors} ошибок`);
        
        return {
            imported,
            errors
        };
    } catch (error) {
        logger.error('Ошибка импорта пользователей:', error);
        throw error;
    }
}
