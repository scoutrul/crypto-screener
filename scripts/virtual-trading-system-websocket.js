const fs = require('fs');
const path = require('path');
/**
 * Система виртуальной торговли с WebSocket поддержкой
 * Наследует общую бизнес-логику из VirtualTradingBaseService
 */

const { BinanceWebSocketProvider } = require('../src/infrastructure/adapters/BinanceWebSocketProvider.js');
const { VirtualTradingBaseService } = require('../src/domain/services/VirtualTradingBaseService');

// Конфигурация для WebSocket системы (наследуется из базового класса)
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // 30 секунд - Trade List (высший приоритет)
  pendingCheckInterval: 30 * 1000,      // 30 секунд - Watchlist (средний приоритет)
  anomalyCheckInterval: 5 * 60 * 1000,  // 5 минут - Anomalies (низший приоритет)
  
  // WebSocket специфичные настройки
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
class VirtualTradingSystemWebSocket extends VirtualTradingBaseService {
  constructor() {
    // Вызвать конструктор базового класса с конфигурацией
    super(CONFIG);
    
    // WebSocket специфичные поля
    this.wsProvider = null;
    this.wsConnected = false;
    
    // Интервалы для REST API (медленный поток)
    this.anomalyCheckInterval = null;
    
    // Статистика
    this.systemStartTime = new Date();
    this.lastStatisticsUpdate = new Date();
  }

  /**
   * Инициализация системы (переопределение абстрактного метода)
   */
  async initialize() {
    console.log('🚀 Инициализация системы виртуальной торговли с WebSocket...');
    
    // Загрузить данные (используем методы базового класса)
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
   * Инициализация WebSocket провайдера (WebSocket специфика)
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
   * Подписаться на потоки для watchlist (WebSocket специфика)
   */
  subscribeToWatchlistStreams() {
    if (!this.wsConnected || this.pendingAnomalies.size === 0) {
      return;
    }
    
    const streams = [];
    
    this.pendingAnomalies.forEach((anomaly, symbol) => {
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: this.config.websocketIntervals.watchlist,
        callback: (symbol, candle) => this.handleWatchlistKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 Подписка на ${streams.length} потоков watchlist`);
    }
  }

  /**
   * Подписаться на потоки для trade list (WebSocket специфика)
   */
  subscribeToTradeListStreams() {
    if (!this.wsConnected || this.activeTrades.size === 0) {
      return;
    }
    
    const streams = [];
    
    this.activeTrades.forEach((trade, symbol) => {
      streams.push({
        symbol: symbol.replace('/USDT', ''),
        interval: this.config.websocketIntervals.tradeList,
        callback: (symbol, candle) => this.handleTradeListKline(symbol, candle)
      });
    });
    
    if (streams.length > 0) {
      this.wsProvider.subscribeToMultipleStreams(streams);
      console.log(`📡 Подписка на ${streams.length} потоков trade list`);
    }
  }

  /**
   * Обработка свечи для watchlist (WebSocket специфика)
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
   * Обработка свечи для trade list (WebSocket специфика)
   */
  async handleTradeListKline(symbol, candle) {
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
    
    // Сохранить обновленные данные в файл
    await this.saveActiveTrades();
  }

  /**
   * Проверить подтверждение входа для watchlist (WebSocket специфика)
   */
  async checkEntryConfirmation(symbol, anomaly, currentCandle) {
    const currentPrice = currentCandle.close;
    
    console.log(`🔍 [CONFIRMATION] Проверка подтверждения входа для ${symbol}:`);
    console.log(`   💰 Текущая цена: $${currentPrice}`);
    console.log(`   📊 Аномалия: ${anomaly.tradeType} по $${anomaly.anomalyPrice}`);
    
    // Этап 2: Проверка консолидации (если еще не проверена)
    if (!anomaly.isConsolidated) {
      console.log(`🔍 [CONSOLIDATION] Проверка консолидации для ${symbol}...`);
      
      if (!this.checkConsolidation(currentCandle)) {
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
      const { entryLevel, cancelLevel } = this.calculateEntryLevels(currentPrice, anomaly.tradeType);
      anomaly.entryLevel = entryLevel;
      anomaly.cancelLevel = cancelLevel;
      
      console.log(`📊 ${symbol} - Уровни установлены: вход $${entryLevel}, отмена $${cancelLevel}`);
      await this.savePendingAnomalies();
      return;
    }
    
    // Этап 4: Проверка условий входа или отмены
    const result = this.checkEntryConditions(currentPrice, anomaly.entryLevel, anomaly.cancelLevel, anomaly.tradeType);
    
    if (result === 'entry') {
      console.log(`✅ ${symbol} - Условие входа выполнено!`);
      
      // Создать сделку (используем метод базового класса)
      const currentVolume = currentCandle[5]; // Объем текущей свечи
      const trade = this.createVirtualTrade(
        symbol, 
        anomaly.tradeType, 
        currentPrice, 
        anomaly.anomalyId, 
        currentVolume,
        anomaly.entryLevel,
        anomaly.cancelLevel
      );
      
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
      
    } else if (result === 'cancel') {
      console.log(`❌ ${symbol} - Условие отмены выполнено, удаляем из watchlist`);
      this.pendingAnomalies.delete(symbol);
      await this.savePendingAnomalies();
      
      // Отписаться от WebSocket потока
      if (this.wsProvider) {
        this.wsProvider.unsubscribeFromKline(symbol.replace('/USDT', ''));
      }
      
    } else {
      // Проверить таймаут
      if (this.checkEntryTimeout(anomaly)) {
        console.log(`⏰ ${symbol} - Таймаут подтверждения входа, удаляем из watchlist`);
        this.pendingAnomalies.delete(symbol);
        await this.savePendingAnomalies();
        
        // Отписаться от WebSocket потока
        if (this.wsProvider) {
          this.wsProvider.unsubscribeFromKline(symbol.replace('/USDT', ''));
        }
      } else {
        console.log(`⏳ ${symbol} - Ожидание выполнения условий...`);
      }
    }
  }

  /**
   * Проверить таймаут watchlist (WebSocket специфика)
   */
  checkWatchlistTimeout(symbol, anomaly) {
    // Используем метод базового класса для проверки таймаута
    if (this.checkEntryTimeout(anomaly)) {
      console.log(`⏰ ${symbol} - Таймаут подтверждения входа (6 TF), удаляем из watchlist`);
      
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
   * Проверить условия выхода из сделки (WebSocket специфика)
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
   * Проверить аномалии для одной монеты (переопределение абстрактного метода)
   */
  async checkAnomalies(coin) {
    // В WebSocket версии аномалии создаются через REST API
    // Этот метод может быть переопределен для создания тестовых аномалий
    console.log(`🔍 Проверка аномалий для ${coin.symbol}...`);
    
    // Пример: добавить тестовую аномалию если нет активных сделок
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
          this.config.websocketIntervals.watchlist,
          (symbol, candle) => this.handleWatchlistKline(symbol, candle)
        );
      }
    }
  }

  /**
   * Проверить pending anomalies (переопределение абстрактного метода)
   */
  async checkPendingAnomalies() {
    // В WebSocket версии проверка происходит через handleWatchlistKline
    // Этот метод может быть использован для дополнительной логики
    console.log(`⏳ Проверка ${this.pendingAnomalies.size} pending anomalies...`);
  }

  /**
   * Отслеживание активных сделок (переопределение абстрактного метода)
   */
  async trackActiveTrades() {
    // В WebSocket версии отслеживание происходит через handleTradeListKline
    // Этот метод может быть использован для дополнительной логики
    console.log(`📊 Отслеживание ${this.activeTrades.size} активных сделок...`);
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
          this.config.websocketIntervals.watchlist,
          (symbol, candle) => this.handleWatchlistKline(symbol, candle)
        );
      }
    }
    
    console.log('✅ [ПОТОК 1] Поиск аномалий завершен');
  }

  /**
   * Запустить систему (переопределение абстрактного метода)
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
    
    console.log('✅ Система остановлена');
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
}

// Экспорт для использования
module.exports = { VirtualTradingSystemWebSocket, CONFIG }; 