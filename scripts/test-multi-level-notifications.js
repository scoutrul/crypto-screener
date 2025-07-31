/**
 * Тестовый скрипт для демонстрации системы уведомлений о многоуровневой торговле
 */

const { MultiLevelTradingService } = require('../src/domain/services/MultiLevelTradingService');
const { MultiLevelNotificationService } = require('../src/domain/services/MultiLevelNotificationService');

async function testMultiLevelNotifications() {
  console.log('🧪 ТЕСТИРОВАНИЕ СИСТЕМЫ УВЕДОМЛЕНИЙ МНОГОУРОВНЕВОЙ ТОРГОВЛИ\n');

  // Конфигурация
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

  const multiLevelService = new MultiLevelTradingService(config);
  const notificationService = new MultiLevelNotificationService(config);

  // Создаём тестовую сделку
  const trade = {
    symbol: 'BTC/USDT',
    type: 'Long',
    entryPrice: 1.0,
    anomalyId: 'test_anomaly_123',
    tradeLevels: multiLevelService.createTradeLevels(1.0, 'Long'),
    totalCommission: 0,
    netProfit: 0,
    executedLevels: 0
  };

  console.log('📊 СОЗДАНА ТЕСТОВАЯ СДЕЛКА:');
  console.log(`Символ: ${trade.symbol}`);
  console.log(`Тип: ${trade.type}`);
  console.log(`Цена входа: $${trade.entryPrice}`);
  console.log(`Количество уровней: ${trade.tradeLevels.length}\n`);

  // Симулируем выполнение уровней
  const testPrices = [1.0, 1.0006, 1.05, 1.05];
  
  for (let i = 0; i < testPrices.length; i++) {
    const currentPrice = testPrices[i];
    console.log(`💰 ТЕСТИРУЕМ ЦЕНУ: $${currentPrice}`);
    
    // Проверяем выполнение уровней
    const executedLevels = multiLevelService.checkLevelExecution(trade, currentPrice);
    
    if (executedLevels && executedLevels.length > 0) {
      for (const executedLevel of executedLevels) {
        console.log(`✅ Уровень ${executedLevel.levelNumber} выполнен!`);
        
        // Отправляем уведомление
        await notificationService.sendLevelExecutedNotification(trade, executedLevel);
        
        // Показываем детали
        console.log(`   💰 Объём: $${executedLevel.volumeAmount.toFixed(2)}`);
        console.log(`   🎯 Целевая цена: $${executedLevel.targetPrice.toFixed(6)}`);
        console.log(`   💰 Цена выполнения: $${executedLevel.executionPrice.toFixed(6)}`);
        console.log(`   💵 Прибыль: $${executedLevel.profitLoss.toFixed(2)} (${executedLevel.profitLossPercent.toFixed(2)}%)`);
        console.log(`   💸 Комиссия: $${executedLevel.commission.toFixed(2)}`);
      }
    } else {
      console.log('⏳ Уровни не выполнены');
    }
    
    console.log('');
  }

  // Показываем финальную статистику
  console.log('📊 ФИНАЛЬНАЯ СТАТИСТИКА СДЕЛКИ:');
  const stats = multiLevelService.getLevelsStatistics(trade);
  console.log(`Выполнено уровней: ${stats.executedLevels}/4`);
  console.log(`Общая прибыль: $${stats.totalProfit.toFixed(2)}`);
  console.log(`Общая комиссия: $${stats.totalCommission.toFixed(2)}`);
  console.log(`Чистая прибыль: $${stats.netProfit.toFixed(2)}`);

  // Отправляем уведомление о завершении сделки
  console.log('\n📤 ОТПРАВКА УВЕДОМЛЕНИЯ О ЗАВЕРШЕНИИ СДЕЛКИ...');
  await notificationService.sendTradeCompletedNotification(trade);

  // Показываем глобальную статистику
  console.log('\n📊 ГЛОБАЛЬНАЯ СТАТИСТИКА СИСТЕМЫ:');
  const globalStats = notificationService.getGlobalStatistics();
  console.log(`Всего сделок: ${globalStats.totalTrades}`);
  console.log(`Выполнено уровней: ${globalStats.totalLevelsExecuted}`);
  console.log(`Общий объём: $${globalStats.totalVolume.toFixed(2)}`);
  console.log(`Общая прибыль: $${globalStats.totalProfit.toFixed(2)}`);
  console.log(`Общая комиссия: $${globalStats.totalCommission.toFixed(2)}`);
  console.log(`Чистая прибыль: $${globalStats.totalNetProfit.toFixed(2)}`);

  // Сохраняем статистику
  await notificationService.saveStatistics();
  console.log('\n💾 Статистика сохранена в файл');

  console.log('\n✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
}

if (require.main === module) {
  testMultiLevelNotifications().catch(error => {
    console.error('❌ Ошибка тестирования:', error.message);
  });
}

module.exports = { testMultiLevelNotifications }; 