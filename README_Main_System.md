# 🚀 Crypto Screener Main System (Universal)

## 📋 Описание

Универсальная главная система для запуска всех компонентов Crypto Screener одновременно:
- **Кроссплатформенность:** Работает на Windows, Linux и macOS
- **Автоматическое определение ОС:** Сама выбирает правильную команду npm
- **Основная система виртуальной торговли**
- **Telegram бот для мониторинга**

## 🛠️ Запуск

### Основная команда
```bash
npm run run
```

Эта команда запускает:
1. **Основную систему торговли** (`monitor:virtual`)
2. **Telegram бота** (`bot:start`)

### Системная информация
При запуске система автоматически определяет:
- **ОС:** Windows, Linux, macOS
- **Команда npm:** `npm.cmd` (Windows) или `npm` (Unix)
- **Архитектура:** x64, arm64, etc.

**Пример вывода:**
```
🖥️ ОС: win32 (Windows)
📦 Команда npm: npm.cmd
🚀 Запуск Crypto Screener Main System (Universal)...
```

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
```