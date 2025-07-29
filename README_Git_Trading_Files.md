# 📊 Git Trading Files Manager

Система автоматического управления торговыми файлами в Git для Crypto Screener.

## 🎯 Назначение

Автоматическое добавление важных торговых файлов в Git stage для отслеживания изменений в реальном времени.

## 📁 Отслеживаемые файлы

Следующие файлы автоматически добавляются в Git stage при изменении:

- `data/active-trades.json` - Активные сделки
- `data/pending-anomalies.json` - Ожидающие аномалии  
- `data/trade-history.json` - История сделок
- `data/trading-statistics.json` - Торговая статистика

## 🚀 Команды

### Основные команды

```bash
# Добавить все торговые файлы в Git stage
npm run git:stage-trading

# Проверить изменения в торговых файлах
npm run git:check-trading

# Автоматически добавить измененные файлы
npm run git:auto-trading
```

### Прямые команды

```bash
# Добавить в stage
node scripts/git-stage-trading-files.js stage

# Проверить изменения
node scripts/git-stage-trading-files.js check

# Автоматический режим
node scripts/git-stage-trading-files.js auto
```

## ⚙️ Конфигурация

### .gitignore

Добавлены исключения для важных торговых файлов:

```gitignore
# Data files - но исключаем важные файлы торговой системы
data/*.json
!data/active-trades.json
!data/pending-anomalies.json
!data/trade-history.json
!data/trading-statistics.json
```

### Автоматическая интеграция

Система автоматически добавляет файлы в Git stage при:

- Сохранении активных сделок (`saveActiveTrades()`)
- Сохранении аномалий (`savePendingAnomalies()`)
- Сохранении истории сделок (`saveTradeHistory()`)
- Сохранении статистики (`saveTradingStatistics()`)

## 🔄 Как это работает

### 1. Отслеживание изменений

Система проверяет статус Git и находит изменения в торговых файлах:

```javascript
const status = execSync('git status --porcelain', { encoding: 'utf8' });
const tradingFileChanges = lines.filter(line => {
  const fileName = line.substring(3);
  return TRADING_FILES.some(tradingFile => fileName.includes(tradingFile));
});
```

### 2. Автоматическое добавление

При обнаружении изменений файлы автоматически добавляются в Git stage:

```javascript
execSync(`git add "${file}"`, { stdio: 'pipe' });
```

### 3. Интеграция с торговой системой

В каждом методе сохранения добавлен вызов:

```javascript
// Автоматически добавить в Git stage
try {
  const { stageTradingFiles } = require('./git-stage-trading-files.js');
  stageTradingFiles();
} catch (error) {
  console.log('ℹ️ Git stage не выполнен:', error.message);
}
```

## 📊 Преимущества

### ✅ Автоматическое отслеживание
- Файлы автоматически добавляются в Git при изменении
- Не нужно вручную добавлять файлы в stage

### ✅ История изменений
- Полная история всех торговых операций
- Возможность отката к предыдущим состояниям
- Аудит торговых решений

### ✅ Резервное копирование
- Автоматическое резервное копирование через Git
- Защита от потери данных
- Синхронизация между устройствами

### ✅ Анализ производительности
- Отслеживание изменений в статистике
- Анализ эффективности торговых стратегий
- Сравнение результатов во времени

## 🔧 Устранение неполадок

### Проблема: Git stage не выполняется

**Решение:**
```bash
# Проверить статус Git
npm run git:check-trading

# Принудительно добавить файлы
npm run git:stage-trading
```

### Проблема: Файлы не отслеживаются

**Решение:**
```bash
# Проверить .gitignore
cat .gitignore

# Добавить файлы вручную
git add data/active-trades.json
git add data/pending-anomalies.json
```

### Проблема: Ошибки в скрипте

**Решение:**
```bash
# Проверить логи
node scripts/git-stage-trading-files.js check

# Перезапустить систему
npm run monitor:virtual
```

## 📈 Примеры использования

### Мониторинг в реальном времени

```bash
# Запустить торговую систему
npm run monitor:virtual

# В другом терминале следить за изменениями
watch -n 30 "npm run git:check-trading"
```

### Анализ истории торгов

```bash
# Посмотреть изменения за последний час
git log --since="1 hour ago" --oneline

# Посмотреть изменения в конкретном файле
git log --follow data/active-trades.json
```

### Сравнение состояний

```bash
# Сравнить текущее состояние с предыдущим
git diff HEAD~1 data/active-trades.json

# Посмотреть все изменения
git diff --staged
```

## 🔮 Планы развития

- [ ] Интеграция с GitHub Actions для автоматических коммитов
- [ ] Уведомления в Telegram о важных изменениях
- [ ] Автоматическое создание отчетов по изменениям
- [ ] Интеграция с внешними системами мониторинга

## 📝 Примечания

- Система работает только в Git репозитории
- Требует настроенного Git с правами на запись
- Рекомендуется регулярное создание коммитов
- Файлы добавляются в stage, но не коммитятся автоматически 