#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import dotenv from 'dotenv';

// Утилиты и функции
import config from './utils/config.js';
import database from './utils/database.js';
import bot from './functions/bot.js';
import { syncUsers, getUserStats, exportUsers } from './functions/users.js';
import { sendMorningGreetings, sendTestGreeting, sendBroadcastMessage } from './functions/greetings.js';

// Загружаем переменные окружения
dotenv.config();

// Создаём CLI программу
const program = new Command();

program
    .name('bot-cli')
    .description('CLI для управления ботом утренних приветствий Битрикс24')
    .version('1.0.0');

// Команда регистрации бота
program
    .command('register')
    .description('Зарегистрировать нового бота в Битрикс24')
    .action(async () => {
        const spinner = ora('Подключение к Битрикс24...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            spinner.stop();
            
            // Запрашиваем параметры бота
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Имя бота:',
                    default: 'Бот утренних приветствий'
                },
                {
                    type: 'input',
                    name: 'code',
                    message: 'Код бота (уникальный):',
                    default: 'morning_greeting_bot'
                },
                {
                    type: 'input',
                    name: 'position',
                    message: 'Должность бота:',
                    default: 'Ассистент'
                },
                {
                    type: 'list',
                    name: 'color',
                    message: 'Цвет бота:',
                    choices: ['GREEN', 'RED', 'BLUE', 'ORANGE', 'PURPLE'],
                    default: 'GREEN'
                }
            ]);
            
            spinner.start('Регистрация бота...');
            
            const result = await bot.registerBot(answers);
            
            spinner.succeed(chalk.green('✅ Бот успешно зарегистрирован!'));
            
            console.log(chalk.cyan('\n📌 Информация о боте:'));
            console.log(`   ID: ${chalk.yellow(result.botId)}`);
            console.log(`   Имя: ${result.botName}`);
            console.log(`   Код: ${result.botCode}`);
            
            if (result.alreadyExists) {
                console.log(chalk.yellow('\n⚠️ Бот с таким кодом уже существует'));
            }
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка регистрации бота'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда удаления бота
program
    .command('unregister')
    .description('Удалить бота из Битрикс24')
    .action(async () => {
        const confirm = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'sure',
                message: 'Вы уверены, что хотите удалить бота?',
                default: false
            }
        ]);
        
        if (!confirm.sure) {
            console.log(chalk.yellow('Отменено'));
            return;
        }
        
        const spinner = ora('Удаление бота...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            const result = await bot.unregisterBot();
            
            if (result) {
                spinner.succeed(chalk.green('✅ Бот успешно удалён'));
            } else {
                spinner.fail(chalk.red('Не удалось удалить бота'));
            }
        } catch (error) {
            spinner.fail(chalk.red('Ошибка удаления бота'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда синхронизации пользователей
program
    .command('sync-users')
    .description('Синхронизировать пользователей с Битрикс24')
    .action(async () => {
        const spinner = ora('Синхронизация пользователей...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            const result = await syncUsers();
            
            spinner.succeed(chalk.green('✅ Синхронизация завершена'));
            
            console.log(chalk.cyan('\n📊 Результаты:'));
            console.log(`   Всего: ${chalk.yellow(result.total)}`);
            console.log(`   Синхронизировано: ${chalk.green(result.synced)}`);
            console.log(`   Ошибок: ${chalk.red(result.errors)}`);
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка синхронизации'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда просмотра списка пользователей
program
    .command('list-users')
    .description('Показать список пользователей')
    .option('-a, --all', 'Показать всех пользователей (включая неактивных)')
    .action(async (options) => {
        const spinner = ora('Загрузка пользователей...').start();
        
        try {
            await database.connect();
            
            const query = options.all 
                ? 'SELECT * FROM users ORDER BY name'
                : 'SELECT * FROM users WHERE is_active = 1 ORDER BY name';
                
            const users = await database.db.all(query);
            
            spinner.stop();
            
            if (users.length === 0) {
                console.log(chalk.yellow('Пользователи не найдены'));
                return;
            }
            
            // Создаём таблицу
            const table = new Table({
                head: ['ID', 'Имя', 'Email', 'Должность', 'Активен', 'Последнее приветствие'],
                colWidths: [10, 25, 30, 20, 10, 20]
            });
            
            users.forEach(user => {
                table.push([
                    user.bitrix_id,
                    user.name || '-',
                    user.email || '-',
                    user.work_position || '-',
                    user.is_active ? chalk.green('✓') : chalk.red('✗'),
                    user.last_greeting_sent 
                        ? new Date(user.last_greeting_sent).toLocaleDateString('ru-RU')
                        : 'Никогда'
                ]);
            });
            
            console.log(table.toString());
            console.log(chalk.cyan(`\nВсего пользователей: ${users.length}`));
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка загрузки пользователей'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда отправки приветствий
program
    .command('send-greetings')
    .description('Отправить утренние приветствия сейчас')
    .action(async () => {
        const confirm = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'sure',
                message: 'Отправить приветствия всем активным пользователям?',
                default: false
            }
        ]);
        
        if (!confirm.sure) {
            console.log(chalk.yellow('Отменено'));
            return;
        }
        
        const spinner = ora('Отправка приветствий...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            const result = await sendMorningGreetings();
            
            spinner.succeed(chalk.green('✅ Приветствия отправлены'));
            
            console.log(chalk.cyan('\n📊 Результаты:'));
            console.log(`   Всего пользователей: ${chalk.yellow(result.total)}`);
            console.log(`   Отправлено: ${chalk.green(result.sent)}`);
            console.log(`   Ошибок: ${chalk.red(result.errors)}`);
            
            const successRate = result.total > 0 
                ? ((result.sent / result.total) * 100).toFixed(2)
                : 0;
            console.log(`   Успешность: ${chalk.cyan(successRate + '%')}`);
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка отправки приветствий'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда тестового приветствия
program
    .command('test-greeting <userId>')
    .description('Отправить тестовое приветствие пользователю')
    .action(async (userId) => {
        const spinner = ora('Отправка тестового приветствия...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            const result = await sendTestGreeting(userId);
            
            spinner.succeed(chalk.green('✅ Тестовое приветствие отправлено'));
            
            console.log(chalk.cyan('\n📌 Детали:'));
            console.log(`   Пользователь: ${result.userName} (ID: ${result.userId})`);
            console.log(`   Сообщение: ${result.message.substring(0, 100)}...`);
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка отправки тестового приветствия'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда массовой рассылки
program
    .command('broadcast')
    .description('Отправить сообщение всем активным пользователям')
    .action(async () => {
        const answers = await inquirer.prompt([
            {
                type: 'editor',
                name: 'message',
                message: 'Введите сообщение для рассылки:'
            },
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Отправить это сообщение всем активным пользователям?',
                default: false
            }
        ]);
        
        if (!answers.confirm) {
            console.log(chalk.yellow('Отменено'));
            return;
        }
        
        const spinner = ora('Отправка рассылки...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            const result = await sendBroadcastMessage(answers.message);
            
            spinner.succeed(chalk.green('✅ Рассылка завершена'));
            
            console.log(chalk.cyan('\n📊 Результаты:'));
            console.log(`   Всего: ${chalk.yellow(result.total)}`);
            console.log(`   Отправлено: ${chalk.green(result.sent)}`);
            console.log(`   Ошибок: ${chalk.red(result.errors)}`);
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка рассылки'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда статистики
program
    .command('stats')
    .description('Показать статистику бота')
    .option('-d, --days <number>', 'Количество дней для статистики', '7')
    .action(async (options) => {
        const spinner = ora('Загрузка статистики...').start();
        
        try {
            await database.connect();
            await bot.initialize();
            
            spinner.stop();
            
            // Статистика пользователей
            const userStats = await getUserStats();
            
            console.log(chalk.cyan('\n👥 Статистика пользователей:'));
            console.log(`   Всего: ${chalk.yellow(userStats.total)}`);
            console.log(`   Активных: ${chalk.green(userStats.active)}`);
            console.log(`   Неактивных: ${chalk.red(userStats.inactive)}`);
            console.log(`   Получили приветствие сегодня: ${chalk.cyan(userStats.greetedToday)}`);
            
            // Статистика сообщений
            const messageStats = await database.getMessageStats(parseInt(options.days));
            
            if (messageStats.length > 0) {
                console.log(chalk.cyan(`\n📈 Статистика сообщений за ${options.days} дней:`));
                
                const table = new Table({
                    head: ['Дата', 'Всего', 'Отправлено', 'Ошибок'],
                    colWidths: [15, 10, 15, 10]
                });
                
                messageStats.forEach(stat => {
                    table.push([
                        new Date(stat.date).toLocaleDateString('ru-RU'),
                        stat.total,
                        chalk.green(stat.sent),
                        stat.errors > 0 ? chalk.red(stat.errors) : '0'
                    ]);
                });
                
                console.log(table.toString());
            }
            
            // Информация о боте
            const botInfo = await bot.getBotInfo();
            if (botInfo) {
                console.log(chalk.cyan('\n🤖 Информация о боте:'));
                console.log(`   ID: ${chalk.yellow(botInfo.ID)}`);
                console.log(`   Имя: ${botInfo.NAME}`);
                console.log(`   Код: ${botInfo.CODE}`);
            }
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка загрузки статистики'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда экспорта пользователей
program
    .command('export-users')
    .description('Экспортировать список пользователей')
    .option('-f, --format <format>', 'Формат экспорта (json/csv)', 'json')
    .option('-o, --output <file>', 'Файл для сохранения')
    .action(async (options) => {
        const spinner = ora('Экспорт пользователей...').start();
        
        try {
            await database.connect();
            
            const data = await exportUsers(options.format);
            
            if (options.output) {
                const fs = await import('fs/promises');
                await fs.writeFile(options.output, 
                    typeof data === 'string' ? data : JSON.stringify(data, null, 2)
                );
                spinner.succeed(chalk.green(`✅ Данные экспортированы в ${options.output}`));
            } else {
                spinner.stop();
                console.log(data);
            }
            
        } catch (error) {
            spinner.fail(chalk.red('Ошибка экспорта'));
            console.error(chalk.red(error.message));
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Команда настройки расписания
program
    .command('schedule')
    .description('Настроить расписание отправки приветствий')
    .action(async () => {
        try {
            await database.connect();
            
            const current = await database.getScheduleSettings();
            
            console.log(chalk.cyan('\n📅 Текущие настройки расписания:'));
            if (current) {
                console.log(`   Время: ${current.hour}:${String(current.minute).padStart(2, '0')}`);
                console.log(`   Дни недели: ${current.days_of_week}`);
                console.log(`   Часовой пояс: ${current.timezone}`);
                console.log(`   Активно: ${current.is_active ? chalk.green('Да') : chalk.red('Нет')}`);
                
                if (current.last_run) {
                    console.log(`   Последний запуск: ${new Date(current.last_run).toLocaleString('ru-RU')}`);
                }
            }
            
            const change = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'change',
                    message: 'Изменить настройки?',
                    default: false
                }
            ]);
            
            if (change.change) {
                const answers = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'hour',
                        message: 'Час отправки (0-23):',
                        default: current?.hour || 9,
                        validate: (value) => {
                            const num = parseInt(value);
                            return (num >= 0 && num <= 23) || 'Введите число от 0 до 23';
                        }
                    },
                    {
                        type: 'input',
                        name: 'minute',
                        message: 'Минуты (0-59):',
                        default: current?.minute || 0,
                        validate: (value) => {
                            const num = parseInt(value);
                            return (num >= 0 && num <= 59) || 'Введите число от 0 до 59';
                        }
                    },
                    {
                        type: 'checkbox',
                        name: 'days',
                        message: 'Дни недели:',
                        choices: [
                            { name: 'Понедельник', value: 1, checked: true },
                            { name: 'Вторник', value: 2, checked: true },
                            { name: 'Среда', value: 3, checked: true },
                            { name: 'Четверг', value: 4, checked: true },
                            { name: 'Пятница', value: 5, checked: true },
                            { name: 'Суббота', value: 6, checked: false },
                            { name: 'Воскресенье', value: 0, checked: false }
                        ]
                    }
                ]);
                
                await database.db.run(`
                    UPDATE schedule_settings
                    SET hour = ?, minute = ?, days_of_week = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE schedule_type = 'morning_greeting'
                `, answers.hour, answers.minute, answers.days.join(','));
                
                console.log(chalk.green('✅ Настройки расписания обновлены'));
                console.log(chalk.yellow('⚠️ Перезапустите сервер для применения изменений'));
            }
            
        } catch (error) {
            console.error(chalk.red('Ошибка настройки расписания:'), error.message);
            process.exit(1);
        } finally {
            await database.close();
        }
    });

// Парсим аргументы
program.parse(process.argv);
