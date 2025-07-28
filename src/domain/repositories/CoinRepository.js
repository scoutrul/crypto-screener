/**
 * Интерфейс репозитория для работы с монетами
 */
class CoinRepository {
  /**
   * Получить топ монет по рыночной капитализации
   * @param {number} limit - Количество монет
   * @param {string} currency - Валюта (по умолчанию 'btc')
   * @returns {Promise<Array<Coin>>}
   */
  async getTopCoinsByMarketCap(limit = 1000, currency = 'btc') {
    throw new Error('Method getTopCoinsByMarketCap must be implemented');
  }

  /**
   * Получить монету по ID
   * @param {string} id - ID монеты
   * @returns {Promise<Coin|null>}
   */
  async getById(id) {
    throw new Error('Method getById must be implemented');
  }

  /**
   * Получить монеты по символам
   * @param {Array<string>} symbols - Массив символов
   * @returns {Promise<Array<Coin>>}
   */
  async getBySymbols(symbols) {
    throw new Error('Method getBySymbols must be implemented');
  }

  /**
   * Получить трендовые монеты
   * @returns {Promise<Array<Coin>>}
   */
  async getTrendingCoins() {
    throw new Error('Method getTrendingCoins must be implemented');
  }

  /**
   * Сохранить монету
   * @param {Coin} coin - Монета для сохранения
   * @returns {Promise<void>}
   */
  async save(coin) {
    throw new Error('Method save must be implemented');
  }

  /**
   * Сохранить несколько монет
   * @param {Array<Coin>} coins - Массив монет
   * @returns {Promise<void>}
   */
  async saveMany(coins) {
    throw new Error('Method saveMany must be implemented');
  }

  /**
   * Обновить монету
   * @param {Coin} coin - Монета для обновления
   * @returns {Promise<void>}
   */
  async update(coin) {
    throw new Error('Method update must be implemented');
  }

  /**
   * Удалить монету
   * @param {string} id - ID монеты
   * @returns {Promise<void>}
   */
  async delete(id) {
    throw new Error('Method delete must be implemented');
  }

  /**
   * Получить все монеты
   * @returns {Promise<Array<Coin>>}
   */
  async getAll() {
    throw new Error('Method getAll must be implemented');
  }

  /**
   * Поиск монет по названию или символу
   * @param {string} query - Поисковый запрос
   * @returns {Promise<Array<Coin>>}
   */
  async search(query) {
    throw new Error('Method search must be implemented');
  }

  /**
   * Получить статистику рынка
   * @returns {Promise<Object>}
   */
  async getMarketStats() {
    throw new Error('Method getMarketStats must be implemented');
  }
}

module.exports = CoinRepository; 