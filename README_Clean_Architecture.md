# Crypto Screener - Чистая Архитектура с DDD

## 🏗️ Архитектура

Проект построен на принципах **Чистой Архитектуры** и **Domain-Driven Design (DDD)**:

```
src/
├── domain/                    # 🎯 Доменный слой
│   ├── entities/             # Сущности (Coin, MarketData, Signal)
│   ├── value-objects/        # Объекты-значения (Price, Percentage, TimeFrame)
│   ├── aggregates/           # Агрегаты (MarketSnapshot, Portfolio)
│   ├── services/             # Доменные сервисы (MarketAnalysisService)
│   └── repositories/         # Интерфейсы репозиториев
├── application/              # 📱 Слой приложения
│   ├── services/             # Сервисы приложения (NotificationService)
│   ├── use-cases/            # Сценарии использования (SendMarketSummaryUseCase)
│   └── dto/                  # Объекты передачи данных
├── infrastructure/           # 🔧 Инфраструктурный слой
│   ├── adapters/             # Адаптеры (CoinGeckoAdapter, TelegramAdapter)
│   ├── repositories/         # Реализации репозиториев
│   └── config/               # Конфигурация (AppConfig)
└── presentation/             # 🖥️ Слой представления
    ├── cli/                  # CLI интерфейс
    └── telegram/             # Telegram бот (будущее)
```

## 🚀 Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка переменных окружения
Создайте файл `.env`:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
NODE_ENV=development
```

### 3. Запуск приложения
```bash
# Запуск в режиме разработки
npm run dev

# Запуск в продакшн режиме
npm start
```

## 📊 Использование

### CLI команды

```bash
# Отправить сводку рынка (по умолчанию 20 монет)
npm run summary

# Отправить сводку с указанным количеством монет
npm run summary:10
npm run summary:20
npm run summary:50

# Отправить сводку только растущих монет
npm run rising

# Отправить сводку только падающих монет
npm run falling

# Отправить тестовое сообщение
npm run test

# Показать справку
npm run help
```

### Прямое использование CLI

```bash
# Инициализировать приложение и запустить CLI
node src/app.js && node src/presentation/cli/MarketSummaryCLI.js summary 15

# Или через npm
npm run cli summary 15
```

## 🏛️ Архитектурные принципы

### 1. Доменный слой (Domain Layer)
- **Сущности**: `Coin`, `MarketData`, `Signal`
- **Value Objects**: `Price`, `Percentage`, `TimeFrame`
- **Доменные сервисы**: `MarketAnalysisService`
- **Интерфейсы репозиториев**: `CoinRepository`, `NotificationRepository`

### 2. Слой приложения (Application Layer)
- **Сервисы приложения**: `NotificationService`
- **Use Cases**: `SendMarketSummaryUseCase`
- **DTO**: Объекты передачи данных

### 3. Инфраструктурный слой (Infrastructure Layer)
- **Адаптеры**: `CoinGeckoAdapter`, `TelegramAdapter`
- **Реализации репозиториев**: `CoinGeckoRepository`, `TelegramNotificationRepository`
- **Конфигурация**: `AppConfig`

### 4. Слой представления (Presentation Layer)
- **CLI**: `MarketSummaryCLI`
- **Telegram Bot**: (планируется)

## 🔧 Основные компоненты

### Value Objects
```javascript
// Цена с валидацией и операциями
const price = Price.fromBTC(0.001);
const percentage = Percentage.fromValue(5.5);

// Временной интервал
const timeframe = TimeFrame.fromString('1h');
```

### Доменная сущность Coin
```javascript
const coin = Coin.fromApiData(apiData);
console.log(coin.getCurrentPrice().format()); // "0.00100000 BTC"
console.log(coin.isPriceRising24h()); // true/false
```

### Use Case
```javascript
const useCase = new SendMarketSummaryUseCase(coinRepository, notificationService);
await useCase.execute({ limit: 20, totalLimit: 1000, currency: 'btc' });
```

## 📋 Конфигурация

### Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | - |
| `TELEGRAM_CHAT_ID` | ID чата Telegram | - |
| `NODE_ENV` | Режим работы | `development` |
| `COINGECKO_TIMEOUT` | Таймаут API запросов | `30000` |
| `COINGECKO_RATE_LIMIT_DELAY` | Задержка между запросами | `2000` |
| `DEFAULT_NOTIFICATION_LIMIT` | Лимит уведомлений по умолчанию | `20` |
| `DEFAULT_CURRENCY` | Валюта по умолчанию | `btc` |

### Конфигурация приложения
```javascript
const config = new AppConfig();
console.log(config.telegram.botToken);
console.log(config.app.environment);
console.log(config.notifications.defaultLimit);
```

## 🔄 Dependency Injection

Приложение использует контейнер зависимостей:

```javascript
// Инициализация всех зависимостей
const container = new DependencyContainer();
await container.initialize();

// Получение сервисов
const useCase = container.getSendMarketSummaryUseCase();
const notificationService = container.getNotificationService();
```

## 🧪 Тестирование

### Режим разработки
В режиме `development` сообщения отправляются только в консоль:
```bash
NODE_ENV=development npm run summary
```

### Режим продакшн
В режиме `production` сообщения отправляются в Telegram:
```bash
NODE_ENV=production npm run summary
```

## 🔄 Миграция с legacy кода

Старые команды доступны с префиксом `legacy:`:

```bash
# Старые команды
npm run legacy:coingecko
npm run legacy:send-top-coins
npm run legacy:send-top-10

# Новые команды
npm run summary
npm run summary:10
npm run rising
```

## 📈 Расширение функциональности

### Добавление нового адаптера
1. Создайте адаптер в `src/infrastructure/adapters/`
2. Реализуйте интерфейс репозитория
3. Добавьте в контейнер зависимостей

### Добавление нового use case
1. Создайте use case в `src/application/use-cases/`
2. Добавьте CLI команду в `MarketSummaryCLI`
3. Обновите `package.json`

### Добавление новой доменной сущности
1. Создайте сущность в `src/domain/entities/`
2. Добавьте value objects при необходимости
3. Обновите доменные сервисы

## 🚨 Обработка ошибок

Приложение включает комплексную обработку ошибок:

- **Валидация конфигурации** при запуске
- **Проверка доступности API** перед выполнением операций
- **Автоматические retry** при rate limiting
- **Логирование ошибок** в консоль и Telegram
- **Graceful degradation** в режиме разработки

## 📚 Документация API

### CoinGecko API
- Автоматическая обработка rate limiting
- Пагинация для больших запросов
- Retry логика при ошибках 429

### Telegram API
- Поддержка HTML разметки
- Обработка ошибок API
- Fallback на консоль в режиме разработки

## 🤝 Вклад в проект

1. Следуйте принципам чистой архитектуры
2. Добавляйте тесты для новых компонентов
3. Обновляйте документацию
4. Используйте conventional commits

## 📄 Лицензия

ISC License 