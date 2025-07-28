const axios = require('axios');

/**
 * Адаптер для работы с Telegram Bot API
 */
class TelegramAdapter {
  constructor(botToken, chatId) {
    if (!botToken || !chatId) {
      throw new Error('Bot token and chat ID are required');
    }
    
    this.botToken = botToken;
    this.chatId = chatId;
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Отправить сообщение в Telegram
   * @param {string} message - Текст сообщения
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<void>}
   */
  async sendMessage(message, options = {}) {
    try {
      const payload = {
        chat_id: this.chatId,
        text: message,
        parse_mode: options.parseMode || 'HTML',
        disable_web_page_preview: options.disableWebPagePreview || true
      };

      if (options.replyMarkup) {
        payload.reply_markup = options.replyMarkup;
      }

      const response = await axios.post(`${this.apiUrl}/sendMessage`, payload);
      
      if (!response.data.ok) {
        throw new Error(`Telegram API Error: ${response.data.description}`);
      }

      console.log('Message sent to Telegram successfully');
      return response.data.result;
      
    } catch (error) {
      console.error('Failed to send Telegram message:', error.message);
      throw error;
    }
  }

  /**
   * Отправить сводку рынка
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {Promise<void>}
   */
  async sendMarketSummary(coins, limit = 20) {
    const message = this.buildMarketSummaryMessage(coins, limit);
    await this.sendMessage(message, { parseMode: 'HTML' });
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
    
    let message = `📊 <b>ТОП-${coinsToShow.length} МОНЕТ ПО КАПИТАЛИЗАЦИИ (BTC пары)</b>\n\n`;
    message += `🕐 <b>Обновлено:</b> ${now}\n`;
    message += `📈 <b>Всего монет в базе:</b> ${coins.length}\n\n`;
    
    coinsToShow.forEach((coin, index) => {
      const rank = index + 1;
      const price = coin.getCurrentPrice().format(8);
      const change24h = coin.getPriceChangePercentage24h() ? 
        coin.getPriceChangePercentage24h().format() : 'N/A';
      const changeIcon = coin.getPriceChangePercentage24h() ? 
        (coin.getPriceChangePercentage24h().isPositive() ? '📈' : 
         coin.getPriceChangePercentage24h().isNegative() ? '📉' : '➡️') : '➡️';
      
      message += `${rank}. <b>${coin.getName()}</b> (${coin.getSymbol()})\n`;
      message += `   💰 ${price} BTC ${changeIcon} ${change24h}\n\n`;
    });

    // Статистика рынка
    const risingCoins = coins.filter(c => c.isPriceRising24h()).length;
    const fallingCoins = coins.filter(c => c.isPriceFalling24h()).length;
    const stableCoins = coins.length - risingCoins - fallingCoins;
    
    message += `📊 <b>Статистика рынка:</b>\n`;
    message += `📈 Растут: ${risingCoins} монет\n`;
    message += `📉 Падают: ${fallingCoins} монет\n`;
    message += `➡️ Без изменений: ${stableCoins} монет\n\n`;
    message += `🔗 <i>Данные: CoinGecko API</i>`;
    
    return message;
  }

  /**
   * Отправить сигнал об аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {Promise<void>}
   */
  async sendAnomalySignal(signal) {
    const message = this.buildAnomalySignalMessage(signal);
    await this.sendMessage(message, { parseMode: 'HTML' });
  }

  /**
   * Построить сообщение о сигнале аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {string} Форматированное сообщение
   */
  buildAnomalySignalMessage(signal) {
    const now = new Date().toLocaleString('ru-RU');
    const severityIcon = signal.severity === 'high' ? '🚨' : '⚠️';
    
    let message = `${severityIcon} <b>СИГНАЛ АНОМАЛИИ</b>\n\n`;
    message += `🕐 <b>Время:</b> ${now}\n`;
    message += `🪙 <b>Монета:</b> ${signal.coin}\n`;
    message += `📊 <b>Тип:</b> ${signal.type}\n`;
    message += `📈 <b>Изменение цены:</b> ${signal.priceChange}%\n`;
    message += `📊 <b>Объем:</b> ${signal.volumeChange}\n`;
    message += `⚡ <b>Важность:</b> ${signal.severity === 'high' ? 'Высокая' : 'Средняя'}\n\n`;
    message += `🔍 <i>Рекомендуется дополнительный анализ</i>`;
    
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
    const message = this.buildNotificationMessage(title, messageText, type);
    await this.sendMessage(message, { parseMode: 'HTML' });
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
    
    let message = `${icon} <b>${title.toUpperCase()}</b>\n\n`;
    message += `🕐 <b>Время:</b> ${now}\n`;
    message += `📝 <b>Сообщение:</b>\n${messageText}\n\n`;
    message += `🔗 <i>Crypto Screener</i>`;
    
    return message;
  }

  /**
   * Отправить сообщение в консоль (для разработки)
   * @param {string} message - Сообщение
   * @param {string} level - Уровень логирования
   * @returns {Promise<void>}
   */
  async sendConsoleMessage(message, level = 'log') {
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

  /**
   * Проверить доступность бота
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      return response.data.ok;
    } catch (error) {
      console.error('Telegram bot is not available:', error.message);
      return false;
    }
  }

  /**
   * Получить информацию о боте
   * @returns {Promise<Object>}
   */
  async getBotInfo() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      if (response.data.ok) {
        return response.data.result;
      }
      throw new Error('Failed to get bot info');
    } catch (error) {
      console.error('Error getting bot info:', error.message);
      throw error;
    }
  }
}

module.exports = TelegramAdapter; 