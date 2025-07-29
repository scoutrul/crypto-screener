/**
 * Полноценная система виртуальной торговли с WebSocket поддержкой
 * Объединяет весь функционал старой системы с WebSocket интеграцией
 */

const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');
const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');

// Конфигурация (из старой системы)
const CONFIG = {
  timeframe: '15m',
  volumeThreshold: 3, // Объем в 3 раз больше среднего
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
  entryConfirmationTFs: 2, // 2 TF для подтверждения точки входа
  
  // WebSocket настройки
  useWebSocket: true,
  websocketIntervals: {
    watchlist: '1m', // Интервал для watchlist
    tradeList: '1m'  // Интервал для trade list
  }
};

class VirtualTradingSystemFull {
  constructor() {
    // Данные (из старой системы)
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.filteredCoins = [];
    this.activeTrades = new Map(); // symbol -> trade object
    this.watchlist = new Set(); // символы в watchlist
    this.anomalyCooldowns = new Map(); // symbol -> timestamp
    this.pendingAnomalies = new Map(); // symbol -> anomaly object
    this.tradeHistory = []; // история всех сделок
    this.tradingStatistics = null; // статистика торговли
    this.app = null;
    
    // WebSocket провайдер (из новой системы)
    this.wsProvider = null;
    this.wsConnected = false;
    
    // Интервалы для REST API (медленный поток)
    this.anomalyCheckInterval = null;
  }

  /**
   * Инициализация системы
   */
  async initialize() {
    console.log('🚀 Инициализация полноценной системы виртуальной торговли...');
    
    // Инициализировать приложение (из старой системы)
    this.app = new CryptoScreenerApp();
    await this.app.start();
    
    // Загрузить данные (из старой системы)
    const loaded = await this.loadFilteredCoins();
    if (!loaded) {
      throw new Error('Не удалось загрузить список монет');
    }

    await this.loadTradeHistory();
    await this.loadTradingStatistics();
    await this.loadPendingAnomalies();
    await this.loadActiveTrades();

    // Инициализировать WebSocket провайдер (из новой системы)
    if (CONFIG.useWebSocket) {
      await this.initializeWebSocket();
    }
    
    console.log('✅ Система инициализирована');
  }

  /**
   * Инициализация WebSocket провайдера (из новой системы)
   */
  async initializeWebSocket() {
    console.log('🔌 Инициализация WebSocket провайдера...');
    
    this.wsProvider = new BinanceWebSocketProvider();
    
    // Установить обработчики событий
    this.wsProvider.onConnect(() => {
      console.log('🎉 WebSocket подключен!');
      this.wsConnected = true;
      this.subscribeToWatchlistStreams();
      this.subscribeToTradeListStreams();
    });
    
    this.wsProvider.onDisconnect((code, reason) => {
      console.log(`🔌 WebSocket отключен: ${code} - ${reason}`);
      this.wsConnected = false;
    });
    
    this.wsProvider.onError((error) => {
      console.error('❌ WebSocket ошибка:', error);
    });
    
    // Подключиться к WebSocket
    await this.wsProvider.connect();
  }

  /**
   * Подписаться на потоки для watchlist (из новой системы)
   */
  subscribeToWatchlistStreams() {
    if (!this.wsConnected || this.pendingAnomalies.size === 0) {
      return;
    }
    
    const streams = [];
    
    this.pendingAnomalies.forEach((anomaly, symbol) => {
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: CONFIG.websocketIntervals.watchlist,
        callback: (symbol, candle) => this.handleWatchlistKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 Подписка на ${streams.length} потоков watchlist`);
    }
  }

  /**
   * Подписаться на потоки для trade list (из новой системы)
   */
  subscribeToTradeListStreams() {
    if (!this.wsConnected || this.activeTrades.size === 0) {
      return;
    }
    
    const streams = [];
    
    this.activeTrades.forEach((trade, symbol) => {
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: CONFIG.websocketIntervals.tradeList,
        callback: (symbol, candle) => this.handleTradeListKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 Подписка на ${streams.length} потоков trade list`);
    }
  }

  /**
   * Обработка свечи для watchlist (из новой системы)
   */
  handleWatchlistKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const anomaly = this.pendingAnomalies.get(fullSymbol);
    
    if (!anomaly) {
      return;
    }
    
    console.log(`📊 [WATCHLIST] ${fullSymbol} - Новая свеча: $${candle.close}`);
    
    // Проверить подтверждение входа (используем логику из старой системы)
    this.checkEntryConfirmationWebSocket(fullSymbol, anomaly, candle);
    
    // Проверить таймаут watchlist (из старой системы)
    this.checkWatchlistTimeout(fullSymbol, anomaly);
  }

  /**
   * Обработка свечи для trade list (из новой системы)
   */
  handleTradeListKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const trade = this.activeTrades.get(fullSymbol);
    
    if (!trade) {
      return;
    }
    
    console.log(`📊 [TRADE LIST] ${fullSymbol} - Новая свеча: $${candle.close}`);
    
    // Обновить последнюю цену (из старой системы)
    trade.lastPrice = candle.close;
    trade.lastUpdateTime = new Date().toISOString();
    
    // Проверить условия закрытия (используем логику из старой системы)
    this.checkTradeExitConditionsWebSocket(trade, candle.close);
  }

  /**
   * Проверить подтверждение входа для WebSocket (адаптированная логика из старой системы)
   */
  async checkEntryConfirmationWebSocket(symbol, anomaly, currentCandle) {
    const currentPrice = currentCandle.close;
    const anomalyPrice = anomaly.anomalyPrice;
    const tradeType = anomaly.tradeType;
    
    // Рассчитать изменение цены (логика из старой системы)
    const priceChange = ((currentPrice - anomalyPrice) / anomalyPrice) * 100;
    const expectedDirection = tradeType === 'Long' ? 1 : -1;
    
    // Проверить направление движения (логика из старой системы)
    if (Math.abs(priceChange) >= CONFIG.priceThreshold * 100 && 
        Math.sign(priceChange) === expectedDirection) {
      
      console.log(`✅ ${symbol} - Подтверждение входа! Изменение: ${priceChange.toFixed(2)}%`);
      
      // Создать сделку (используем метод из старой системы)
      const trade = this.createVirtualTrade(symbol, tradeType, currentPrice, anomaly.anomalyId);
      this.activeTrades.set(symbol, trade);
      
      // Удалить из watchlist
      this.pendingAnomalies.delete(symbol);
      
      // Отписаться от WebSocket потока
      if (this.wsProvider) {
        this.wsProvider.unsubscribeFromKline(symbol.replace('/USDT', ''));
      }
      
      // Подписаться на поток для trade list
      if (this.wsProvider && this.wsConnected) {
        this.wsProvider.subscribeToKline(
          symbol.replace('/USDT', ''),
          CONFIG.websocketIntervals.tradeList,
          (symbol, candle) => this.handleTradeListKline(symbol, candle)
        );
      }
      
      // Отправить уведомление (используем метод из старой системы)
      await this.sendNewTradeNotification(trade);
      
      // Сохранить данные (используем методы из старой системы)
      await this.saveActiveTrades();
      await this.savePendingAnomalies();
      
    } else {
      console.log(`⏳ ${symbol} - Ожидание подтверждения. Изменение: ${priceChange.toFixed(2)}%`);
    }
  }

  /**
   * Проверить таймаут watchlist (из старой системы)
   */
  checkWatchlistTimeout(symbol, anomaly) {
    const watchlistTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
    const timeInWatchlist = Date.now() - watchlistTime.getTime();
    const minutesInWatchlist = Math.floor(timeInWatchlist / (15 * 60 * 1000));
    
    if (minutesInWatchlist >= CONFIG.anomalyCooldown) {
      console.log(`⏰ ${symbol} в watchlist слишком долго (${minutesInWatchlist} TF), удаляем`);
      
      // Удалить из watchlist
      this.pendingAnomalies.delete(symbol);
      
      // Отписаться от WebSocket потока
      if (this.wsProvider) {
        this.wsProvider.unsubscribeFromKline(symbol.replace('/USDT', ''));
      }
      
      // Сохранить данные
      this.savePendingAnomalies();
    }
  }

  /**
   * Проверить условия выхода из сделки для WebSocket (адаптированная логика из старой системы)
   */
  checkTradeExitConditionsWebSocket(trade, currentPrice) {
    const { symbol, type, entryPrice, stopLoss, takeProfit } = trade;
    
    let shouldClose = false;
    let reason = '';
    let profitLoss = 0;
    
    // Логика из старой системы
    if (type === 'Long') {
      if (currentPrice >= takeProfit) {
        shouldClose = true;
        reason = 'take_profit';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else if (currentPrice <= stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      }
    } else { // Short
      if (currentPrice <= takeProfit) {
        shouldClose = true;
        reason = 'take_profit';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
      } else if (currentPrice >= stopLoss) {
        shouldClose = true;
        reason = 'stop_loss';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
      }
    }
    
    if (shouldClose) {
      console.log(`🔴 ${symbol} - Закрытие сделки: ${reason} (${profitLoss.toFixed(2)}%)`);
      this.closeTrade(trade, currentPrice, reason, profitLoss);
    }
  }

  /**
   * Загрузить отфильтрованные монеты (из старой системы)
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
   * Загрузить историю сделок (из старой системы)
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
   * Загрузить статистику торговли (из старой системы)
   */
  async loadTradingStatistics() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'trading-statistics.json');
      const data = await fs.readFile(filename, 'utf8');
      this.tradingStatistics = JSON.parse(data);
      console.log(`📊 Загружена статистика торговли (${this.tradingStatistics.totalTrades} сделок)`);
    } catch (error) {
      console.log('📊 Статистика торговли не найдена, создаем новую');
      this.tradingStatistics = {
        lastUpdated: new Date().toISOString(),
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0,
        averageProfit: 0,
        bestTrade: null,
        worstTrade: null,
        longestTrade: null,
        shortestTrade: null,
        monthlyStats: {},
        dailyStats: {},
        tradeHistory: [],
        systemStartTime: new Date().toISOString(),
        totalDaysRunning: 0,
        averageTradesPerDay: 0
      };
    }
  }

  /**
   * Сохранить статистику торговли (из старой системы)
   */
  async saveTradingStatistics() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'trading-statistics.json');
      
      // Обновить статистику перед сохранением
      this.updateTradingStatistics();
      
      await fs.writeFile(filename, JSON.stringify(this.tradingStatistics, null, 2));
    } catch (error) {
      console.error('❌ Ошибка сохранения статистики торговли:', error.message);
    }
  }

  /**
   * Сохранить историю сделок (из старой системы)
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
   * Сохранить pending anomalies (из старой системы)
   */
  async savePendingAnomalies() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'pending-anomalies.json');
      const anomaliesData = Array.from(this.pendingAnomalies.entries()).map(([symbol, anomaly]) => ({
        symbol,
        ...anomaly
      }));
      await fs.writeFile(filename, JSON.stringify(anomaliesData, null, 2));
    } catch (error) {
      console.error('❌ Ошибка сохранения pending anomalies:', error.message);
    }
  }

  /**
   * Загрузить pending anomalies (из старой системы)
   */
  async loadPendingAnomalies() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
      const data = await fs.readFile(filename, 'utf8');
      const anomaliesData = JSON.parse(data);
      this.pendingAnomalies.clear();
      anomaliesData.forEach(anomaly => {
        this.pendingAnomalies.set(anomaly.symbol, {
          tradeType: anomaly.tradeType,
          anomalyTime: anomaly.anomalyTime,
          anomalyCandleIndex: anomaly.anomalyCandleIndex,
          anomalyPrice: anomaly.anomalyPrice,
          historicalPrice: anomaly.historicalPrice,
          anomalyId: anomaly.anomalyId,
          watchlistTime: anomaly.watchlistTime
        });
      });
      console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies`);
    } catch (error) {
      console.log('📊 Pending anomalies не найдены, создаем новые');
      this.pendingAnomalies = new Map();
    }
  }

  /**
   * Загрузить активные сделки (из старой системы)
   */
  async loadActiveTrades() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'active-trades.json');
      const data = await fs.readFile(filename, 'utf8');
      const tradesData = JSON.parse(data);
      this.activeTrades.clear();
      tradesData.forEach(trade => {
        this.activeTrades.set(trade.symbol, trade);
        this.watchlist.add(trade.symbol);
      });
      console.log(`📊 Загружено ${this.activeTrades.size} активных сделок`);
      
      // Отправить уведомление о существующих сделках
      if (this.activeTrades.size > 0) {
        await this.sendExistingTradesNotification();
      }
    } catch (error) {
      console.log('📊 Активные сделки не найдены, создаем новые');
      this.activeTrades = new Map();
    }
  }

  /**
   * Сохранить активные сделки (из старой системы)
   */
  async saveActiveTrades() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'active-trades.json');
      const tradesData = Array.from(this.activeTrades.values());
      await fs.writeFile(filename, JSON.stringify(tradesData, null, 2));
    } catch (error) {
      console.error('❌ Ошибка сохранения активных сделок:', error.message);
    }
  }

  /**
   * Получить свечи с Binance с повторными попытками (из старой системы)
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
   * Рассчитать среднюю цену (из старой системы)
   */
  calculateAveragePrice(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalPrice = candles.reduce((sum, candle) => {
      return sum + (candle[1] + candle[4]) / 2; // (open + close) / 2
    }, 0);
    
    return totalPrice / candles.length;
  }

  /**
   * Рассчитать средний объем (из старой системы)
   */
  calculateAverageVolume(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalVolume = candles.reduce((sum, candle) => sum + candle[5], 0);
    return totalVolume / candles.length;
  }

  /**
   * Обнаружить аномалию объема (из старой системы)
   */
  detectVolumeAnomaly(currentVolume, historicalVolume) {
    return currentVolume > historicalVolume * CONFIG.volumeThreshold;
  }

  /**
   * Проверить cooldown для аномалий (из старой системы)
   */
  isAnomalyOnCooldown(symbol) {
    const cooldownTime = this.anomalyCooldowns.get(symbol);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    const cooldownDuration = CONFIG.anomalyCooldown * 15 * 60 * 1000; // 4 TF * 15 минут
    return (now - cooldownTime) < cooldownDuration;
  }

  /**
   * Установить cooldown для аномалий (из старой системы)
   */
  setAnomalyCooldown(symbol) {
    this.anomalyCooldowns.set(symbol, Date.now());
  }

  /**
   * Определить тип сделки на основе изменения цены (из старой системы)
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
   * Создать виртуальную сделку (из старой системы)
   */
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null) {
    const stopLoss = tradeType === 'Long' 
      ? entryPrice * (1 - CONFIG.stopLossPercent)
      : entryPrice * (1 + CONFIG.stopLossPercent);
    
    const takeProfit = tradeType === 'Long'
      ? entryPrice * (1 + CONFIG.takeProfitPercent)
      : entryPrice * (1 - CONFIG.takeProfitPercent);

    const trade = {
      id: `${symbol}_${Date.now()}`,
      anomalyId: anomalyId || `${symbol.replace('/USDT', '')}_${Date.now()}`,
      symbol: symbol,
      type: tradeType,
      entryPrice: entryPrice,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      entryTime: new Date().toISOString(),
      status: 'open',
      virtualAmount: CONFIG.virtualDeposit,
      lastPrice: entryPrice,
      lastUpdateTime: new Date().toISOString()
    };

    this.activeTrades.set(symbol, trade);
    this.watchlist.add(symbol);
    
    console.log(`💰 Создана виртуальная сделка ${tradeType} для ${symbol} по цене $${entryPrice.toFixed(6)}`);
    return trade;
  }

  /**
   * Закрыть сделку (из старой системы)
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
    
    // Удалить из активных сделок и watchlist
    this.activeTrades.delete(trade.symbol);
    this.watchlist.delete(trade.symbol);
    console.log(`🗑️ ${trade.symbol} удален из trade list и watchlist`);

    // Отписаться от WebSocket потока
    if (this.wsProvider) {
      this.wsProvider.unsubscribeFromKline(trade.symbol.replace('/USDT', ''));
    }

    // Сохранить историю и статистику
    await this.saveTradeHistory();
    await this.saveTradingStatistics();

    console.log(`🔒 Закрыта сделка ${trade.type} для ${trade.symbol}: ${profitLoss.toFixed(2)}% (${reason})`);
    
    // Отправить уведомление
    await this.sendTradeNotification(trade);
  }

  /**
   * Отправить уведомление о сделке (из старой системы)
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
   * Создать сообщение о сделке (из старой системы)
   */
  createTradeNotificationMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
    const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
    const reasonText = trade.closeReason === 'take_profit' ? 'Тейк-профит' : 'Стоп-лосс';
    
    // Получить текущую статистику
    const stats = this.getCurrentStatistics();
    
    // Форматировать время закрытия сделки
    const closeTime = new Date(trade.exitTime).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return `${symbol} → ${trade.type} ${emoji} ЗАКРЫТА
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время закрытия: ${closeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
💰 Выход: $${trade.exitPrice.toFixed(6)}
📊 Результат: ${profitLossText}
⏱️ Длительность: ${Math.round(trade.duration / 1000 / 60)} минут
🎯 Причина: ${reasonText}

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Общая прибыль: ${stats.totalProfit}%
• Активных сделок: ${this.activeTrades.size}`;
  }

  /**
   * Получить текущую статистику (из старой системы)
   */
  getCurrentStatistics() {
    if (!this.tradingStatistics) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0
      };
    }
    
    return {
      totalTrades: this.tradingStatistics.totalTrades,
      winningTrades: this.tradingStatistics.winningTrades,
      losingTrades: this.tradingStatistics.losingTrades,
      winRate: this.tradingStatistics.winRate,
      totalProfit: this.tradingStatistics.totalProfit.toFixed(2)
    };
  }

  /**
   * Обновить статистику торговли (из старой системы)
   */
  updateTradingStatistics() {
    if (!this.tradingStatistics) return;

    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.profitLoss > 0).length;
    const losingTrades = this.tradeHistory.filter(t => t.profitLoss < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(1) : 0;
    const totalProfit = this.tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const averageProfit = totalTrades > 0 ? (totalProfit / totalTrades).toFixed(2) : 0;

    // Найти лучшую и худшую сделки
    const bestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((best, current) => 
        current.profitLoss > best.profitLoss ? current : best
      ) : null;

    const worstTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((worst, current) => 
        current.profitLoss < worst.profitLoss ? current : worst
      ) : null;

    // Найти самую длинную и короткую сделки
    const longestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((longest, current) => 
        current.duration > longest.duration ? current : longest
      ) : null;

    const shortestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((shortest, current) => 
        current.duration < shortest.duration ? current : shortest
      ) : null;

    // Рассчитать дни работы системы
    const systemStartTime = new Date(this.tradingStatistics.systemStartTime);
    const now = new Date();
    const totalDaysRunning = Math.ceil((now - systemStartTime) / (1000 * 60 * 60 * 24));
    const averageTradesPerDay = totalDaysRunning > 0 ? (totalTrades / totalDaysRunning).toFixed(1) : 0;

    // Обновить статистику
    this.tradingStatistics = {
      ...this.tradingStatistics,
      lastUpdated: new Date().toISOString(),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: parseFloat(winRate),
      totalProfit,
      averageProfit: parseFloat(averageProfit),
      bestTrade: bestTrade ? {
        symbol: bestTrade.symbol,
        type: bestTrade.type,
        profitLoss: bestTrade.profitLoss,
        entryTime: bestTrade.entryTime
      } : null,
      worstTrade: worstTrade ? {
        symbol: worstTrade.symbol,
        type: worstTrade.type,
        profitLoss: worstTrade.profitLoss,
        entryTime: worstTrade.entryTime
      } : null,
      longestTrade: longestTrade ? {
        symbol: longestTrade.symbol,
        type: longestTrade.type,
        duration: longestTrade.duration,
        entryTime: longestTrade.entryTime
      } : null,
      shortestTrade: shortestTrade ? {
        symbol: shortestTrade.symbol,
        type: shortestTrade.type,
        duration: shortestTrade.duration,
        entryTime: shortestTrade.entryTime
      } : null,
      tradeHistory: this.tradeHistory.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.type,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        profitLoss: trade.profitLoss,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        closeReason: trade.closeReason,
        duration: trade.duration
      })),
      totalDaysRunning,
      averageTradesPerDay: parseFloat(averageTradesPerDay)
    };
  }

  /**
   * Показать статистику (из старой системы)
   */
  showStatistics() {
    if (!this.tradingStatistics) {
      console.log('\n📊 Статистика не загружена');
      return;
    }

    const stats = this.tradingStatistics;
    
    console.log('\n📊 РАСШИРЕННАЯ СТАТИСТИКА ТОРГОВЛИ:');
    console.log(`📈 Всего сделок: ${stats.totalTrades}`);
    console.log(`🟢 Прибыльных: ${stats.winningTrades}`);
    console.log(`🔴 Убыточных: ${stats.losingTrades}`);
    console.log(`📊 Винрейт: ${stats.winRate}%`);
    console.log(`💰 Общая прибыль: ${stats.totalProfit.toFixed(2)}%`);
    console.log(`📊 Средняя прибыль: ${stats.averageProfit}%`);
    
    if (stats.bestTrade) {
      console.log(`🏆 Лучшая сделка: ${stats.bestTrade.symbol} ${stats.bestTrade.type} +${stats.bestTrade.profitLoss.toFixed(2)}%`);
    }
    if (stats.worstTrade) {
      console.log(`💀 Худшая сделка: ${stats.worstTrade.symbol} ${stats.worstTrade.type} ${stats.worstTrade.profitLoss.toFixed(2)}%`);
    }
    if (stats.longestTrade) {
      console.log(`⏱️ Самая длинная: ${stats.longestTrade.symbol} ${Math.round(stats.longestTrade.duration / 1000 / 60)} минут`);
    }
    if (stats.shortestTrade) {
      console.log(`⚡ Самая короткая: ${stats.shortestTrade.symbol} ${Math.round(stats.shortestTrade.duration / 1000 / 60)} минут`);
    }
    
    console.log(`📅 Дней работы: ${stats.totalDaysRunning}`);
    console.log(`📊 Сделок в день: ${stats.averageTradesPerDay}`);
    console.log(`👀 Активных сделок: ${this.activeTrades.size}`);
    console.log(`📋 В watchlist: ${this.watchlist.size}`);
    console.log(`🕐 Последнее обновление: ${new Date(stats.lastUpdated).toLocaleString()}`);
    
    // WebSocket статус
    if (this.wsProvider) {
      const wsStatus = this.wsProvider.getConnectionStatus();
      console.log(`🔌 WebSocket: ${wsStatus.isConnected ? 'Подключен' : 'Отключен'}`);
      console.log(`📡 Активных подписок: ${wsStatus.activeSubscriptions}`);
    }
  }

  /**
   * Проверить аномалии для одной монеты (из старой системы)
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверяем cooldown
    if (this.isAnomalyOnCooldown(symbol)) {
      console.log(`🚫 ${symbol} на cooldown, пропускаем`);
      return;
    }

    // Проверяем, есть ли уже активная сделка
    if (this.activeTrades.has(symbol)) {
      console.log(`💰 ${symbol} уже в активной сделке, пропускаем`);
      return;
    }

    // Проверяем, есть ли уже pending anomaly для этой монеты
    if (this.pendingAnomalies.has(symbol)) {
      console.log(`⏳ ${symbol} уже в pending, пропускаем повторное добавление`);
      return;
    }

    try {
      const since = Date.now() - (CONFIG.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, Math.max(CONFIG.historicalWindow, 20), 3);
      
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

      // Создать уникальный ID аномалии
      const anomalyId = `${symbol.replace('/USDT', '')}_${Date.now()}`;
      
      // Сохранить аномалию в pending для ожидания подтверждения
      const anomalyTime = new Date(anomalyCandle[0]);
      
      this.pendingAnomalies.set(symbol, {
        anomalyId,
        tradeType: tradeType,
        anomalyTime: anomalyTime.toISOString(),
        watchlistTime: new Date().toISOString(), // Время добавления в watchlist
        anomalyCandleIndex: candles.length - 2,
        anomalyPrice: anomalyPrice,
        historicalPrice: avgHistoricalPrice
      });
      
      console.log(`📝 Аномалия ${symbol} добавлена в pending (${tradeType})`);
      
      // Подписаться на WebSocket поток для watchlist
      if (this.wsProvider && this.wsConnected) {
        this.wsProvider.subscribeToKline(
          symbol.replace('/USDT', ''),
          CONFIG.websocketIntervals.watchlist,
          (symbol, candle) => this.handleWatchlistKline(symbol, candle)
        );
      }
      
      await this.savePendingAnomalies();

    } catch (error) {
      console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
    }
  }

  /**
   * Отправить уведомление о новой сделке (из старой системы)
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
   * Создать сообщение о новой сделке (из старой системы)
   */
  createNewTradeMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const stopLoss = trade.stopLoss;
    const takeProfit = trade.takeProfit;

    // Получить текущую статистику
    const stats = this.getCurrentStatistics();

    // Форматировать время создания сделки
    const tradeTime = new Date(trade.entryTime).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `🎯 НОВАЯ СДЕЛКА: ${symbol} → ${trade.type} ${emoji}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время: ${tradeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
🛑 Стоп: $${stopLoss.toFixed(6)}
🎯 Тейк: $${takeProfit.toFixed(6)}
💵 Виртуальная сумма: $${trade.virtualAmount}

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Активных сделок: ${this.activeTrades.size}

💡 РЕКОМЕНДАЦИИ:
• Объем: не более 2.0% от депозита
• При отработке на 20% - стоп в безубыток ${trade.type === 'Long' ? 'чуть выше' : 'чуть ниже'} входа
• Можно закрыть раньше при изменении тренда`;
  }

  /**
   * Отправить уведомление о существующих сделках при запуске (из старой системы)
   */
  async sendExistingTradesNotification() {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createExistingTradesMessage();
      await notificationRepository.sendTelegramMessage(message);
      console.log('📱 Уведомление о существующих сделках отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о существующих сделках:', error.message);
    }
  }

  /**
   * Создать сообщение о существующих сделках (из старой системы)
   */
  createExistingTradesMessage() {
    const trades = Array.from(this.activeTrades.values());
    const longTrades = trades.filter(t => t.type === 'Long');
    const shortTrades = trades.filter(t => t.type === 'Short');
    
    let message = `📊 СУЩЕСТВУЮЩИЕ СДЕЛКИ (${trades.length})\n\n`;
    
    if (longTrades.length > 0) {
      message += `🟢 LONG (${longTrades.length}):\n`;
      longTrades.forEach(trade => {
        const symbol = trade.symbol.replace('/USDT', '');
        const entryTime = new Date(trade.entryTime).toLocaleString('ru-RU');
        const lastUpdateTime = trade.lastUpdateTime ? new Date(trade.lastUpdateTime).toLocaleString('ru-RU') : 'Не обновлялось';
        
        // Рассчитать изменение в процентах
        const lastPrice = trade.lastPrice || trade.entryPrice;
        const priceChange = ((lastPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
        const changeSign = priceChange >= 0 ? '+' : '';
        
        message += `• ${symbol} ${changeEmoji}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  ⏰ Обновлено: ${lastUpdateTime}\n\n`;
      });
    }
    
    if (shortTrades.length > 0) {
      message += `🔴 SHORT (${shortTrades.length}):\n`;
      shortTrades.forEach(trade => {
        const symbol = trade.symbol.replace('/USDT', '');
        const entryTime = new Date(trade.entryTime).toLocaleString('ru-RU');
        const lastUpdateTime = trade.lastUpdateTime ? new Date(trade.lastUpdateTime).toLocaleString('ru-RU') : 'Не обновлялось';
        
        // Рассчитать изменение в процентах (для Short логика обратная)
        const lastPrice = trade.lastPrice || trade.entryPrice;
        const priceChange = ((trade.entryPrice - lastPrice) / trade.entryPrice) * 100;
        const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
        const changeSign = priceChange >= 0 ? '+' : '';
        
        message += `• ${symbol} ${changeEmoji}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  ⏰ Обновлено: ${lastUpdateTime}\n\n`;
      });
    }
    
    message += `💡 Система мониторит эти сделки в реальном времени через WebSocket`;
    
    return message;
  }

  /**
   * Поток 1: Поиск аномалий среди всех монет (5 минут) - REST API
   */
  async runAnomalyCheck() {
    console.log('🔍 [ПОТОК 1] Поиск аномалий среди всех монет...');
    
    for (const coin of this.filteredCoins) {
      await this.checkAnomalies(coin);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('✅ [ПОТОК 1] Поиск аномалий завершен');
  }

  /**
   * Запустить систему
   */
  async start() {
    console.log('🚀 Запуск полноценной системы виртуальной торговли с WebSocket...');
    
    await this.initialize();
    
    // Запустить первый цикл поиска аномалий
    await this.runAnomalyCheck();
    
    // Запустить медленный поток (поиск аномалий) через REST API
    this.anomalyCheckInterval = setInterval(async () => {
      await this.runAnomalyCheck();
    }, 5 * 60 * 1000); // 5 минут
    
    console.log('✅ Система запущена');
    console.log('   🔍 Поток 1 (аномалии): каждые 5 минут (REST API)');
    console.log('   ⏳ Поток 2 (watchlist): WebSocket в реальном времени');
    console.log('   📊 Поток 3 (trade list): WebSocket в реальном времени');
  }

  /**
   * Остановить систему
   */
  async stop() {
    console.log('🛑 Остановка системы...');
    
    if (this.anomalyCheckInterval) {
      clearInterval(this.anomalyCheckInterval);
      this.anomalyCheckInterval = null;
    }
    
    if (this.wsProvider) {
      this.wsProvider.disconnect();
    }
    
    // Сохранить данные перед остановкой
    await this.saveTradeHistory();
    await this.savePendingAnomalies();
    await this.saveActiveTrades();
    
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    
    console.log('✅ Система остановлена');
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
const system = new VirtualTradingSystemFull();

if (require.main === module) {
  system.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { VirtualTradingSystemFull }; 