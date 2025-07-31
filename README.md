# Crypto Screener - Чистая Архитектура с DDD

🚀 **Crypto Screener** - это приложение для мониторинга криптовалютного рынка с отправкой уведомлений в Telegram, построенное на принципах **Чистой Архитектуры** и **Domain-Driven Design (DDD)**.

## 🏗️ Архитектура

Проект следует принципам чистой архитектуры с четким разделением слоев:

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
# Запуск в режиме разработки (сообщения только в консоль)
npm run dev

# Запуск в продакшн режиме (сообщения в Telegram)
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

### Виртуальная торговая система

```bash
# Запуск виртуальной торговой системы (с проверкой приоритетной очереди первой)
npm run run

# Тестирование многоуровневой системы
npm run test-multi-level

# Тестирование динамического тейк-профита
npm run test:dynamic-take-profit
npm run test:dynamic-take-profit-integration

# Тестирование приоритетной очереди
npm run test:priority-queue
npm run test:startup-priority
npm run demo:priority-queue

# Просмотр статистики торговли
npm run trading-stats
```

### Прямое использование CLI

```bash
# Инициализировать приложение и запустить CLI
node src/cli.js summary 15

# Или через npm
npm run cli summary 15
```

## 🏛️ Архитектурные принципы

### 1. Доменный слой (Domain Layer)
- **Сущности**: `Coin`, `MarketData`, `Signal`, `TradeLevel`
- **Value Objects**: `Price`, `Percentage`, `TimeFrame`
- **Доменные сервисы**: `MarketAnalysisService`, `MultiLevelTradingService`
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

### Приоритетная очередь
Система использует приоритетную очередь для управления задачами мониторинга:

- **Приоритет 1**: Активные сделки (каждые 30 сек) - высший приоритет
- **Приоритет 2**: Watchlist (каждые 30 сек) - средний приоритет  
- **Приоритет 3**: Аномалии (каждые 5 мин) - низший приоритет

При запуске `npm run run` приоритетная очередь проверяется **первым делом**, что обеспечивает:
- Стабильную работу системы
- Предотвращение конфликтов и переполнения
- Автоматическую инициализацию базовых задач
- Мониторинг состояния системы

#### Правило ограничения частоты перезапуска аномалий
Для предотвращения перегрузки системы при больших списках аномалий реализовано правило ограничения частоты:

- **Минимальный интервал**: 5 минут между проверками аномалий
- **Максимальная продолжительность**: 5 минут на одну проверку
- **Автоматическое регулирование**: если проверка превышает лимит, следующая откладывается
- **Отслеживание времени**: начало и продолжительность каждой проверки

**Тестирование правила:**
```bash
npm run test:anomaly-rate-limit    # Тест правила ограничения
npm run demo:anomaly-rate-limit    # Демонстрация функциональности
```

### Value Objects
```javascript
// Цена с валидацией и операциями
const price = Price.safe(0.001);
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

---

## 🎯 Многоуровневая система фиксации прибыли

Проект включает продвинутую систему виртуальной торговли с многоуровневой фиксацией прибыли:

### Основные возможности
- **4 уровня фиксации** с разными объёмами и целями
- **Автоматическая безубыточность** с учётом комиссий
- **Постепенная фиксация прибыли** на уровнях 3 и 4
- **Детальная статистика** и уведомления по каждому уровню

### Конфигурация
```javascript
{
  multiLevelEnabled: true,           // Включение системы
  initialVolume: 1000,              // Начальный объём ($1000)
  commissionPercent: 0.0003,        // Комиссия (0.03%)
  level2VolumePercent: 0.2,         // 20% для безубытка
  level3VolumePercent: 0.4,         // 40% для фиксации
  level4VolumePercent: 0.4,         // 40% для фиксации
  level2TargetPercent: 0.0006,      // 0.06% для безубытка
  level3TargetPercent: 0.05,        // 5% прибыли
  level4TargetPercent: 0.05         // 5% прибыли
}
```

### Уровни системы
1. **Уровень 1**: Вход (100% объёма) - базовый уровень
2. **Уровень 2**: Безубыток (20% объёма) - гарантированная безубыточность
3. **Уровень 3**: Фиксация прибыли (40% объёма) - динамический тейк-профит
4. **Уровень 4**: Фиксация прибыли (40% объёма) - динамический тейк-профит

### Динамический тейк-профит

Система автоматически рассчитывает тейк-профит на основе leverage объема аномалии:
- **Leverage < 8x**: 2.5% (по умолчанию)
- **Leverage 8-10x**: 3.0%
- **Leverage 10-12x**: 3.5%
- **Leverage 12-16x**: 4.0%
- **Leverage 16-20x**: 4.5%
- **Leverage 20x+**: 5.0%

Это позволяет адаптировать стратегию к силе аномалии объема.

Подробная документация: [README_Multi_Level_Trading.md](README_Multi_Level_Trading.md)

## 📖 Дополнительная документация

- [README_Clean_Architecture.md](README_Clean_Architecture.md) - Подробная документация по архитектуре
- [README_CoinGecko.md](README_CoinGecko.md) - Документация по CoinGecko API
- [README_Telegram_Commands.md](README_Telegram_Commands.md) - Документация по Telegram командам
- [README_Multi_Level_Trading.md](README_Multi_Level_Trading.md) - Документация по многоуровневой системе фиксации прибыли
- [README_Telegram_Singleton.md](README_Telegram_Singleton.md) - Документация по синглтону Telegram бота
- [README_Priority_Queue_Implementation.md](README_Priority_Queue_Implementation.md) - Документация по реализации приоритетной очереди
- [README_Anomaly_Rate_Limit.md](README_Anomaly_Rate_Limit.md) - Документация по правилу ограничения частоты перезапуска аномалий

