const { VirtualTradingSystemWebSocket } = require('./virtual-trading-system-websocket.js');

/**
 * Основной скрипт для запуска системы виртуальной торговли с WebSocket
 * Запускает систему в продакшен режиме с непрерывной работой
 */
async function startWebSocketSystem() {
  console.log('🚀 ЗАПУСК СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ С WEB SOCKET');
  console.log('=' .repeat(60));
  
  const system = new VirtualTradingSystemWebSocket();
  
  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал завершения (Ctrl+C)');
    console.log('⏳ Остановка системы...');
    await system.stop();
    console.log('✅ Система остановлена');
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал завершения (SIGTERM)');
    console.log('⏳ Остановка системы...');
    await system.stop();
    console.log('✅ Система остановлена');
    process.exit(0);
  });
  
  try {
    console.log('🔧 Инициализация системы...');
    await system.start();
    
    console.log('\n✅ СИСТЕМА ЗАПУЩЕНА И ГОТОВА К РАБОТЕ!');
    console.log('=' .repeat(60));
    console.log('📊 АРХИТЕКТУРА СИСТЕМЫ:');
    console.log('   🔍 Поток 1 (аномалии): каждые 5 минут (REST API)');
    console.log('   ⏳ Поток 2 (watchlist): WebSocket в реальном времени');
    console.log('   📊 Поток 3 (trade list): WebSocket в реальном времени');
    console.log('=' .repeat(60));
    
    // Показывать статистику каждые 5 минут
    const statsInterval = setInterval(() => {
      console.log('\n📊 СТАТИСТИКА СИСТЕМЫ:');
      console.log('=' .repeat(40));
      system.showStatistics();
      console.log('=' .repeat(40));
    }, 5 * 60 * 1000); // 5 минут
    
    // Показывать статус WebSocket каждые 2 минуты
    const wsStatusInterval = setInterval(() => {
      if (system.wsProvider) {
        const status = system.wsProvider.getConnectionStatus();
        console.log(`🔌 WebSocket статус: ${status.isConnected ? 'Подключен' : 'Отключен'} | Подписок: ${status.activeSubscriptions}`);
      }
    }, 2 * 60 * 1000); // 2 минуты
    
    // Показывать начальную статистику
    console.log('\n📊 НАЧАЛЬНАЯ СТАТИСТИКА:');
    system.showStatistics();
    
    console.log('\n⏳ Система работает... Нажмите Ctrl+C для остановки');
    console.log('💡 Статистика будет обновляться каждые 5 минут');
    
    // Держать процесс активным
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
    console.error('🛑 Остановка системы...');
    await system.stop();
    process.exit(1);
  }
}

// Запуск системы
startWebSocketSystem().catch(error => {
  console.error('❌ ОШИБКА ЗАПУСКА:', error);
  process.exit(1);
}); 