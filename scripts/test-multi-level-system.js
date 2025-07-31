/**
 * Тестовый скрипт для проверки многоуровневой системы фиксации прибыли
 */

const { VirtualTradingBaseService } = require('../src/domain/services/VirtualTradingBaseService');
const { MultiLevelTradingService } = require('../src/domain/services/MultiLevelTradingService');

async function testMultiLevelSystem() {
  console.log('🧪 ТЕСТИРОВАНИЕ МНОГОУРОВНЕВОЙ СИСТЕМЫ\n');

  // Создаем базовый сервис с многоуровневой системой
  const config = {
    multiLevelEnabled: true,
    initialVolume: 1000,
    commissionPercent: 0.0003,
    level2VolumePercent: 0.2,
    level3VolumePercent: 0.4,
    level4VolumePercent: 0.4,
    level2TargetPercent: 0.0006,
    level3TargetPercent: 0.05,
    level4TargetPercent: 0.05
  };

  const baseService = new VirtualTradingBaseService(config);
  const multiLevelService = new MultiLevelTradingService(config);

  console.log('📊 КОНФИГУРАЦИЯ СИСТЕМЫ:');
  console.log(JSON.stringify(config, null, 2));
  console.log('');

  // Тест 1: Создание уровней для Long сделки
  console.log('🔍 ТЕСТ 1: Создание уровней для Long сделки');
  const entryPrice = 1.0000;
  const tradeType = 'Long';
  
  const levels = multiLevelService.createTradeLevels(entryPrice, tradeType);
  console.log(`Создано ${levels.length} уровней:`);
  
  levels.forEach(level => {
    console.log(`  Уровень ${level.levelNumber}: $${level.volumeAmount} → $${level.targetPrice.toFixed(6)}`);
  });
  console.log('');

  // Тест 2: Проверка выполнения уровней
  console.log('🔍 ТЕСТ 2: Проверка выполнения уровней');
  
  // Симулируем рост цены
  const testPrices = [
    1.0000, // Начальная цена
    1.0006, // Уровень 2 (безубыток)
    1.0500, // Уровень 3 (5% прибыли)
    1.0500  // Уровень 4 (5% прибыли)
  ];

  const trade = {
    symbol: 'BTC/USDT',
    type: tradeType,
    entryPrice: entryPrice,
    tradeLevels: levels,
    totalCommission: 0,
    netProfit: 0,
    executedLevels: 0
  };

  testPrices.forEach((price, index) => {
    console.log(`\n💰 Цена: $${price.toFixed(6)}`);
    const executedLevels = multiLevelService.checkLevelExecution(trade, price);
    
    if (executedLevels) {
      executedLevels.forEach(level => {
        console.log(`  ✅ Выполнен уровень ${level.levelNumber}: $${level.profitLoss.toFixed(2)} (${level.profitLossPercent.toFixed(2)}%)`);
        console.log(`     💸 Комиссия: $${level.commission.toFixed(2)}`);
      });
    } else {
      console.log('  ⏳ Уровни не выполнены');
    }
  });

  // Тест 3: Статистика по уровням
  console.log('\n🔍 ТЕСТ 3: Статистика по уровням');
  const stats = multiLevelService.getLevelsStatistics(trade);
  console.log(`Всего уровней: ${stats.totalLevels}`);
  console.log(`Выполнено: ${stats.executedLevels}`);
  console.log(`Общий объём: $${stats.totalVolume}`);
  console.log(`Общая прибыль: $${stats.totalProfit.toFixed(2)}`);
  console.log(`Общая комиссия: $${stats.totalCommission.toFixed(2)}`);
  console.log(`Чистая прибыль: $${stats.netProfit.toFixed(2)}`);

  // Тест 4: Прогресс выполнения
  console.log('\n🔍 ТЕСТ 4: Прогресс выполнения');
  const progress = multiLevelService.getLevelsProgress(trade);
  console.log(`Прогресс: ${progress.progress}% (${progress.executedLevels}/${progress.totalLevels})`);

  // Тест 5: Создание сообщения о прогрессе
  console.log('\n🔍 ТЕСТ 5: Сообщение о прогрессе');
  const progressMessage = multiLevelService.createLevelsProgressMessage(trade);
  console.log(progressMessage);

  // Тест 6: Short сделка
  console.log('\n🔍 ТЕСТ 6: Short сделка');
  const shortEntryPrice = 1.0000;
  const shortLevels = multiLevelService.createTradeLevels(shortEntryPrice, 'Short');
  
  console.log('Уровни для Short сделки:');
  shortLevels.forEach(level => {
    console.log(`  Уровень ${level.levelNumber}: $${level.volumeAmount} → $${level.targetPrice.toFixed(6)}`);
  });

  // Тест 7: Проверка завершения сделки
  console.log('\n🔍 ТЕСТ 7: Проверка завершения сделки');
  const isCompleted = multiLevelService.isTradeCompleted(trade);
  console.log(`Сделка завершена: ${isCompleted ? 'Да' : 'Нет'}`);

  console.log('\n✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
}

// Запуск тестов
if (require.main === module) {
  testMultiLevelSystem().catch(error => {
    console.error('❌ Ошибка тестирования:', error.message);
    process.exit(1);
  });
}

module.exports = { testMultiLevelSystem }; 