/**
 * Полноценная система виртуальной торговли с WebSocket поддержкой
 * Наследует общую бизнес-логику из VirtualTradingBaseService
 * Объединяет весь функционал старой системы с WebSocket интеграцией
 */

const ccxt = require('ccxt');
const { CryptoScreenerApp } = require('../src/app');
const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');
const { VirtualTradingBaseService } = require('../src/domain/services/VirtualTradingBaseService');

// Конфигурация для Full WebSocket системы (наследуется из базового класса)
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // 30 секунд - Trade List (высший приоритет)
  pendingCheckInterval: 30 * 1000,      // 30 секунд - Watchlist (средний приоритет)
  anomalyCheckInterval: 5 * 60 * 1000,  // 5 минут - Anomalies (низший приоритет)
  
  // Дополнительные параметры для Full WebSocket системы
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  priceTrackingInterval: 5 * 60 * 1000, // 5 минут для отслеживания цены
  exchanges: ['Binance'],
  
  // WebSocket настройки
  useWebSocket: true,
  websocketIntervals: {
    watchlist: '1m', // Интервал для watchlist
    tradeList: '1m'  // Интервал для trade list
  }
};

class VirtualTradingSystemFull extends VirtualTradingBaseService {
  constructor() {
    // Вызвать конструктор базового класса с конфигурацией
    super(CONFIG);
    
    // Full WebSocket специфичные поля
    this.exchange = new ccxt.binance({ 
      enableRateLimit: true,
      options: {
        defaultType: 'spot' // Явно указываем использование spot API
      }
    });
    this.app = null;
    
    // WebSocket провайдер
    this.wsProvider = null;
    this.wsConnected = false;
    
    // Интервалы для REST API (медленный поток)
    this.anomalyCheckInterval = null;
  }

  /**
   * Инициализация системы (переопределение абстрактного метода)
   */
  async initialize() {
    console.log('🚀 Инициализация полноценной системы виртуальной торговли...');
    
    // Инициализировать приложение (из старой системы)
    this.app = new CryptoScreenerApp();
    await this.app.start();
    
    // Загрузить данные (используем методы базового класса)
    const loaded = await this.loadFilteredCoins();
    if (!loaded) {
      throw new Error('Не удалось загрузить список монет');
    }

    await this.loadTradeHistory();
    await this.loadTradingStatistics();
    await this.loadPendingAnomalies();
    await this.loadActiveTrades();

    // Установить сервис уведомлений
    if (this.app) {
      this.setNotificationService(this.app.getNotificationService());
    }

    // Инициализировать WebSocket провайдер (из новой системы)
    if (CONFIG.useWebSocket) {
      await this.initializeWebSocket();
    }
    
    console.log('✅ Система инициализирована');
  }

  /**
   * Инициализация WebSocket провайдера (Full WebSocket специфика)
   */
  async initializeWebSocket() {
    console.log('🔌 Инициализация WebSocket провайдера...');
    
    this.wsProvider = new BinanceWebSocketProvider();
    
    // Установить обработчики событий
    this.wsProvider.onConnect(async () => {
      console.log('🎉 WebSocket подключен!');
      this.wsConnected = true;
      await this.subscribeToWatchlistStreams();
      await this.subscribeToTradeListStreams();
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
   * Подписаться на потоки для watchlist (Full WebSocket специфика)
   */
  async subscribeToWatchlistStreams() {
    if (!this.wsConnected) {
      console.log('⚠️ [WS] WebSocket не подключен, пропускаем подписку на watchlist');
      return;
    }
    
    if (this.pendingAnomalies.size === 0) {
      console.log('📋 [WS] Нет pending anomalies для подписки на watchlist');
      return;
    }
    
    const streams = [];
    
    this.pendingAnomalies.forEach((anomaly, symbol) => {
      console.log(`📡 [WS] Подготовка подписки на watchlist для ${symbol}`);
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: this.config.websocketIntervals.watchlist,
        callback: (symbol, candle) => this.handleWatchlistKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      console.log(`📡 [WS] Подписка на ${streams.length} потоков watchlist:`, streams.map(s => s.symbol));
      await this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 [WS] Подписка на ${streams.length} потоков watchlist завершена`);
    }
  }

  /**
   * Подписаться на потоки для trade list (Full WebSocket специфика)
   */
  async subscribeToTradeListStreams() {
    if (!this.wsConnected) {
      console.log('⚠️ [WS] WebSocket не подключен, пропускаем подписку на trade list');
      return;
    }
    
    if (this.activeTrades.size === 0) {
      console.log('💰 [WS] Нет активных сделок для подписки на trade list');
      return;
    }
    
    const streams = [];
    
    this.activeTrades.forEach((trade, symbol) => {
      console.log(`📡 [WS] Подготовка подписки на trade list для ${symbol}`);
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: this.config.websocketIntervals.tradeList,
        callback: (symbol, candle) => this.handleTradeListKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      console.log(`📡 [WS] Подписка на ${streams.length} потоков trade list:`, streams.map(s => s.symbol));
      await this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 [WS] Подписка на ${streams.length} потоков trade list завершена`);
    }
  }

  /**
   * Обработка свечи для watchlist (Full WebSocket специфика)
   */
  handleWatchlistKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const anomaly = this.pendingAnomalies.get(fullSymbol);
    
    if (!anomaly) {
      console.log(`⚠️ [WATCHLIST] ${fullSymbol} - Аномалия не найдена в pending anomalies`);
      return;
    }
    
    console.log(`📊 [WATCHLIST] ${fullSymbol} - Обновление цены: $${candle.close}`);
    
    // Обновить время последнего обновления в аномалии
    anomaly.lastUpdateTime = new Date().toISOString();
    anomaly.lastPrice = candle.close;
    
    // Проверить подтверждение входа (используем логику из старой системы)
    this.checkEntryConfirmationWebSocket(fullSymbol, anomaly, candle);
    
    // Проверить таймаут watchlist (из старой системы)
    this.checkWatchlistTimeout(fullSymbol, anomaly);
    
    // Сохранить обновленные данные
    this.savePendingAnomalies();
  }

  /**
   * Обработка свечи для trade list (Full WebSocket специфика)
   */
  async handleTradeListKline(symbol, candle) {
    const fullSymbol = `${symbol}/USDT`;
    const trade = this.activeTrades.get(fullSymbol);
    
    if (!trade) {
      console.log(`⚠️ [TRADE LIST] ${fullSymbol} - Сделка не найдена в active trades`);
      return;
    }
    
    console.log(`📊 [TRADE LIST] ${fullSymbol} - Обновление цены: $${candle.close}`);
    
    // Обновить последнюю цену (из старой системы)
    const oldPrice = trade.lastPrice;
    trade.lastPrice = candle.close;
    trade.lastUpdateTime = new Date().toISOString();
    
    console.log(`   📊 Изменение цены: $${oldPrice} → $${candle.close}`);
    
    // Проверить условия закрытия (используем логику из старой системы)
    this.checkTradeExitConditionsWebSocket(trade, candle.close);
    
    // Сохранить обновленные данные
    await this.saveActiveTrades();
  }

  /**
   * Проверить подтверждение входа для WebSocket (новая логика с этапами)
   */
  async checkEntryConfirmationWebSocket(symbol, anomaly, currentCandle) {
    const currentPrice = currentCandle.close;
    
    console.log(`🔍 [CONFIRMATION] Проверка подтверждения входа для ${symbol}:`);
    console.log(`   💰 Текущая цена: $${currentPrice}`);
    console.log(`   📊 Аномалия: ${anomaly.tradeType} по $${anomaly.anomalyPrice}`);
    
    console.log(`🔍 [CONFIRMATION] Проверка подтверждения входа для ${symbol}:`);
    console.log(`   💰 Текущая цена: $${currentPrice}`);
    console.log(`   📊 Цена аномалии: $${anomalyPrice}`);
    console.log(`   📈 Тип сделки: ${tradeType}`);
    
    // Рассчитать изменение цены (логика из старой системы)
    const priceChange = ((currentPrice - anomalyPrice) / anomalyPrice) * 100;
    const expectedDirection = tradeType === 'Long' ? 1 : -1;
    
    console.log(`   📊 Изменение цены: ${priceChange.toFixed(2)}%`);
    console.log(`   🎯 Ожидаемое направление: ${expectedDirection > 0 ? 'вверх' : 'вниз'}`);
    console.log(`   📏 Порог: ${CONFIG.priceThreshold * 100}%`);
    
    // Проверить направление движения (логика из старой системы)
    if (Math.abs(priceChange) >= this.config.priceThreshold * 100 && 
        Math.sign(priceChange) === expectedDirection) {
      
      console.log(`✅ ${symbol} - Подтверждение входа! Изменение: ${priceChange.toFixed(2)}%`);
      
      // Создать сделку (используем метод базового класса)
      const currentVolume = currentCandle[5]; // Объем текущей свечи
      const trade = this.createVirtualTrade(symbol, tradeType, currentPrice, anomaly.anomalyId, currentVolume);
      
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
          this.config.websocketIntervals.tradeList,
          (symbol, candle) => this.handleTradeListKline(symbol, candle)
        );
      }
      
      // Отправить уведомление (используем метод базового класса)
      await this.sendNewTradeNotification(trade);
      
      // Сохранить данные (используем методы базового класса)
      await this.saveActiveTrades();
      await this.savePendingAnomalies();
      
    } else {
      console.log(`⏳ ${symbol} - Ожидание подтверждения. Изменение: ${priceChange.toFixed(2)}%`);
      console.log(`   ❌ Недостаточное изменение или неправильное направление`);
    }
  }

  /**
   * Проверить таймаут watchlist (Full WebSocket специфика)
   */
  checkWatchlistTimeout(symbol, anomaly) {
    const watchlistTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
    const timeInWatchlist = Date.now() - watchlistTime.getTime();
    const minutesInWatchlist = Math.floor(timeInWatchlist / (15 * 60 * 1000));
    
    if (minutesInWatchlist >= this.config.anomalyCooldown) {
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
   * Получить свечи с Binance с повторными попытками (Full WebSocket специфика)
   */
  async fetchCandles(symbol, since, limit = 100, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.exchange.fetchOHLCV(symbol, this.config.timeframe, since, limit);
      } catch (error) {
        if (error.message.includes('does not have market symbol')) {
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
    return currentVolume > historicalVolume * this.config.volumeThreshold;
  }

  /**
   * Проверить cooldown для аномалий (из старой системы)
   */
  isAnomalyOnCooldown(symbol) {
    const cooldownTime = this.anomalyCooldowns.get(symbol);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    const cooldownDuration = this.config.anomalyCooldown * 15 * 60 * 1000; // 4 TF * 15 минут
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
    
    if (priceDiff > this.config.priceThreshold) {
      return 'Short';
    } else if (priceDiff < -this.config.priceThreshold) {
      return 'Long';
    }
    
    return null;
  }

  /**
   * Создать виртуальную сделку (из старой системы)
   */
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null, currentVolume = null) {
    const stopLoss = tradeType === 'Long' 
      ? entryPrice * (1 - this.config.stopLossPercent)
      : entryPrice * (1 + this.config.stopLossPercent);
    
    const takeProfit = tradeType === 'Long'
      ? entryPrice * (1 + this.config.takeProfitPercent)
      : entryPrice * (1 - this.config.takeProfitPercent);

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
      lastPrice: entryPrice,
      lastUpdateTime: new Date().toISOString(),
      currentVolume: currentVolume // Добавляем текущий объем свечи
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
   * Показать статистику (расширение базового метода)
   */
  showStatistics() {
    // Вызвать базовый метод
    super.showStatistics();
    
    // Добавить WebSocket специфичную информацию
    if (this.wsProvider) {
      const wsStatus = this.wsProvider.getConnectionStatus();
      console.log(`🔌 WebSocket: ${wsStatus.isConnected ? 'Подключен' : 'Отключен'}`);
      console.log(`📡 Активных подписок: ${wsStatus.activeSubscriptions}`);
    }
  }

  /**
   * Проверить аномалии для одной монеты (переопределение абстрактного метода)
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверяем cooldown (используем метод базового класса)
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
      const since = Date.now() - (this.config.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, Math.max(this.config.historicalWindow, 20), 3);
      
      if (candles.length < this.config.historicalWindow) {
        return;
      }

      const anomalyCandle = candles[candles.length - 2];
      const historicalCandles = candles.slice(0, -2);

      const anomalyVolume = anomalyCandle[5];
      const avgHistoricalVolume = this.calculateAverageVolume(historicalCandles);
      const anomalyPrice = this.calculateAveragePrice([anomalyCandle]);
      const avgHistoricalPrice = this.calculateAveragePrice(historicalCandles);

      // Обнаружение аномалии объема (используем метод базового класса)
      if (!this.detectVolumeAnomaly(anomalyVolume, avgHistoricalVolume)) {
        return;
      }

      console.log(`🚨 Аномалия объема обнаружена для ${symbol}!`);

      // Определение типа сделки (используем метод базового класса)
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
          this.config.websocketIntervals.watchlist,
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

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Активных сделок: ${this.activeTrades.size}`;
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
   * Запустить систему (переопределение абстрактного метода)
   */
  async start() {
    console.log('🚀 Запуск полноценной системы виртуальной торговли с WebSocket...');
    
    await this.initialize();
    
    // Запустить первый цикл поиска аномалий
    await this.runAnomalyCheck();
    
    // Запустить медленный поток (поиск аномалий) через REST API
    this.anomalyCheckInterval = setInterval(async () => {
      await this.runAnomalyCheck();
    }, this.config.anomalyCheckInterval); // Anomalies - низший приоритет
    
    console.log('✅ Система запущена');
    console.log(`   🔍 Поток 1 (аномалии): каждые ${this.config.anomalyCheckInterval / 1000 / 60} минут (REST API)`);
    console.log('   ⏳ Поток 2 (watchlist): WebSocket в реальном времени');
    console.log('   📊 Поток 3 (trade list): WebSocket в реальном времени');
  }

  /**
   * Остановить систему (переопределение абстрактного метода)
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
    
    // Сохранить данные перед остановкой (используем методы базового класса)
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