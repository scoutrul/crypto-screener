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
    
    if (this.ws) {
      this.stopHeartbeat();
      this.ws.close();
      this.ws = null;
    }
    
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
    
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    
    // Сохранить подписку
    this.subscriptions.set(symbol, {
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
    console.log(`📡 Подписка на ${streamName}`);
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
  subscribeToMultipleStreams(streams) {
    if (!this.isConnected) {
      throw new Error('WebSocket не подключен');
    }
    
    const streamNames = [];
    
    streams.forEach(({ symbol, interval, callback }) => {
      const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
      streamNames.push(streamName);
      
      // Сохранить подписку
      this.subscriptions.set(symbol, {
        interval,
        callback,
        streamName
      });
    });
    
    // Отправить запрос на подписку
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streamNames,
      id: Date.now()
    };
    
    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`📡 Подписка на ${streamNames.length} потоков:`, streamNames);
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
      console.log('📨 Ответ на команду:', message);
      return;
    }
    
    // Обработка ошибок
    if (message.error) {
      console.error('❌ WebSocket ошибка:', message.error);
      return;
    }
    
    // Обработка данных свечей
    if (message.e === 'kline') {
      this.handleKlineData(message);
      return;
    }
    
    // Обработка ping/pong
    if (message.pong) {
      this.lastPong = Date.now();
      return;
    }
    
    console.log('📨 Неизвестное сообщение:', message);
  }

  /**
   * Обработка данных свечей
   * @param {Object} klineData - Данные свечи
   */
  handleKlineData(klineData) {
    const { s: symbol, k: kline } = klineData;
    
    // Найти подписку для этого символа
    const subscription = this.subscriptions.get(symbol);
    if (!subscription) {
      return;
    }
    
    // Проверить, что свеча закрыта
    if (!kline.x) {
      return; // Свеча еще не закрыта
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
    
    // Вызвать callback с данными свечи
    try {
      subscription.callback(symbol, candle);
    } catch (error) {
      console.error(`❌ Ошибка в callback для ${symbol}:`, error);
    }
  }

  /**
   * Запустить heartbeat механизм
   */
  startHeartbeat() {
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        this.ws.send(JSON.stringify({ ping: Date.now() }));
        
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