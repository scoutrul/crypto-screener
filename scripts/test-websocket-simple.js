/**
 * Простой тестовый скрипт для проверки WebSocket подключения
 * Тестирует только несколько символов для избежания rate limits
 */

const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');

class SimpleWebSocketTester {
  constructor() {
    this.wsProvider = new BinanceWebSocketProvider();
    this.testSymbols = ['CRVUSDT', 'AAVEUSDT']; // Только символы из наших данных
    this.receivedData = new Map();
  }

  async start() {
    console.log('🧪 Запуск простого теста WebSocket подключения...');
    
    // Установить обработчики событий
    this.wsProvider.onConnect(async () => {
      console.log('✅ WebSocket подключен!');
      await this.subscribeToTestStreams();
    });
    
    this.wsProvider.onDisconnect((code, reason) => {
      console.log(`🔌 WebSocket отключен: ${code} - ${reason}`);
    });
    
    this.wsProvider.onError((error) => {
      console.error('❌ WebSocket ошибка:', error);
    });
    
    // Подключиться к WebSocket
    await this.wsProvider.connect();
    
    // Запустить таймер для проверки данных
    this.startDataCheck();
  }

  async subscribeToTestStreams() {
    console.log('📡 Подписка на тестовые потоки...');
    
    for (const symbol of this.testSymbols) {
      console.log(`📡 Подписка на ${symbol}@kline_1m`);
      
      this.wsProvider.subscribeToKline(
        symbol,
        '1m',
        (symbol, candle) => this.handleTestKline(symbol, candle)
      );
      
      // Задержка между подписками
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  handleTestKline(symbol, candle) {
    console.log(`📊 [TEST] ${symbol} - Новая свеча:`);
    console.log(`   💰 Цена: $${candle.close}`);
    console.log(`   📈 Объем: ${candle.volume}`);
    console.log(`   🕐 Время: ${new Date(candle.closeTime).toLocaleString()}`);
    console.log(`   ✅ Закрыта: ${candle.isClosed}`);
    
    // Сохранить данные для статистики
    if (!this.receivedData.has(symbol)) {
      this.receivedData.set(symbol, []);
    }
    this.receivedData.get(symbol).push({
      price: candle.close,
      volume: candle.volume,
      time: new Date(candle.closeTime),
      isClosed: candle.isClosed
    });
  }

  startDataCheck() {
    // Проверять данные каждые 30 секунд
    setInterval(() => {
      console.log('\n📊 СТАТИСТИКА ПОЛУЧЕННЫХ ДАННЫХ:');
      
      this.receivedData.forEach((data, symbol) => {
        console.log(`   ${symbol}: ${data.length} свечей`);
        if (data.length > 0) {
          const latest = data[data.length - 1];
          console.log(`     Последняя цена: $${latest.price}`);
          console.log(`     Последнее время: ${latest.time.toLocaleString()}`);
        }
      });
      
      // Показать статус соединения
      const status = this.wsProvider.getConnectionStatus();
      console.log(`\n🔌 Статус соединения:`);
      console.log(`   Подключен: ${status.isConnected}`);
      console.log(`   Активных подписок: ${status.activeSubscriptions}`);
      console.log(`   Последний pong: ${new Date(status.lastPong).toLocaleString()}`);
      
    }, 30000);
  }

  async stop() {
    console.log('🛑 Остановка теста...');
    this.wsProvider.disconnect();
  }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await tester.stop();
  process.exit(0);
});

// Запуск теста
const tester = new SimpleWebSocketTester();

if (require.main === module) {
  tester.start().catch(error => {
    console.error('❌ Ошибка запуска теста:', error.message);
    process.exit(1);
  });
}

module.exports = { SimpleWebSocketTester }; 