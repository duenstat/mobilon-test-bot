# Используем официальный образ Node.js
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src/ ./src/

# Создаём необходимые директории
RUN mkdir -p db logs

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "src/index.js"]
