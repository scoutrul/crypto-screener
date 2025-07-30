const { CryptoScreenerApp } = require('../src/app');

/**
 * Тестовый скрипт для проверки работы уведомлений
 */
async function testNotifications() {
  console.log('🧪 ТЕСТ УВЕДОМЛЕНИЙ');
  console.log('=' .repeat(50));
  
  try {
    // Инициализировать приложение
    console.log('🔧 Инициализация приложения...');
    const app = new CryptoScreenerApp();
    await app.start();
    
    // Получить сервис уведомлений
    const notificationService = app.container.getNotificationService();
    
    if (!notificationService) {
      console.error('❌ NotificationService не инициализирован');
      return;
    }
    
    console.log('✅ NotificationService инициализирован');
    
    // Проверить доступность
    const isAvailable = await notificationService.isAvailable();
    console.log(`📡 Доступность уведомлений: ${isAvailable ? '✅ Доступно' : '❌ Недоступно'}`);
    
    if (!isAvailable) {
      console.error('❌ Уведомления недоступны');
      return;
    }
    
    // Отправить тестовое сообщение
    console.log('📤 Отправка тестового сообщения...');
    await notificationService.sendNotification(
      '🧪 Тест уведомлений',
      'Это тестовое сообщение для проверки работы системы уведомлений.',
      'info'
    );
    
    console.log('✅ Тестовое сообщение отправлено');
    
    // Отправить уведомление о новой сделке
    console.log('📤 Отправка уведомления о новой сделке...');
    const mockTrade = {
      symbol: 'BTC/USDT',
      type: 'Long',
      entryPrice: 50000,
      stopLoss: 49000,
      takeProfit: 52000,
      entryTime: new Date().toISOString(),
      virtualAmount: 1000,
      volumeIncrease: 5.2,
      anomalyId: 'test_anomaly_123'
    };
    
    await notificationService.sendNewTradeNotification(mockTrade);
    
    console.log('✅ Уведомление о новой сделке отправлено');
    
    console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    
  } catch (error) {
    console.error('❌ ОШИБКА ТЕСТИРОВАНИЯ:', error.message);
    console.error('📋 Стек ошибки:', error.stack);
  }
}

// Запуск теста
testNotifications().catch(error => {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
  process.exit(1);
}); 