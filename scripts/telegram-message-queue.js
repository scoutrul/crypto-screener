const TelegramBot = require('node-telegram-bot-api');

/**
 * Глобальная очередь сообщений для Telegram бота
 */
class TelegramMessageQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.bot = null;
    this.delayBetweenMessages = 1000; // 1 секунда между сообщениями
  }

  /**
   * Инициализировать бота
   */
  setBot(bot) {
    this.bot = bot;
    console.log('📤 Telegram очередь сообщений инициализирована');
  }

  /**
   * Добавить сообщение в очередь
   */
  async addMessage(chatId, message, options = {}) {
    const messageItem = {
      chatId,
      message,
      options,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3
    };

    this.queue.push(messageItem);
    console.log(`📤 Сообщение добавлено в очередь (${this.queue.length} в очереди)`);

    // Запустить обработку очереди, если она не запущена
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Обработать очередь сообщений
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Начало обработки очереди (${this.queue.length} сообщений)`);

    while (this.queue.length > 0) {
      const messageItem = this.queue.shift();
      
      try {
        await this.sendMessage(messageItem);
        console.log(`✅ Сообщение отправлено (${this.queue.length} осталось)`);
        
        // Задержка между сообщениями
        if (this.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenMessages));
        }
      } catch (error) {
        console.error(`❌ Ошибка отправки сообщения:`, error.message);
        
        // Повторить попытку, если не превышен лимит
        if (messageItem.retries < messageItem.maxRetries) {
          messageItem.retries++;
          this.queue.unshift(messageItem);
          console.log(`🔄 Повторная попытка ${messageItem.retries}/${messageItem.maxRetries}`);
          
          // Увеличить задержку при повторных попытках
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenMessages * 2));
        } else {
          console.error(`❌ Сообщение не отправлено после ${messageItem.maxRetries} попыток`);
        }
      }
    }

    this.isProcessing = false;
    console.log('✅ Очередь сообщений обработана');
  }

  /**
   * Отправить одно сообщение
   */
  async sendMessage(messageItem) {
    if (!this.bot) {
      throw new Error('Бот не инициализирован');
    }

    // Проверить, что бот готов к отправке сообщений
    if (!this.bot.isPolling()) {
      throw new Error('Бот не готов к отправке сообщений');
    }

    return await this.bot.sendMessage(
      messageItem.chatId, 
      messageItem.message, 
      messageItem.options
    );
  }

  /**
   * Получить статистику очереди
   */
  getQueueStats() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      totalMessages: this.queue.length + (this.isProcessing ? 1 : 0)
    };
  }

  /**
   * Очистить очередь
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    console.log(`🗑️ Очередь очищена (${clearedCount} сообщений удалено)`);
    return clearedCount;
  }

  /**
   * Установить задержку между сообщениями
   */
  setDelay(delayMs) {
    this.delayBetweenMessages = delayMs;
    console.log(`⏱️ Задержка между сообщениями установлена: ${delayMs}ms`);
  }

  /**
   * Получить информацию о очереди
   */
  getQueueInfo() {
    const stats = this.getQueueStats();
    return {
      ...stats,
      delayBetweenMessages: this.delayBetweenMessages,
      oldestMessage: this.queue.length > 0 ? this.queue[0].timestamp : null,
      newestMessage: this.queue.length > 0 ? this.queue[this.queue.length - 1].timestamp : null
    };
  }
}

// Создать глобальный экземпляр очереди
const globalMessageQueue = new TelegramMessageQueue();

module.exports = globalMessageQueue; 