import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import database from '../utils/database.js';

/**
 * Класс для работы с ботом Битрикс24
 */
class BitrixBot {
    constructor() {
        this.botId = null;
        this.$b24 = null;
        this.isInitialized = false;
    }

    /**
     * Инициализация подключения к Битрикс24
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        try {
            // Создаём подключение к Битрикс24
            this.$b24 = new B24Hook({
                b24Url: `https://${config.bitrix.url}`,
                userId: config.bitrix.userId,
                secret: config.bitrix.secret
            });

            // Настройка логгера библиотеки
            this.$logger = LoggerBrowser.build('BitrixBot', config.isDevelopment);

            // Проверяем подключение
            const serverTime = await this.$b24.callMethod('server.time');
            logger.success('Подключение к Битрикс24 установлено', {
                serverTime: serverTime.getData()
            });

            // Загружаем ID бота
            await this.loadBotId();

            this.isInitialized = true;
            return true;
        } catch (error) {
            logger.error('Ошибка инициализации подключения к Битрикс24:', error);
            throw error;
        }
    }

    /**
     * Загрузка ID бота из БД или конфига
     */
    async loadBotId() {
        // Сначала пробуем загрузить из БД
        const botConfig = await database.getActiveBotConfig();
        
        if (botConfig && botConfig.bot_id) {
            this.botId = botConfig.bot_id;
            logger.info('ID бота загружен из базы данных', { botId: this.botId });
            return this.botId;
        }

        // Если в БД нет, берём из конфига
        if (config.bitrix.botId) {
            this.botId = config.bitrix.botId;
            logger.info('ID бота загружен из конфигурации', { botId: this.botId });
            return this.botId;
        }

        logger.warn('ID бота не найден. Необходима регистрация бота.');
        return null;
    }

    /**
     * Регистрация нового бота
     */
    async registerBot(botParams = {}) {
        try {
            await this.initialize();

            const params = {
                CODE: botParams.code || 'morning_greeting_bot',
                TYPE: botParams.type || 'B',
                EVENT_HANDLER: botParams.eventHandler || `https://${config.server.host}:${config.server.port}/webhook`,
                PROPERTIES: {
                    NAME: botParams.name || 'Бот утренних приветствий',
                    COLOR: botParams.color || 'GREEN',
                    EMAIL: botParams.email || 'bot@company.ru',
                    PERSONAL_BIRTHDAY: new Date().toISOString().split('T')[0],
                    WORK_POSITION: botParams.position || 'Ассистент',
                    PERSONAL_WWW: botParams.www || '',
                    PERSONAL_GENDER: botParams.gender || 'M',
                    PERSONAL_PHOTO: botParams.photo || ''
                }
            };

            const result = await this.$b24.callMethod('imbot.register', params);
            const botId = result.getData();

            if (botId) {
                this.botId = botId;

                // Сохраняем в БД
                await database.saveBotConfig({
                    botId: botId.toString(),
                    botName: params.PROPERTIES.NAME,
                    botCode: params.CODE,
                    webhookUrl: params.EVENT_HANDLER
                });

                logger.success('✅ Бот успешно зарегистрирован!', {
                    botId,
                    name: params.PROPERTIES.NAME,
                    code: params.CODE
                });

                return {
                    success: true,
                    botId,
                    botName: params.PROPERTIES.NAME,
                    botCode: params.CODE
                };
            }
        } catch (error) {
            logger.error('Ошибка регистрации бота:', error);
            
            // Если бот уже зарегистрирован, пробуем получить его ID
            if (error.message && error.message.includes('already')) {
                const existingBot = await this.findExistingBot(botParams.code);
                if (existingBot) {
                    return {
                        success: true,
                        botId: existingBot.ID,
                        botName: existingBot.NAME,
                        botCode: existingBot.CODE,
                        alreadyExists: true
                    };
                }
            }
            
            throw error;
        }
    }

    /**
     * Поиск существующего бота
     */
    async findExistingBot(botCode) {
        try {
            const result = await this.$b24.callMethod('imbot.bot.list');
            const bots = result.getData() || [];
            
            return bots.find(bot => bot.CODE === botCode);
        } catch (error) {
            logger.error('Ошибка поиска бота:', error);
            return null;
        }
    }

    /**
     * Удаление бота
     */
    async unregisterBot() {
        if (!this.botId) {
            logger.warn('ID бота не установлен');
            return false;
        }

        try {
            await this.initialize();
            
            const result = await this.$b24.callMethod('imbot.unregister', {
                BOT_ID: this.botId
            });

            if (result.getData()) {
                logger.success('Бот успешно удален', { botId: this.botId });
                
                // Деактивируем в БД
                await database.db.run(`
                    UPDATE bot_config 
                    SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
                    WHERE bot_id = ?
                `, this.botId);
                
                this.botId = null;
                return true;
            }
        } catch (error) {
            logger.error('Ошибка удаления бота:', error);
            throw error;
        }

        return false;
    }

    /**
     * Отправка сообщения от имени бота
     */
    async sendMessage(userId, message, options = {}) {
        if (!this.botId) {
            throw new Error('Бот не инициализирован. ID бота отсутствует.');
        }

        try {
            const params = {
                BOT_ID: this.botId,
                DIALOG_ID: userId,
                MESSAGE: message
            };

            // Добавляем клавиатуру если есть
            if (options.keyboard) {
                params.KEYBOARD = options.keyboard;
            }

            // Добавляем меню если есть
            if (options.menu) {
                params.MENU = options.menu;
            }

            // Добавляем вложения если есть
            if (options.attach) {
                params.ATTACH = options.attach;
            }

            const result = await this.$b24.callMethod('imbot.message.add', params);
            const messageId = result.getData();

            if (messageId) {
                logger.bot(`Сообщение отправлено пользователю ${userId}`, {
                    messageId,
                    userId,
                    preview: message.substring(0, 100)
                });

                // Сохраняем в историю
                await database.saveMessageHistory(
                    userId.toString(),
                    message,
                    'sent'
                );

                return messageId;
            }
        } catch (error) {
            logger.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
            
            // Сохраняем ошибку в историю
            await database.saveMessageHistory(
                userId.toString(),
                message,
                'error',
                error.message
            );
            
            throw error;
        }
    }

    /**
     * Отправка сообщения с кнопками
     */
    async sendMessageWithButtons(userId, message, buttons = []) {
        const keyboard = buttons.map(row => {
            if (Array.isArray(row)) {
                return row.map(btn => this.createButton(btn));
            }
            return [this.createButton(row)];
        });

        return await this.sendMessage(userId, message, { keyboard });
    }

    /**
     * Создание кнопки для клавиатуры
     */
    createButton(buttonData) {
        return {
            TEXT: buttonData.text || 'Кнопка',
            COMMAND: buttonData.command || 'button',
            COMMAND_PARAMS: buttonData.params || '',
            BG_COLOR: buttonData.bgColor || '#29619b',
            TEXT_COLOR: buttonData.textColor || '#ffffff',
            DISPLAY: buttonData.display || 'LINE',
            BLOCK: buttonData.block || 'Y'
        };
    }

    /**
     * Обновление сообщения
     */
    async updateMessage(messageId, message, options = {}) {
        try {
            const params = {
                BOT_ID: this.botId,
                MESSAGE_ID: messageId,
                MESSAGE: message
            };

            if (options.keyboard) {
                params.KEYBOARD = options.keyboard;
            }

            if (options.menu) {
                params.MENU = options.menu;
            }

            if (options.attach) {
                params.ATTACH = options.attach;
            }

            const result = await this.$b24.callMethod('imbot.message.update', params);
            
            if (result.getData()) {
                logger.bot(`Сообщение ${messageId} обновлено`);
                return true;
            }
        } catch (error) {
            logger.error(`Ошибка обновления сообщения ${messageId}:`, error);
            throw error;
        }

        return false;
    }

    /**
     * Удаление сообщения
     */
    async deleteMessage(messageId) {
        try {
            const result = await this.$b24.callMethod('imbot.message.delete', {
                BOT_ID: this.botId,
                MESSAGE_ID: messageId
            });

            if (result.getData()) {
                logger.bot(`Сообщение ${messageId} удалено`);
                return true;
            }
        } catch (error) {
            logger.error(`Ошибка удаления сообщения ${messageId}:`, error);
            throw error;
        }

        return false;
    }

    /**
     * Отправка индикатора "печатает"
     */
    async sendTyping(dialogId) {
        try {
            await this.$b24.callMethod('im.dialog.writing', {
                DIALOG_ID: dialogId
            });
        } catch (error) {
            // Не критичная ошибка, просто логируем
            logger.debug('Не удалось отправить индикатор печати:', error);
        }
    }

    /**
     * Получение информации о боте
     */
    async getBotInfo() {
        if (!this.botId) {
            return null;
        }

        try {
            const result = await this.$b24.callMethod('imbot.bot.list');
            const bots = result.getData() || [];
            
            return bots.find(bot => bot.ID === this.botId.toString());
        } catch (error) {
            logger.error('Ошибка получения информации о боте:', error);
            return null;
        }
    }

    /**
     * Обработка команды от пользователя
     */
    async handleCommand(command, params, userId) {
        logger.info(`Получена команда: ${command}`, { params, userId });

        switch (command) {
            case 'thanks':
                await this.sendMessage(userId, 'Всегда пожалуйста! 😊 Хорошего дня!');
                break;
                
            case 'tasks':
                await this.sendMessage(userId, 'Загружаю ваши задачи на сегодня...');
                // Здесь можно добавить интеграцию с задачами Битрикс24
                await this.sendMessage(userId, '📋 Ваши задачи на сегодня:\n1. Проверить почту\n2. Подготовить отчёт\n3. Созвон с командой');
                break;
                
            case 'help':
                await this.sendMessage(userId, 
                    'Я бот для утренних приветствий! 🤖\n\n' +
                    'Каждое утро в рабочие дни я буду отправлять вам приветствие и полезный совет.\n\n' +
                    'Доступные команды:\n' +
                    '/help - эта справка\n' +
                    '/stop - отписаться от рассылки\n' +
                    '/start - подписаться на рассылку\n' +
                    '/status - проверить статус подписки'
                );
                break;
                
            case 'stop':
                await database.db.run(`
                    UPDATE users SET is_active = 0 
                    WHERE bitrix_id = ?
                `, userId);
                await this.sendMessage(userId, '✅ Вы отписались от утренних приветствий. Чтобы подписаться снова, используйте команду /start');
                break;
                
            case 'start':
                await database.db.run(`
                    UPDATE users SET is_active = 1 
                    WHERE bitrix_id = ?
                `, userId);
                await this.sendMessage(userId, '✅ Вы подписались на утренние приветствия! Увидимся завтра утром! 🌅');
                break;
                
            case 'status':
                const user = await database.db.get(`
                    SELECT is_active FROM users 
                    WHERE bitrix_id = ?
                `, userId);
                
                if (user && user.is_active) {
                    await this.sendMessage(userId, '✅ Вы подписаны на утренние приветствия');
                } else {
                    await this.sendMessage(userId, '❌ Вы не подписаны на утренние приветствия. Используйте /start для подписки');
                }
                break;
                
            default:
                await this.sendMessage(userId, 'Неизвестная команда. Используйте /help для справки');
        }
    }
}

// Экспортируем singleton экземпляр
const bot = new BitrixBot();
export default bot;
