# Реализация проверки приоритетной очереди при запуске

## 🎯 Задача
Реализовать проверку приоритетной очереди **первым делом** при запуске `npm run run`.

## ✅ Выполненные изменения

### 1. Добавлен метод `checkPriorityQueue()`
**Файл**: `scripts/virtual-trading-system.js`

```javascript
async checkPriorityQueue() {
  console.log('🔍 Проверка приоритетной очереди...');
  
  // Проверить состояние очереди
  console.log(`📊 Текущее состояние очереди:`);
  console.log(`   • Задач в очереди: ${this.taskQueue.length}`);
  console.log(`   • Обработка активна: ${this.isProcessing}`);
  console.log(`   • Последняя проверка активных сделок: ${this.lastActiveTradesCheck ? new Date(this.lastActiveTradesCheck).toLocaleTimeString() : 'не выполнялась'}`);
  console.log(`   • Последняя проверка watchlist: ${this.lastPendingCheck ? new Date(this.lastPendingCheck).toLocaleTimeString() : 'не выполнялась'}`);
  console.log(`   • Последняя проверка аномалий: ${this.lastAnomalyCheck ? new Date(this.lastAnomalyCheck).toLocaleTimeString() : 'не выполнялась'}`);
  
  // Очистить очередь если она в недопустимом состоянии
  if (this.taskQueue.length > 100) {
    console.log('⚠️ Очередь переполнена, очищаем...');
    this.taskQueue = [];
    this.isProcessing = false;
  }
  
  // Проверить интервалы
  const intervalsStatus = {
    activeTrades: !!this.activeTradesInterval,
    pendingCheck: !!this.pendingCheckInterval,
    anomalyCheck: !!this.anomalyCheckInterval
  };
  
  console.log(`⏰ Статус интервалов:`);
  console.log(`   • Активные сделки: ${intervalsStatus.activeTrades ? '🟢 Активен' : '🔴 Остановлен'}`);
  console.log(`   • Watchlist: ${intervalsStatus.pendingCheck ? '🟢 Активен' : '🔴 Остановлен'}`);
  console.log(`   • Аномалии: ${intervalsStatus.anomalyCheck ? '🟢 Активен' : '🔴 Остановлен'}`);
  
  // Инициализировать базовую задачу если очередь пуста
  if (this.taskQueue.length === 0) {
    console.log('📦 Очередь пуста, добавляем базовую задачу...');
    this.addTaskToQueue(async () => {
      console.log('🔍 [ПОТОК 1] Базовая задача поиска аномалий...');
      await this.runAnomalyCheck();
    }, 3);
  }
  
  console.log('✅ Проверка приоритетной очереди завершена');
}
```

### 2. Модифицирован метод `initialize()`
**Файл**: `scripts/virtual-trading-system.js`

```javascript
async initialize() {
  console.log('🚀 Инициализация системы виртуальной торговли (REST API)...');
  
  // ПЕРВЫМ ДЕЛОМ - проверить приоритетную очередь
  console.log('🔍 ПЕРВЫЙ ПРИОРИТЕТ: Проверка приоритетной очереди...');
  await this.checkPriorityQueue();
  
  // ... остальная инициализация
}
```

### 3. Модифицирован метод `start()`
**Файл**: `scripts/virtual-trading-system.js`

```javascript
async start() {
  try {
    // ПЕРВЫМ ДЕЛОМ - проверить приоритетную очередь
    console.log('🔍 ПЕРВЫЙ ПРИОРИТЕТ: Проверка приоритетной очереди при запуске...');
    await this.checkPriorityQueue();
    
    // ... остальной код запуска
  } catch (error) {
    console.error('❌ Ошибка запуска системы:', error.message);
    await this.stop();
  }
}
```

### 4. Обновлен main-universal.js
**Файл**: `scripts/main-universal.js`

```javascript
console.log('📋 Компоненты:');
console.log('   • Приоритетная очередь (проверяется первой)');
console.log('   • Основная система торговли (monitor:virtual)');
console.log('   • Telegram бот (инициализируется автоматически через синглтон)');
```

### 5. Созданы тестовые скрипты

#### `scripts/test-priority-queue-check.js`
- Тестирует функциональность приоритетной очереди
- Проверяет добавление и выполнение задач
- Валидирует состояние очереди

#### `scripts/test-startup-priority.js`
- Тестирует порядок запуска системы
- Проверяет, что приоритетная очередь проверяется первой
- Ведет лог всех операций инициализации

#### `scripts/demo-priority-queue.js`
- Демонстрирует работу приоритетной очереди
- Показывает преимущества новой функциональности

### 6. Добавлены npm скрипты
**Файл**: `package.json`

```json
{
  "scripts": {
    "test:priority-queue": "node scripts/test-priority-queue-check.js",
    "test:startup-priority": "node scripts/test-startup-priority.js",
    "demo:priority-queue": "node scripts/demo-priority-queue.js"
  }
}
```

### 7. Обновлена документация
**Файл**: `README.md`

- Добавлен раздел "Приоритетная очередь"
- Обновлены CLI команды
- Добавлены новые тестовые команды

## 📊 Приоритеты задач

1. **Приоритет 1**: Активные сделки (каждые 30 сек) - высший приоритет
2. **Приоритет 2**: Watchlist (каждые 30 сек) - средний приоритет  
3. **Приоритет 3**: Аномалии (каждые 5 мин) - низший приоритет

## ✅ Преимущества реализации

- **Гарантированная проверка очереди** при запуске
- **Предотвращение конфликтов** и переполнения
- **Автоматическая инициализация** базовых задач
- **Мониторинг состояния** системы
- **Детальное логирование** всех операций

## 🧪 Тестирование

```bash
# Тест приоритетной очереди
npm run test:priority-queue

# Тест порядка запуска
npm run test:startup-priority

# Демонстрация функциональности
npm run demo:priority-queue

# Полный запуск системы
npm run run
```

## 🎯 Результат

При запуске `npm run run` приоритетная очередь теперь проверяется **первым делом**, что обеспечивает стабильную работу системы и предотвращает проблемы с очередью задач. 