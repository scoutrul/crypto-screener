/**
 * Скрипт для мониторинга и отправки только полных торговых сигналов
 * Отправляет в Telegram только сигналы Long/Short с подтвержденной точкой входа
 */

const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');

// Конфигурация
const CONFIG = {
  timeframe: '15m',
  volumeThreshold: 3, // Объем в 3 раза больше среднего
  priceThreshold: 0.005, // 0.5% для определения направления
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  historicalWindow: 8, // 8 свечей (2 часа)
  exchanges: ['Binance'],
  maxDepositPercent: 0.02, // 2% от депозита
  stopLossPercent: 0.01, // 1%
  takeProfitPercent: 0.03, // 3%
  breakEvenPercent: 0.20 // 20% для безубытка
};

class TradeSignalsMonitor {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.filteredCoins = [];
    this.sentAlerts = new Set();
    this.app = null;
    this.monitoringInterval = null;
  }

  /**
   * Загрузить отфильтрованные монеты
   */
  async loadFilteredCoins() {
    try {
      // Сначала попробуем загрузить Binance-специфичный список
      let filename = path.join(__dirname, '..', 'data', 'binance-coins.json');
      let data;
      try {
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен список монет, торгующихся на Binance');
      } catch (error) {
        // Если файл не найден, используем общий список
        filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен общий список монет (некоторые могут не торговаться на Binance)');
      }
      
      const coinsData = JSON.parse(data);
      this.filteredCoins = coinsData.coins;
      console.log(`📊 Загружено ${this.filteredCoins.length} монет для мониторинга`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return false;
    }
  }

  /**
   * Получить свечи с Binance с повторными попытками
   */
  async fetchCandles(symbol, since, limit = 100, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.exchange.fetchOHLCV(symbol, CONFIG.timeframe, since, limit);
      } catch (error) {
        if (error.message.includes('does not have market symbol')) {
          console.log(`⚠️ ${symbol} не торгуется на Binance, пропускаем`);
          return [];
        } else if (error.message.includes('timeout') || error.message.includes('fetch failed')) {
          if (attempt < retries) {
            console.log(`⏳ Таймаут для ${symbol}, попытка ${attempt}/${retries}, повтор через 2 сек...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            console.error(`❌ Ошибка получения свечей для ${symbol} после ${retries} попыток:`, error.message);
            return [];
          }
        } else {
          console.error(`❌ Ошибка получения свечей для ${symbol}:`, error.message);
          return [];
        }
      }
    }
    return [];
  }

  /**
   * Рассчитать среднюю цену
   */
  calculateAveragePrice(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalPrice = candles.reduce((sum, candle) => {
      return sum + (candle[1] + candle[4]) / 2; // (open + close) / 2
    }, 0);
    
    return totalPrice / candles.length;
  }

  /**
   * Рассчитать средний объем
   */
  calculateAverageVolume(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalVolume = candles.reduce((sum, candle) => sum + candle[5], 0);
    return totalVolume / candles.length;
  }

  /**
   * Обнаружить аномалию объема
   */
  detectVolumeAnomaly(currentVolume, historicalVolume) {
    return currentVolume > historicalVolume * CONFIG.volumeThreshold;
  }

  /**
   * Определить тип сделки на основе изменения цены
   */
  determineTradeType(anomalyPrice, historicalPrice) {
    const priceDiff = (anomalyPrice - historicalPrice) / historicalPrice;
    
    if (priceDiff > CONFIG.priceThreshold) {
      return 'Short';
    } else if (priceDiff < -CONFIG.priceThreshold) {
      return 'Long';
    }
    
    return null;
  }

  /**
   * Проверить точку входа
   */
  checkEntryPoint(currentPrice, previousPrice, tradeType) {
    const priceDiff = (currentPrice - previousPrice) / previousPrice;
    
    if (tradeType === 'Long' && priceDiff > CONFIG.priceThreshold) {
      return true;
    } else if (tradeType === 'Short' && priceDiff < -CONFIG.priceThreshold) {
      return true;
    }
    
    return false;
  }

  /**
   * Создать сообщение о сделке
   */
  createTradeMessage(symbol, tradeType, currentPrice) {
    const ticker = symbol.replace('/USDT', '');
    const emoji = tradeType === 'Long' ? '🟢' : '🔴';
    const stopLoss = tradeType === 'Long' 
      ? currentPrice * (1 - CONFIG.stopLossPercent)
      : currentPrice * (1 + CONFIG.stopLossPercent);
    
    const takeProfit = tradeType === 'Long'
      ? currentPrice * (1 + CONFIG.takeProfitPercent)
      : currentPrice * (1 - CONFIG.takeProfitPercent);

    return `${ticker} → ${tradeType} ${emoji}

Биржи: Binance, Bybit, OKX, BingX
Вход: $${currentPrice.toFixed(6)}
Стоп: $${stopLoss.toFixed(6)}
Тейк: $${takeProfit.toFixed(6)}
Отработка: до нескольких часов`;
  }

  /**
   * Отправить уведомление
   */
  async sendNotification(message) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Сигнал отправлен в Telegram');
    } catch (error) {
      console.error('❌ Ошибка отправки сигнала:', error.message);
    }
  }

  /**
   * Проверить аномалии для одной монеты
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверяем, не отправляли ли мы уже сигнал для этой монеты
    const alertKey = `${symbol}_${Date.now()}`;
    if (this.sentAlerts.has(alertKey)) {
      console.log(`⏭️ Сигнал для ${symbol} уже отправлен`);
      return;
    }

    try {
      // Получить свечи за последние 2 часа (8 свечей по 15 минут)
      const since = Date.now() - (CONFIG.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, CONFIG.historicalWindow);
      
      if (candles.length < CONFIG.historicalWindow) {
        console.log(`⚠️ Недостаточно данных для ${symbol}`);
        return;
      }

      // Разделить свечи на периоды
      const anomalyCandle = candles[candles.length - 2]; // Аномальная свеча (2 свечи назад)
      const currentCandle = candles[candles.length - 1]; // Текущая свеча
      const historicalCandles = candles.slice(0, -2); // Исторические свечи (6 свечей)
      const previousCandle = candles[candles.length - 3]; // Предыдущая свеча

      // Рассчитать объемы и цены
      const anomalyVolume = anomalyCandle[5];
      const avgHistoricalVolume = this.calculateAverageVolume(historicalCandles);
      const anomalyPrice = this.calculateAveragePrice([anomalyCandle]);
      const avgHistoricalPrice = this.calculateAveragePrice(historicalCandles);
      const currentPrice = this.calculateAveragePrice([currentCandle]);

      // Обнаружение аномалии объема
      if (!this.detectVolumeAnomaly(anomalyVolume, avgHistoricalVolume)) {
        return; // Нет аномалии объема
      }

      console.log(`🚨 Аномалия объема обнаружена для ${symbol}!`);

      // Определение типа сделки
      const tradeType = this.determineTradeType(anomalyPrice, avgHistoricalPrice);
      
      if (!tradeType) {
        console.log(`⚠️ Неопределенный тип сделки для ${symbol}`);
        return; // Не отправляем уведомление, если тип не определен
      }

      console.log(`📈 Тип сделки: ${tradeType}`);

      // Проверка точки входа
      const previousPrice = this.calculateAveragePrice([previousCandle]);
      const entryPoint = this.checkEntryPoint(currentPrice, previousPrice, tradeType);

      if (!entryPoint) {
        console.log(`⏳ Ожидание точки входа для ${symbol}`);
        return; // Не отправляем уведомление, если точка входа не найдена
      }

      console.log(`✅ Точка входа найдена для ${symbol}!`);

      // Создать и отправить сообщение
      const message = this.createTradeMessage(symbol, tradeType, currentPrice);
      await this.sendNotification(message);
      
      console.log(`🎯 Сигнал ${tradeType} отправлен для ${symbol}`);
      this.sentAlerts.add(alertKey);

    } catch (error) {
      console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
    }
  }

  /**
   * Запустить мониторинг
   */
  async runMonitoring() {
    console.log('🔍 Начинаем проверку торговых сигналов...');
    
    for (const coin of this.filteredCoins) {
      await this.checkAnomalies(coin);
      // Небольшая пауза между запросами
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ Проверка торговых сигналов завершена');
  }

  /**
   * Запустить мониторинг
   */
  async start() {
    try {
      // Инициализировать приложение
      this.app = new CryptoScreenerApp();
      await this.app.start();
      
      console.log('🚀 Запуск мониторинга торговых сигналов...');
      
      // Загрузить список монет
      const loaded = await this.loadFilteredCoins();
      if (!loaded) {
        throw new Error('Не удалось загрузить список монет');
      }

      // Запустить первый цикл мониторинга
      await this.runMonitoring();

      // Установить интервал для повторных проверок
      this.monitoringInterval = setInterval(async () => {
        await this.runMonitoring();
      }, CONFIG.monitoringInterval);

      console.log(`⏰ Мониторинг запущен с интервалом ${CONFIG.monitoringInterval / 1000 / 60} минут`);

    } catch (error) {
      console.error('❌ Ошибка запуска мониторинга:', error.message);
      await this.stop();
    }
  }

  /**
   * Остановить мониторинг
   */
  async stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    
    console.log('🛑 Мониторинг торговых сигналов остановлен');
  }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await monitor.stop();
  process.exit(0);
});

// Запуск мониторинга
const monitor = new TradeSignalsMonitor();

if (require.main === module) {
  monitor.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { TradeSignalsMonitor }; 