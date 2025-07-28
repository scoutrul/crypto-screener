/**
 * Интерфейс репозитория для работы с уведомлениями
 */
class NotificationRepository {
  /**
   * Отправить сообщение в Telegram
   * @param {string} message - Текст сообщения
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<void>}
   */
  async sendTelegramMessage(message, options = {}) {
    throw new Error('Method sendTelegramMessage must be implemented');
  }

  /**
   * Отправить сводку рынка
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {Promise<void>}
   */
  async sendMarketSummary(coins, limit = 20) {
    throw new Error('Method sendMarketSummary must be implemented');
  }

  /**
   * Отправить сигнал об аномалии
   * @param {Object} signal - Данные сигнала
   * @returns {Promise<void>}
   */
  async sendAnomalySignal(signal) {
    throw new Error('Method sendAnomalySignal must be implemented');
  }

  /**
   * Отправить общее уведомление
   * @param {string} title - Заголовок
   * @param {string} message - Сообщение
   * @param {string} type - Тип уведомления (info, warning, error, success)
   * @returns {Promise<void>}
   */
  async sendNotification(title, message, type = 'info') {
    throw new Error('Method sendNotification must be implemented');
  }

  /**
   * Отправить уведомление в консоль (для разработки)
   * @param {string} message - Сообщение
   * @param {string} level - Уровень логирования (log, warn, error)
   * @returns {Promise<void>}
   */
  async sendConsoleMessage(message, level = 'log') {
    throw new Error('Method sendConsoleMessage must be implemented');
  }

  /**
   * Проверить доступность сервиса уведомлений
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('Method isAvailable must be implemented');
  }
}

module.exports = NotificationRepository; 