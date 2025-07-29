/**
 * Система виртуальной торговли с REST API
 * Наследует общую бизнес-логику из VirtualTradingBaseService
 */

const ccxt = require('ccxt');
const { CryptoScreenerApp } = require('../src/app');
const { VirtualTradingBaseService } = require('../src/domain/services/VirtualTradingBaseService');

// Конфигурация для REST API системы (наследуется из базового класса)
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // 30 секунд - Trade List (высший приоритет)
  pendingCheckInterval: 30 * 1000,      // 30 секунд - Watchlist (средний приоритет)
  anomalyCheckInterval: 5 * 60 * 1000,  // 5 минут - Anomalies (низший приоритет)
  
  // Дополнительные параметры для REST API системы
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  priceTrackingInterval: 5 * 60 * 1000, // 5 минут для отслеживания цены
  exchanges: ['Binance']
};

class VirtualTradingSystem extends VirtualTradingBaseService {
  constructor() {
    // Вызвать конструктор базового класса с конфигурацией
    super(CONFIG);
    
    // REST API специфичные поля
    this.exchange = new ccxt.binance({ 
      enableRateLimit: true,
      options: {
        defaultType: 'spot' // Явно указываем использование spot API
      }
    });
    this.app = null;
    
    // Приоритетная очередь для потоков
    this.taskQueue = [];
    this.isProcessing = false;
    this.lastActiveTradesCheck = 0;
    this.lastPendingCheck = 0;
    this.lastAnomalyCheck = 0;
    
    // Интервалы для разных потоков (REST API)
    this.anomalyCheckInterval = null;      // Поток 1: 5 минут
    this.pendingCheckInterval = null;      // Поток 2: 30 секунд  
    this.activeTradesInterval = null;      // Поток 3: 30 секунд
  }

  /**
   * Инициализация системы (переопределение абстрактного метода)
   */
  async initialize() {
    console.log('🚀 Инициализация системы виртуальной торговли (REST API)...');
    
    // Инициализировать приложение
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
    if (this.app && this.app.container) {
      this.setNotificationService(this.app.container.getNotificationService());
    }
    
    console.log('✅ Система инициализирована');
  }

  /**
   * Добавить задачу в приоритетную очередь
   */
  addTaskToQueue(task, priority) {
    this.taskQueue.push({ task, priority, timestamp: Date.now() });
    // Сортировка по приоритету (1 - высший приоритет)
    this.taskQueue.sort((a, b) => a.priority - b.priority);
    
    // Запустить обработку очереди, если она не запущена
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Обработать приоритетную очередь
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.taskQueue.length > 0) {
      const { task, priority } = this.taskQueue.shift();
      
      try {
        console.log(`🎯 Выполнение задачи с приоритетом ${priority} (${this.taskQueue.length} в очереди)`);
        await task();
      } catch (error) {
        console.error(`❌ Ошибка выполнения задачи с приоритетом ${priority}:`, error.message);
      }
      
      // Небольшая пауза между задачами
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Если очередь пуста, заполняем её задачами из приоритета 3 (аномалии)
    if (this.taskQueue.length === 0) {
      console.log('📦 Очередь пуста, заполняем задачами из приоритета 3 (аномалии)...');
      this.addTaskToQueue(async () => {
        console.log('🔍 [ПОТОК 3] Запуск поиска аномалий из очереди...');
        await this.runAnomalyCheck();
      }, 3);
    } else {
      console.log(`📊 Очередь содержит ${this.taskQueue.length} задач`);
    }
    
    this.isProcessing = false;
  }

  /**
   * Получить свечи с Binance с повторными попытками (REST API специфика)
   */
  async fetchCandles(symbol, since, limit = 100, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.exchange.fetchOHLCV(symbol, this.config.timeframe, since, limit);
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
   * Проверить подтверждение входа (REST API специфика с новой логикой)
   */
  async checkEntryConfirmation(symbol, tradeType, anomalyCandleIndex) {
    try {
      const since = Date.now() - (this.config.entryConfirmationTFs * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, this.config.entryConfirmationTFs + 1, 3);
      
      if (candles.length < this.config.entryConfirmationTFs) {
        console.log(`⚠️ Недостаточно данных для подтверждения входа ${symbol}`);
        return;
      }

      const currentPrice = this.calculateAveragePrice(candles.slice(-1));
      const anomaly = this.pendingAnomalies.get(symbol);
      
      if (!anomaly) {
        console.log(`⚠️ ${symbol} - Аномалия не найдена в pending`);
        return;
      }
      
      console.log(`🔍 [CONFIRMATION] Проверка подтверждения входа для ${symbol}:`);
      console.log(`   💰 Текущая цена: $${currentPrice}`);
      console.log(`   📊 Аномалия: ${tradeType} по $${anomaly.anomalyPrice}`);
      
      // Этап 2: Проверка консолидации (если еще не проверена)
      if (!anomaly.isConsolidated) {
        console.log(`🔍 [CONSOLIDATION] Проверка консолидации для ${symbol}...`);
        
        // Получить аномальную свечу для проверки консолидации
        const anomalyCandle = candles[anomalyCandleIndex] || candles[candles.length - 2];
        
        if (!this.checkConsolidation(anomalyCandle)) {
          console.log(`❌ ${symbol} - Консолидация не подтвердилась, удаляем из watchlist`);
          this.pendingAnomalies.delete(symbol);
          await this.savePendingAnomalies();
          return;
        }
        
        // Консолидация подтвердилась, определяем сетап
        console.log(`✅ ${symbol} - Консолидация подтвердилась`);
        anomaly.isConsolidated = true;
        anomaly.closePrice = currentPrice;
        
        // Этап 3: Определение сетапа и триггеров
        const { entryLevel, cancelLevel } = this.calculateEntryLevels(currentPrice, tradeType);
        anomaly.entryLevel = entryLevel;
        anomaly.cancelLevel = cancelLevel;
        
        console.log(`📊 ${symbol} - Уровни установлены: вход $${entryLevel}, отмена $${cancelLevel}`);
        await this.savePendingAnomalies();
        return;
      }
      
      // Этап 4: Проверка условий входа или отмены
      const result = this.checkEntryConditions(currentPrice, anomaly.entryLevel, anomaly.cancelLevel, tradeType);
      
      if (result === 'entry') {
        console.log(`✅ ${symbol} - Условие входа выполнено!`);
        
        // Создать сделку (используем метод базового класса)
        const currentVolume = candles[candles.length - 1][5]; // Объем текущей свечи
        const trade = this.createVirtualTrade(
          symbol, 
          tradeType, 
          currentPrice, 
          anomaly.anomalyId, 
          currentVolume,
          anomaly.entryLevel,
          anomaly.cancelLevel
        );
        
        // Удалить из watchlist
        this.pendingAnomalies.delete(symbol);
        
        // Отправить уведомление (используем метод базового класса)
        await this.sendNewTradeNotification(trade);
        
        // Сохранить данные (используем методы базового класса)
        await this.saveActiveTrades();
        await this.savePendingAnomalies();
        
      } else if (result === 'cancel') {
        console.log(`❌ ${symbol} - Условие отмены выполнено, удаляем из watchlist`);
        this.pendingAnomalies.delete(symbol);
        await this.savePendingAnomalies();
        
      } else {
        // Проверить таймаут
        if (this.checkEntryTimeout(anomaly)) {
          console.log(`⏰ ${symbol} - Таймаут подтверждения входа, удаляем из watchlist`);
          this.pendingAnomalies.delete(symbol);
          await this.savePendingAnomalies();
        } else {
          console.log(`⏳ ${symbol} - Ожидание выполнения условий...`);
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка проверки подтверждения входа для ${symbol}:`, error.message);
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
   * Проверить pending anomalies (переопределение абстрактного метода)
   */
  async checkPendingAnomalies() {
    if (this.pendingAnomalies.size === 0) {
      return; // Нет монет в watchlist
    }
    
    console.log(`⏳ [ПОТОК 2] Мониторинг ${this.pendingAnomalies.size} монет в watchlist (многопоточный)...`);
    
    const batchSize = 5; // Меньший размер батча для watchlist
    const delayBetweenBatches = 500; // Меньшая задержка
    
    const anomalies = Array.from(this.pendingAnomalies.entries());
    
    // Разбить на батчи
    for (let i = 0; i < anomalies.length; i += batchSize) {
      const batch = anomalies.slice(i, i + batchSize);
      
      console.log(`📦 Обработка watchlist батча ${Math.floor(i / batchSize) + 1}/${Math.ceil(anomalies.length / batchSize)} (${batch.length} монет)`);
      
      // Запустить все запросы в батче параллельно
      const promises = batch.map(async ([symbol, anomaly]) => {
        try {
          // Проверить подтверждение входа
          await this.checkEntryConfirmation(symbol, anomaly.tradeType, anomaly.anomalyCandleIndex);
          
          // Проверить таймаут watchlist
          this.checkWatchlistTimeout(symbol, anomaly);
        } catch (error) {
          console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
        }
      });
      
      // Ждать завершения всех запросов в батче
      await Promise.all(promises);
      
      // Задержка между батчами
      if (i + batchSize < anomalies.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    console.log('✅ [ПОТОК 2] Мониторинг watchlist завершен');
  }

  /**
   * Проверить таймаут watchlist (REST API специфика)
   */
  checkWatchlistTimeout(symbol, anomaly) {
    // Используем метод базового класса для проверки таймаута
    if (this.checkEntryTimeout(anomaly)) {
      console.log(`⏰ ${symbol} - Таймаут подтверждения входа (6 TF), удаляем из watchlist`);
      
      // Удалить из watchlist
      this.pendingAnomalies.delete(symbol);
      
      // Сохранить данные
      this.savePendingAnomalies();
    }
  }

  /**
   * Отслеживание активных сделок (переопределение абстрактного метода)
   */
  async trackActiveTrades() {
    if (this.activeTrades.size === 0) {
      return; // Нет активных сделок для отслеживания
    }
    
    console.log(`📊 [ПОТОК 3] Мониторинг ${this.activeTrades.size} сделок в trade list (многопоточный)...`);
    
    const batchSize = 3; // Меньший размер батча для активных сделок
    const delayBetweenBatches = 300; // Меньшая задержка
    
    const trades = Array.from(this.activeTrades.entries());
    
    // Разбить на батчи
    for (let i = 0; i < trades.length; i += batchSize) {
      const batch = trades.slice(i, i + batchSize);
      
      console.log(`📦 Обработка trade list батча ${Math.floor(i / batchSize) + 1}/${Math.ceil(trades.length / batchSize)} (${batch.length} сделок)`);
      
      // Запустить все запросы в батче параллельно
      const promises = batch.map(async ([symbol, trade]) => {
        try {
          const since = Date.now() - (2 * 15 * 60 * 1000); // Последние 2 свечи
          const candles = await this.fetchCandles(symbol, since, 2, 3);
          
          if (candles.length === 0) {
            console.log(`⚠️ Не удалось получить данные для ${symbol}`);
            return;
          }
          
          const currentPrice = this.calculateAveragePrice(candles);
          const currentVolume = candles[candles.length - 1][5]; // Объем текущей свечи
          
          // Обновить последнюю цену, время и объем
          trade.lastPrice = currentPrice;
          trade.lastUpdateTime = new Date().toISOString();
          trade.currentVolume = currentVolume; // Обновляем текущий объем
          
          // Проверить условия закрытия
          this.checkTradeExitConditions(trade, currentPrice);
        } catch (error) {
          console.error(`❌ Ошибка отслеживания ${symbol}:`, error.message);
        }
      });
      
      // Ждать завершения всех запросов в батче
      await Promise.all(promises);
      
      // Задержка между батчами
      if (i + batchSize < trades.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    // Сохранить обновленные данные в файл
    await this.saveActiveTrades();
    
    console.log('✅ [ПОТОК 3] Мониторинг trade list завершен');
  }

  /**
   * Проверить условия выхода из сделки (REST API специфика)
   */
  checkTradeExitConditions(trade, currentPrice) {
    const { symbol, type, entryPrice, stopLoss, takeProfit } = trade;
    
    let shouldClose = false;
    let reason = '';
    let profitLoss = 0;
    
    // Логика из базового класса
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
   * Показать статистику торговли с дополнительной информацией о приоритетной очереди
   */
  showStatistics() {
    // Вызвать базовый метод
    super.showStatistics();
    
    // Добавить статистику приоритетной очереди
    console.log('\n🎯 СТАТИСТИКА ПРИОРИТЕТНОЙ ОЧЕРЕДИ:');
    console.log(`📦 Задач в очереди: ${this.taskQueue.length}`);
    console.log(`⚙️ Обработка активна: ${this.isProcessing ? 'Да' : 'Нет'}`);
    
    const now = Date.now();
    const activeTradesAgo = this.lastActiveTradesCheck ? Math.round((now - this.lastActiveTradesCheck) / 1000) : 'Никогда';
    const pendingAgo = this.lastPendingCheck ? Math.round((now - this.lastPendingCheck) / 1000) : 'Никогда';
    const anomalyAgo = this.lastAnomalyCheck ? Math.round((now - this.lastAnomalyCheck) / 1000) : 'Никогда';
    
    console.log(`🥇 Активные сделки: ${activeTradesAgo} сек назад`);
    console.log(`🥈 Watchlist: ${pendingAgo} сек назад`);
    console.log(`🥉 Аномалии: ${anomalyAgo} сек назад`);
  }

  /**
   * Проверить аномалии для одной монеты (переопределение абстрактного метода)
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверки уже выполнены в runAnomalyCheck, поэтому сразу переходим к анализу

    try {
      const since = Date.now() - (this.config.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, Math.max(this.config.historicalWindow, 20), 3);
      
      if (candles.length < this.config.historicalWindow) {
        console.log(`⚠️ Недостаточно данных для ${symbol} (получено ${candles.length}/${this.config.historicalWindow})`);
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
        historicalPrice: avgHistoricalPrice,
        currentVolume: anomalyVolume // Добавляем текущий объем свечи
      });
      
      console.log(`📝 Аномалия ${symbol} добавлена в pending (${tradeType})`);
      
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
   * Поток 1: Поиск аномалий среди всех монет (5 минут) - REST API
   * Многопоточная обработка с ограниченным количеством одновременных запросов
   * Приоритет 3 - низший приоритет
   */
  async runAnomalyCheck() {
    this.addTaskToQueue(async () => {
      console.log('🔍 [ПОТОК 1] Поиск аномалий среди всех монет (многопоточный)...');
      
      // Фильтруем монеты, которые уже в активных сделках или pending
      const availableCoins = this.filteredCoins.filter(coin => {
        const symbol = `${coin.symbol}/USDT`;
        const isInActiveTrade = this.activeTrades.has(symbol);
        const isInPending = this.pendingAnomalies.has(symbol);
        const isOnCooldown = this.isAnomalyOnCooldown(symbol);
        
        if (isInActiveTrade) {
          console.log(`💰 ${symbol} уже в активной сделке, пропускаем`);
          return false;
        }
        if (isInPending) {
          console.log(`⏳ ${symbol} уже в pending, пропускаем`);
          return false;
        }
        if (isOnCooldown) {
          console.log(`🚫 ${symbol} на cooldown, пропускаем`);
          return false;
        }
        
        return true;
      });
      
      console.log(`📊 Доступно для проверки: ${availableCoins.length}/${this.filteredCoins.length} монет`);
      
      if (availableCoins.length === 0) {
        console.log('✅ Нет доступных монет для проверки');
        this.lastAnomalyCheck = Date.now();
        return;
      }
      
      const batchSize = 10; // Количество одновременных запросов
      const delayBetweenBatches = 1000; // Задержка между батчами (1 секунда)
      
      // Разбить отфильтрованные монеты на батчи
      for (let i = 0; i < availableCoins.length; i += batchSize) {
        const batch = availableCoins.slice(i, i + batchSize);
        
        console.log(`📦 Обработка батча ${Math.floor(i / batchSize) + 1}/${Math.ceil(availableCoins.length / batchSize)} (${batch.length} монет)`);
        
        // Запустить все запросы в батче параллельно
        const promises = batch.map(async (coin) => {
          try {
            await this.checkAnomalies(coin);
          } catch (error) {
            console.log(`⚠️ Ошибка обработки ${coin.symbol}:`, error.message);
          }
        });
        
        // Ждать завершения всех запросов в батче
        await Promise.all(promises);
        
        // Задержка между батчами для избежания rate limiting
        if (i + batchSize < availableCoins.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }
      
      console.log('✅ [ПОТОК 1] Поиск аномалий завершен');
      this.lastAnomalyCheck = Date.now();
    }, 3);
  }

  /**
   * Поток 2: Мониторинг watchlist (30 секунд) - REST API
   * Приоритет 2 - средний приоритет
   */
  async runPendingCheck() {
    this.addTaskToQueue(async () => {
      await this.checkPendingAnomalies();
      this.lastPendingCheck = Date.now();
    }, 2);
  }

  /**
   * Поток 3: Мониторинг trade list (30 секунд) - REST API
   * Приоритет 1 - высший приоритет
   */
  async runActiveTradesCheck() {
    this.addTaskToQueue(async () => {
      await this.trackActiveTrades();
      this.lastActiveTradesCheck = Date.now();
    }, 1);
  }

  /**
   * Запустить систему (переопределение абстрактного метода)
   */
  async start() {
    try {
      // Инициализировать систему
      await this.initialize();
      
      console.log('🚀 Запуск системы виртуальной торговли (REST API) с приоритетной очередью...');
      
      // Запустить первый цикл всех потоков в правильном порядке приоритетов
      await this.runActiveTradesCheck(); // Приоритет 1 - сначала активные сделки
      await this.runPendingCheck();      // Приоритет 2 - потом watchlist
      await this.runAnomalyCheck();      // Приоритет 3 - потом общий мониторинг

      // Заполнить очередь задачами из приоритета 3 для непрерывной работы
      console.log('📦 Инициализация очереди задачами из приоритета 3...');
      this.addTaskToQueue(async () => {
        console.log('🔍 [ПОТОК 3] Инициализация поиска аномалий...');
        await this.runAnomalyCheck();
      }, 3);

      // Установить интервалы для 3 потоков с приоритетной очередью
      this.activeTradesInterval = setInterval(async () => {
        await this.runActiveTradesCheck();
      }, this.config.activeTradesInterval); // Trade List - высший приоритет

      this.pendingCheckInterval = setInterval(async () => {
        await this.runPendingCheck();
      }, this.config.pendingCheckInterval); // Watchlist - средний приоритет

      this.anomalyCheckInterval = setInterval(async () => {
        await this.runAnomalyCheck();
      }, this.config.anomalyCheckInterval); // Anomalies - низший приоритет

      console.log('⏰ Приоритетная система мониторинга запущена:');
      console.log(`   🥇 Поток 3 (активные сделки): каждые ${this.config.activeTradesInterval / 1000} сек - ПРИОРИТЕТ 1`);
      console.log(`   🥈 Поток 2 (watchlist): каждые ${this.config.pendingCheckInterval / 1000} сек - ПРИОРИТЕТ 2`);
      console.log(`   🥉 Поток 1 (аномалии): каждые ${this.config.anomalyCheckInterval / 1000 / 60} мин - ПРИОРИТЕТ 3`);
      console.log('   📤 Статус в Telegram: каждые 2 часа');

      // Отправить начальный статус через 1 минуту после запуска
      setTimeout(async () => {
        try {
          const { sendSystemStatus } = require('./send-system-status.js');
          await sendSystemStatus();
        } catch (error) {
          console.log('ℹ️ Начальная отправка статуса не выполнена:', error.message);
        }
      }, 60 * 1000); // 1 минута

      // Показывать статистику каждые 30 минут
      setInterval(() => {
        this.showStatistics();
      }, 30 * 60 * 1000);

      // Отправлять статус в Telegram каждые 2 часа
      setInterval(async () => {
        try {
          const { sendSystemStatus } = require('./send-system-status.js');
          await sendSystemStatus();
        } catch (error) {
          console.log('ℹ️ Автоматическая отправка статуса не выполнена:', error.message);
        }
      }, 2 * 60 * 60 * 1000); // 2 часа

    } catch (error) {
      console.error('❌ Ошибка запуска системы:', error.message);
      await this.stop();
    }
  }

  /**
   * Остановить систему (переопределение абстрактного метода)
   */
  async stop() {
    console.log('🛑 Остановка системы...');
    
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
const system = new VirtualTradingSystem();

if (require.main === module) {
  system.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { VirtualTradingSystem }; 