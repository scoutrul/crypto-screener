# 📋 Конфигурация системы виртуальной торговли

## 🎯 Обзор

Система виртуальной торговли поддерживает настройку интервалов потоков через конфигурационные объекты. Все интервалы вынесены в `CONFIG` объекты для легкого изменения.

## ⏰ Интервалы потоков

### **Базовые настройки (VirtualTradingBaseService)**

```javascript
this.config = {
  timeframe: '15m',                    // Таймфрейм для свечей
  volumeThreshold: 3,                  // Порог объема (в 3 раза больше среднего)
  priceThreshold: 0.005,               // Порог цены (0.5% для определения направления)
  historicalWindow: 8,                 // Окно исторических данных (8 свечей = 2 часа)
  stopLossPercent: 0.01,              // Стоп-лосс (1%)
  takeProfitPercent: 0.03,            // Тейк-профит (3%)
  breakEvenPercent: 0.20,             // Процент для безубытка (20%)
  anomalyCooldown: 4,                 // Кулдаун аномалий (4 TF = 1 час)
  entryConfirmationTFs: 6,            // TF для подтверждения входа (6 TF)
  consolidationThreshold: 0.02,        // Порог консолидации (2%)
  entryLevelPercent: 0.01,            // Уровень входа (1%)
  cancelLevelPercent: 0.01            // Уровень отмены (1%)
};
```

### **Дополнительные настройки потоков**

```javascript
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // 30 секунд - Trade List (высший приоритет)
  pendingCheckInterval: 30 * 1000,      // 30 секунд - Watchlist (средний приоритет)
  anomalyCheckInterval: 5 * 60 * 1000,  // 5 минут - Anomalies (низший приоритет)
  
  // Дополнительные параметры
  monitoringInterval: 5 * 60 * 1000,    // 5 минут
  priceTrackingInterval: 5 * 60 * 1000, // 5 минут для отслеживания цены
  exchanges: ['Binance']                 // Список бирж
};
```

## 🚀 Варианты систем

### **1. REST API система (virtual-trading-system.js)**

```javascript
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // Trade List - каждые 30 сек
  pendingCheckInterval: 30 * 1000,      // Watchlist - каждые 30 сек
  anomalyCheckInterval: 5 * 60 * 1000,  // Anomalies - каждые 5 мин
  
  // REST API параметры
  monitoringInterval: 5 * 60 * 1000,
  priceTrackingInterval: 5 * 60 * 1000,
  exchanges: ['Binance']
};
```

### **2. WebSocket система (virtual-trading-system-websocket.js)**

```javascript
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // Trade List - каждые 30 сек
  pendingCheckInterval: 30 * 1000,      // Watchlist - каждые 30 сек
  anomalyCheckInterval: 5 * 60 * 1000,  // Anomalies - каждые 5 мин
  
  // WebSocket параметры
  useWebSocket: true,
  websocketIntervals: {
    watchlist: '1m',  // WebSocket интервал для watchlist
    tradeList: '1m'   // WebSocket интервал для trade list
  }
};
```

### **3. Full WebSocket система (virtual-trading-system-full.js)**

```javascript
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // Trade List - каждые 30 сек
  pendingCheckInterval: 30 * 1000,      // Watchlist - каждые 30 сек
  anomalyCheckInterval: 5 * 60 * 1000,  // Anomalies - каждые 5 мин
  
  // Full WebSocket параметры
  monitoringInterval: 5 * 60 * 1000,
  priceTrackingInterval: 5 * 60 * 1000,
  exchanges: ['Binance'],
  useWebSocket: true,
  websocketIntervals: {
    watchlist: '1m',
    tradeList: '1m'
  }
};
```

## 🎯 Приоритеты потоков

### **🥇 Приоритет 1 - Trade List (Активные сделки)**
- **Интервал**: 30 секунд
- **Назначение**: Мониторинг активных сделок для закрытия
- **Критичность**: Высокая (влияет на прибыль/убытки)

### **🥈 Приоритет 2 - Watchlist (Pending Anomalies)**
- **Интервал**: 30 секунд
- **Назначение**: Проверка подтверждения входа
- **Критичность**: Средняя (потенциальные новые сделки)

### **🥉 Приоритет 3 - Anomalies (Общий мониторинг)**
- **Интервал**: 5 минут
- **Назначение**: Поиск новых аномалий
- **Критичность**: Низкая (поиск возможностей)

## 🔧 Изменение интервалов

### **Для изменения интервалов:**

1. **Откройте файл системы** (например, `scripts/virtual-trading-system.js`)
2. **Найдите CONFIG объект** в начале файла
3. **Измените нужные интервалы:**

```javascript
const CONFIG = {
  // Изменить интервалы здесь
  activeTradesInterval: 15 * 1000,      // 15 секунд вместо 30
  pendingCheckInterval: 60 * 1000,      // 1 минута вместо 30 секунд
  anomalyCheckInterval: 10 * 60 * 1000, // 10 минут вместо 5
  // ... остальные настройки
};
```

### **Рекомендуемые интервалы:**

| Поток | Минимальный | Рекомендуемый | Максимальный |
|-------|-------------|---------------|--------------|
| **Trade List** | 15 сек | 30 сек | 60 сек |
| **Watchlist** | 30 сек | 30 сек | 2 мин |
| **Anomalies** | 2 мин | 5 мин | 10 мин |

## 📊 Логирование интервалов

Система автоматически показывает текущие интервалы при запуске:

```
⏰ Приоритетная система мониторинга запущена:
   🥇 Поток 3 (активные сделки): каждые 30 сек - ПРИОРИТЕТ 1
   🥈 Поток 2 (watchlist): каждые 30 сек - ПРИОРИТЕТ 2
   🥉 Поток 1 (аномалии): каждые 5 мин - ПРИОРИТЕТ 3
```

## ⚠️ Важные замечания

1. **Приоритеты**: Trade List всегда имеет высший приоритет
2. **WebSocket**: В WebSocket системах watchlist и trade list работают в реальном времени
3. **Rate Limiting**: Слишком частые запросы могут привести к блокировке API
4. **Производительность**: Меньшие интервалы = больше нагрузки на систему

## 🚀 Команды запуска

```bash
# REST API система
npm run main

# WebSocket система
npm run monitor:websocket

# Full WebSocket система
npm run monitor:full
``` 