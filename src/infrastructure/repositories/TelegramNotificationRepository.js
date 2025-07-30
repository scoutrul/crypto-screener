const messageQueue = require('../../../scripts/telegram-message-queue');

/**
 * Реализация репозитория уведомлений через Telegram
 */
class TelegramNotificationRepository {
  constructor() {
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

      await messageQueue.addMessage(this.chatId, message, options);
    } catch (error) {
      console.error('❌ Ошибка отправки сообщения в Telegram:', error.message);
    }
  }
}

module.exports = TelegramNotificationRepository; 