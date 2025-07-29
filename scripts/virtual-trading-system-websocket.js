const fs = require('fs');
const path = require('path');
const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');
// Простая функция для отправки сообщений в Telegram
async function sendTelegramMessage(message) {
  try {
    // Здесь можно добавить логику отправки в Telegram
    console.log('📱 TELEGRAM:', message);
  } catch (error) {
    console.error('❌ Ошибка отправки в Telegram:', error.message);
  }
}

// Конфигурация
const CONFIG = {
  // Пороги для аномалий
  volumeThreshold: 3, // Текущий объем должен быть в 3 раза больше исторического
  priceThreshold: 0.5, // Изменение цены в процентах для определения направления
  
  // Подтверждение входа
  entryConfirmationTFs: 2, // Количество временных фреймов для подтверждения
  
  // Управление рисками
  stopLossPercent: 1, // Стоп-лосс в процентах
  takeProfitPercent: 3, // Тейк-профит в процентах
  virtualDeposit: 1000, // Виртуальный депозит в USDT
  
  // Таймауты
  cooldownPeriod: 4, // Период кулдауна в TF (4 TF = 1 час)
  
  // WebSocket настройки
  useWebSocket: true, // Использовать WebSocket для быстрых потоков
  websocketIntervals: {
    watchlist: '1m', // Интервал для watchlist (1 минута)
    tradeList: '1m'  // Интервал для trade list (1 минута)
  }
};

/**
 * Система виртуальной торговли с WebSocket поддержкой
 * Использует WebSocket для быстрых потоков (watchlist и trade list)
 * и REST API для медленного потока (поиск аномалий)
 */
class VirtualTradingSystemWebSocket {
  constructor() {
    // Данные
    this.filteredCoins = [];
    this.pendingAnomalies = new Map(); // watchlist
    this.activeTrades = new Map(); // trade list
    this.tradeHistory = [];
    this.tradingStatistics = {};
    this.anomalyCooldowns = new Map();
    
    // WebSocket провайдер
    this.wsProvider = null;
    this.wsConnected = false;
    
    // Интервалы для REST API (медленный поток)
    this.anomalyCheckInterval = null;
    
    // Уведомления
    this.sendTelegramMessage = sendTelegramMessage;
    
    // Статистика
    this.systemStartTime = new Date();
    this.lastStatisticsUpdate = new Date();
  }

  /**
   * Инициализация системы
   */
  async initialize() {
    console.log('🚀 Инициализация системы виртуальной торговли с WebSocket...');
    
    // Загрузить данные
    await this.loadFilteredCoins();
    await this.loadPendingAnomalies();
    await this.loadActiveTrades();
    await this.loadTradeHistory();
    await this.loadTradingStatistics();
    
    // Инициализировать WebSocket провайдер
    if (CONFIG.useWebSocket) {
      await this.initializeWebSocket();
    }
    
    console.log('✅ Система инициализирована');
  }

  /**
   * Инициализация WebSocket провайдера
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
   * Подписаться на потоки для watchlist
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
   * Подписаться на потоки для trade list
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
   * Обработка свечи для watchlist
   */
  handleWatchlistKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const anomaly = this.pendingAnomalies.get(fullSymbol);
    
    if (!anomaly) {
      return;
    }
    
    console.log(`📊 [WATCHLIST] ${fullSymbol} - Новая свеча: $${candle.close}`);
    
    // Проверить подтверждение входа
    this.checkEntryConfirmation(fullSymbol, anomaly, candle);
    
    // Проверить таймаут watchlist
    this.checkWatchlistTimeout(fullSymbol, anomaly);
  }

  /**
   * Обработка свечи для trade list
   */
  handleTradeListKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const trade = this.activeTrades.get(fullSymbol);
    
    if (!trade) {
      return;
    }
    
    console.log(`📊 [TRADE LIST] ${fullSymbol} - Новая свеча: $${candle.close}`);
    
    // Обновить последнюю цену
    trade.lastPrice = candle.close;
    trade.lastUpdateTime = new Date().toISOString();
    
    // Проверить условия закрытия
    this.checkTradeExitConditions(trade, candle.close);
  }

  /**
   * Проверить подтверждение входа для watchlist
   */
  async checkEntryConfirmation(symbol, anomaly, currentCandle) {
    const currentPrice = currentCandle.close;
    const anomalyPrice = anomaly.anomalyPrice;
    const tradeType = anomaly.tradeType;
    
    // Рассчитать изменение цены
    const priceChange = ((currentPrice - anomalyPrice) / anomalyPrice) * 100;
    const expectedDirection = tradeType === 'Long' ? 1 : -1;
    
    // Проверить направление движения
    if (Math.abs(priceChange) >= CONFIG.priceThreshold && 
        Math.sign(priceChange) === expectedDirection) {
      
      console.log(`✅ ${symbol} - Подтверждение входа! Изменение: ${priceChange.toFixed(2)}%`);
      
      // Создать сделку
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
      
      // Отправить уведомление
      await this.sendNewTradeNotification(trade);
      
      // Сохранить данные
      await this.saveActiveTrades();
      await this.savePendingAnomalies();
      
    } else {
      console.log(`⏳ ${symbol} - Ожидание подтверждения. Изменение: ${priceChange.toFixed(2)}%`);
    }
  }

  /**
   * Проверить таймаут watchlist
   */
  checkWatchlistTimeout(symbol, anomaly) {
    const watchlistTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
    const timeInWatchlist = Date.now() - watchlistTime.getTime();
    const minutesInWatchlist = Math.floor(timeInWatchlist / (15 * 60 * 1000));
    
    if (minutesInWatchlist >= CONFIG.cooldownPeriod) {
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
   * Проверить условия выхода из сделки
   */
  checkTradeExitConditions(trade, currentPrice) {
    const { symbol, type, entryPrice, stopLoss, takeProfit } = trade;
    
    let shouldClose = false;
    let reason = '';
    let profitLoss = 0;
    
    if (type === 'Long') {
      if (currentPrice <= stopLoss) {
        shouldClose = true;
        reason = 'Stop Loss';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else if (currentPrice >= takeProfit) {
        shouldClose = true;
        reason = 'Take Profit';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      }
    } else { // Short
      if (currentPrice >= stopLoss) {
        shouldClose = true;
        reason = 'Stop Loss';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
      } else if (currentPrice <= takeProfit) {
        shouldClose = true;
        reason = 'Take Profit';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
      }
    }
    
    if (shouldClose) {
      console.log(`🔴 ${symbol} - Закрытие сделки: ${reason} (${profitLoss.toFixed(2)}%)`);
      this.closeTrade(trade, currentPrice, reason, profitLoss);
    }
  }

  /**
   * Запустить систему
   */
  async start() {
    console.log('🚀 Запуск системы виртуальной торговли с WebSocket...');
    
    await this.initialize();
    
    // Запустить медленный поток (поиск аномалий) через REST API
    await this.runAnomalyCheck();
    
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
    
    console.log('✅ Система остановлена');
  }

  // ... остальные методы остаются такими же, как в оригинальной системе
  // (loadFilteredCoins, loadPendingAnomalies, createVirtualTrade, etc.)

  /**
   * Загрузить отфильтрованные монеты
   */
  async loadFilteredCoins() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '../data/filtered-coins.json'), 'utf8');
      this.filteredCoins = JSON.parse(data);
      console.log(`📊 Загружено ${this.filteredCoins.length} отфильтрованных монет`);
    } catch (error) {
      console.error('❌ Ошибка загрузки отфильтрованных монет:', error.message);
      this.filteredCoins = [];
    }
  }

  /**
   * Загрузить pending anomalies (watchlist)
   */
  async loadPendingAnomalies() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '../data/pending-anomalies.json'), 'utf8');
      const anomalies = JSON.parse(data);
      
      this.pendingAnomalies.clear();
      anomalies.forEach(anomaly => {
        this.pendingAnomalies.set(anomaly.symbol, anomaly);
      });
      
      console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies`);
    } catch (error) {
      console.error('❌ Ошибка загрузки pending anomalies:', error.message);
    }
  }

  /**
   * Загрузить активные сделки
   */
  async loadActiveTrades() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '../data/active-trades.json'), 'utf8');
      const trades = JSON.parse(data);
      
      this.activeTrades.clear();
      trades.forEach(trade => {
        this.activeTrades.set(trade.symbol, trade);
      });
      
      console.log(`📊 Загружено ${this.activeTrades.size} активных сделок`);
    } catch (error) {
      console.error('❌ Ошибка загрузки активных сделок:', error.message);
    }
  }

  /**
   * Загрузить историю сделок
   */
  async loadTradeHistory() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '../data/trade-history.json'), 'utf8');
      this.tradeHistory = JSON.parse(data);
      console.log(`📊 Загружено ${this.tradeHistory.length} исторических сделок`);
    } catch (error) {
      console.error('❌ Ошибка загрузки истории сделок:', error.message);
      this.tradeHistory = [];
    }
  }

  /**
   * Загрузить статистику торговли
   */
  async loadTradingStatistics() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '../data/trading-statistics.json'), 'utf8');
      this.tradingStatistics = JSON.parse(data);
      console.log('📊 Загружена статистика торговли');
    } catch (error) {
      console.error('❌ Ошибка загрузки статистики торговли:', error.message);
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
        systemStartTime: new Date().toISOString()
      };
    }
  }

  /**
   * Сохранить pending anomalies
   */
  async savePendingAnomalies() {
    try {
      const anomalies = Array.from(this.pendingAnomalies.values());
      fs.writeFileSync(
        path.join(__dirname, '../data/pending-anomalies.json'),
        JSON.stringify(anomalies, null, 2)
      );
    } catch (error) {
      console.error('❌ Ошибка сохранения pending anomalies:', error.message);
    }
  }

  /**
   * Сохранить активные сделки
   */
  async saveActiveTrades() {
    try {
      const trades = Array.from(this.activeTrades.values());
      fs.writeFileSync(
        path.join(__dirname, '../data/active-trades.json'),
        JSON.stringify(trades, null, 2)
      );
    } catch (error) {
      console.error('❌ Ошибка сохранения активных сделок:', error.message);
    }
  }

  /**
   * Создать виртуальную сделку
   */
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null) {
    const stopLoss = tradeType === 'Long' 
      ? entryPrice * (1 - CONFIG.stopLossPercent / 100)
      : entryPrice * (1 + CONFIG.stopLossPercent / 100);
    
    const takeProfit = tradeType === 'Long'
      ? entryPrice * (1 + CONFIG.takeProfitPercent / 100)
      : entryPrice * (1 - CONFIG.takeProfitPercent / 100);
    
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
    
    return trade;
  }

  /**
   * Закрыть сделку
   */
  async closeTrade(trade, exitPrice, reason, profitLoss) {
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date().toISOString();
    trade.status = 'closed';
    trade.reason = reason;
    trade.profitLoss = profitLoss;
    
    // Добавить в историю
    this.tradeHistory.push(trade);
    
    // Удалить из активных сделок
    this.activeTrades.delete(trade.symbol);
    
    // Отписаться от WebSocket потока
    if (this.wsProvider) {
      this.wsProvider.unsubscribeFromKline(trade.symbol.replace('/USDT', ''));
    }
    
    // Обновить статистику
    this.updateTradingStatistics();
    
    // Отправить уведомление
    await this.sendTradeNotification(trade);
    
    // Сохранить данные
    await this.saveActiveTrades();
    await this.saveTradeHistory();
    await this.saveTradingStatistics();
  }

  /**
   * Отправить уведомление о новой сделке
   */
  async sendNewTradeNotification(trade) {
    const message = this.createNewTradeMessage(trade);
    await this.sendTelegramMessage(message);
  }

  /**
   * Отправить уведомление о закрытии сделки
   */
  async sendTradeNotification(trade) {
    const message = this.createTradeNotificationMessage(trade);
    await this.sendTelegramMessage(message);
  }

  /**
   * Создать сообщение о новой сделке
   */
  createNewTradeMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const tradeTime = new Date(trade.entryTime).toLocaleString('ru-RU');
    
    return `🎯 НОВАЯ СДЕЛКА: ${symbol} → ${trade.type} ${emoji}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время: ${tradeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
🛑 Стоп: $${trade.stopLoss.toFixed(6)}
🎯 Тейк: $${trade.takeProfit.toFixed(6)}

💡 Виртуальная сумма: $${trade.virtualAmount}`;
  }

  /**
   * Создать сообщение о закрытии сделки
   */
  createTradeNotificationMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
    const closeTime = new Date(trade.exitTime).toLocaleString('ru-RU');
    
    return `${symbol} → ${trade.type} ${emoji} ЗАКРЫТА
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время закрытия: ${closeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
💰 Выход: $${trade.exitPrice.toFixed(6)}
📊 Прибыль: ${trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}%
🎯 Причина: ${trade.reason}`;
  }

  /**
   * Обновить статистику торговли
   */
  updateTradingStatistics() {
    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.profitLoss > 0).length;
    const losingTrades = this.tradeHistory.filter(t => t.profitLoss < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    const totalProfit = this.tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const averageProfit = totalTrades > 0 ? totalProfit / totalTrades : 0;
    
    this.tradingStatistics = {
      lastUpdated: new Date().toISOString(),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalProfit,
      averageProfit,
      systemStartTime: this.systemStartTime.toISOString()
    };
  }

  /**
   * Сохранить историю сделок
   */
  async saveTradeHistory() {
    try {
      fs.writeFileSync(
        path.join(__dirname, '../data/trade-history.json'),
        JSON.stringify(this.tradeHistory, null, 2)
      );
    } catch (error) {
      console.error('❌ Ошибка сохранения истории сделок:', error.message);
    }
  }

  /**
   * Сохранить статистику торговли
   */
  async saveTradingStatistics() {
    try {
      fs.writeFileSync(
        path.join(__dirname, '../data/trading-statistics.json'),
        JSON.stringify(this.tradingStatistics, null, 2)
      );
    } catch (error) {
      console.error('❌ Ошибка сохранения статистики торговли:', error.message);
    }
  }

  /**
   * Поток 1: Поиск аномалий (REST API)
   */
  async runAnomalyCheck() {
    console.log('🔍 [ПОТОК 1] Поиск аномалий среди всех монет...');
    
    // Здесь должна быть логика поиска аномалий через REST API
    // Пока что просто логируем
    console.log(`🔍 Проверка ${this.filteredCoins.length} монет на аномалии...`);
    
    // Пример: добавить тестовую аномалию
    if (this.pendingAnomalies.size === 0 && this.activeTrades.size === 0) {
      console.log('📝 Добавление тестовой аномалии...');
      const testAnomaly = {
        symbol: 'BTC/USDT',
        anomalyId: 'BTC_TEST_' + Date.now(),
        tradeType: 'Long',
        anomalyTime: new Date().toISOString(),
        watchlistTime: new Date().toISOString(),
        anomalyCandleIndex: 6,
        anomalyPrice: 50000,
        historicalPrice: 49000
      };
      
      this.pendingAnomalies.set(testAnomaly.symbol, testAnomaly);
      await this.savePendingAnomalies();
      
      // Подписаться на WebSocket поток
      if (this.wsProvider && this.wsConnected) {
        this.wsProvider.subscribeToKline(
          'BTCUSDT',
          CONFIG.websocketIntervals.watchlist,
          (symbol, candle) => this.handleWatchlistKline(symbol, candle)
        );
      }
    }
    
    console.log('✅ [ПОТОК 1] Поиск аномалий завершен');
  }

  /**
   * Показать статистику
   */
  showStatistics() {
    console.log('\n📊 СТАТИСТИКА СИСТЕМЫ:');
    console.log('=' .repeat(50));
    
    // WebSocket статус
    if (this.wsProvider) {
      const wsStatus = this.wsProvider.getConnectionStatus();
      console.log(`🔌 WebSocket: ${wsStatus.isConnected ? 'Подключен' : 'Отключен'}`);
      console.log(`📡 Активных подписок: ${wsStatus.activeSubscriptions}`);
    }
    
    // Сделки
    console.log(`📋 В watchlist: ${this.pendingAnomalies.size}`);
    console.log(`📊 Активных сделок: ${this.activeTrades.size}`);
    console.log(`📈 Всего сделок: ${this.tradeHistory.length}`);
    
    // Статистика
    if (this.tradingStatistics.totalTrades > 0) {
      console.log(`🎯 Винрейт: ${this.tradingStatistics.winRate.toFixed(2)}%`);
      console.log(`💰 Общая прибыль: ${this.tradingStatistics.totalProfit.toFixed(2)}%`);
      console.log(`📊 Средняя прибыль: ${this.tradingStatistics.averageProfit.toFixed(2)}%`);
    }
    
    console.log('=' .repeat(50));
  }
}

// Экспорт для использования
module.exports = { VirtualTradingSystemWebSocket, CONFIG }; 