/**
 * Скрипт мониторинга аномалий для отфильтрованных монет
 */
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');

// Конфигурация
const CONFIG = {
  timeframe: '15m',
  volumeThreshold: 3, // Объем больше в 3 раза
  priceThreshold: 0.005, // 0.5% изменение цены (снижено с 1% для большей чувствительности)
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  historicalWindow: 2 * 60 * 60 * 1000, // 2 часа для исторических данных
  exchanges: ['binance', 'bybit'], // Биржи для торговли
  maxDepositPercent: 0.02, // 2% от депозита
  stopLossPercent: 0.01, // 1% стоп-лосс
  takeProfitPercent: 0.03, // 3% тейк-профит
  breakEvenPercent: 0.20 // 20% для перевода в безубыток
};

class AnomalyMonitor {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.sentAlerts = new Set();
    this.filteredCoins = [];
    this.app = null;
  }

  /**
   * Загрузить отфильтрованные монеты из файла
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
      
      this.filteredCoins = coinsData.coins.map(coin => ({
        ...coin,
        symbol: `${coin.symbol}/USDT` // Добавляем пару для CCXT
      }));
      
      console.log(`📊 Загружено ${this.filteredCoins.length} монет для мониторинга`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return false;
    }
  }

  /**
   * Получить свечи для анализа
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
      return sum + (candle[2] + candle[3]) / 2; // (high + low) / 2
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
   * Детектировать аномалию объема
   */
  detectVolumeAnomaly(currentVolume, historicalVolume) {
    return currentVolume > historicalVolume * CONFIG.volumeThreshold;
  }

  /**
   * Определить тип сделки (Long/Short)
   */
  determineTradeType(anomalyPrice, historicalPrice) {
    const priceDiff = (anomalyPrice - historicalPrice) / historicalPrice;
    
    // Добавить отладочную информацию
    console.log(`   🔍 Детальный анализ: аномальная=${anomalyPrice.toFixed(6)}, историческая=${historicalPrice.toFixed(6)}, изменение=${(priceDiff * 100).toFixed(2)}%`);
    
    if (priceDiff > CONFIG.priceThreshold) {
      console.log(`   📉 Определен как Short: ${(priceDiff * 100).toFixed(2)}% > ${(CONFIG.priceThreshold * 100).toFixed(1)}% (ожидаем падение после роста)`);
      return 'Short';
    } else if (priceDiff < -CONFIG.priceThreshold) {
      console.log(`   📈 Определен как Long: ${(priceDiff * 100).toFixed(2)}% < -${(CONFIG.priceThreshold * 100).toFixed(1)}% (ожидаем рост после падения)`);
      return 'Long';
    }
    
    console.log(`   ❓ Неопределен: ${(priceDiff * 100).toFixed(2)}% между -${(CONFIG.priceThreshold * 100).toFixed(1)}% и ${(CONFIG.priceThreshold * 100).toFixed(1)}%`);
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
Объем: не более 2.0% от депозита
Отработка: до нескольких часов

✔️ При отработке сделки на 20%, не забудьте поставить стоп в безубыток ${tradeType === 'Long' ? 'чуть выше' : 'чуть ниже'} точки входа
✔️ Вы можете закрыть сделку в прибыль раньше тейка при изменении тренда`;
  }

  /**
   * Создать сообщение о неопределенном направлении
   */
  createUndefinedDirectionMessage(symbol, currentPrice, anomalyVolume, avgHistoricalVolume, priceDiff, waitingForEntry = false) {
    const volumeRatio = (anomalyVolume / avgHistoricalVolume).toFixed(1);
    const priceChangePercent = (priceDiff * 100).toFixed(2);
    
    let status = waitingForEntry ? '⏳ ОЖИДАНИЕ ТОЧКИ ВХОДА' : '❓ НАПРАВЛЕНИЕ НЕ ОПРЕДЕЛЕНО';
    let description = waitingForEntry 
      ? 'Направление определено, но точка входа еще не найдена'
      : 'Изменение цены недостаточно для определения направления';

    return `🚨 <b>АНОМАЛИЯ ОБЪЕМА - ${status}</b>

📊 <b>TICKER:</b> ${symbol.replace('/USDT', '')}
🏢 <b>Биржи:</b> ${CONFIG.exchanges.join(' / ')}
💰 <b>Текущая цена:</b> $${currentPrice.toFixed(6)}

📈 <b>Анализ аномалии:</b>
• Объем аномальной свечи: ${anomalyVolume.toLocaleString()}
• Средний исторический объем: ${avgHistoricalVolume.toLocaleString()}
• Превышение объема: <b>${volumeRatio}x</b>
• Изменение цены: <b>${priceChangePercent}%</b>

⚠️ <b>Статус:</b> ${description}

💡 <b>Рекомендации:</b>
• Следите за дальнейшим движением цены
• Готовьтесь к возможному сигналу Long/Short
• Не открывайте позиции до подтверждения направления

🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;
  }

  /**
   * Отправить уведомление
   */
  async sendNotification(message) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Уведомление отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Проверить аномалии для одной монеты
   */
  async checkAnomalies(coin) {
    try {
      const symbol = coin.symbol;
      const now = Date.now();
      const since = now - CONFIG.historicalWindow;
      
      console.log(`\n🔍 Проверка ${symbol}...`);
      
      // Получить свечи
      const candles = await this.fetchCandles(symbol, since);
      
      if (candles.length < 8) {
        console.log(`⚠️ Недостаточно данных для ${symbol}`);
        return;
      }

      // Разделить свечи на периоды
      const currentCandle = candles[candles.length - 1];
      const previousCandle = candles[candles.length - 2];
      const anomalyCandle = candles[candles.length - 3];
      const historicalCandles = candles.slice(0, -3);

      // Проверить, не отправляли ли мы уже сигнал для этой свечи
      const alertKey = `${symbol}_${anomalyCandle[0]}`;
      if (this.sentAlerts.has(alertKey)) {
        console.log(`⏭️ Сигнал для ${symbol} уже отправлен`);
        return;
      }

      // Рассчитать объемы
      const currentVolume = currentCandle[5];
      const anomalyVolume = anomalyCandle[5];
      const avgHistoricalVolume = this.calculateAverageVolume(historicalCandles);

      // Детектировать аномалию объема
      if (!this.detectVolumeAnomaly(anomalyVolume, avgHistoricalVolume)) {
        console.log(`📊 Нормальный объем для ${symbol}`);
        return;
      }

      console.log(`🚨 Аномалия объема обнаружена для ${symbol}!`);

      // Рассчитать цены
      const currentPrice = this.calculateAveragePrice([currentCandle]);
      const anomalyPrice = this.calculateAveragePrice([anomalyCandle]);
      const avgHistoricalPrice = this.calculateAveragePrice(historicalCandles);

      // Определить тип сделки
      const tradeType = this.determineTradeType(anomalyPrice, avgHistoricalPrice);
      
      // Добавить отладочную информацию
      const priceDiff = (anomalyPrice - avgHistoricalPrice) / avgHistoricalPrice;
      console.log(`📊 Анализ цены для ${symbol}:`);
      console.log(`   - Цена аномальной свечи: ${anomalyPrice.toFixed(6)}`);
      console.log(`   - Средняя историческая цена: ${avgHistoricalPrice.toFixed(6)}`);
      console.log(`   - Изменение: ${(priceDiff * 100).toFixed(2)}%`);
      console.log(`   - Порог: ${(CONFIG.priceThreshold * 100).toFixed(1)}%`);
      
      // Проверить точку входа
      const previousPrice = this.calculateAveragePrice([previousCandle]);
      const entryPoint = this.checkEntryPoint(currentPrice, previousPrice, tradeType);

      if (!tradeType) {
        console.log(`⚠️ Неопределенный тип сделки для ${symbol} (изменение ${(priceDiff * 100).toFixed(2)}% < порог ${(CONFIG.priceThreshold * 100).toFixed(1)}%)`);
        
        // Отправить сигнал о неопределенном направлении
        const message = this.createUndefinedDirectionMessage(symbol, currentPrice, anomalyVolume, avgHistoricalVolume, priceDiff);
        await this.sendNotification(message);
        return;
      }

      console.log(`📈 Тип сделки: ${tradeType}`);

      if (!entryPoint) {
        console.log(`⏳ Ожидание точки входа для ${symbol}`);
        
        // Отправить сигнал о неопределенном направлении, но с ожиданием точки входа
        const message = this.createUndefinedDirectionMessage(symbol, currentPrice, anomalyVolume, avgHistoricalVolume, priceDiff, true);
        await this.sendNotification(message);
        return;
      }

      console.log(`✅ Точка входа найдена для ${symbol}!`);

      // Создать и отправить сообщение
      const message = this.createTradeMessage(symbol, tradeType, currentPrice);
      await this.sendNotification(message);

      // Пометить сигнал как отправленный
      this.sentAlerts.add(alertKey);

      console.log(`🎯 Сигнал ${tradeType} отправлен для ${symbol}`);

    } catch (error) {
      console.error(`❌ Ошибка проверки ${coin.symbol}:`, error.message);
    }
  }

  /**
   * Основной цикл мониторинга
   */
  async runMonitoring() {
    console.log('🚀 Запуск мониторинга аномалий...');
    
    // Загрузить список монет
    if (!await this.loadFilteredCoins()) {
      console.error('❌ Не удалось загрузить список монет');
      return;
    }

    // Проверить каждую монету
    for (const coin of this.filteredCoins) {
      await this.checkAnomalies(coin);
      
      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ Мониторинг завершен');
  }

  /**
   * Запустить мониторинг
   */
  async start() {
    try {
      // Инициализировать приложение
      this.app = new CryptoScreenerApp();
      await this.app.start();
      
      console.log('🎯 Мониторинг аномалий запущен');
      console.log(`⏰ Интервал проверки: ${CONFIG.monitoringInterval / 1000 / 60} минут`);
      console.log(`📊 Таймфрейм: ${CONFIG.timeframe}`);
      console.log(`🔍 Монет для мониторинга: ${this.filteredCoins.length}`);

      // Запустить первый мониторинг
      await this.runMonitoring();

      // Установить интервал
      setInterval(async () => {
        await this.runMonitoring();
      }, CONFIG.monitoringInterval);

    } catch (error) {
      console.error('❌ Ошибка запуска мониторинга:', error.message);
    }
  }

  /**
   * Остановить мониторинг
   */
  async stop() {
    if (this.app) {
      await this.app.stop();
    }
    console.log('🛑 Мониторинг остановлен');
  }
}

// Запуск скрипта
if (require.main === module) {
  const monitor = new AnomalyMonitor();
  
  // Обработка сигналов завершения
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

  // Запустить мониторинг
  monitor.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { AnomalyMonitor }; 