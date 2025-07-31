/**
 * Тестовый скрипт для проверки логики определения типа сделки
 */

const { VirtualTradingSystem } = require('./virtual-trading-system.js');

async function testTradeTypeDetermination() {
  console.log('🧪 Тестирование логики определения типа сделки...');
  
  const system = new VirtualTradingSystem();
  
  try {
    // Инициализировать систему
    await system.initialize();
    
    // Тестовые случаи
    const testCases = [
      {
        name: 'EDU/USDT - очень высокий leverage',
        anomalyPrice: 0.123456,
        historicalPrice: 0.122000,
        volumeLeverage: 59.9,
        expectedType: 'Short' // Ожидаем Short, так как цена выросла
      },
      {
        name: 'BTC/USDT - умеренный leverage',
        anomalyPrice: 50000,
        historicalPrice: 49000,
        volumeLeverage: 5.2,
        expectedType: 'Short'
      },
      {
        name: 'ETH/USDT - падение цены',
        anomalyPrice: 3000,
        historicalPrice: 3100,
        volumeLeverage: 3.1,
        expectedType: 'Long'
      },
      {
        name: 'TEST/USDT - небольшое изменение (должно не определиться)',
        anomalyPrice: 1.000,
        historicalPrice: 0.995,
        volumeLeverage: 2.0,
        expectedType: null
      },
      {
        name: 'HIGH/USDT - очень высокий leverage с малым изменением цены',
        anomalyPrice: 0.1005,
        historicalPrice: 0.1000,
        volumeLeverage: 25.0,
        expectedType: 'Short' // Должно определиться со сниженным порогом
      }
    ];
    
    console.log('\n📊 ТЕСТИРОВАНИЕ ОПРЕДЕЛЕНИЯ ТИПА СДЕЛКИ:\n');
    
    for (const testCase of testCases) {
      console.log(`🔍 Тест: ${testCase.name}`);
      console.log('─'.repeat(50));
      
      // Временно изменить конфигурацию для теста
      const originalThreshold = system.config.priceThreshold;
      
      // Тест с обычным порогом
      let tradeType = system.determineTradeType(testCase.anomalyPrice, testCase.historicalPrice);
      console.log(`📊 Результат с обычным порогом (${(originalThreshold * 100).toFixed(2)}%): ${tradeType || 'не определен'}`);
      
      // Тест с высоким leverage и сниженным порогом
      if (!tradeType && testCase.volumeLeverage > 20) {
        console.log(`🔥 Тестируем сниженный порог для leverage ${testCase.volumeLeverage}x...`);
        system.config.priceThreshold = 0.005; // 0.5%
        tradeType = system.determineTradeType(testCase.anomalyPrice, testCase.historicalPrice);
        console.log(`📊 Результат со сниженным порогом (0.50%): ${tradeType || 'не определен'}`);
      }
      
      // Восстановить оригинальный порог
      system.config.priceThreshold = originalThreshold;
      
      // Проверить результат
      const isCorrect = tradeType === testCase.expectedType;
      const status = isCorrect ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН';
      console.log(`${status} - Ожидалось: ${testCase.expectedType}, Получено: ${tradeType}`);
      
      console.log('\n');
    }
    
    console.log('✅ Тестирование завершено!');
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error.message);
  } finally {
    // Остановить систему
    await system.stop();
  }
}

// Запустить тест
if (require.main === module) {
  testTradeTypeDetermination().catch(error => {
    console.error('❌ Критическая ошибка теста:', error.message);
    process.exit(1);
  });
}

module.exports = { testTradeTypeDetermination }; 