/**
 * Система виртуальной торговли с отслеживанием результатов
 * - Автоматическое создание виртуальных сделок на $1000
 * - Отслеживание цен каждые 5 минут
 * - Закрытие по тейку/стопу
 * - Статистика винрейта
 */

const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');

// Конфигурация
const CONFIG = {
  timeframe: '15m',
  volumeThreshold: 6, // Объем в 6 раз больше среднего
  priceThreshold: 0.005, // 0.5% для определения направления
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  priceTrackingInterval: 5 * 60 * 1000, // 5 минут для отслеживания цены
  historicalWindow: 8, // 8 свечей (2 часа)
  exchanges: ['Binance'],
  virtualDeposit: 1000, // $1000 на сделку
  stopLossPercent: 0.01, // 1%
  takeProfitPercent: 0.03, // 3%
  breakEvenPercent: 0.20, // 20% для безубытка
  anomalyCooldown: 4, // 4 TF (1 час) без повторных аномалий
  entryConfirmationTFs: 2 // 2 TF для подтверждения точки входа
};

class VirtualTradingSystem {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.filteredCoins = [];
    this.activeTrades = new Map(); // symbol -> trade object
    this.watchlist = new Set(); // символы в watchlist
    this.anomalyCooldowns = new Map(); // symbol -> timestamp
    this.tradeHistory = []; // история всех сделок
    this.app = null;
    this.monitoringInterval = null;
    this.priceTrackingInterval = null;
  }

  /**
   * Загрузить отфильтрованные монеты
   */
  async loadFilteredCoins() {
    try {
      let filename = path.join(__dirname, '..', 'data', 'binance-coins.json');
      let data;
      try {
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен список монет, торгующихся на Binance');
      } catch (error) {
        filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен общий список монет');
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
   * Загрузить историю сделок
   */
  async loadTradeHistory() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'trade-history.json');
      const data = await fs.readFile(filename, 'utf8');
      this.tradeHistory = JSON.parse(data);
      console.log(`📊 Загружено ${this.tradeHistory.length} исторических сделок`);
    } catch (error) {
      console.log('📊 История сделок не найдена, создаем новую');
      this.tradeHistory = [];
    }
  }

  /**
   * Сохранить историю сделок
   */
  async saveTradeHistory() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'trade-history.json');
      await fs.writeFile(filename, JSON.stringify(this.tradeHistory, null, 2));
    } catch (error) {
      console.error('❌ Ошибка сохранения истории сделок:', error.message);
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
   * Проверить cooldown для аномалий
   */
  isAnomalyOnCooldown(symbol) {
    const cooldownTime = this.anomalyCooldowns.get(symbol);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    const cooldownDuration = CONFIG.anomalyCooldown * 15 * 60 * 1000; // 4 TF * 15 минут
    return (now - cooldownTime) < cooldownDuration;
  }

  /**
   * Установить cooldown для аномалий
   */
  setAnomalyCooldown(symbol) {
    this.anomalyCooldowns.set(symbol, Date.now());
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
   * Проверить подтверждение точки входа (2 TF)
   */
  async checkEntryConfirmation(symbol, tradeType, anomalyCandleIndex) {
    try {
      // Получить дополнительные свечи для подтверждения
      const since = Date.now() - (CONFIG.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, CONFIG.historicalWindow + CONFIG.entryConfirmationTFs, 3);
      
      if (candles.length < CONFIG.historicalWindow + CONFIG.entryConfirmationTFs) {
        console.log(`⚠️ Недостаточно данных для подтверждения ${symbol} (получено ${candles.length}/${CONFIG.historicalWindow + CONFIG.entryConfirmationTFs})`);
        return false;
      }

      // Проверить движение в течение 2 TF после аномалии
      const confirmationCandles = candles.slice(anomalyCandleIndex + 1, anomalyCandleIndex + 1 + CONFIG.entryConfirmationTFs);
      
      if (confirmationCandles.length < CONFIG.entryConfirmationTFs) {
        return false;
      }

      // Проверить направление движения
      const firstPrice = this.calculateAveragePrice([confirmationCandles[0]]);
      const lastPrice = this.calculateAveragePrice([confirmationCandles[confirmationCandles.length - 1]]);
      const priceDiff = (lastPrice - firstPrice) / firstPrice;

      if (tradeType === 'Long' && priceDiff > CONFIG.priceThreshold) {
        return true; // Подтверждение роста для Long
      } else if (tradeType === 'Short' && priceDiff < -CONFIG.priceThreshold) {
        return true; // Подтверждение падения для Short
      }

      return false;
    } catch (error) {
      console.error(`❌ Ошибка проверки подтверждения для ${symbol}:`, error.message);
      return false;
    }
  }

  /**
   * Создать виртуальную сделку
   */
  createVirtualTrade(symbol, tradeType, entryPrice) {
    const stopLoss = tradeType === 'Long' 
      ? entryPrice * (1 - CONFIG.stopLossPercent)
      : entryPrice * (1 + CONFIG.stopLossPercent);
    
    const takeProfit = tradeType === 'Long'
      ? entryPrice * (1 + CONFIG.takeProfitPercent)
      : entryPrice * (1 - CONFIG.takeProfitPercent);

    const trade = {
      id: `${symbol}_${Date.now()}`,
      symbol: symbol,
      type: tradeType,
      entryPrice: entryPrice,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      entryTime: new Date().toISOString(),
      status: 'open',
      virtualAmount: CONFIG.virtualDeposit,
      priceHistory: [{
        time: new Date().toISOString(),
        price: entryPrice
      }]
    };

    this.activeTrades.set(symbol, trade);
    this.watchlist.add(symbol);
    
    console.log(`💰 Создана виртуальная сделка ${tradeType} для ${symbol} по цене $${entryPrice.toFixed(6)}`);
    return trade;
  }

  /**
   * Отслеживать цену активных сделок
   */
  async trackActiveTrades() {
    for (const [symbol, trade] of this.activeTrades) {
      try {
        const candles = await this.fetchCandles(symbol, Date.now() - 15 * 60 * 1000, 1, 3);
        if (candles.length === 0) {
          console.log(`⚠️ Не удалось получить данные для ${symbol}, пропускаем отслеживание`);
          continue;
        }

        const currentPrice = this.calculateAveragePrice(candles);
        
        // Добавить цену в историю
        trade.priceHistory.push({
          time: new Date().toISOString(),
          price: currentPrice
        });

        // Проверить условия закрытия
        let shouldClose = false;
        let closeReason = '';
        let profitLoss = 0;

        if (trade.type === 'Long') {
          if (currentPrice >= trade.takeProfit) {
            shouldClose = true;
            closeReason = 'take_profit';
            profitLoss = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
          } else if (currentPrice <= trade.stopLoss) {
            shouldClose = true;
            closeReason = 'stop_loss';
            profitLoss = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
          }
        } else { // Short
          if (currentPrice <= trade.takeProfit) {
            shouldClose = true;
            closeReason = 'take_profit';
            profitLoss = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
          } else if (currentPrice >= trade.stopLoss) {
            shouldClose = true;
            closeReason = 'stop_loss';
            profitLoss = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
          }
        }

        if (shouldClose) {
          await this.closeTrade(trade, currentPrice, closeReason, profitLoss);
        }

      } catch (error) {
        console.error(`❌ Ошибка отслеживания ${symbol}:`, error.message);
      }
    }
  }

  /**
   * Закрыть сделку
   */
  async closeTrade(trade, exitPrice, reason, profitLoss) {
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date().toISOString();
    trade.status = 'closed';
    trade.closeReason = reason;
    trade.profitLoss = profitLoss;
    trade.duration = new Date(trade.exitTime) - new Date(trade.entryTime);

    // Добавить в историю
    this.tradeHistory.push(trade);
    
    // Удалить из активных сделок
    this.activeTrades.delete(trade.symbol);
    this.watchlist.delete(trade.symbol);

    // Сохранить историю
    await this.saveTradeHistory();

    console.log(`🔒 Закрыта сделка ${trade.type} для ${trade.symbol}: ${profitLoss.toFixed(2)}% (${reason})`);
    
    // Отправить уведомление
    await this.sendTradeNotification(trade);
  }

  /**
   * Отправить уведомление о сделке
   */
  async sendTradeNotification(trade) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createTradeNotificationMessage(trade);
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Уведомление о сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о сделке
   */
  createTradeNotificationMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
    const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
    
    return `${symbol} → ${trade.type} ${emoji} ЗАКРЫТА

Вход: $${trade.entryPrice.toFixed(6)}
Выход: $${trade.exitPrice.toFixed(6)}
Результат: ${profitLossText}

Длительность: ${Math.round(trade.duration / 1000 / 60)} минут
Причина: ${trade.closeReason === 'take_profit' ? 'Тейк-профит' : 'Стоп-лосс'}`;
  }

  /**
   * Показать статистику
   */
  showStatistics() {
    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.profitLoss > 0).length;
    const losingTrades = this.tradeHistory.filter(t => t.profitLoss < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(1) : 0;
    
    const totalProfit = this.tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const avgProfit = totalTrades > 0 ? (totalProfit / totalTrades).toFixed(2) : 0;

    console.log('\n📊 СТАТИСТИКА ВИРТУАЛЬНОЙ ТОРГОВЛИ:');
    console.log(`📈 Всего сделок: ${totalTrades}`);
    console.log(`🟢 Прибыльных: ${winningTrades}`);
    console.log(`🔴 Убыточных: ${losingTrades}`);
    console.log(`📊 Винрейт: ${winRate}%`);
    console.log(`💰 Общая прибыль: ${totalProfit.toFixed(2)}%`);
    console.log(`📊 Средняя прибыль: ${avgProfit}%`);
    console.log(`👀 Активных сделок: ${this.activeTrades.size}`);
    console.log(`📋 В watchlist: ${this.watchlist.size}`);
  }

  /**
   * Проверить аномалии для одной монеты
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверяем cooldown
    if (this.isAnomalyOnCooldown(symbol)) {
      return;
    }

    // Проверяем, есть ли уже активная сделка
    if (this.activeTrades.has(symbol)) {
      return;
    }

    try {
      const since = Date.now() - (CONFIG.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, CONFIG.historicalWindow, 3);
      
      if (candles.length < CONFIG.historicalWindow) {
        console.log(`⚠️ Недостаточно данных для ${symbol} (получено ${candles.length}/${CONFIG.historicalWindow})`);
        return;
      }

      const anomalyCandle = candles[candles.length - 2];
      const historicalCandles = candles.slice(0, -2);

      const anomalyVolume = anomalyCandle[5];
      const avgHistoricalVolume = this.calculateAverageVolume(historicalCandles);
      const anomalyPrice = this.calculateAveragePrice([anomalyCandle]);
      const avgHistoricalPrice = this.calculateAveragePrice(historicalCandles);

      // Обнаружение аномалии объема
      if (!this.detectVolumeAnomaly(anomalyVolume, avgHistoricalVolume)) {
        return;
      }

      console.log(`🚨 Аномалия объема обнаружена для ${symbol}!`);

      // Определение типа сделки
      const tradeType = this.determineTradeType(anomalyPrice, avgHistoricalPrice);
      
      if (!tradeType) {
        console.log(`⚠️ Неопределенный тип сделки для ${symbol}`);
        this.setAnomalyCooldown(symbol);
        return;
      }

      console.log(`📈 Тип сделки: ${tradeType}`);

      // Проверка подтверждения точки входа
      const entryConfirmed = await this.checkEntryConfirmation(symbol, tradeType, candles.length - 2);

      if (!entryConfirmed) {
        console.log(`⏳ Ожидание подтверждения точки входа для ${symbol}`);
        return;
      }

      console.log(`✅ Точка входа подтверждена для ${symbol}!`);

      // Создать виртуальную сделку
      const currentPrice = this.calculateAveragePrice([candles[candles.length - 1]]);
      const trade = this.createVirtualTrade(symbol, tradeType, currentPrice);

      // Установить cooldown
      this.setAnomalyCooldown(symbol);

      // Отправить уведомление о новой сделке
      await this.sendNewTradeNotification(trade);

    } catch (error) {
      console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
    }
  }

  /**
   * Отправить уведомление о новой сделке
   */
  async sendNewTradeNotification(trade) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createNewTradeMessage(trade);
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Уведомление о новой сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о новой сделке
   */
  createNewTradeMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const stopLoss = trade.stopLoss;
    const takeProfit = trade.takeProfit;

    return `${symbol} → ${trade.type} ${emoji}

Биржи: Binance, Bybit, OKX, BingX
Вход: $${trade.entryPrice.toFixed(6)}
Стоп: $${stopLoss.toFixed(6)}
Тейк: $${takeProfit.toFixed(6)}
Объем: не более 2.0% от депозита
Отработка: до нескольких часов

✔️ При отработке сделки на 20%, не забудьте поставить стоп в безубыток ${trade.type === 'Long' ? 'чуть выше' : 'чуть ниже'} точки входа
✔️ Вы можете закрыть сделку в прибыль раньше тейка при изменении тренда`;
  }

  /**
   * Запустить мониторинг
   */
  async runMonitoring() {
    console.log('🔍 Начинаем проверку аномалий...');
    
    for (const coin of this.filteredCoins) {
      await this.checkAnomalies(coin);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ Проверка аномалий завершена');
  }

  /**
   * Запустить систему
   */
  async start() {
    try {
      // Инициализировать приложение
      this.app = new CryptoScreenerApp();
      await this.app.start();
      
      console.log('🚀 Запуск системы виртуальной торговли...');
      
      // Загрузить данные
      const loaded = await this.loadFilteredCoins();
      if (!loaded) {
        throw new Error('Не удалось загрузить список монет');
      }

      await this.loadTradeHistory();

      // Запустить первый цикл мониторинга
      await this.runMonitoring();

      // Установить интервалы
      this.monitoringInterval = setInterval(async () => {
        await this.runMonitoring();
      }, CONFIG.monitoringInterval);

      this.priceTrackingInterval = setInterval(async () => {
        await this.trackActiveTrades();
      }, CONFIG.priceTrackingInterval);

      console.log(`⏰ Мониторинг запущен с интервалом ${CONFIG.monitoringInterval / 1000 / 60} минут`);
      console.log(`📊 Отслеживание цен каждые ${CONFIG.priceTrackingInterval / 1000 / 60} минут`);

      // Показывать статистику каждые 30 минут
      setInterval(() => {
        this.showStatistics();
      }, 30 * 60 * 1000);

    } catch (error) {
      console.error('❌ Ошибка запуска системы:', error.message);
      await this.stop();
    }
  }

  /**
   * Остановить систему
   */
  async stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.priceTrackingInterval) {
      clearInterval(this.priceTrackingInterval);
      this.priceTrackingInterval = null;
    }
    
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    
    console.log('🛑 Система виртуальной торговли остановлена');
  }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await system.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await system.stop();
  process.exit(0);
});

// Запуск системы
const system = new VirtualTradingSystem();

if (require.main === module) {
  system.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { VirtualTradingSystem }; 