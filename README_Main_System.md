# 🚀 Crypto Screener Main System

## 📋 Описание

Главная система для запуска всех компонентов Crypto Screener одновременно:
- Основная система виртуальной торговли
- Telegram бот для мониторинга

## 🛠️ Запуск

### Основная команда
```bash
npm run run
```

Эта команда запускает:
1. **Основную систему торговли** (`monitor:virtual`)
2. **Telegram бота** (`bot:start`)

### Альтернативные команды

```bash
# Только система торговли
npm run monitor:virtual

# Только Telegram бот
npm run bot:start

# Отправка статуса watchlist
npm run watchlist:send
```

## 📊 Что происходит при запуске

### 1. Инициализация системы
```
🚀 Запуск Crypto Screener Main System (Windows)...
📋 Компоненты:
   • Основная система торговли (monitor:virtual)
   • Telegram бот (bot:start)
```

### 2. Запуск компонентов
```
🚀 Запуск Trading System...
🚀 Запуск Telegram Bot...
```

### 3. Готовность системы
```
✅ Все компоненты запущены!
📊 Система работает в фоновом режиме
🤖 Telegram бот готов к использованию
💡 Используйте Ctrl+C для остановки всех процессов
```

## 🤖 Telegram команды

После запуска системы используйте команды в Telegram:

- **`/start`** - Приветствие и список команд
- **`/watchlist`** - Статус watchlist с детальной статистикой
- **`/status`** - Общий статус системы
- **`/help`** - Справка по командам

## 📊 Пример вывода watchlist

```
📋 WATCHLIST СТАТУС:

📊 В watchlist: 3 аномалий

📈 Long: 3 | Short: 0

🟢 MELANIA (Long)
   📊 Объем: 21.4x
   💰 Аномальная цена: $0.221450
   📈 Текущая цена: $0.215900
   ⏱️ Время в watchlist: 47 мин
   📊 Изменение цены: -2.51%
   🎯 До входа: 0.57%
   ❌ До отмены: 1.43%
   📊 Диапазон: 0.26%

📊 ОБЩАЯ СТАТИСТИКА:
   📈 Средний leverage: 13.1x
   ⏱️ Среднее время в watchlist: 34 мин
   🕐 Обновлено: 30.07.2025, 14:22:53
```

## 🛑 Остановка системы

### Graceful остановка
```bash
# В терминале где запущена система
Ctrl+C
```

Система корректно остановит все процессы:
```
🛑 Получен сигнал завершения...
🛑 Остановка всех процессов...
🛑 Остановка Trading System...
✅ Trading System остановлен
🛑 Остановка Telegram Bot...
✅ Telegram Bot остановлен
```

### Принудительная остановка
```bash
# Остановить все Node.js процессы
taskkill /f /im node.exe
```

## 🔧 Настройка

### Переменные окружения
В файле `.env`:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### Параметры системы
В файле `src/domain/services/VirtualTradingBaseService.js`:
```javascript
this.config = {
  entryConfirmationTFs: 12, // Время ожидания входа (3 часа)
  consolidationThreshold: 0.03, // Порог консолидации (3%)
  entryLevelPercent: 0.008, // Уровень входа (0.8%)
  cancelLevelPercent: 0.012, // Уровень отмены (1.2%)
  // ...
};
```

## 📈 Мониторинг

### Логи системы
```bash
# Запуск с логированием
npm run run 2>&1 | tee system.log
```

### Проверка процессов
```bash
# Проверить активные Node.js процессы
tasklist | findstr node.exe
```

### Статус файлов
```bash
# Проверить количество аномалий в watchlist
node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('data/pending-anomalies.json')); console.log('Аномалий в watchlist:', data.length);"
```

## 🚨 Устранение неполадок

### Система не запускается
1. Проверьте наличие всех зависимостей: `npm install`
2. Проверьте файл `.env` с токенами
3. Убедитесь, что порты не заняты

### Telegram бот не отвечает
1. Проверьте токен бота в `.env`
2. Убедитесь, что бот добавлен в чат
3. Проверьте права бота

### Один из процессов завершился
Система автоматически отслеживает процессы и предупреждает о неожиданном завершении.

### Высокое потребление ресурсов
1. Проверьте количество аномалий в watchlist
2. Уменьшите интервалы проверки в конфигурации
3. Очистите старые данные: `npm run clear:data`

## 🔄 Автоматический перезапуск

### Windows Task Scheduler
Создайте задачу для автоматического запуска:

```batch
@echo off
cd /d C:\git\crypto-screener
npm run run
```

### Cron (Linux/Mac)
```bash
# Каждые 6 часов
0 */6 * * * cd /path/to/crypto-screener && npm run run
```

## 📊 Статистика работы

### Файлы данных
- `data/pending-anomalies.json` - Аномалии в watchlist
- `data/active-trades.json` - Активные сделки
- `data/trade-history.json` - История сделок
- `data/trading-statistics.json` - Статистика торговли
- `data/signal-statistics.json` - Статистика сигналов

### Мониторинг производительности
```bash
# Проверить размер файлов данных
dir data\*.json
```

## 🔄 Обновления

### Обновление системы
```bash
git pull
npm install
npm run run
```

### Обновление конфигурации
После изменения параметров перезапустите систему:
```bash
npm run run
```

---

**💡 Совет:** Используйте `npm run run` для запуска всей системы одним командой. Это самый простой способ начать работу с Crypto Screener. 