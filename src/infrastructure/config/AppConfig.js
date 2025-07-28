require('dotenv').config();

/**
 * Конфигурация приложения
 */
class AppConfig {
  constructor() {
    this.validateRequiredEnvVars();
  }

  /**
   * Проверить обязательные переменные окружения
   */
  validateRequiredEnvVars() {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  /**
   * Получить конфигурацию Telegram
   */
  get telegram() {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID
    };
  }

  /**
   * Получить конфигурацию CoinGecko
   */
  get coinGecko() {
    return {
      baseUrl: 'https://api.coingecko.com/api/v3',
      timeout: parseInt(process.env.COINGECKO_TIMEOUT) || 30000,
      rateLimitDelay: parseInt(process.env.COINGECKO_RATE_LIMIT_DELAY) || 2000,
      maxRetries: parseInt(process.env.COINGECKO_MAX_RETRIES) || 3
    };
  }

  /**
   * Получить конфигурацию приложения
   */
  get app() {
    return {
      environment: process.env.NODE_ENV || 'development',
      isDevelopment: process.env.NODE_ENV === 'development',
      isProduction: process.env.NODE_ENV === 'production',
      logLevel: process.env.LOG_LEVEL || 'info'
    };
  }

  /**
   * Получить конфигурацию уведомлений
   */
  get notifications() {
    return {
      defaultLimit: parseInt(process.env.DEFAULT_NOTIFICATION_LIMIT) || 20,
      maxLimit: parseInt(process.env.MAX_NOTIFICATION_LIMIT) || 100,
      enableConsoleLogging: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
      enableTelegram: process.env.ENABLE_TELEGRAM !== 'false'
    };
  }

  /**
   * Получить конфигурацию рынка
   */
  get market() {
    return {
      defaultCurrency: process.env.DEFAULT_CURRENCY || 'btc',
      defaultLimit: parseInt(process.env.DEFAULT_MARKET_LIMIT) || 1000,
      supportedCurrencies: ['btc', 'usd', 'eur', 'eth']
    };
  }

  /**
   * Получить конфигурацию аномалий
   */
  get anomalies() {
    return {
      volumeThreshold: parseFloat(process.env.VOLUME_ANOMALY_THRESHOLD) || 50,
      priceThreshold: parseFloat(process.env.PRICE_ANOMALY_THRESHOLD) || 20,
      enableDetection: process.env.ENABLE_ANOMALY_DETECTION !== 'false'
    };
  }

  /**
   * Получить конфигурацию базы данных (если понадобится в будущем)
   */
  get database() {
    return {
      url: process.env.DATABASE_URL,
      type: process.env.DATABASE_TYPE || 'sqlite',
      enableLogging: process.env.DATABASE_LOGGING === 'true'
    };
  }

  /**
   * Получить все конфигурации
   */
  getAll() {
    return {
      telegram: this.telegram,
      coinGecko: this.coinGecko,
      app: this.app,
      notifications: this.notifications,
      market: this.market,
      anomalies: this.anomalies,
      database: this.database
    };
  }

  /**
   * Проверить валидность конфигурации
   */
  validate() {
    try {
      this.validateRequiredEnvVars();
      
      // Проверить Telegram конфигурацию
      if (!this.telegram.botToken || !this.telegram.chatId) {
        throw new Error('Invalid Telegram configuration');
      }

      // Проверить CoinGecko конфигурацию
      if (!this.coinGecko.baseUrl) {
        throw new Error('Invalid CoinGecko configuration');
      }

      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error.message);
      return false;
    }
  }

  /**
   * Получить конфигурацию для разработки
   */
  static getDevelopmentConfig() {
    return {
      telegram: {
        botToken: 'test_token',
        chatId: 'test_chat_id'
      },
      coinGecko: {
        baseUrl: 'https://api.coingecko.com/api/v3',
        timeout: 30000,
        rateLimitDelay: 2000,
        maxRetries: 3
      },
      app: {
        environment: 'development',
        isDevelopment: true,
        isProduction: false,
        logLevel: 'debug'
      },
      notifications: {
        defaultLimit: 20,
        maxLimit: 100,
        enableConsoleLogging: true,
        enableTelegram: false
      },
      market: {
        defaultCurrency: 'btc',
        defaultLimit: 1000,
        supportedCurrencies: ['btc', 'usd', 'eur', 'eth']
      },
      anomalies: {
        volumeThreshold: 50,
        priceThreshold: 20,
        enableDetection: true
      }
    };
  }
}

module.exports = AppConfig; 