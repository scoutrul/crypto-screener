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
  entryConfirmationTFs: 2 // 2 TF для подтверждения точки входа
};

class VirtualTradingSystem {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.filteredCoins = [];
    this.activeTrades = new Map(); // symbol -> trade object
    this.watchlist = new Set(); // символы в watchlist
    this.anomalyCooldowns = new Map(); // symbol -> timestamp
    this.pendingAnomalies = new Map(); // symbol -> anomaly object
    this.tradeHistory = []; // история всех сделок
    this.tradingStatistics = null; // статистика торговли
    this.app = null;
    
    // Интервалы для разных потоков (WebSocket-готовые)
    this.anomalyCheckInterval = null;      // Поток 1: 5 минут
    this.pendingCheckInterval = null;      // Поток 2: 1 минута  
    this.activeTradesInterval = null;      // Поток 3: 30 секунд
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
   * Загрузить статистику торговли
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
   * Сохранить статистику торговли
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
   * Сохранить pending anomalies
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
   * Загрузить pending anomalies
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
          currentVolume: anomaly.currentVolume || null // Добавляем поддержку currentVolume
        });
      });
      console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies`);
    } catch (error) {
      console.log('📊 Pending anomalies не найдены, создаем новые');
      this.pendingAnomalies = new Map();
    }
  }

  /**
   * Загрузить активные сделки
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
   * Сохранить активные сделки
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
      const requiredCandles = CONFIG.historicalWindow + CONFIG.entryConfirmationTFs;
      const candles = await this.fetchCandles(symbol, since, Math.max(requiredCandles, 20), 3);
      
      if (candles.length < requiredCandles) {
        console.log(`⚠️ Недостаточно данных для подтверждения ${symbol} (получено ${candles.length}/${requiredCandles})`);
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
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null, currentVolume = null) {
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
      lastUpdateTime: new Date().toISOString(),
      currentVolume: currentVolume // Добавляем текущий объем свечи
    };

    this.activeTrades.set(symbol, trade);
    this.watchlist.add(symbol);
    
    console.log(`💰 Создана виртуальная сделка ${tradeType} для ${symbol} по цене $${entryPrice.toFixed(6)}`);
    return trade;
  }

  /**
   * Проверить pending anomalies для подтверждения точки входа
   */
  async checkPendingAnomalies() {
    const symbolsToRemove = [];
    
    for (const [symbol, anomaly] of this.pendingAnomalies) {
      try {
        console.log(`🔍 Проверяем pending anomaly для ${symbol}...`);
        
        // Получить свечи с момента аномалии + дополнительные 2 свечи
        const anomalyTime = new Date(anomaly.anomalyTime);
        const timeSinceAnomaly = Date.now() - anomalyTime.getTime();
        const minutesSinceAnomaly = Math.floor(timeSinceAnomaly / (15 * 60 * 1000));
        
        // Проверить таймаут watchlist (4 TF = 1 час)
        const watchlistTime = new Date(anomaly.watchlistTime || anomaly.anomalyTime);
        const timeInWatchlist = Date.now() - watchlistTime.getTime();
        const minutesInWatchlist = Math.floor(timeInWatchlist / (15 * 60 * 1000));
        
        if (minutesInWatchlist >= 4) { // 4 TF = 1 час
          console.log(`⏰ ${symbol} в watchlist слишком долго (${minutesInWatchlist} TF = ${Math.floor(minutesInWatchlist / 4)} часов), удаляем из watchlist`);
          symbolsToRemove.push(symbol);
          continue;
        }
        
        // Нам нужно: 8 свечей (historical) + свечи с момента аномалии + 2 свечи для подтверждения
        const totalCandlesNeeded = CONFIG.historicalWindow + minutesSinceAnomaly + CONFIG.entryConfirmationTFs;
        
        console.log(`   📊 Время с аномалии: ${minutesSinceAnomaly} минут`);
        console.log(`   📊 Нужно свечей: ${totalCandlesNeeded} (8 исторических + ${minutesSinceAnomaly} с аномалии + 2 для подтверждения)`);
        
        const since = anomalyTime.getTime() - (CONFIG.historicalWindow * 15 * 60 * 1000);
        const candles = await this.fetchCandles(symbol, since, Math.max(totalCandlesNeeded, 30), 3);
        
        if (candles.length < totalCandlesNeeded) {
          console.log(`⚠️ Недостаточно данных для ${symbol} (получено ${candles.length}/${totalCandlesNeeded})`);
          // Проверим, может быть у нас все равно достаточно свечей для подтверждения
          if (candles.length >= CONFIG.historicalWindow + CONFIG.entryConfirmationTFs) {
            console.log(`   🔍 Продолжаем с доступными данными...`);
          } else {
            continue;
          }
        }

        // Найти свечи после аномалии
        const anomalyCandleTime = anomalyTime.getTime();
        let anomalyCandleIndex = -1;
        
        for (let i = 0; i < candles.length; i++) {
          if (candles[i][0] >= anomalyCandleTime) {
            anomalyCandleIndex = i;
            break;
          }
        }
        
        if (anomalyCandleIndex === -1) {
          // Если не найдена точная свеча, попробуем найти ближайшую
          console.log(`⚠️ Точная свеча аномалии не найдена для ${symbol}, ищем ближайшую...`);
          
          // Найти свечу, которая ближе всего к времени аномалии
          let closestIndex = 0;
          let closestDiff = Math.abs(candles[0][0] - anomalyCandleTime);
          
          for (let i = 1; i < candles.length; i++) {
            const diff = Math.abs(candles[i][0] - anomalyCandleTime);
            if (diff < closestDiff) {
              closestDiff = diff;
              closestIndex = i;
            }
          }
          
          // Если разница не больше 15 минут, используем эту свечу
          if (closestDiff <= 15 * 60 * 1000) {
            anomalyCandleIndex = closestIndex;
            console.log(`   ✅ Найдена ближайшая свеча на индексе ${anomalyCandleIndex}`);
          } else {
            console.log(`⚠️ Не найдена подходящая свеча для ${symbol}`);
            symbolsToRemove.push(symbol);
            continue;
          }
        }

        // Проверить, есть ли достаточно свечей после аномалии
        const candlesAfterAnomaly = candles.length - anomalyCandleIndex - 1;
        
        console.log(`   📊 Свечей после аномалии: ${candlesAfterAnomaly} (нужно ${CONFIG.entryConfirmationTFs})`);
        
        if (candlesAfterAnomaly < CONFIG.entryConfirmationTFs) {
          console.log(`⏳ Ожидаем еще ${CONFIG.entryConfirmationTFs - candlesAfterAnomaly} свечей для ${symbol}`);
          continue;
        }

        // Проверить подтверждение точки входа
        const confirmationCandles = candles.slice(anomalyCandleIndex + 1, anomalyCandleIndex + 1 + CONFIG.entryConfirmationTFs);
        const firstPrice = this.calculateAveragePrice([confirmationCandles[0]]);
        const lastPrice = this.calculateAveragePrice([confirmationCandles[confirmationCandles.length - 1]]);
        const priceDiff = (lastPrice - firstPrice) / firstPrice;

        let entryConfirmed = false;
        
        if (anomaly.tradeType === 'Long' && priceDiff > CONFIG.priceThreshold) {
          entryConfirmed = true;
        } else if (anomaly.tradeType === 'Short' && priceDiff < -CONFIG.priceThreshold) {
          entryConfirmed = true;
        }

        if (entryConfirmed) {
          console.log(`✅ Точка входа подтверждена для ${symbol}!`);
          
          // Создать виртуальную сделку
          const currentPrice = this.calculateAveragePrice([candles[candles.length - 1]]);
          const currentVolume = candles[candles.length - 1][5]; // Объем текущей свечи
          const trade = this.createVirtualTrade(symbol, anomaly.tradeType, currentPrice, anomaly.anomalyId, currentVolume);
          
          // Установить cooldown
          this.setAnomalyCooldown(symbol);
          
          // Отправить уведомление
          await this.sendNewTradeNotification(trade);
          
          // Удалить из watchlist (переместить в trade list)
          symbolsToRemove.push(symbol);
          console.log(`✅ ${symbol} перемещен из watchlist в trade list`);
        } else {
          console.log(`❌ Подтверждение не получено для ${symbol} (изменение: ${(priceDiff * 100).toFixed(2)}%)`);
          
          // // Отправить уведомление о том, что подтверждение не получено
          // await this.sendWatchlistUpdateNotification(symbol, anomaly.tradeType, priceDiff);
          
          // НЕ удаляем из pending - оставляем для дальнейшего мониторинга
          console.log(`📋 ${symbol} остается в watchlist для дальнейшего мониторинга`);
        }

      } catch (error) {
        console.error(`❌ Ошибка проверки pending anomaly для ${symbol}:`, error.message);
        symbolsToRemove.push(symbol);
      }
    }

    // Удалить обработанные аномалии
    symbolsToRemove.forEach(symbol => {
      this.pendingAnomalies.delete(symbol);
    });

    if (symbolsToRemove.length > 0) {
      await this.savePendingAnomalies();
    }
  }

  /**
   * Отслеживать цену активных сделок
   */
  async trackActiveTrades() {
    if (this.activeTrades.size === 0) {
      return; // Нет активных сделок для отслеживания
    }

    console.log(`📊 Отслеживаем ${this.activeTrades.size} активных сделок...`);
    
    for (const [symbol, trade] of this.activeTrades) {
      try {
        const candles = await this.fetchCandles(symbol, Date.now() - 15 * 60 * 1000, 1, 3);
        if (candles.length === 0) {
          console.log(`⚠️ Не удалось получить данные для ${symbol}, пропускаем отслеживание`);
          continue;
        }

        const currentPrice = this.calculateAveragePrice(candles);
        const currentVolume = candles[0][5]; // Объем текущей свечи
        
        // Обновить последнюю цену, время и объем
        trade.lastPrice = currentPrice;
        trade.lastUpdateTime = new Date().toISOString();
        trade.currentVolume = currentVolume; // Обновляем текущий объем

        // Рассчитать текущий P&L
        let currentProfitLoss = 0;
        if (trade.type === 'Long') {
          currentProfitLoss = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        } else { // Short
          currentProfitLoss = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        }

        // Проверить условия закрытия
        let shouldClose = false;
        let closeReason = '';
        let profitLoss = 0;

        if (trade.type === 'Long') {
          if (currentPrice >= trade.takeProfit) {
            shouldClose = true;
            closeReason = 'take_profit';
            profitLoss = currentProfitLoss;
          } else if (currentPrice <= trade.stopLoss) {
            shouldClose = true;
            closeReason = 'stop_loss';
            profitLoss = currentProfitLoss;
          }
        } else { // Short
          if (currentPrice <= trade.takeProfit) {
            shouldClose = true;
            closeReason = 'take_profit';
            profitLoss = currentProfitLoss;
          } else if (currentPrice >= trade.stopLoss) {
            shouldClose = true;
            closeReason = 'stop_loss';
            profitLoss = currentProfitLoss;
          }
        }

        if (shouldClose) {
          console.log(`🔒 Закрываем сделку ${symbol} (${trade.type}): ${profitLoss.toFixed(2)}% - ${closeReason}`);
          await this.closeTrade(trade, currentPrice, closeReason, profitLoss);
        } else {
          console.log(`📈 ${symbol} (${trade.type}): ${currentProfitLoss.toFixed(2)}% | Вход: $${trade.entryPrice.toFixed(6)} | Текущая: $${currentPrice.toFixed(6)}`);
        }

      } catch (error) {
        console.error(`❌ Ошибка отслеживания ${symbol}:`, error.message);
      }
    }

    // Сохранить активные сделки после обновления
    if (this.activeTrades.size > 0) {
      await this.saveActiveTrades();
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
   * Получить текущую статистику
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
   * Обновить статистику торговли
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
   * Показать статистику
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
  }

  /**
   * Проверить аномалии для одной монеты
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
        historicalPrice: avgHistoricalPrice,
        currentVolume: anomalyVolume // Добавляем текущий объем свечи
      });
      
      console.log(`📝 Аномалия ${symbol} добавлена в pending (${tradeType})`);
      
      // Уведомления о добавлении в watchlist отключены
      // await this.sendWatchlistAddedNotification(symbol, tradeType, anomalyId);
      
      await this.savePendingAnomalies();

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
   * Отправить уведомление об обновлении watchlist
   */
  async sendWatchlistUpdateNotification(symbol, tradeType, priceDiff) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createWatchlistUpdateMessage(symbol, tradeType, priceDiff);
      await notificationRepository.sendTelegramMessage(message);
      console.log(`📱 Уведомление о watchlist отправлено для ${symbol}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки уведомления о watchlist для ${symbol}:`, error.message);
    }
  }

  /**
   * Создать сообщение об обновлении watchlist
   */
  createWatchlistUpdateMessage(symbol, tradeType, priceDiff) {
    const symbolName = symbol.replace('/USDT', '');
    const priceChangeText = priceDiff >= 0 ? `+${(priceDiff * 100).toFixed(2)}%` : `${(priceDiff * 100).toFixed(2)}%`;
    const emoji = tradeType === 'Long' ? '🟢' : '🔴';
    
    return `⏳ ${symbolName} → ${tradeType} ${emoji} - ОЖИДАНИЕ

📊 Изменение цены: ${priceChangeText}
🎯 Нужно: ${tradeType === 'Long' ? '>+0.5%' : '<-0.5%'}
⏰ Статус: Ожидаем более сильного движения

💡 Монета остается в watchlist для дальнейшего мониторинга`;
  }

  /**
   * Отправить уведомление о добавлении в watchlist
   */
  async sendWatchlistAddedNotification(symbol, tradeType, anomalyId = null) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createWatchlistAddedMessage(symbol, tradeType, anomalyId);
      await notificationRepository.sendTelegramMessage(message);
      console.log(`📱 Уведомление о добавлении в watchlist отправлено для ${symbol}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки уведомления о добавлении в watchlist для ${symbol}:`, error.message);
    }
  }

  /**
   * Отправить уведомление о существующих сделках при запуске
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
   * Создать сообщение о существующих сделках
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
    
    message += `💡 Система мониторит эти сделки каждые 30 секунд`;
    
    return message;
  }

  /**
   * Создать сообщение о добавлении в watchlist
   */
  createWatchlistAddedMessage(symbol, tradeType, anomalyId = null) {
    const symbolName = symbol.replace('/USDT', '');
    const emoji = tradeType === 'Long' ? '🟢' : '🔴';
    const idText = anomalyId ? `\n🆔 ID: ${anomalyId}` : '';
    
    return `📋 ${symbolName} → ${tradeType} ${emoji} - ДОБАВЛЕН В WATCHLIST${idText}

🚨 Аномалия объема обнаружена
📈 Направление: ${tradeType}
⏰ Ожидаем подтверждения точки входа (2 свечи)

💡 Система будет мониторить движение цены каждые 5 минут`;
  }

  /**
   * Поток 1: Поиск аномалий среди всех монет (5 минут)
   * WebSocket-готовый метод
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
   * Поток 2: Мониторинг watchlist (30 секунд)
   * WebSocket-готовый метод
   */
  async runPendingCheck() {
    if (this.pendingAnomalies.size === 0) {
      return; // Нет монет в watchlist
    }
    
    console.log(`⏳ [ПОТОК 2] Мониторинг ${this.pendingAnomalies.size} монет в watchlist...`);
    await this.checkPendingAnomalies();
    console.log('✅ [ПОТОК 2] Мониторинг watchlist завершен');
  }

  /**
   * Поток 3: Мониторинг trade list (30 секунд)
   * WebSocket-готовый метод
   */
  async runActiveTradesCheck() {
    if (this.activeTrades.size === 0) {
      return; // Нет активных сделок для отслеживания
    }
    
    console.log(`📊 [ПОТОК 3] Мониторинг ${this.activeTrades.size} сделок в trade list...`);
    await this.trackActiveTrades();
    console.log('✅ [ПОТОК 3] Мониторинг trade list завершен');
  }

  /**
   * Запустить мониторинг (устаревший метод - для совместимости)
   */
  async runMonitoring() {
    await this.runAnomalyCheck();
    await this.runPendingCheck();
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
      await this.loadTradingStatistics();
      await this.loadPendingAnomalies();
      await this.loadActiveTrades();

      // Запустить первый цикл всех потоков
      await this.runAnomalyCheck();
      await this.runPendingCheck();
      await this.runActiveTradesCheck();

      // Установить интервалы для 3 потоков
      this.anomalyCheckInterval = setInterval(async () => {
        await this.runAnomalyCheck();
      }, 5 * 60 * 1000); // 5 минут

      this.pendingCheckInterval = setInterval(async () => {
        await this.runPendingCheck();
      }, 30 * 1000); // 30 секунд

      this.activeTradesInterval = setInterval(async () => {
        await this.runActiveTradesCheck();
      }, 30 * 1000); // 30 секунд

      console.log('⏰ Многоуровневая система мониторинга запущена:');
      console.log('   🔍 Поток 1 (аномалии): каждые 5 минут');
      console.log('   ⏳ Поток 2 (watchlist): каждые 30 секунд');
      console.log('   📊 Поток 3 (активные сделки): каждые 30 секунд');

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
    // Остановить все потоки
    if (this.anomalyCheckInterval) {
      clearInterval(this.anomalyCheckInterval);
      this.anomalyCheckInterval = null;
    }
    
    if (this.pendingCheckInterval) {
      clearInterval(this.pendingCheckInterval);
      this.pendingCheckInterval = null;
    }
    
    if (this.activeTradesInterval) {
      clearInterval(this.activeTradesInterval);
      this.activeTradesInterval = null;
    }
    
    // Сохранить данные перед остановкой
    await this.saveTradeHistory();
    await this.savePendingAnomalies();
    await this.saveActiveTrades();
    
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