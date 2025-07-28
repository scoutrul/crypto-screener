const NotificationRepository = require('../../domain/repositories/NotificationRepository');
const TelegramAdapter = require('../adapters/TelegramAdapter');
const AppConfig = require('../config/AppConfig');

/**
 * Реализация репозитория уведомлений для Telegram
 */
class TelegramNotificationRepository extends NotificationRepository {
  constructor() {
    super();
    
    try {
      const config = new AppConfig();
      this.adapter = new TelegramAdapter(config.telegram.botToken, config.telegram.chatId);
      this.config = config;
    } catch (error) {
      console.warn('Telegram configuration not available, using console-only mode');
      this.adapter = null;
      this.config = AppConfig.getDevelopmentConfig();
    }
  }

  /**
   * Отправить сообщение в Telegram
   * @param {string} message - Текст сообщения
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<void>}
   */
  async sendTelegramMessage(message, options = {}) {
    if (this.adapter && this.config.notifications.enableTelegram) {
      return await this.adapter.sendMessage(message, options);
    } else {
      // В режиме разработки или если Telegram недоступен, отправляем в консоль
      await this.sendConsoleMessage(message, 'log');
    }
  }

  /**
   * Отправить сводку рынка
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {Promise<void>}
   */
  async sendMarketSummary(coins, limit = 20) {
    if (this.adapter && this.config.notifications.enableTelegram) {
      return await this.adapter.sendMarketSummary(coins, limit);
    } else {
      // В режиме разработки отправляем в консоль
      const message = this.buildMarketSummaryMessage(coins, limit);
      await this.sendConsoleMessage(message, 'log');
    }
  }

  /**
   * Построить сообщение со сводкой рынка
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {string} Форматированное сообщение
   */
  buildMarketSummaryMessage(coins, limit = 20) {
    const now = new Date().toLocaleString('ru-RU');
    const coinsToShow = coins.slice(0, limit);
    
    let message = `📊 ТОП-${coinsToShow.length} МОНЕТ ПО КАПИТАЛИЗАЦИИ (BTC пары)\n\n`;
    message += `🕐 Обновлено: ${now}\n`;
    message += `📈 Всего монет в базе: ${coins.length}\n\n`;
    
    coinsToShow.forEach((coin, index) => {
      const rank = index + 1;
      const price = coin.getCurrentPrice().format(8);
      const change24h = coin.getPriceChangePercentage24h() ? 
        coin.getPriceChangePercentage24h().format() : 'N/A';
      const changeIcon = coin.getPriceChangePercentage24h() ? 
        (coin.getPriceChangePercentage24h().isPositive() ? '📈' : 
         coin.getPriceChangePercentage24h().isNegative() ? '📉' : '➡️') : '➡️';
      
      message += `${rank}. ${coin.getName()} (${coin.getSymbol()})\n`;
      message += `   💰 ${price} BTC ${changeIcon} ${change24h}\n\n`;
    });

    // Статистика рынка
    const risingCoins = coins.filter(c => c.isPriceRising24h()).length;
    const fallingCoins = coins.filter(c => c.isPriceFalling24h()).length;
    const stableCoins = coins.length - risingCoins - fallingCoins;
    
    message += `📊 Статистика рынка:\n`;
    message += `📈 Растут: ${risingCoins} монет\n`;
    message += `📉 Падают: ${fallingCoins} монет\n`;
    message += `➡️ Без изменений: ${stableCoins} монет\n\n`;
    message += `🔗 Данные: CoinGecko API`;
    
    return message;
  }

  /**
   * Отправить сигнал об аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {Promise<void>}
   */
  async sendAnomalySignal(signal) {
    if (this.adapter && this.config.notifications.enableTelegram) {
      return await this.adapter.sendAnomalySignal(signal);
    } else {
      // В режиме разработки отправляем в консоль
      const message = this.buildAnomalySignalMessage(signal);
      await this.sendConsoleMessage(message, 'warn');
    }
  }

  /**
   * Построить сообщение о сигнале аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {string} Форматированное сообщение
   */
  buildAnomalySignalMessage(signal) {
    const now = new Date().toLocaleString('ru-RU');
    const severityIcon = signal.severity === 'high' ? '🚨' : '⚠️';
    
    let message = `${severityIcon} СИГНАЛ АНОМАЛИИ\n\n`;
    message += `🕐 Время: ${now}\n`;
    message += `🪙 Монета: ${signal.coin}\n`;
    message += `📊 Тип: ${signal.type}\n`;
    message += `📈 Изменение цены: ${signal.priceChange}%\n`;
    message += `📊 Объем: ${signal.volumeChange}\n`;
    message += `⚡ Важность: ${signal.severity === 'high' ? 'Высокая' : 'Средняя'}\n\n`;
    message += `🔍 Рекомендуется дополнительный анализ`;
    
    return message;
  }

  /**
   * Отправить общее уведомление
   * @param {string} title - Заголовок
   * @param {string} messageText - Сообщение
   * @param {string} type - Тип уведомления
   * @returns {Promise<void>}
   */
  async sendNotification(title, messageText, type = 'info') {
    if (this.adapter && this.config.notifications.enableTelegram) {
      return await this.adapter.sendNotification(title, messageText, type);
    } else {
      // В режиме разработки отправляем в консоль
      const message = this.buildNotificationMessage(title, messageText, type);
      const level = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
      await this.sendConsoleMessage(message, level);
    }
  }

  /**
   * Построить сообщение уведомления
   * @param {string} title - Заголовок
   * @param {string} messageText - Сообщение
   * @param {string} type - Тип уведомления
   * @returns {string} Форматированное сообщение
   */
  buildNotificationMessage(title, messageText, type = 'info') {
    const now = new Date().toLocaleString('ru-RU');
    const typeIcons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    };
    
    const icon = typeIcons[type] || typeIcons.info;
    
    let message = `${icon} ${title.toUpperCase()}\n\n`;
    message += `🕐 Время: ${now}\n`;
    message += `📝 Сообщение:\n${messageText}\n\n`;
    message += `🔗 Crypto Screener`;
    
    return message;
  }

  /**
   * Отправить сообщение в консоль
   * @param {string} message - Сообщение
   * @param {string} level - Уровень логирования
   * @returns {Promise<void>}
   */
  async sendConsoleMessage(message, level = 'log') {
    if (this.config.notifications.enableConsoleLogging) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      
      switch (level) {
        case 'warn':
          console.warn(`${prefix} ${message}`);
          break;
        case 'error':
          console.error(`${prefix} ${message}`);
          break;
        default:
          console.log(`${prefix} ${message}`);
      }
    }
  }

  /**
   * Проверить доступность сервиса уведомлений
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (this.adapter && this.config.notifications.enableTelegram) {
      return await this.adapter.isAvailable();
    }
    return this.config.notifications.enableConsoleLogging;
  }
}

module.exports = TelegramNotificationRepository; 