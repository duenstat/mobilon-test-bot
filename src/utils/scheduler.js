import cron from 'node-cron';
import logger from './logger.js';
import config from './config.js';
import database from './database.js';

/**
 * Класс для управления расписанием задач
 */
class Scheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Запуск планировщика
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Планировщик уже запущен');
            return;
        }

        logger.info('🕐 Запуск планировщика задач...');
        this.isRunning = true;

        // Получаем настройки расписания из БД
        const scheduleSettings = await database.getScheduleSettings('morning_greeting');
        
        if (scheduleSettings && scheduleSettings.is_active) {
            await this.scheduleMorningGreeting(scheduleSettings);
        } else {
            // Используем настройки из конфига
            await this.scheduleMorningGreetingFromConfig();
        }

        logger.success('Планировщик задач запущен');
    }

    /**
     * Планирование утренних приветствий из настроек БД
     */
    async scheduleMorningGreeting(settings) {
        const { hour, minute, days_of_week } = settings;
        const daysArray = days_of_week.split(',').map(d => parseInt(d.trim()));
        
        // Преобразуем дни недели в cron формат
        const cronDays = daysArray.join(',');
        const cronExpression = `${minute} ${hour} * * ${cronDays}`;

        await this.scheduleJob('morning_greeting', cronExpression, async () => {
            logger.info('⏰ Запуск задачи утреннего приветствия');
            
            try {
                // Импортируем функцию отправки приветствий
                const { sendMorningGreetings } = await import('../functions/greetings.js');
                await sendMorningGreetings();
                
                // Обновляем время последнего запуска
                await database.updateLastRun('morning_greeting');
                
                logger.success('Задача утреннего приветствия выполнена');
            } catch (error) {
                logger.error('Ошибка выполнения задачи утреннего приветствия:', error);
            }
        });
    }

    /**
     * Планирование утренних приветствий из конфига
     */
    async scheduleMorningGreetingFromConfig() {
        const { hour, minute, daysOfWeek } = config.schedule.morningGreeting;
        
        // Преобразуем дни недели в cron формат
        const cronDays = daysOfWeek.join(',');
        const cronExpression = `${minute} ${hour} * * ${cronDays}`;

        await this.scheduleJob('morning_greeting', cronExpression, async () => {
            logger.info('⏰ Запуск задачи утреннего приветствия (из конфига)');
            
            try {
                // Импортируем функцию отправки приветствий
                const { sendMorningGreetings } = await import('../functions/greetings.js');
                await sendMorningGreetings();
                
                // Обновляем время последнего запуска
                await database.updateLastRun('morning_greeting');
                
                logger.success('Задача утреннего приветствия выполнена');
            } catch (error) {
                logger.error('Ошибка выполнения задачи утреннего приветствия:', error);
            }
        });
    }

    /**
     * Добавление задачи в расписание
     */
    async scheduleJob(name, cronExpression, handler) {
        // Останавливаем предыдущую задачу если она существует
        if (this.jobs.has(name)) {
            this.jobs.get(name).stop();
            logger.info(`Остановлена предыдущая задача: ${name}`);
        }

        // Создаём новую задачу
        const job = cron.schedule(cronExpression, handler, {
            scheduled: true,
            timezone: config.schedule.morningGreeting.timezone
        });

        this.jobs.set(name, job);
        logger.info(`📅 Задача "${name}" добавлена в расписание: ${cronExpression}`);

        // Показываем следующее время выполнения
        const nextRun = this.getNextRunTime(cronExpression);
        if (nextRun) {
            logger.info(`Следующий запуск "${name}": ${nextRun.toLocaleString('ru-RU')}`);
        }
    }

    /**
     * Вычисление следующего времени выполнения
     */
    getNextRunTime(cronExpression) {
        try {
            const interval = cron.parseExpression(cronExpression, {
                tz: config.schedule.morningGreeting.timezone
            });
            return interval.next().toDate();
        } catch (error) {
            logger.error('Ошибка при вычислении следующего времени выполнения:', error);
            return null;
        }
    }

    /**
     * Ручной запуск задачи
     */
    async runJob(name) {
        const job = this.jobs.get(name);
        if (job) {
            logger.info(`🔄 Ручной запуск задачи: ${name}`);
            job.now();
        } else {
            logger.warn(`Задача "${name}" не найдена`);
        }
    }

    /**
     * Остановка задачи
     */
    stopJob(name) {
        const job = this.jobs.get(name);
        if (job) {
            job.stop();
            this.jobs.delete(name);
            logger.info(`⏹️ Задача "${name}" остановлена`);
        }
    }

    /**
     * Остановка всех задач
     */
    stopAll() {
        for (const [name, job] of this.jobs) {
            job.stop();
            logger.info(`⏹️ Задача "${name}" остановлена`);
        }
        this.jobs.clear();
        this.isRunning = false;
        logger.info('Все задачи остановлены');
    }

    /**
     * Получение списка активных задач
     */
    getActiveJobs() {
        const jobs = [];
        for (const [name, job] of this.jobs) {
            jobs.push({
                name,
                running: job.running !== undefined ? job.running : true
            });
        }
        return jobs;
    }

    /**
     * Добавление задачи для ежедневной синхронизации пользователей
     */
    async scheduleDailyUserSync() {
        // Синхронизация каждую ночь в 2:00
        const cronExpression = '0 2 * * *';
        
        await this.scheduleJob('user_sync', cronExpression, async () => {
            logger.info('🔄 Запуск синхронизации пользователей');
            
            try {
                const { syncUsers } = await import('../functions/users.js');
                await syncUsers();
                logger.success('Синхронизация пользователей завершена');
            } catch (error) {
                logger.error('Ошибка синхронизации пользователей:', error);
            }
        });
    }

    /**
     * Добавление задачи для очистки старых логов
     */
    async scheduleLogCleanup() {
        // Очистка каждое воскресенье в 3:00
        const cronExpression = '0 3 * * 0';
        
        await this.scheduleJob('log_cleanup', cronExpression, async () => {
            logger.info('🧹 Запуск очистки старых логов');
            
            try {
                // Удаляем записи старше 30 дней
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                await database.db.run(`
                    DELETE FROM message_history 
                    WHERE sent_at < ?
                `, thirtyDaysAgo.toISOString());
                
                logger.success('Старые логи очищены');
            } catch (error) {
                logger.error('Ошибка очистки логов:', error);
            }
        });
    }
}

// Экспортируем singleton экземпляр
const scheduler = new Scheduler();
export default scheduler;
