/**
 * Тестовый скрипт для проверки получения данных свечей
 * Фокусируется на получении и обработке данных свечей
 */

const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');

class WebSocketDataTester {
  constructor() {
    this.wsProvider = new BinanceWebSocketProvider();
    this.testSymbols = ['CRVUSDT', 'AAVEUSDT']; // Символы из наших данных
    this.receivedCandles = new Map();
    this.startTime = Date.now();
  }

  async start() {
    console.log('🧪 Запуск теста получения данных свечей...');
    
    // Установить обработчики событий
    this.wsProvider.onConnect(async () => {
      console.log('✅ WebSocket подключен!');
      await this.subscribeToStreams();
    });
    
    this.wsProvider.onDisconnect((code, reason) => {
      console.log(`🔌 WebSocket отключен: ${code} - ${reason}`);
    });
    
    this.wsProvider.onError((error) => {
      console.error('❌ WebSocket ошибка:', error);
    });
    
    // Подключиться к WebSocket
    await this.wsProvider.connect();
    
    // Запустить мониторинг данных
    this.startDataMonitoring();
  }

  async subscribeToStreams() {
    console.log('📡 Подписка на потоки данных...');
    
    for (const symbol of this.testSymbols) {
      console.log(`📡 Подписка на ${symbol}@kline_1m`);
      
      this.wsProvider.subscribeToKline(
        symbol,
        '1m',
        (symbol, candle) => this.handleCandle(symbol, candle)
      );
      
      // Задержка между подписками
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  handleCandle(symbol, candle) {
    const now = new Date();
    const timeDiff = now - this.startTime;
    
    console.log(`\n📊 [${now.toLocaleTimeString()}] Получена свеча для ${symbol}:`);
    console.log(`   💰 Цена: $${candle.close}`);
    console.log(`   📈 Объем: ${candle.volume}`);
    console.log(`   🕐 Время закрытия: ${new Date(candle.closeTime).toLocaleString()}`);
    console.log(`   ✅ Закрыта: ${candle.isClosed}`);
    console.log(`   ⏱️ Время с запуска: ${Math.round(timeDiff / 1000)}с`);
    
    // Сохранить данные для статистики
    if (!this.receivedCandles.has(symbol)) {
      this.receivedCandles.set(symbol, []);
    }
    this.receivedCandles.get(symbol).push({
      price: candle.close,
      volume: candle.volume,
      time: new Date(candle.closeTime),
      isClosed: candle.isClosed,
      receivedAt: now
    });
  }

  startDataMonitoring() {
    // Показывать статистику каждые 30 секунд
    setInterval(() => {
      console.log('\n📊 СТАТИСТИКА ПОЛУЧЕННЫХ СВЕЧЕЙ:');
      
      this.receivedCandles.forEach((candles, symbol) => {
        console.log(`   ${symbol}: ${candles.length} свечей`);
        if (candles.length > 0) {
          const latest = candles[candles.length - 1];
          const closedCandles = candles.filter(c => c.isClosed);
          console.log(`     Последняя цена: $${latest.price}`);
          console.log(`     Закрытых свечей: ${closedCandles.length}`);
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
const tester = new WebSocketDataTester();

if (require.main === module) {
  tester.start().catch(error => {
    console.error('❌ Ошибка запуска теста:', error.message);
    process.exit(1);
  });
}

module.exports = { WebSocketDataTester }; 