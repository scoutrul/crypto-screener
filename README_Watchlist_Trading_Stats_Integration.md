# 📊 Интеграция Статистики Watchlist с Trading Statistics

## 📋 Описание

Система автоматической синхронизации статистики watchlist с `trading-statistics.json` обеспечивает единую точку доступа ко всей статистике системы и отправку в Telegram.

## 🏗️ Структура данных

### Обновленная структура `trading-statistics.json`:

```json
{
  "lastUpdated": "2025-07-30T15:04:45.251Z",
  "totalTrades": 3,
  "winningTrades": 1,
  "losingTrades": 2,
  "winRate": 33.3,
  "totalProfit": 1.3885844523801425,
  "averageProfit": 0.46,
  "watchlistStats": {
    "sessionStartTime": "2025-07-30T13:45:00.000Z",
    "lastUpdated": "2025-07-30T15:46:26.052Z",
    "totalAnomaliesProcessed": 5,
    "currentAnomaliesCount": 5,
    "convertedToTrades": 0,
    "removedFromWatchlist": 0,
    "averageVolumeLeverage": 11.2,
    "averageWatchlistTimeMinutes": 72,
    "longAnomaliesCount": 0,
    "shortAnomaliesCount": 5,
    "consolidatedAnomaliesCount": 3,
    "unconsolidatedAnomaliesCount": 2,
    "topVolumeLeverages": [15.8, 13.0, 9.8, 8.9, 8.4],
    "conversionRate": 0.0,
    "sessionDurationMinutes": 121
  },
  "tradeHistory": [...],
  "systemStartTime": "2025-07-30T11:41:28.711Z",
  "totalDaysRunning": 1,
  "averageTradesPerDay": 3
}
```

## 🛠️ Команды

### Синхронизация статистики

```bash
# Синхронизировать статистику watchlist с trading-statistics.json
npm run watchlist:sync

# Показать статистику из trading-statistics.json
npm run watchlist:sync:show

# Прямые команды
node scripts/sync-watchlist-stats.js sync
node scripts/sync-watchlist-stats.js show
node scripts/sync-watchlist-stats.js auto
```

### Отправка статуса в Telegram

```bash
# Отправить статус с включенной статистикой watchlist
npm run status:send

# Предварительный просмотр статуса
npm run status:preview
```

## 🔄 Автоматическая синхронизация

### При добавлении аномалии:
```javascript
await this.addToWatchlist(anomaly);
// Автоматически:
// 1. Обновляет pending-anomalies.json
// 2. Обновляет мета-статистику
// 3. Синхронизирует с trading-statistics.json
```

### При удалении аномалии:
```javascript
await this.removeFromWatchlist(symbol, 'converted');
// Автоматически:
// 1. Удаляет из pending-anomalies.json
// 2. Обновляет мета-статистику
// 3. Синхронизирует с trading-statistics.json
```

## 📊 Статистика в Telegram

### Включенные метрики в статусе:

```
📋 СТАТИСТИКА WATCHLIST:
   📊 Всего обработано: 5
   📋 Текущих в watchlist: 5
   ✅ Конвертировано в сделки: 0
   ❌ Удалено из watchlist: 0
   📊 Средний leverage: 11.2x
   ⏱️ Среднее время в watchlist: 72 мин
   🟢 Long: 0 | 🔴 Short: 5
   ✅ Консолидированные: 3 | ⏳ Не консолидированные: 2
   📈 Конверсия: 0%
```

## 🎯 Преимущества интеграции

### Единая точка доступа
- Вся статистика в одном файле `trading-statistics.json`
- Автоматическая синхронизация при изменениях
- Совместимость с существующими скриптами

### Улучшенная отчетность
- Статистика watchlist включена в Telegram статус
- Детальная информация о конверсии аномалий
- Метрики производительности в реальном времени

### Автоматизация
- Не требует ручного обновления
- Синхронизация происходит при каждом изменении
- Надежная обработка ошибок

## 🔧 Технические детали

### Утилита синхронизации
- **Файл:** `scripts/sync-watchlist-stats.js`
- **Класс:** `WatchlistStatsSync`
- **Автоматическое обновление** при изменениях

### Интеграция с основной системой
- **Автоматическая синхронизация** при добавлении/удалении аномалий
- **Обновление Telegram статуса** с включенной статистикой watchlist
- **Обратная совместимость** с существующим кодом

### Обработка ошибок
- **Graceful fallback** при ошибках синхронизации
- **Логирование** всех операций
- **Автоматическое восстановление** при сбоях

## 📈 Пример полного статуса

```
📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ

🕐 Обновлено: 30.07.2025, 18:51:45

📊 АКТИВНЫЕ СДЕЛКИ (21):
   [детальная информация о сделках]

⏳ PENDING ANOMALIES (5):
   [информация об аномалиях]

📈 ИСТОРИЯ СДЕЛОК (3):
   🎯 Винрейт: 33.3% (1/3)
   💰 Общая прибыль: 1.39%
   📊 Средняя прибыль: 0.46%

📊 ТОРГОВАЯ СТАТИСТИКА:
   🎯 Общий винрейт: 33.3%
   💰 Общая прибыль: 1.39%
   ⏱️ Среднее время: 0 мин

📊 СТАТИСТИКА СИГНАЛОВ:
   📈 Всего лидов: 5
   ✅ Конвертировано в сделки: 0
   ⏱️ Среднее время жизни лида: 72 мин
   📊 Конверсия: 0%

📋 СТАТИСТИКА WATCHLIST:
   📊 Всего обработано: 5
   📋 Текущих в watchlist: 5
   ✅ Конвертировано в сделки: 0
   ❌ Удалено из watchlist: 0
   📊 Средний leverage: 11.2x
   ⏱️ Среднее время в watchlist: 72 мин
   🟢 Long: 0 | 🔴 Short: 5
   ✅ Консолидированные: 3 | ⏳ Не консолидированные: 2
   📈 Конверсия: 0%

🔗 Crypto Screener v2.0
```

## 🔄 Миграция

### Автоматическое обновление
Система автоматически добавляет секцию `watchlistStats` в существующий файл `trading-statistics.json`:

```javascript
// До обновления
{
  "totalTrades": 3,
  "winRate": 33.3,
  // ... остальная статистика
}

// После обновления
{
  "totalTrades": 3,
  "winRate": 33.3,
  "watchlistStats": {
    // ... статистика watchlist
  },
  // ... остальная статистика
}
```

### Обратная совместимость
- Все существующие скрипты продолжают работать
- Старая структура файлов поддерживается
- Плавная миграция без потери данных 