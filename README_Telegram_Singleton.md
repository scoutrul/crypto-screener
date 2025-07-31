# Telegram Bot Singleton

## Обзор

Система использует синглтон для Telegram бота, чтобы избежать конфликтов при одновременном запуске нескольких процессов. Все компоненты системы используют один и тот же экземпляр бота через `telegramBotSingleton`.

## Архитектура

### Компоненты

1. **`scripts/telegram-bot-singleton.js`** - Основной синглтон
2. **`scripts/telegram-message-queue.js`** - Глобальная очередь сообщений
3. **`src/infrastructure/repositories/TelegramNotificationRepository.js`** - Репозиторий уведомлений

### Схема использования

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Bot Singleton                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ telegramBotSingleton.initialize()                  │   │
│  │ telegramBotSingleton.getBot()                      │   │
│  │ telegramBotSingleton.isReady()                     │   │
│  │ telegramBotSingleton.stop()                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Message Queue (Singleton)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ messageQueue.setBot(bot)                          │   │
│  │ messageQueue.addMessage(chatId, message)          │   │
│  │ messageQueue.isBotReady()                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TelegramNotificationRepository                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ sendTelegramMessage(message)                      │   │
│  │ sendMarketSummary(coins)                          │   │
│  │ sendAnomalySignal(signal)                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Использование

### Инициализация

```javascript
const telegramBotSingleton = require('./scripts/telegram-bot-singleton');

// Инициализировать бота (только один раз)
const bot = await telegramBotSingleton.initialize();

if (bot) {
  console.log('✅ Бот инициализирован');
} else {
  console.log('❌ Ошибка инициализации');
}
```

### Проверка состояния

```javascript
// Проверить, готов ли бот
if (telegramBotSingleton.isReady()) {
  console.log('✅ Бот готов к работе');
}

// Получить информацию о состоянии
const status = telegramBotSingleton.getStatus();
console.log(status);
```

### Отправка сообщений

```javascript
const messageQueue = require('./scripts/telegram-message-queue');

// Добавить сообщение в очередь
await messageQueue.addMessage(chatId, 'Привет!');

// Проверить готовность очереди
if (messageQueue.isBotReady()) {
  console.log('✅ Очередь готова');
}
```

### Остановка

```javascript
// Остановить бота
await telegramBotSingleton.stop();
```

## Интеграция с компонентами

### VirtualTradingSystem

```javascript
// В scripts/virtual-trading-system.js
async initializeTelegramBot() {
  this.telegramBot = await telegramBotSingleton.initialize();
}
```

### VirtualTradingBaseService

```javascript
// В src/domain/services/VirtualTradingBaseService.js
// Автоматически использует синглтон через TelegramNotificationRepository
```

### MainUniversal

```javascript
// В scripts/main-universal.js
// Больше не запускает отдельный процесс бота
// Бот инициализируется автоматически через синглтон
```

## Преимущества

1. **Единая точка инициализации** - Бот создается только один раз
2. **Отсутствие конфликтов** - Нет множественных экземпляров
3. **Потокобезопасность** - Синхронизированная инициализация
4. **Централизованное управление** - Все через один интерфейс
5. **Надежная очередь сообщений** - Автоматическая обработка ошибок

## Тестирование

```bash
# Тест синглтона
npm run test:telegram-singleton

# Тест интеграции
npm run test:telegram-init
```

## Устранение проблем

### Ошибка 409 Conflict

Если возникает ошибка `ETELEGRAM: 409 Conflict`:

1. Остановить все процессы Node.js:
   ```bash
   taskkill /f /im node.exe
   ```

2. Проверить, что только один процесс использует бота:
   ```bash
   npm run test:telegram-singleton
   ```

3. Запустить систему заново:
   ```bash
   npm run start
   ```

### Бот не инициализируется

1. Проверить переменные окружения:
   ```bash
   echo $TELEGRAM_BOT_TOKEN
   echo $TELEGRAM_CHAT_ID
   ```

2. Проверить статус синглтона:
   ```javascript
   const status = telegramBotSingleton.getStatus();
   console.log(status);
   ```

## Конфигурация

### Переменные окружения

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### Настройки бота

```javascript
// В telegram-bot-singleton.js
const bot = new TelegramBot(token, { 
  polling: true,
  polling_options: {
    timeout: 10,
    limit: 100,
    allowed_updates: ['message']
  }
});
```

## Мониторинг

### Статистика очереди

```javascript
const queueStats = messageQueue.getQueueStats();
console.log(queueStats);
```

### Информация о боте

```javascript
const botStatus = telegramBotSingleton.getStatus();
console.log(botStatus);
```

## Безопасность

- Бот инициализируется только при наличии токена
- Очередь сообщений обрабатывает ошибки автоматически
- Повторные попытки при сбоях
- Логирование всех операций 