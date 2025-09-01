# 🤖 Битрикс24 Бот Утренних Приветствий

Автоматический бот для отправки утренних приветствий сотрудникам в Битрикс24. Бот работает по расписанию, отправляя персонализированные сообщения с мотивационными советами каждое утро в рабочие дни.

## ✨ Возможности

- 🌅 **Автоматическая отправка утренних приветствий** по расписанию
- 👥 **Синхронизация пользователей** с Битрикс24
- 📅 **Гибкое расписание** - настройка времени и дней отправки
- 💾 **База данных SQLite** для хранения конфигурации и истории
- 📊 **Статистика и отчёты** о доставке сообщений
- 🎯 **Персонализация** - различные приветствия и советы
- 🎉 **Праздничные поздравления** в особые дни
- 🔧 **CLI интерфейс** для управления ботом
- 🌐 **REST API** для интеграции
- 📝 **Детальное логирование** всех операций
- 🐳 **Docker поддержка** для простого развёртывания

## 📋 Требования

- Node.js 18+ 
- NPM или Yarn
- Битрикс24 с правами на создание ботов
- Webhook токен для Битрикс24

## 🚀 Быстрый старт

### 1. Клонирование и установка

```bash
# Клонирование репозитория
git clone https://github.com/duenstat/mobilon-test-bot.git
cd mobilon-test-bot

# Установка зависимостей
npm install
```

### 2. Настройка окружения

Создайте файл `.env` на основе `.env.example`:

```env
# Битрикс24 настройки
BITRIX_URL=your-domain.bitrix24.ru
BITRIX_USER_ID=1
BITRIX_WEBHOOK_SECRET=your_webhook_secret_here
BOT_ID=

# Настройки расписания
GREETING_HOUR=9
GREETING_MINUTE=0
GREETING_DAYS=1,2,3,4,5
TIMEZONE=Europe/Moscow

# Настройки сервера
PORT=3000
HOST=localhost
NODE_ENV=production
LOG_LEVEL=info

# Настройки бота
MAX_USERS_PER_BATCH=10
MESSAGE_DELAY=1000
```

### 3. Регистрация бота

```bash
# Регистрация нового бота в Битрикс24
npm run register

# Или через CLI
npm run cli register
```

### 4. Синхронизация пользователей

```bash
npm run sync-users
```

### 5. Запуск сервера

```bash
# Продакшн режим
npm start

# Режим разработки с автоперезагрузкой
npm run dev
```

## 🎮 Управление через CLI

Бот поставляется с мощным CLI интерфейсом для управления:

```bash
# Показать справку по командам
npm run cli --help

# Регистрация бота
npm run cli register

# Синхронизация пользователей
npm run cli sync-users

# Отправка приветствий вручную
npm run cli send-greetings

# Тестовое приветствие конкретному пользователю
npm run cli test-greeting <userId>

# Просмотр списка пользователей
npm run cli list-users

# Статистика бота
npm run cli stats

# Настройка расписания
npm run cli schedule

# Массовая рассылка
npm run cli broadcast

# Экспорт пользователей
npm run cli export-users -f csv -o users.csv
```

## 📡 REST API

Сервер предоставляет REST API для управления ботом:

### Основные эндпоинты

```http
GET  /                          # Статус сервера
POST /webhook                   # Webhook для Битрикс24
GET  /api/status               # Детальный статус бота
POST /api/bot/register         # Регистрация бота
DELETE /api/bot/unregister     # Удаление бота
POST /api/users/sync           # Синхронизация пользователей
GET  /api/users                # Список пользователей
PATCH /api/users/:id           # Обновление пользователя
POST /api/greetings/send       # Отправка приветствий
POST /api/greetings/test       # Тестовое приветствие
GET  /api/stats/messages       # Статистика сообщений
GET  /api/schedule             # Настройки расписания
PUT  /api/schedule             # Обновление расписания
POST /api/schedule/run/:job    # Ручной запуск задачи
```

### Примеры запросов

```bash
# Получить статус бота
curl http://localhost:3000/api/status

# Синхронизировать пользователей
curl -X POST http://localhost:3000/api/users/sync

# Отправить тестовое приветствие
curl -X POST http://localhost:3000/api/greetings/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "1", "message": "Тестовое сообщение"}'

# Обновить расписание
curl -X PUT http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{"hour": 9, "minute": 30, "days_of_week": "1,2,3,4,5"}'
```

## 🐳 Docker развёртывание

### Использование Docker

```bash
# Сборка образа
docker build -t morning-bot .

# Запуск контейнера
docker run -d \
  --name morning-bot \
  -p 3000:3000 \
  -v $(pwd)/db:/app/db \
  -v $(pwd)/logs:/app/logs \
  --env-file .env \
  morning-bot
```

### Использование Docker Compose

```bash
# Запуск с docker-compose
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

## 🚢 Продакшн развёртывание с PM2

```bash
# Установка PM2 глобально
npm install -g pm2

# Запуск с PM2
pm2 start ecosystem.config.js --env production

# Мониторинг
pm2 monit

# Логи
pm2 logs morning-greeting-bot

# Перезапуск
pm2 restart morning-greeting-bot

# Остановка
pm2 stop morning-greeting-bot

# Сохранение конфигурации PM2
pm2 save
pm2 startup
```

## 📂 Структура проекта

```
mobilon-test-bot/
├── src/
│   ├── index.js              # Основной сервер Express
│   ├── cli.js                 # CLI интерфейс
│   ├── functions/
│   │   ├── bot.js            # Функции работы с ботом
│   │   ├── users.js          # Функции работы с пользователями
│   │   └── greetings.js      # Функции отправки приветствий
│   └── utils/
│       ├── config.js         # Конфигурация приложения
│       ├── database.js       # Работа с БД SQLite
│       ├── logger.js         # Система логирования
│       └── scheduler.js      # Планировщик задач
├── db/                        # База данных SQLite
├── logs/                      # Логи приложения
├── test/                      # Тестовые скрипты
├── .env                       # Переменные окружения
├── package.json              # Зависимости и скрипты
├── Dockerfile                # Docker образ
├── docker-compose.yml        # Docker Compose конфигурация
├── ecosystem.config.js       # PM2 конфигурация
└── README.md                 # Документация
```

## 🗄️ База данных

Бот использует SQLite для хранения данных со следующими таблицами:

- `bot_config` - Конфигурация бота
- `users` - Информация о пользователях
- `message_history` - История отправленных сообщений
- `schedule_settings` - Настройки расписания

## 📝 Настройка сообщений

Сообщения и советы можно настроить в файле `src/utils/config.js`:

```javascript
messages: {
  greetings: [
    '🌞 Доброе утро, {name}! Желаю вам продуктивного дня!',
    // Добавьте свои приветствия
  ],
  tips: [
    '[b]💡 Совет дня:[/b]\nВаш мотивационный совет',
    // Добавьте свои советы
  ],
  holidays: {
    '01-01': '🎄 С Новым годом, {name}!',
    // Добавьте праздничные поздравления
  }
}
```

## 🔧 Команды бота в чате

Пользователи могут взаимодействовать с ботом через команды:

- `/help` - Справка по командам
- `/start` - Подписаться на рассылку
- `/stop` - Отписаться от рассылки
- `/status` - Проверить статус подписки

## 📊 Мониторинг и логи

### Просмотр логов

```bash
# Логи приложения
tail -f logs/app.log

# Логи ошибок
tail -f logs/error.log

# Логи сообщений бота
tail -f logs/bot-messages.log
```

### Статистика через CLI

```bash
# Статистика за последние 7 дней
npm run cli stats

# Статистика за 30 дней
npm run cli stats -d 30
```

## 🛠️ Разработка

### Запуск в режиме разработки

```bash
NODE_ENV=development npm run dev
```

### Тестирование

```bash
# Запуск тестового скрипта
npm test

# Тестовое приветствие
npm run cli test-greeting 1
```

## 📋 Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `BITRIX_URL` | URL вашего Битрикс24 | - |
| `BITRIX_USER_ID` | ID пользователя для webhook | 1 |
| `BITRIX_WEBHOOK_SECRET` | Секретный ключ webhook | - |
| `BOT_ID` | ID зарегистрированного бота | - |
| `GREETING_HOUR` | Час отправки приветствий | 9 |
| `GREETING_MINUTE` | Минуты отправки | 0 |
| `GREETING_DAYS` | Дни недели (0-6) | 1,2,3,4,5 |
| `TIMEZONE` | Часовой пояс | Europe/Moscow |
| `PORT` | Порт сервера | 3000 |
| `HOST` | Хост сервера | localhost |
| `NODE_ENV` | Окружение | production |
| `LOG_LEVEL` | Уровень логирования | info |
| `MAX_USERS_PER_BATCH` | Пользователей в батче | 10 |
| `MESSAGE_DELAY` | Задержка между сообщениями (мс) | 1000 |

## 🤝 Поддержка

При возникновении проблем:

1. Проверьте логи в папке `logs/`
2. Убедитесь, что все переменные окружения настроены правильно
3. Проверьте права доступа webhook в Битрикс24
4. Используйте команду `npm run cli stats` для диагностики

## 📄 Лицензия

MIT

## 👥 Авторы

Разработано для Mobilon
