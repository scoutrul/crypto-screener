const TelegramBot = require('node-telegram-bot-api');
const messageQueue = require('./telegram-message-queue');

/**
 * Синглтон для Telegram бота
 * Обеспечивает единую точку инициализации бота во всей системе
 */
class TelegramBotSingleton {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * Инициализировать бота (только один раз)
   */
  async initialize() {
    // Если уже инициализирован, вернуть существующий экземпляр
    if (this.isInitialized && this.bot) {
      return this.bot;
    }

    // Если инициализация уже в процессе, дождаться её завершения
    if (this.initializationPromise) {
      return await this.initializationPromise;
    }

    // Начать инициализацию
    this.initializationPromise = this._doInitialize();
    return await this.initializationPromise;
  }

  /**
   * Внутренний метод инициализации
   */
  async _doInitialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.log('⚠️ TELEGRAM_BOT_TOKEN не настроен, Telegram уведомления отключены');
        return null;
      }

      // Создать бота только если его еще нет
      if (!this.bot) {
        this.bot = new TelegramBot(token, { 
          polling: true,
          polling_options: {
            timeout: 10,
            limit: 100,
            allowed_updates: ['message']
          }
        });
      }

      // Инициализировать очередь сообщений
      messageQueue.setBot(this.bot);
      
      // Дождаться полной инициализации бота
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Проверить, что бот готов
      if (!this.bot.isPolling()) {
        console.warn('⚠️ Telegram бот не готов к работе');
        return null;
      }
      
      this.isInitialized = true;
      console.log('🤖 Telegram бот инициализирован (синглтон)');
      
      return this.bot;
      
    } catch (error) {
      console.error('❌ Ошибка инициализации Telegram бота:', error.message);
      if (error.message.includes('409 Conflict')) {
        console.log('💡 Подсказка: Возможно, уже запущен другой экземпляр бота');
        console.log('💡 Остановите все процессы: taskkill /f /im node.exe');
      }
      return null;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Получить экземпляр бота
   */
  getBot() {
    return this.bot;
  }

  /**
   * Проверить, инициализирован ли бот
   */
  isReady() {
    return this.isInitialized && this.bot && this.bot.isPolling();
  }

  /**
   * Остановить бота
   */
  async stop() {
    if (this.bot) {
      try {
        this.bot.stopPolling();
        console.log('🤖 Telegram бот остановлен (синглтон)');
      } catch (error) {
        console.error('❌ Ошибка остановки Telegram бота:', error.message);
      }
    }
    this.isInitialized = false;
    this.bot = null;
  }

  /**
   * Получить информацию о состоянии бота
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isReady: this.isReady(),
      hasBot: !!this.bot,
      isPolling: this.bot ? this.bot.isPolling() : false
    };
  }
}

// Создать глобальный экземпляр синглтона
const telegramBotSingleton = new TelegramBotSingleton();

module.exports = telegramBotSingleton; 