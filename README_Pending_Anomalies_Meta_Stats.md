# 📊 Мета-Статистика Pending Anomalies

## 📋 Описание

Система автоматического обновления мета-статистики в файле `pending-anomalies.json` обеспечивает отслеживание всех сигналов и их жизненного цикла в реальном времени.

## 🏗️ Структура файла

### Новая структура `pending-anomalies.json`:

```json
{
  "meta": {
    "sessionStats": {
      "sessionStartTime": "2025-07-30T13:45:00.000Z",
      "lastUpdated": "2025-07-30T15:00:47.903Z",
      "totalAnomaliesProcessed": 5,
      "currentAnomaliesCount": 5,
      "convertedToTrades": 0,
      "removedFromWatchlist": 0,
      "averageVolumeLeverage": 11.2,
      "averageWatchlistTimeMinutes": 60,
      "longAnomaliesCount": 0,
      "shortAnomaliesCount": 5,
      "consolidatedAnomaliesCount": 3,
      "unconsolidatedAnomaliesCount": 2,
      "topVolumeLeverages": [15.8, 13.0, 9.8, 8.9, 8.4],
      "conversionRate": 0.0,
      "sessionDurationMinutes": 135
    },
    "fileInfo": {
      "version": "2.0",
      "description": "Pending anomalies with session statistics",
      "createdAt": "2025-07-30T13:45:00.000Z",
      "lastModified": "2025-07-30T15:00:47.903Z"
    }
  },
  "anomalies": [
    // ... аномалии
  ]
}
```

## 🛠️ Команды

### Консольные команды

```bash
# Показать текущую статистику сессии
npm run pending:stats

# Обновить мета-статистику
npm run pending:stats:update

# Прямые команды
node scripts/update-pending-anomalies-stats.js show
node scripts/update-pending-anomalies-stats.js update
node scripts/update-pending-anomalies-stats.js convert SYMBOL
node scripts/update-pending-anomalies-stats.js remove SYMBOL
```

## 📊 Метрики сессии

### Общая статистика
- **sessionStartTime** - время начала сессии
- **lastUpdated** - время последнего обновления
- **totalAnomaliesProcessed** - всего обработано аномалий
- **currentAnomaliesCount** - текущих в watchlist
- **convertedToTrades** - конвертировано в сделки
- **removedFromWatchlist** - удалено из watchlist
- **sessionDurationMinutes** - длительность сессии в минутах

### Распределение
- **longAnomaliesCount** - количество Long аномалий
- **shortAnomaliesCount** - количество Short аномалий
- **consolidatedAnomaliesCount** - консолидированные аномалии
- **unconsolidatedAnomaliesCount** - не консолидированные аномалии

### Метрики производительности
- **averageVolumeLeverage** - средний объемный leverage
- **averageWatchlistTimeMinutes** - среднее время в watchlist
- **conversionRate** - процент конверсии
- **topVolumeLeverages** - топ-5 по leverage

## 🔄 Автоматическое обновление

### При добавлении аномалии:
```javascript
await this.addToWatchlist(anomaly);
// Автоматически обновляет:
// - totalAnomaliesProcessed
// - currentAnomaliesCount
// - Пересчитывает все метрики
```

### При удалении аномалии:
```javascript
await this.removeFromWatchlist(symbol, 'converted');
// Автоматически обновляет:
// - convertedToTrades (если reason === 'converted')
// - removedFromWatchlist
// - Пересчитывает все метрики
```

### Причины удаления:
- **'converted'** - конвертировано в сделку
- **'consolidation'** - не прошла консолидацию
- **'cancel'** - сработал уровень отмены
- **'timeout'** - таймаут входа
- **'removed'** - общее удаление

## 🎯 Применение

### Мониторинг производительности
- Отслеживание конверсии аномалий в сделки
- Анализ времени нахождения в watchlist
- Оценка качества обнаружения аномалий

### Оптимизация параметров
- Настройка пороговых значений на основе статистики
- Анализ распределения leverage
- Корректировка времени ожидания

### Отчетность
- Регулярная проверка статистики
- Сравнение сессий
- Выявление трендов

## 🔧 Технические детали

### Утилита обновления
- **Файл:** `scripts/update-pending-anomalies-stats.js`
- **Класс:** `PendingAnomaliesStatsUpdater`
- **Автоматическая конвертация** старых файлов в новую структуру

### Интеграция с основной системой
- **Автоматическое обновление** при каждом изменении
- **Совместимость** со старой структурой
- **Обратная совместимость** с существующим кодом

### Обработка ошибок
- **Graceful fallback** при ошибках загрузки
- **Автоматическое создание** новой структуры
- **Логирование** всех операций

## 📈 Пример вывода

```
📊 СТАТИСТИКА СЕССИИ WATCHLIST:

🕐 Начало сессии: 30.07.2025, 16:45:00
🔄 Последнее обновление: 30.07.2025, 18:00:47
⏱️ Длительность сессии: 135 мин

📈 ОБЩАЯ СТАТИСТИКА:
   📊 Всего обработано: 5
   📋 Текущих в watchlist: 5
   ✅ Конвертировано в сделки: 0
   ❌ Удалено из watchlist: 0

📊 РАСПРЕДЕЛЕНИЕ:
   🟢 Long: 0
   🔴 Short: 5
   ✅ Консолидированные: 3
   ⏳ Не консолидированные: 2

📈 МЕТРИКИ:
   📊 Средний leverage: 11.2x
   ⏱️ Среднее время в watchlist: 60 мин
   📈 Конверсия: 0%

🏆 ТОП LEVERAGE:
   1. 15.8x
   2. 13.0x
   3. 9.8x
   4. 8.9x
   5. 8.4x
```

## 🔄 Миграция

### Автоматическая конвертация
Система автоматически конвертирует старые файлы в новую структуру:

```javascript
// Старая структура (массив)
[
  { "symbol": "BTC/USDT", ... },
  { "symbol": "ETH/USDT", ... }
]

// Новая структура (объект с мета-данными)
{
  "meta": { "sessionStats": {...}, "fileInfo": {...} },
  "anomalies": [
    { "symbol": "BTC/USDT", ... },
    { "symbol": "ETH/USDT", ... }
  ]
}
```

### Обратная совместимость
- Все существующие скрипты продолжают работать
- Автоматическое определение структуры файла
- Плавная миграция без потери данных 