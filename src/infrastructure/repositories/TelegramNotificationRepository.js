const NotificationRepository = require('../../domain/repositories/NotificationRepository');
const messageQueue = require('../../../scripts/telegram-message-queue');

/**
 * Реализация репозитория уведомлений через Telegram
 */
class TelegramNotificationRepository extends NotificationRepository {
  constructor() {
    super();
    this.chatId = process.env.TELEGRAM_CHAT_ID;
  }

  /**
   * Проверить доступность Telegram
   */
  async isAvailable() {
    return !!this.chatId;
  }

  /**
   * Отправить сообщение в Telegram через очередь
   */
  async sendTelegramMessage(message, options = {}) {
    try {
      if (!this.chatId) {
        console.warn('⚠️ TELEGRAM_CHAT_ID не настроен, сообщение не отправлено');
        return;
      }

      // Проверить, готов ли бот
      if (!messageQueue.isBotReady()) {
        console.warn('⚠️ Telegram бот не инициализирован, сообщение не отправлено');
        return;
      }

      await messageQueue.addMessage(this.chatId, message, options);
    } catch (error) {
      console.error('❌ Ошибка отправки сообщения в Telegram:', error.message);
    }
  }

  /**
   * Отправить сводку рынка
   */
  async sendMarketSummary(coins, limit = 20) {
    const message = this.buildMarketSummaryMessage(coins, limit);
    await this.sendTelegramMessage(message, { parseMode: 'HTML' });
  }

  /**
   * Построить сообщение со сводкой рынка
   */
  buildMarketSummaryMessage(coins, limit = 20) {
    const now = new Date().toLocaleString('ru-RU');
    const coinsToShow = coins.slice(0, limit);
    
    let message = `📊 <b>ТОП-${coinsToShow.length} МОНЕТ ПО КАПИТАЛИЗАЦИИ</b>\n\n`;
    message += `🕐 <b>Обновлено:</b> ${now}\n`;
    message += `📈 <b>Всего монет в базе:</b> ${coins.length}\n\n`;
    
    coinsToShow.forEach((coin, index) => {
      const rank = index + 1;
      message += `${rank}. <b>${coin.name}</b> (${coin.symbol})\n`;
      message += `   💰 ${coin.currentPrice} BTC\n\n`;
    });
    
    return message;
  }

  /**
   * Отправить сигнал об аномалии
   */
  async sendAnomalySignal(signal) {
    const message = this.buildAnomalySignalMessage(signal);
    await this.sendTelegramMessage(message, { parseMode: 'HTML' });
  }

  /**
   * Построить сообщение об аномалии
   */
  buildAnomalySignalMessage(signal) {
    const now = new Date().toLocaleString('ru-RU');
    
    let message = `🚨 <b>ОБНАРУЖЕНА АНОМАЛИЯ</b>\n\n`;
    message += `🕐 <b>Время:</b> ${now}\n`;
    message += `📊 <b>Монета:</b> ${signal.coin}\n`;
    message += `🔍 <b>Тип:</b> ${signal.type}\n`;
    message += `⚠️ <b>Серьезность:</b> ${signal.severity}\n\n`;
    message += `📈 <b>Детали:</b> ${signal.description || 'Нет дополнительной информации'}`;
    
    return message;
  }

  /**
   * Отправить общее уведомление
   */
  async sendNotification(title, message, type = 'info') {
    const formattedMessage = this.buildNotificationMessage(title, message, type);
    await this.sendTelegramMessage(formattedMessage, { parseMode: 'HTML' });
  }

  /**
   * Построить сообщение уведомления
   */
  buildNotificationMessage(title, message, type = 'info') {
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    };
    
    const icon = icons[type] || icons.info;
    
    let formattedMessage = `${icon} <b>${title}</b>\n\n`;
    formattedMessage += `${message}\n\n`;
    formattedMessage += `🕐 ${new Date().toLocaleString('ru-RU')}`;
    
    return formattedMessage;
  }

  /**
   * Отправить уведомление в консоль (для разработки)
   */
  async sendConsoleMessage(message, level = 'log') {
    const timestamp = new Date().toLocaleString('ru-RU');
    const formattedMessage = `[${timestamp}] ${message}`;
    
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }
}

module.exports = TelegramNotificationRepository; 