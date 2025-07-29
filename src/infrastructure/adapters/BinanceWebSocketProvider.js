const WebSocket = require('ws');

/**
 * WebSocket провайдер для Binance
 * Поддерживает подписку на потоки свечей и управление соединениями
 */
class BinanceWebSocketProvider {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.subscriptions = new Map(); // symbol -> { interval, callback }
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // 1 секунда
    this.pingInterval = null;
    this.pongTimeout = null;
    this.lastPong = Date.now();
    
    // URL для WebSocket соединения
    this.wsUrl = 'wss://data-stream.binance.vision/ws';
    
    // Обработчики событий
    this.onMessageCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
    this.onErrorCallback = null;
  }

  /**
   * Подключиться к WebSocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Подключение к Binance WebSocket...');
        
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.on('open', () => {
          console.log('✅ WebSocket соединение установлено');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastPong = Date.now();
          this.startHeartbeat();
          
          if (this.onConnectCallback) {
            this.onConnectCallback();
          }
          
          resolve();
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Ошибка парсинга сообщения:', error);
          }
        });
        
        this.ws.on('close', (code, reason) => {
          console.log(`🔌 WebSocket соединение закрыто: ${code} - ${reason}`);
          this.isConnected = false;
          this.stopHeartbeat();
          
          // Очистить подписки при отключении
          this.subscriptions.clear();
          
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback(code, reason);
          }
          
          // Попытка переподключения
          this.scheduleReconnect();
        });
        
        this.ws.on('error', (error) => {
          console.error('❌ WebSocket ошибка:', error);
          
          if (this.onErrorCallback) {
            this.onErrorCallback(error);
          }
          
          reject(error);
        });
        
      } catch (error) {
        console.error('❌ Ошибка создания WebSocket соединения:', error);
        reject(error);
      }
    });
  }

  /**
   * Отключиться от WebSocket
   */
  disconnect() {
    console.log('🔌 Отключение от WebSocket...');
    
    this.stopHeartbeat();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    this.ws = null;
    this.isConnected = false;
    this.subscriptions.clear();
  }

  /**
   * Подписаться на поток свечей для символа
   * @param {string} symbol - Символ (например, 'BTCUSDT')
   * @param {string} interval - Интервал свечей ('1m', '5m', '15m', '1h', '4h', '1d')
   * @param {function} callback - Функция обратного вызова для обработки данных
   */
  subscribeToKline(symbol, interval, callback) {
    if (!this.isConnected) {
      throw new Error('WebSocket не подключен');
    }
    
    // Нормализовать символ (всегда в верхнем регистре)
    const normalizedSymbol = symbol.toUpperCase();
    
    // Проверить, не подписаны ли уже на этот символ
    if (this.subscriptions.has(normalizedSymbol)) {
      console.log(`⚠️ [WS] Уже подписаны на ${normalizedSymbol}@kline_${interval}`);
      return;
    }
    
    const streamName = `${normalizedSymbol.toLowerCase()}@kline_${interval}`;
    
    // Сохранить подписку
    this.subscriptions.set(normalizedSymbol, {
      interval,
      callback,
      streamName
    });
    
    // Отправить запрос на подписку
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: [streamName],
      id: Date.now()
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`📡 [WS] Подписка на ${streamName}`);
  }

  /**
   * Отписаться от потока свечей для символа
   * @param {string} symbol - Символ
   */
  unsubscribeFromKline(symbol) {
    if (!this.isConnected) {
      return;
    }
    
    const subscription = this.subscriptions.get(symbol);
    if (!subscription) {
      return;
    }
    
    // Отправить запрос на отписку
    const unsubscribeMessage = {
      method: 'UNSUBSCRIBE',
      params: [subscription.streamName],
      id: Date.now()
    };
    
    this.ws.send(JSON.stringify(unsubscribeMessage));
    this.subscriptions.delete(symbol);
    console.log(`📡 Отписка от ${subscription.streamName}`);
  }

  /**
   * Подписаться на несколько потоков одновременно
   * @param {Array} streams - Массив объектов { symbol, interval, callback }
   */
  async subscribeToMultipleStreams(streams) {
    if (!this.isConnected) {
      throw new Error('WebSocket не подключен');
    }
    
    const streamNames = [];
    const newSubscriptions = [];
    
    streams.forEach(({ symbol, interval, callback }) => {
      // Нормализовать символ
      const normalizedSymbol = symbol.toUpperCase();
      
      // Проверить, не подписаны ли уже
      if (this.subscriptions.has(normalizedSymbol)) {
        console.log(`⚠️ [WS] Пропускаем ${normalizedSymbol} - уже подписаны`);
        return;
      }
      
      const streamName = `${normalizedSymbol.toLowerCase()}@kline_${interval}`;
      streamNames.push(streamName);
      
      // Сохранить подписку
      this.subscriptions.set(normalizedSymbol, {
        interval,
        callback,
        streamName
      });
      
      newSubscriptions.push({ symbol: normalizedSymbol, streamName });
    });
    
    if (streamNames.length === 0) {
      console.log('📡 [WS] Нет новых потоков для подписки');
      return;
    }
    
    // Отправить запрос на подписку
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streamNames,
      id: Date.now()
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`📡 [WS] Подписка на ${streamNames.length} новых потоков:`, newSubscriptions.map(s => s.symbol));
    
    // Добавить задержку после подписки для избежания rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Получить список активных подписок
   */
  getActiveSubscriptions() {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Обработка входящих сообщений
   * @param {Object} message - Сообщение от WebSocket
   */
  handleMessage(message) {
    // Обработка ответов на команды
    if (message.result !== undefined) {
      console.log('📨 [WS] Ответ на команду:', message);
      return;
    }
    
    // Обработка ошибок
    if (message.error) {
      console.error('❌ [WS] WebSocket ошибка:', message.error);
      return;
    }
    
    // Обработка данных свечей
    if (message.e === 'kline') {
      console.log(`📊 [WS] Получены данные свечи для ${message.s}:`);
      console.log(`   🕐 Время: ${new Date(message.E).toLocaleString()}`);
      console.log(`   💰 Цена: $${message.k.c}`);
      console.log(`   📈 Объем: ${message.k.v}`);
      console.log(`   ✅ Закрыта: ${message.k.x}`);
      this.handleKlineData(message);
      return;
    }
    
    // Обработка ping/pong
    if (message.pong) {
      this.lastPong = Date.now();
      console.log('🏓 [WS] Pong получен');
      return;
    }
    
    console.log('📨 [WS] Неизвестное сообщение:', message);
  }

  /**
   * Запустить heartbeat механизм
   */
  startHeartbeat() {
    console.log('🏓 [WS] Запуск heartbeat механизма');
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Правильный формат ping сообщения для Binance
        const pingMessage = { ping: Date.now() };
        this.ws.send(JSON.stringify(pingMessage));
        console.log('🏓 [WS] Ping отправлен');
        
        // Проверить, не истек ли pong timeout
        if (Date.now() - this.lastPong > 60000) { // 60 секунд
          console.log('⚠️ Pong timeout, переподключение...');
          this.ws.close();
        }
      }
    }, 30000); // Ping каждые 30 секунд
  }

  /**
   * Остановить heartbeat механизм
   */
  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Запланировать переподключение
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Превышено максимальное количество попыток переподключения');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts} через ${delay}ms`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('❌ Ошибка переподключения:', error);
      });
    }, delay);
  }

  /**
   * Обработка данных свечей
   * @param {Object} klineData - Данные свечи
   */
  handleKlineData(klineData) {
    const { s: symbol, k: kline } = klineData;
    
    console.log(`📊 [WS] Обработка данных свечи для ${symbol}:`);
    console.log(`   💰 Цена: $${kline.c}`);
    console.log(`   📈 Объем: ${kline.v}`);
    console.log(`   ✅ Закрыта: ${kline.x}`);
    
    // Найти подписку для этого символа
    const subscription = this.subscriptions.get(symbol);
    if (!subscription) {
      console.log(`⚠️ [WS] Подписка не найдена для ${symbol}`);
      return;
    }
    
    // Создать объект свечи в нужном формате
    const candle = {
      openTime: kline.t,
      open: parseFloat(kline.o),
      high: parseFloat(kline.h),
      low: parseFloat(kline.l),
      close: parseFloat(kline.c),
      volume: parseFloat(kline.v),
      closeTime: kline.T,
      quoteAssetVolume: parseFloat(kline.q),
      numberOfTrades: kline.n,
      takerBuyBaseAssetVolume: parseFloat(kline.V),
      takerBuyQuoteAssetVolume: parseFloat(kline.Q),
      isClosed: kline.x
    };
    
    // Обрабатываем как открытые, так и закрытые свечи
    if (kline.x) {
      console.log(`✅ [WS] Свеча ${symbol} закрыта, обрабатываем`);
    } else {
      console.log(`⏳ [WS] Свеча ${symbol} обновляется в реальном времени`);
    }
    
    // Вызвать callback с данными свечи
    try {
      subscription.callback(symbol, candle);
    } catch (error) {
      console.error(`❌ Ошибка в callback для ${symbol}:`, error);
    }
  }

  /**
   * Установить обработчик сообщений
   * @param {function} callback - Функция обратного вызова
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  /**
   * Установить обработчик подключения
   * @param {function} callback - Функция обратного вызова
   */
  onConnect(callback) {
    this.onConnectCallback = callback;
  }

  /**
   * Установить обработчик отключения
   * @param {function} callback - Функция обратного вызова
   */
  onDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }

  /**
   * Установить обработчик ошибок
   * @param {function} callback - Функция обратного вызова
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Получить статус соединения
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      activeSubscriptions: this.subscriptions.size,
      lastPong: this.lastPong
    };
  }
}

module.exports = { BinanceWebSocketProvider }; 