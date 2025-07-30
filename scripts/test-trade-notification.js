const { VirtualTradingSystem } = require('./virtual-trading-system.js');

/**
 * Тестовый скрипт для проверки создания сделки и отправки уведомления
 */
async function testTradeNotification() {
  console.log('🧪 ТЕСТ СОЗДАНИЯ СДЕЛКИ И УВЕДОМЛЕНИЯ');
  console.log('=' .repeat(50));
  
  try {
    // Инициализировать систему
    console.log('🔧 Инициализация системы...');
    const system = new VirtualTradingSystem();
    await system.initialize();
    
    console.log('✅ Система инициализирована');
    
    // Создать тестовую сделку
    console.log('💰 Создание тестовой сделки...');
    const trade = system.createVirtualTrade(
      'BTC/USDT',
      'Long',
      50000,
      'test_anomaly_123',
      1000000
    );
    
    console.log('✅ Сделка создана:', {
      symbol: trade.symbol,
      type: trade.type,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit
    });
    
    // Проверить, что сделка добавлена в активные
    console.log(`📊 Активных сделок: ${system.activeTrades.size}`);
    
    // Подождать немного для обработки уведомлений
    console.log('⏳ Ожидание обработки уведомлений...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🎉 ТЕСТ ЗАВЕРШЕН УСПЕШНО!');
    console.log('💡 Если уведомления настроены правильно, вы должны получить сообщение в Telegram');
    
  } catch (error) {
    console.error('❌ ОШИБКА ТЕСТИРОВАНИЯ:', error.message);
    console.error('📋 Стек ошибки:', error.stack);
  }
}

// Запуск теста
testTradeNotification().catch(error => {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  process.exit(1);
}); 