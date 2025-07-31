/**
 * Базовый класс для виртуальной торговой системы
 * Содержит общую бизнес-логику для всех вариантов системы
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Базовый класс виртуальной торговой системы
 */
class VirtualTradingBaseService {
  constructor(config = {}) {
    // Конфигурация по умолчанию
    this.config = {
      timeframe: '15m',
      volumeThreshold: 8, // Объем в 8 раз больше среднего
      historicalWindow: 8, // 8 свечей (2 часа)
      consolidationThreshold: 0.015, // 1.5% для проверки консолидации
      priceThreshold: 0.005, // 0.5% для определения направления
      stopLossPercent: 0.005, // stop 0.5%
      takeProfitPercent: 0.025, // 2.5%
      entryLevelPercent: 0.004, // 0.4% для уровня входа
      cancelLevelPercent: 0.006, // 0.6% для уровня отмены
      anomalyCooldown: 4, // 4 TF (1 час) без повторных аномалий
      entryConfirmationTFs: 6, // 6 TF для подтверждения точки входа (3 часа)
      ...config
    };

    // Данные (одинаковые для всех систем)
    this.filteredCoins = [];
    this.activeTrades = new Map(); // symbol -> trade object
    this.watchlist = new Set(); // символы в watchlist
    this.anomalyCooldowns = new Map(); // symbol -> timestamp
    this.pendingAnomalies = new Map(); // symbol -> anomaly object
    this.tradeHistory = []; // история всех сделок
    this.tradingStatistics = null; // статистика торговли

    // Система уведомлений
    this.notificationService = null;
    
    // Статистика
    this.systemStartTime = new Date();
    this.lastStatisticsUpdate = new Date();
  }

  /**
   * Установить сервис уведомлений
   */
  setNotificationService(notificationService) {
    this.notificationService = notificationService;
  }

  /**
   * Загрузить отфильтрованные монеты (общая логика)
   */
  async loadFilteredCoins() {
    try {
      let filename = path.join(__dirname, '..', '..', '..', 'data', 'binance-coins.json');
      let data;
      try {
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен список монет, торгующихся на Binance');
      } catch (error) {
        filename = path.join(__dirname, '..', '..', '..', 'data', 'filtered-coins.json');
        data = await fs.readFile(filename, 'utf8');
        console.log('📊 Загружен общий список монет');
      }
      const coinsData = JSON.parse(data);
      this.filteredCoins = coinsData.coins;
      // Выводим meta-информацию если есть
      if (coinsData.meta) {
        console.log('---\nMETA-ИНФО О ВЫБОРКЕ МОНЕТ:');
        console.log(JSON.stringify(coinsData.meta, null, 2));
        console.log('---');
      }
      // Выводим параметры системы
      console.log('---\nТЕКУЩИЕ ПАРАМЕТРЫ СИСТЕМЫ:');
      console.log(JSON.stringify(this.config, null, 2));
      console.log('---');
      console.log(`📊 Загружено ${this.filteredCoins.length} монет для мониторинга`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return false;
    }
  }

  /**
   * Загрузить историю сделок (общая логика)
   */
  async loadTradeHistory() {
    try {
      const filename = path.join(__dirname, '..', '..', '..', 'data', 'trade-history.json');
      const data = await fs.readFile(filename, 'utf8');
      this.tradeHistory = JSON.parse(data);
      
      // Добавить поддержку volumeIncrease для существующих сделок
      this.tradeHistory.forEach(trade => {
        if (!trade.volumeIncrease) {
          trade.volumeIncrease = null; // Установить null для старых сделок
        }
        // Добавить поддержку bezubitok для существующих сделок
        if (trade.bezubitok === undefined) {
          trade.bezubitok = false; // Установить false для старых сделок
        }
      });
      
      console.log(`📊 Загружено ${this.tradeHistory.length} исторических сделок`);
    } catch (error) {
      console.log('📊 История сделок не найдена, создаем новую');
      this.tradeHistory = [];
    }
  }

  /**
   * Загрузить статистику торговли (общая логика)
   */
  async loadTradingStatistics() {
    try {
      const filename = path.join(__dirname, '..', '..', '..', 'data', 'trading-statistics.json');
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
   * Загрузить статистику сигналов (общая логика)
   */
  async loadSignalStatistics() {
    try {
      const filename = path.join(__dirname, '..', '..', '..', 'data', 'signal-statistics.json');
      const data = await fs.readFile(filename, 'utf8');
      this.signalStatistics = JSON.parse(data);
      console.log(`📊 Загружена статистика сигналов (${this.signalStatistics.totalLeads} лидов)`);
    } catch (error) {
      console.log('📊 Статистика сигналов не найдена, создаем новую');
      this.signalStatistics = {
        lastUpdated: new Date().toISOString(),
        totalLeads: 0,
        convertedToTrade: 0,
        averageLeadLifetimeMinutes: 0,
        leads: []
      };
    }
  }

  /**
   * Сохранить статистику торговли (общая логика)
   */
  async saveTradingStatistics() {
    try {
      const dataDir = path.join(__dirname, '..', '..', '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'trading-statistics.json');
      
      // Обновить статистику перед сохранением
      this.updateTradingStatistics();
      
      await fs.writeFile(filename, JSON.stringify(this.tradingStatistics, null, 2));
      
      // Автоматически добавить в Git stage
      try {
        const { stageTradingFiles } = require('../../../scripts/git-stage-trading-files.js');
        stageTradingFiles();
      } catch (error) {
        console.log('ℹ️ Git stage не выполнен:', error.message);
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения статистики торговли:', error.message);
    }
  }

  /**
   * Сохранить статистику сигналов (общая логика)
   */
  async saveSignalStatistics() {
    try {
      const dataDir = path.join(__dirname, '..', '..', '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'signal-statistics.json');
      
      // Обновить статистику перед сохранением
      this.updateSignalStatistics();
      
      await fs.writeFile(filename, JSON.stringify(this.signalStatistics, null, 2));
      
      // Автоматически добавить в Git stage
      try {
        const { stageTradingFiles } = require('../../../scripts/git-stage-trading-files.js');
        stageTradingFiles();
      } catch (error) {
        console.log('ℹ️ Git stage не выполнен:', error.message);
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения статистики сигналов:', error.message);
    }
  }

  /**
   * Сохранить историю сделок (общая логика)
   */
  async saveTradeHistory() {
    try {
      const dataDir = path.join(__dirname, '..', '..', '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'trade-history.json');
      await fs.writeFile(filename, JSON.stringify(this.tradeHistory, null, 2));
      
      // Автоматически добавить в Git stage
      try {
        const { stageTradingFiles } = require('../../../scripts/git-stage-trading-files.js');
        stageTradingFiles();
      } catch (error) {
        console.log('ℹ️ Git stage не выполнен:', error.message);
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения истории сделок:', error.message);
    }
  }

  /**
   * Сохранить pending anomalies (общая логика)
   */
  async savePendingAnomalies() {
    try {
      const dataDir = path.join(__dirname, '..', '..', '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'pending-anomalies.json');
      const anomaliesData = Array.from(this.pendingAnomalies.entries()).map(([symbol, anomaly]) => ({
        symbol,
        ...anomaly
      }));
      await fs.writeFile(filename, JSON.stringify(anomaliesData, null, 2));
      
      // Автоматически добавить в Git stage
      try {
        const { stageTradingFiles } = require('../../../scripts/git-stage-trading-files.js');
        stageTradingFiles();
      } catch (error) {
        console.log('ℹ️ Git stage не выполнен:', error.message);
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения pending anomalies:', error.message);
    }
  }

  /**
   * Загрузить pending anomalies (общая логика)
   */
  async loadPendingAnomalies() {
    try {
      const filename = path.join(__dirname, '..', '..', '..', 'data', 'pending-anomalies.json');
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
          watchlistTime: anomaly.watchlistTime,
          currentVolume: anomaly.currentVolume || null, // Добавляем поддержку currentVolume
          volumeLeverage: anomaly.volumeLeverage || null, // Leverage объема
          maxPrice: anomaly.maxPrice || null, // Максимальная цена в watchlist
          minPrice: anomaly.minPrice || null, // Минимальная цена в watchlist
          entryLevel: anomaly.entryLevel || null, // Уровень входа
          cancelLevel: anomaly.cancelLevel || null, // Уровень отмены
          isConsolidated: anomaly.isConsolidated || false, // Флаг консолидации
          closePrice: anomaly.closePrice || null // Цена закрытия аномальной свечи
        });
      });
      console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies`);
    } catch (error) {
      console.log('📊 Pending anomalies не найдены, создаем новые');
      this.pendingAnomalies = new Map();
    }
  }

  /**
   * Загрузить активные сделки (общая логика)
   */
  async loadActiveTrades() {
    try {
      const filename = path.join(__dirname, '..', '..', '..', 'data', 'active-trades.json');
      const data = await fs.readFile(filename, 'utf8');
      const tradesData = JSON.parse(data);
      this.activeTrades.clear();
      tradesData.forEach(trade => {
        // Добавить поддержку volumeIncrease для существующих сделок
        if (!trade.volumeIncrease) {
          trade.volumeIncrease = null; // Установить null для старых сделок
        }
        // Добавить поддержку bezubitok для существующих сделок
        if (trade.bezubitok === undefined) {
          trade.bezubitok = false; // Установить false для старых сделок
        }
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
   * Сохранить активные сделки (общая логика)
   */
  async saveActiveTrades() {
    try {
      const dataDir = path.join(__dirname, '..', '..', '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const filename = path.join(dataDir, 'active-trades.json');
      const tradesData = Array.from(this.activeTrades.values());
      await fs.writeFile(filename, JSON.stringify(tradesData, null, 2));
      
      // Автоматически добавить в Git stage
      try {
        const { stageTradingFiles } = require('../../../scripts/git-stage-trading-files.js');
        stageTradingFiles();
      } catch (error) {
        console.log('ℹ️ Git stage не выполнен:', error.message);
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения активных сделок:', error.message);
    }
  }

  /**
   * Рассчитать среднюю цену (общая логика)
   */
  calculateAveragePrice(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalPrice = candles.reduce((sum, candle) => {
      return sum + (candle[1] + candle[4]) / 2; // (open + close) / 2
    }, 0);
    
    return totalPrice / candles.length;
  }

  /**
   * Рассчитать средний объем (общая логика)
   */
  calculateAverageVolume(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalVolume = candles.reduce((sum, candle) => sum + candle[5], 0);
    return totalVolume / candles.length;
  }

  /**
   * Обнаружить аномалию объема (общая логика)
   */
  detectVolumeAnomaly(currentVolume, historicalVolume) {
    return currentVolume > historicalVolume * this.config.volumeThreshold;
  }

  /**
   * Проверить cooldown для аномалий (общая логика)
   */
  isAnomalyOnCooldown(symbol) {
    const cooldownTime = this.anomalyCooldowns.get(symbol);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    const cooldownDuration = this.config.anomalyCooldown * 15 * 60 * 1000; // 4 TF * 15 минут
    return (now - cooldownTime) < cooldownDuration;
  }

  /**
   * Установить cooldown для аномалий (общая логика)
   */
  setAnomalyCooldown(symbol) {
    this.anomalyCooldowns.set(symbol, Date.now());
  }

  /**
   * Определить тип сделки на основе изменения цены (общая логика)
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
   * Проверить консолидацию свечи (общая логика)
   * Этап 2: подтверждение консолидации
   */
  checkConsolidation(candle) {
    const high = candle[2]; // High
    const low = candle[3];  // Low
    const consolidationRange = (high - low) / low;
    
    console.log(`🔍 Проверка консолидации: High=${high}, Low=${low}, Range=${(consolidationRange * 100).toFixed(2)}%`);
    
    // Консолидация подтвердилась, если разница между High и Low меньше 2%
    // Если разница >= 2%, то консолидация НЕ подтвердилась
    const isConsolidated = consolidationRange < this.config.consolidationThreshold;
    
    if (isConsolidated) {
      console.log(`✅ Консолидация подтвердилась (диапазон < ${(this.config.consolidationThreshold * 100).toFixed(1)}%)`);
    } else {
      console.log(`❌ Консолидация не подтвердилась (диапазон >= ${(this.config.consolidationThreshold * 100).toFixed(1)}%)`);
    }
    
    return isConsolidated;
  }

  /**
   * Рассчитать уровни входа и отмены (общая логика)
   * Этап 3: определение сетапа и триггеров
   */
  calculateEntryLevels(closePrice, tradeType) {
    let entryLevel, cancelLevel;
    
    if (tradeType === 'Long') {
      entryLevel = closePrice * (1 + this.config.entryLevelPercent);
      cancelLevel = closePrice * (1 - this.config.cancelLevelPercent);
    } else { // Short
      entryLevel = closePrice * (1 - this.config.entryLevelPercent);
      cancelLevel = closePrice * (1 + this.config.cancelLevelPercent);
    }
    
    console.log(`📊 Уровни для ${tradeType}:`);
    console.log(`   🎯 Вход: $${entryLevel.toFixed(6)}`);
    console.log(`   ❌ Отмена: $${cancelLevel.toFixed(6)}`);
    
    return { entryLevel, cancelLevel };
  }

  /**
   * Проверить условия входа или отмены (общая логика)
   * Этап 4: подтверждение точки входа или отмена
   */
  checkEntryConditions(currentPrice, entryLevel, cancelLevel, tradeType) {
    console.log(`🔍 Проверка условий входа для ${tradeType}:`);
    console.log(`   🎯 Уровень входа: $${entryLevel}`);
    console.log(`   ❌ Уровень отмены: $${cancelLevel}`);
    
    if (tradeType === 'Long') {
      if (currentPrice > entryLevel) {
        console.log(`✅ Условие входа для Long выполнено!`);
        return 'entry';
      } else if (currentPrice < cancelLevel) {
        console.log(`❌ Условие отмены для Long выполнено!`);
        return 'cancel';
      }
    } else { // Short
      if (currentPrice < entryLevel) {
        console.log(`✅ Условие входа для Short выполнено!`);
        return 'entry';
      } else if (currentPrice > cancelLevel) {
        console.log(`❌ Условие отмены для Short выполнено!`);
        return 'cancel';
      }
    }
    
    console.log(`⏳ Условия не выполнены, ожидание...`);
    return 'wait';
  }

  /**
   * Проверить таймаут подтверждения входа (общая логика)
   */
  checkEntryTimeout(anomaly) {
    const watchlistTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
    const timeInWatchlist = Date.now() - watchlistTime.getTime();
    const minutesInWatchlist = Math.floor(timeInWatchlist / (15 * 60 * 1000));
    
    console.log(`⏰ Время в watchlist: ${minutesInWatchlist} TF из ${this.config.entryConfirmationTFs}`);
    
    return minutesInWatchlist >= this.config.entryConfirmationTFs;
  }

  /**
   * Проверить и установить режим безубытка (общая логика)
   */
  checkAndSetBezubitok(trade, currentPrice) {
    if (trade.bezubitok) {
      return; // Уже в режиме безубытка
    }

    // Рассчитать прогресс к тейк-профиту
    let progressToTakeProfit = 0;
    if (trade.type === 'Long') {
      progressToTakeProfit = ((currentPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
    } else { // Short
      progressToTakeProfit = ((trade.entryPrice - currentPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
    }

    // Ограничить прогресс от 0 до 100%
    progressToTakeProfit = Math.max(0, Math.min(100, progressToTakeProfit));

    // Если достигли 20% прогресса к тейк-профиту
    if (progressToTakeProfit >= 20) {
      trade.bezubitok = true;
      
      // Пересчитать стоп-лосс для режима безубытка (+6% от цены входа)
      const bezubitokStopLossPercent = 0.06; // 6%
      if (trade.type === 'Long') {
        trade.stopLoss = trade.entryPrice * (1 + bezubitokStopLossPercent);
      } else { // Short
        trade.stopLoss = trade.entryPrice * (1 - bezubitokStopLossPercent);
      }

      console.log(`🟢 ${trade.symbol} переведен в режим безубытка!`);
      console.log(`   📊 Прогресс к тейк-профиту: ${progressToTakeProfit.toFixed(1)}%`);
      console.log(`   🛑 Новый стоп-лосс: $${trade.stopLoss.toFixed(6)}`);
      
      // Отправить уведомление о переходе в безубыток
      this.sendBezubitokNotification(trade, progressToTakeProfit).catch(error => {
        console.error(`❌ Ошибка отправки уведомления о безубытке для ${trade.symbol}:`, error.message);
      });
    }
  }

  /**
   * Создать виртуальную сделку (общая логика)
   */
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null, currentVolume = null, entryLevel = null, cancelLevel = null) {
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
      currentVolume: currentVolume, // Добавляем текущий объем свечи
      volumeIncrease: null, // Увеличение объема в разах (будет установлено позже)
      entryLevel: entryLevel, // Уровень входа для отслеживания
      cancelLevel: cancelLevel, // Уровень отмены для отслеживания
      bezubitok: false // Режим безубытка
    };

    this.activeTrades.set(symbol, trade);
    this.watchlist.add(symbol);
    
    console.log(`💰 Создана виртуальная сделка ${tradeType} для ${symbol} по цене $${entryPrice.toFixed(6)}`);
    
    // Отправить уведомление о новой сделке
    this.sendNewTradeNotification(trade).catch(error => {
      console.error(`❌ Ошибка отправки уведомления о новой сделке для ${symbol}:`, error.message);
    });
    
    return trade;
  }

  /**
   * Закрыть сделку (общая логика)
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

    // Сохранить историю и статистику
    await this.saveTradeHistory();
    await this.saveTradingStatistics();

    console.log(`🔒 Закрыта сделка ${trade.type} для ${trade.symbol}: ${profitLoss.toFixed(2)}% (${reason})`);
    
    // Отправить уведомление
    await this.sendTradeNotification(trade);
  }

  /**
   * Отправить уведомление о сделке (общая логика)
   */
  async sendTradeNotification(trade) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createTradeNotificationMessage(trade);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление о сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о сделке (общая логика)
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
    
    // Рассчитать прогресс тейк-профита для закрытой сделки
    let takeProfitProgress = 0;
    if (trade.type === 'Long') {
      takeProfitProgress = ((trade.exitPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
    } else {
      // Для Short сделок логика обратная
      takeProfitProgress = ((trade.entryPrice - trade.exitPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
    }
    
    // Ограничить прогресс от 0 до 100%
    takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
    
    // Добавить информацию о безубытке
    const bezubitokInfo = trade.bezubitok ? '\n🟢 БЕЗУБЫТОК: Да' : '';
    
    return `${symbol} → ${trade.type} ${emoji} ЗАКРЫТА
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время закрытия: ${closeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
💰 Выход: $${trade.exitPrice.toFixed(6)}
📊 Результат: ${profitLossText}
🎯 Тейк: $${trade.takeProfit.toFixed(6)} (${takeProfitProgress.toFixed(0)}% прогресс)
📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease}x` : 'N/A'}
⏱️ Длительность: ${Math.round(trade.duration / 1000 / 60)} минут
🎯 Причина: ${reasonText}${bezubitokInfo}

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Общая прибыль: ${stats.totalProfit}%
• Активных сделок: ${this.activeTrades.size}`;
  }

  /**
   * Получить текущую статистику (общая логика)
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
   * Обновить статистику торговли (общая логика)
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
   * Добавить запись о лиде в статистику
   */
  addLeadRecord(anomaly, outcome, converted) {
    if (!this.signalStatistics) {
      this.signalStatistics = {
        leads: [],
        totalLeads: 0,
        convertedToTrade: 0,
        averageLeadLifetimeMinutes: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    const leadTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
    const now = new Date();
    const lifetimeMinutes = Math.round((now - leadTime) / (1000 * 60));

    const leadRecord = {
      symbol: anomaly.symbol,
      anomalyId: anomaly.anomalyId,
      tradeType: anomaly.tradeType,
      volumeLeverage: anomaly.volumeLeverage,
      outcome: outcome, // 'consolidation', 'entry', 'cancel', 'timeout'
      converted: converted,
      watchlistTime: anomaly.watchlistTime,
      lifetimeMinutes: lifetimeMinutes,
      createdAt: new Date().toISOString()
    };

    this.signalStatistics.leads.push(leadRecord);
    this.updateSignalStatistics();
    
    console.log(`📊 Лид ${anomaly.symbol} добавлен в статистику: ${outcome} (${converted ? 'конвертирован' : 'не конвертирован'})`);
  }

  /**
   * Обновить статистику сигналов
   */
  updateSignalStatistics() {
    if (!this.signalStatistics || this.signalStatistics.leads.length === 0) return;

    const totalLeads = this.signalStatistics.leads.length;
    const convertedLeads = this.signalStatistics.leads.filter(lead => lead.converted).length;
    
    // Рассчитать среднее время жизни
    const totalLifetime = this.signalStatistics.leads.reduce((sum, lead) => sum + lead.lifetimeMinutes, 0);
    const averageLifetime = totalLifetime / totalLeads;

    this.signalStatistics = {
      ...this.signalStatistics,
      lastUpdated: new Date().toISOString(),
      totalLeads,
      convertedToTrade: convertedLeads,
      averageLeadLifetimeMinutes: Math.round(averageLifetime * 10) / 10
    };
  }

  /**
   * Показать статистику торговли
   */
  showStatistics() {
    console.log('\n📊 СТАТИСТИКА ТОРГОВЛИ:');
    console.log(`📈 Всего сделок: ${this.tradeHistory.length}`);
    console.log(`💰 Активных сделок: ${this.activeTrades.size}`);
    console.log(`📋 В watchlist: ${this.pendingAnomalies.size}`);
    
    if (this.tradingStatistics) {
      const winRate = this.tradingStatistics.winRate || 0;
      const totalProfit = this.tradingStatistics.totalProfit || 0;
      console.log(`🎯 Винрейт: ${winRate}%`);
      console.log(`💰 Общая прибыль: ${totalProfit}%`);
    }

    // Статистика сигналов
    if (this.signalStatistics) {
      console.log('\n📊 СТАТИСТИКА СИГНАЛОВ:');
      console.log(`📈 Всего лидов: ${this.signalStatistics.totalLeads}`);
      console.log(`✅ Конвертировано в сделки: ${this.signalStatistics.convertedToTrade}`);
      console.log(`⏱️ Среднее время жизни лида: ${this.signalStatistics.averageLeadLifetimeMinutes} мин`);
      
      if (this.signalStatistics.totalLeads > 0) {
        const conversionRate = ((this.signalStatistics.convertedToTrade / this.signalStatistics.totalLeads) * 100).toFixed(1);
        console.log(`📊 Конверсия: ${conversionRate}%`);
      }
    }
  }

  /**
   * Отправить уведомление о новой сделке (общая логика)
   */
  async sendNewTradeNotification(trade) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createNewTradeMessage(trade);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление о новой сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о новой сделке (общая логика)
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
🎯 Тейк: $${takeProfit.toFixed(6)} (0% прогресс)
💵 Виртуальная сумма: $${trade.virtualAmount}
📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease.toFixed(1)}x` : 'N/A'}

💡 БЕЗУБЫТОК: При достижении 20% прогресса к тейк-профиту
🛑 стоп-лосс автоматически изменится на +6% от цены входа

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Активных сделок: ${this.activeTrades.size}`;
  }

  /**
   * Отправить уведомление о существующих сделках при запуске (общая логика)
   */
  async sendExistingTradesNotification() {
    try {
      if (!this.notificationService) return;
      
      const message = this.createExistingTradesMessage();
      await this.notificationService.sendTelegramMessage(message);
      console.log('📱 Уведомление о существующих сделках отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о существующих сделках:', error.message);
    }
  }

  /**
   * Отправить уведомление о переходе в безубыток (общая логика)
   */
  async sendBezubitokNotification(trade, progressToTakeProfit) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createBezubitokMessage(trade, progressToTakeProfit);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление о переходе в безубыток отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о безубытке:', error.message);
    }
  }

  /**
   * Создать сообщение о переходе в безубыток (общая логика)
   */
  createBezubitokMessage(trade, progressToTakeProfit) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    
    // Форматировать время перехода в безубыток
    const bezubitokTime = new Date().toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `🟢 БЕЗУБЫТОК: ${symbol} → ${trade.type} ${emoji}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время: ${bezubitokTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
📈 Текущая цена: $${trade.lastPrice.toFixed(6)}
📊 Прогресс к тейк-профиту: ${progressToTakeProfit.toFixed(1)}%
🛑 Новый стоп-лосс: $${trade.stopLoss.toFixed(6)} (+6% от входа)

💡 Сделка переведена в режим безубытка!
🎯 Теперь стоп-лосс гарантирует прибыль в 6%`;
  }

  /**
   * Создать сообщение о существующих сделках (общая логика)
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
        
        // Рассчитать прогресс тейк-профита по формуле: (текущая - вход)/(тейк-вход)*100
        let takeProfitProgress = 0;
        if (trade.type === 'Long') {
          takeProfitProgress = ((lastPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
        } else {
          // Для Short сделок логика обратная
          takeProfitProgress = ((trade.entryPrice - lastPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
        }
        
        // Ограничить прогресс от 0 до 100%
        takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
        
        // Определить иконку прогресса
        const progressEmoji = takeProfitProgress > 0 ? '🟢' : '⚪';
        
        // Добавить индикатор безубытка
        const bezubitokIndicator = trade.bezubitok ? ' 🟢 БЕЗУБЫТОК' : '';
        
        message += `• ${symbol} ${changeEmoji}${bezubitokIndicator}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `  📊 Прогресс: ${progressEmoji} ${takeProfitProgress.toFixed(0)}%\n`;
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
        
        // Рассчитать прогресс тейк-профита по формуле: (текущая - вход)/(тейк-вход)*100
        let takeProfitProgress = 0;
        if (trade.type === 'Long') {
          takeProfitProgress = ((lastPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
        } else {
          // Для Short сделок логика обратная
          takeProfitProgress = ((trade.entryPrice - lastPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
        }
        
        // Ограничить прогресс от 0 до 100%
        takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
        
        // Определить иконку прогресса
        const progressEmoji = takeProfitProgress > 0 ? '🟢' : '⚪';
        
        // Добавить индикатор безубытка
        const bezubitokIndicator = trade.bezubitok ? ' 🟢 БЕЗУБЫТОК' : '';
        
        message += `• ${symbol} ${changeEmoji}${bezubitokIndicator}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `  📊 Прогресс: ${progressEmoji} ${takeProfitProgress.toFixed(0)}%\n`;
        message += `  📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease}x` : 'N/A'}\n`;
        message += `  ⏰ Обновлено: ${lastUpdateTime}\n\n`;
      });
    }
    
    message += `💡 Система мониторит эти сделки в реальном времени`;
    
    return message;
  }

  /**
   * Абстрактные методы для переопределения в наследниках
   */
  
  /**
   * Инициализация системы (абстрактный метод)
   */
  async initialize() {
    // Загрузить данные (используем методы базового класса)
    const loaded = await this.loadFilteredCoins();
    if (!loaded) {
      throw new Error('Не удалось загрузить список монет');
    }

    await this.loadTradeHistory();
    await this.loadTradingStatistics();
    await this.loadSignalStatistics();
    await this.loadPendingAnomalies();
    await this.loadActiveTrades();

    console.log('✅ Система инициализирована');
  }

  /**
   * Запуск системы (абстрактный)
   */
  async start() {
    throw new Error('Метод start() должен быть переопределен в наследнике');
  }

  /**
   * Остановка системы (абстрактный)
   */
  async stop() {
    throw new Error('Метод stop() должен быть переопределен в наследнике');
  }

  /**
   * Проверка аномалий (абстрактный)
   */
  async checkAnomalies(coin) {
    throw new Error('Метод checkAnomalies() должен быть переопределен в наследнике');
  }

  /**
   * Проверка pending anomalies (абстрактный)
   */
  async checkPendingAnomalies() {
    throw new Error('Метод checkPendingAnomalies() должен быть переопределен в наследнике');
  }

  /**
   * Отслеживание активных сделок (абстрактный)
   */
  async trackActiveTrades() {
    throw new Error('Метод trackActiveTrades() должен быть переопределен в наследнике');
  }

  /**
   * Отправить уведомление о добавлении в pending anomalies
   */
  async sendPendingAnomalyAddedNotification(anomaly) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createPendingAnomalyAddedMessage(anomaly);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление о добавлении в pending anomalies отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о добавлении в pending:', error.message);
    }
  }

  /**
   * Создать сообщение о добавлении в pending anomalies
   */
  createPendingAnomalyAddedMessage(anomaly) {
    const symbol = anomaly.symbol.replace('/USDT', '');
    const emoji = anomaly.tradeType === 'Long' ? '🟢' : '🔴';
    const leverageText = anomaly.volumeLeverage ? `${anomaly.volumeLeverage.toFixed(1)}x` : 'N/A';
    
    // Получить статистику pending anomalies
    const pendingStats = this.getPendingAnomaliesStats();
    
    return `📋 ДОБАВЛЕНА В PENDING ANOMALIES: ${symbol} → ${anomaly.tradeType} ${emoji}

🚨 Аномалия объема: ${leverageText}
🆔 ID: ${anomaly.anomalyId || 'N/A'}
⏰ Время обнаружения: ${new Date(anomaly.anomalyTime).toLocaleString('ru-RU')}
💰 Цена аномалии: $${anomaly.anomalyPrice?.toFixed(6) || 'N/A'}

📊 СТАТИСТИКА PENDING ANOMALIES:
• Всего в ожидании: ${pendingStats.total}
• Long: ${pendingStats.longCount} 🟢
• Short: ${pendingStats.shortCount} 🔴
• Средний leverage: ${pendingStats.avgLeverage}x

💡 Монета будет мониториться каждые 30 секунд для подтверждения входа`;
  }

  /**
   * Отправить уведомление об удалении из pending anomalies
   */
  async sendPendingAnomalyRemovedNotification(symbol, reason, anomaly = null) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createPendingAnomalyRemovedMessage(symbol, reason, anomaly);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление об удалении из pending anomalies отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления об удалении из pending:', error.message);
    }
  }

  /**
   * Создать сообщение об удалении из pending anomalies
   */
  createPendingAnomalyRemovedMessage(symbol, reason, anomaly = null) {
    const symbolName = symbol.replace('/USDT', '');
    const reasonText = this.getRemovalReasonText(reason);
    const emoji = reason === 'converted_to_trade' ? '💰' : '❌';
    
    // Получить статистику pending anomalies
    const pendingStats = this.getPendingAnomaliesStats();
    
    let message = `${emoji} УДАЛЕНА ИЗ PENDING ANOMALIES: ${symbolName}

📋 Причина: ${reasonText}
⏰ Время удаления: ${new Date().toLocaleString('ru-RU')}`;

    if (anomaly) {
      const leverageText = anomaly.volumeLeverage ? `${anomaly.volumeLeverage.toFixed(1)}x` : 'N/A';
      const watchlistTime = anomaly.watchlistTime ? new Date(anomaly.watchlistTime).toLocaleString('ru-RU') : 'N/A';
      
      message += `\n\n📊 ДЕТАЛИ АНОМАЛИИ:
• Тип: ${anomaly.tradeType || 'N/A'}
• Leverage: ${leverageText}
• Время в watchlist: ${watchlistTime}
• ID: ${anomaly.anomalyId || 'N/A'}`;
    }

    message += `\n\n📊 ОБНОВЛЕННАЯ СТАТИСТИКА PENDING:
• Всего в ожидании: ${pendingStats.total}
• Long: ${pendingStats.longCount} 🟢
• Short: ${pendingStats.shortCount} 🔴
• Средний leverage: ${pendingStats.avgLeverage}x`;

    return message;
  }

  /**
   * Получить текст причины удаления
   */
  getRemovalReasonText(reason) {
    const reasons = {
      'converted_to_trade': 'Конвертирована в сделку 💰',
      'timeout': 'Таймаут ожидания ⏰',
      'consolidation': 'Консолидация цены 📊',
      'removed': 'Удалена вручную ❌',
      'cancel_level_hit': 'Достигнут уровень отмены 🚫'
    };
    return reasons[reason] || 'Неизвестная причина';
  }

  /**
   * Получить статистику pending anomalies
   */
  getPendingAnomaliesStats() {
    if (!this.pendingAnomalies) {
      return { total: 0, longCount: 0, shortCount: 0, avgLeverage: 0 };
    }

    const anomalies = Array.from(this.pendingAnomalies.values());
    const longCount = anomalies.filter(a => a.tradeType === 'Long').length;
    const shortCount = anomalies.filter(a => a.tradeType === 'Short').length;
    
    const totalLeverage = anomalies.reduce((sum, a) => sum + (a.volumeLeverage || 0), 0);
    const avgLeverage = anomalies.length > 0 ? (totalLeverage / anomalies.length).toFixed(1) : 0;

    return {
      total: anomalies.length,
      longCount,
      shortCount,
      avgLeverage
    };
  }

  /**
   * Отправить уведомление о входе в сделку с обоснованием
   */
  async sendTradeEntryNotification(trade, anomaly = null) {
    try {
      if (!this.notificationService) return;
      
      const message = this.createTradeEntryMessage(trade, anomaly);
      await this.notificationService.sendTelegramMessage(message);
      console.log('✅ Уведомление о входе в сделку с обоснованием отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о входе в сделку:', error.message);
    }
  }

  /**
   * Создать сообщение о входе в сделку с обоснованием
   */
  createTradeEntryMessage(trade, anomaly = null) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const leverageText = anomaly?.volumeLeverage ? `${anomaly.volumeLeverage.toFixed(1)}x` : 'N/A';
    
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

    let message = `💰 ВХОД В СДЕЛКУ: ${symbol} → ${trade.type} ${emoji}

📋 ОБОСНОВАНИЕ ВХОДА:
• Аномалия объема: ${leverageText}
• Подтверждение движения: ✅
• Время в watchlist: ${anomaly ? this.getWatchlistDuration(anomaly) : 'N/A'}
• ID аномалии: ${anomaly?.anomalyId || trade.anomalyId || 'N/A'}

💰 ПАРАМЕТРЫ СДЕЛКИ:
• Вход: $${trade.entryPrice.toFixed(6)}
• Стоп: $${trade.stopLoss.toFixed(6)}
• Тейк: $${trade.takeProfit.toFixed(6)}
• Виртуальная сумма: $${trade.virtualAmount}
• Время входа: ${tradeTime}

💡 БЕЗУБЫТОК: При достижении 20% прогресса к тейк-профиту
🛑 стоп-лосс автоматически изменится на +6% от цены входа

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Активных сделок: ${this.activeTrades.size}`;

    return message;
  }

  /**
   * Получить продолжительность нахождения в watchlist
   */
  getWatchlistDuration(anomaly) {
    if (!anomaly.watchlistTime) return 'N/A';
    
    const watchlistTime = new Date(anomaly.watchlistTime);
    const now = new Date();
    const durationMs = now - watchlistTime;
    const durationMinutes = Math.round(durationMs / (1000 * 60));
    
    if (durationMinutes < 1) return '< 1 минуты';
    if (durationMinutes < 60) return `${durationMinutes} мин`;
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}ч ${minutes}м`;
  }
}

module.exports = { VirtualTradingBaseService }; 