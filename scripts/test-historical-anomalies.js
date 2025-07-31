/**
 * Тестовый скрипт для проверки функциональности исторических аномалий
 */

const { VirtualTradingSystem } = require('./virtual-trading-system.js');

async function testHistoricalAnomalies() {
  console.log('🧪 Тестирование функциональности исторических аномалий...');
  
  const system = new VirtualTradingSystem();
  
  try {
    // Инициализировать систему
    await system.initialize();
    
    // Создать тестовую аномалию
    const testAnomaly = {
      symbol: 'BTC/USDT',
      anomalyId: 'BTC_test_' + Date.now(),
      tradeType: 'Long',
      anomalyTime: new Date().toISOString(),
      watchlistTime: new Date().toISOString(),
      anomalyCandleIndex: 10,
      anomalyPrice: 50000.0,
      historicalPrice: 49000.0,
      currentVolume: 1000000,
      volumeLeverage: 2.5
    };
    
    console.log('📊 Сохранение тестовой аномалии...');
    await system.saveAnomalyToHistory(testAnomaly);
    
    // Создать еще одну аномалию
    const testAnomaly2 = {
      symbol: 'ETH/USDT',
      anomalyId: 'ETH_test_' + Date.now(),
      tradeType: 'Short',
      anomalyTime: new Date().toISOString(),
      watchlistTime: new Date().toISOString(),
      anomalyCandleIndex: 8,
      anomalyPrice: 3000.0,
      historicalPrice: 3100.0,
      currentVolume: 500000,
      volumeLeverage: 1.8
    };
    
    console.log('📊 Сохранение второй тестовой аномалии...');
    await system.saveAnomalyToHistory(testAnomaly2);
    
    // Показать статистику
    console.log('\n📊 Статистика исторических аномалий:');
    system.showStatistics();
    
    // Проверить загрузку исторических аномалий
    const currentDay = system.getCurrentDayString();
    console.log(`\n📊 Загрузка исторических аномалий за ${currentDay}...`);
    const loadedAnomalies = await system.loadHistoricalAnomalies(currentDay);
    console.log(`📊 Загружено ${loadedAnomalies.length} аномалий`);
    
    if (loadedAnomalies.length > 0) {
      console.log('📋 Список загруженных аномалий:');
      loadedAnomalies.forEach((anomaly, index) => {
        console.log(`  ${index + 1}. ${anomaly.symbol} - ${anomaly.tradeType} (${anomaly.volumeLeverage}x)`);
      });
    }
    
    console.log('\n✅ Тест завершен успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
  } finally {
    // Остановить систему
    await system.stop();
  }
}

// Запустить тест
if (require.main === module) {
  testHistoricalAnomalies().catch(error => {
    console.error('❌ Критическая ошибка теста:', error.message);
    process.exit(1);
  });
}

module.exports = { testHistoricalAnomalies }; 