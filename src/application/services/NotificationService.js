const NotificationRepository = require('../../domain/repositories/NotificationRepository');
const MarketAnalysisService = require('../../domain/services/MarketAnalysisService');

/**
 * Сервис приложения для отправки уведомлений
 */
class NotificationService {
  constructor(notificationRepository, marketAnalysisService) {
    this.notificationRepository = notificationRepository;
    this.marketAnalysisService = marketAnalysisService;
  }

  /**
   * Отправить сводку рынка
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {Promise<void>}
   */
  async sendMarketSummary(coins, limit = 20) {
    try {
      console.log(`Preparing market summary for ${coins.length} coins, showing top ${limit}...`);
      
      // Получить сводку рынка
      const summary = this.marketAnalysisService.getMarketSummary(coins, limit);
      
      // Отправить в Telegram
      await this.notificationRepository.sendMarketSummary(coins, limit);
      
      // Отправить в консоль для разработки
      if (process.env.NODE_ENV === 'development') {
        await this.notificationRepository.sendConsoleMessage(
          `Market Summary sent: ${summary.stats.totalCoins} coins, ${summary.stats.risingCoins} rising, ${summary.stats.fallingCoins} falling`,
          'log'
        );
      }
      
      console.log('Market summary sent successfully');
      
    } catch (error) {
      console.error('Error sending market summary:', error.message);
      throw error;
    }
  }

  /**
   * Отправить сигнал об аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {Promise<void>}
   */
  async sendAnomalySignal(signal) {
    try {
      console.log(`Sending anomaly signal for ${signal.coin}...`);
      
      // Отправить в Telegram
      await this.notificationRepository.sendAnomalySignal(signal);
      
      // Отправить в консоль для разработки
      if (process.env.NODE_ENV === 'development') {
        await this.notificationRepository.sendConsoleMessage(
          `Anomaly signal sent: ${signal.coin} - ${signal.type} (${signal.severity} severity)`,
          'warn'
        );
      }
      
      console.log('Anomaly signal sent successfully');
      
    } catch (error) {
      console.error('Error sending anomaly signal:', error.message);
      throw error;
    }
  }

  /**
   * Отправить общее уведомление
   * @param {string} title - Заголовок
   * @param {string} message - Сообщение
   * @param {string} type - Тип уведомления
   * @returns {Promise<void>}
   */
  async sendNotification(title, message, type = 'info') {
    try {
      console.log(`Sending notification: ${title}...`);
      
      // Отправить в Telegram
      await this.notificationRepository.sendNotification(title, message, type);
      
      // Отправить в консоль для разработки
      if (process.env.NODE_ENV === 'development') {
        await this.notificationRepository.sendConsoleMessage(
          `Notification sent: ${title} - ${message}`,
          type === 'error' ? 'error' : 'log'
        );
      }
      
      console.log('Notification sent successfully');
      
    } catch (error) {
      console.error('Error sending notification:', error.message);
      throw error;
    }
  }

  /**
   * Отправить уведомление о новой сделке
   * @param {Object} trade - Данные сделки
   * @returns {Promise<void>}
   */
  async sendNewTradeNotification(trade) {
    try {
      console.log(`Sending new trade notification for ${trade.symbol}...`);
      
      const message = this.buildNewTradeMessage(trade);
      await this.notificationRepository.sendTelegramMessage(message, { parseMode: 'HTML' });
      
      console.log('New trade notification sent successfully');
      
    } catch (error) {
      console.error('Error sending new trade notification:', error.message);
      throw error;
    }
  }

  /**
   * Построить сообщение о новой сделке
   * @param {Object} trade - Данные сделки
   * @returns {string} Форматированное сообщение
   */
  buildNewTradeMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const stopLoss = trade.stopLoss;
    const takeProfit = trade.takeProfit;

    // Форматировать время создания сделки
    const tradeTime = new Date(trade.entryTime).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let message = `🎯 <b>НОВАЯ СДЕЛКА: ${symbol} → ${trade.type} ${emoji}</b>\n\n`;
    
    if (trade.anomalyId) {
      message += `🆔 <b>ID:</b> ${trade.anomalyId}\n`;
    }
    
    message += `🕐 <b>Время:</b> ${tradeTime}\n\n`;
    message += `💰 <b>Вход:</b> $${trade.entryPrice.toFixed(6)}\n`;
    message += `🛑 <b>Стоп:</b> $${stopLoss.toFixed(6)}\n`;
    message += `🎯 <b>Тейк:</b> $${takeProfit.toFixed(6)} (0% прогресс)\n`;
    
    if (trade.virtualAmount) {
      message += `💵 <b>Виртуальная сумма:</b> $${trade.virtualAmount}\n`;
    }
    
    if (trade.volumeIncrease) {
      message += `📊 <b>Объем:</b> ${trade.volumeIncrease.toFixed(1)}x\n`;
    }
    
    return message;
  }

  /**
   * Отправить сообщение в консоль
   * @param {string} message - Сообщение
   * @param {string} level - Уровень логирования
   * @returns {Promise<void>}
   */
  async sendConsoleMessage(message, level = 'log') {
    try {
      await this.notificationRepository.sendConsoleMessage(message, level);
    } catch (error) {
      console.error('Error sending console message:', error.message);
      throw error;
    }
  }

  /**
   * Отправить тестовое сообщение
   * @returns {Promise<void>}
   */
  async sendTestMessage() {
    try {
      console.log('Sending test message...');
      
      await this.sendNotification(
        'Тестовое уведомление',
        'Это тестовое сообщение от Crypto Screener. Система работает корректно.',
        'info'
      );
      
      console.log('Test message sent successfully');
      
    } catch (error) {
      console.error('Error sending test message:', error.message);
      throw error;
    }
  }

  /**
   * Отправить уведомление о запуске системы
   * @returns {Promise<void>}
   */
  async sendStartupNotification() {
    try {
      const startupTime = new Date().toLocaleString('ru-RU');
      
      // Отключено отправка уведомления о запуске в Telegram
      // await this.sendNotification(
      //   'Система запущена',
      //   `Crypto Screener успешно запущен в ${startupTime}`,
      //   'success'
      // );
      
      console.log(`🚀 Система запущена в ${startupTime} (уведомление в Telegram отключено)`);
      
    } catch (error) {
      console.error('Error sending startup notification:', error.message);
      // Не бросаем ошибку, так как это не критично
    }
  }

  /**
   * Отправить уведомление об ошибке
   * @param {Error} error - Ошибка
   * @param {string} context - Контекст ошибки
   * @returns {Promise<void>}
   */
  async sendErrorNotification(error, context = 'Unknown') {
    try {
      await this.sendNotification(
        'Ошибка системы',
        `Контекст: ${context}\nОшибка: ${error.message}\nСтек: ${error.stack}`,
        'error'
      );
      
    } catch (sendError) {
      console.error('Error sending error notification:', sendError.message);
      // Не бросаем ошибку, так как это не критично
    }
  }

  /**
   * Проверить доступность сервиса уведомлений
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      return await this.notificationRepository.isAvailable();
    } catch (error) {
      console.error('Error checking notification service availability:', error.message);
      return false;
    }
  }
}

module.exports = NotificationService; 